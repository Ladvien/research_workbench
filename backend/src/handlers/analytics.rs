use crate::app_state::AppState;
use crate::error::AppError;
use crate::middleware::auth::UserResponse;
use crate::repositories::api_usage::{UsageStats, ModelUsage, DailyUsage, ConversationUsage};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// Query parameters for analytics endpoints
#[derive(Debug, Deserialize)]
pub struct AnalyticsQuery {
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub end_date: Option<DateTime<Utc>>,
    pub days: Option<u32>,
    pub limit: Option<u32>,
    pub conversation_id: Option<Uuid>,
}

// Response DTOs
#[derive(Debug, Serialize)]
pub struct AnalyticsOverview {
    pub stats: UsageStats,
    pub cost_breakdown: Vec<ModelUsage>,
    pub recent_usage: Vec<DailyUsage>,
}

#[derive(Debug, Serialize)]
pub struct CostBreakdown {
    pub by_model: Vec<ModelUsage>,
    pub by_provider: Vec<ProviderUsage>,
    pub total_cost_usd: f64,
}

#[derive(Debug, Serialize)]
pub struct ProviderUsage {
    pub provider: String,
    pub models: Vec<String>,
    pub total_tokens: u64,
    pub cost_cents: u64,
    pub cost_usd: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize)]
pub struct UsageTrends {
    pub daily: Vec<DailyUsage>,
    pub total_days: u32,
    pub average_daily_tokens: u64,
    pub average_daily_cost_cents: u64,
}

/// Get analytics overview for the authenticated user
pub async fn get_analytics_overview(
    State(state): State<AppState>,
    user: UserResponse,
    Query(query): Query<AnalyticsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo = &state.repositories.api_usage;

    // Get overall stats
    let stats = repo
        .get_usage_stats_by_user(user.id, query.start_date, query.end_date)
        .await?;

    // Get cost breakdown by model
    let cost_breakdown = repo
        .get_usage_by_model(user.id, query.start_date, query.end_date)
        .await?;

    // Get recent daily usage (last 7 days by default)
    let days = query.days.unwrap_or(7);
    let recent_usage = repo
        .get_daily_usage_trends(user.id, days)
        .await?;

    let overview = AnalyticsOverview {
        stats,
        cost_breakdown,
        recent_usage,
    };

    Ok(Json(overview))
}

/// Get detailed cost breakdown by provider and model
pub async fn get_cost_breakdown(
    State(state): State<AppState>,
    user: UserResponse,
    Query(query): Query<AnalyticsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo = &state.repositories.api_usage;

    let by_model = repo
        .get_usage_by_model(user.id, query.start_date, query.end_date)
        .await?;

    // Group by provider
    let mut provider_map: HashMap<String, ProviderUsage> = HashMap::new();
    let mut total_cost_cents = 0u64;

    for model_usage in &by_model {
        let provider_entry = provider_map.entry(model_usage.provider.clone())
            .or_insert_with(|| ProviderUsage {
                provider: model_usage.provider.clone(),
                models: Vec::new(),
                total_tokens: 0,
                cost_cents: 0,
                cost_usd: 0.0,
                requests: 0,
            });

        if !provider_entry.models.contains(&model_usage.model) {
            provider_entry.models.push(model_usage.model.clone());
        }

        provider_entry.total_tokens += model_usage.total_tokens;
        provider_entry.cost_cents += model_usage.cost_cents;
        provider_entry.requests += model_usage.requests;

        total_cost_cents += model_usage.cost_cents;
    }

    // Convert cost_cents to USD for each provider
    for provider in provider_map.values_mut() {
        provider.cost_usd = provider.cost_cents as f64 / 100.0;
    }

    let by_provider: Vec<ProviderUsage> = provider_map.into_values().collect();

    let breakdown = CostBreakdown {
        by_model,
        by_provider,
        total_cost_usd: total_cost_cents as f64 / 100.0,
    };

    Ok(Json(breakdown))
}

/// Get usage trends over time
pub async fn get_usage_trends(
    State(state): State<AppState>,
    user: UserResponse,
    Query(query): Query<AnalyticsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo = &state.repositories.api_usage;

    let days = query.days.unwrap_or(30);
    let daily = repo
        .get_daily_usage_trends(user.id, days)
        .await?;

    let total_tokens: u64 = daily.iter().map(|d| d.total_tokens).sum();
    let total_cost_cents: u64 = daily.iter().map(|d| d.cost_cents).sum();
    let total_days = daily.len() as u32;

    let trends = UsageTrends {
        daily,
        total_days,
        average_daily_tokens: if total_days > 0 { total_tokens / total_days as u64 } else { 0 },
        average_daily_cost_cents: if total_days > 0 { total_cost_cents / total_days as u64 } else { 0 },
    };

    Ok(Json(trends))
}

/// Get per-conversation token usage
pub async fn get_conversation_usage(
    State(state): State<AppState>,
    user: UserResponse,
    Query(query): Query<AnalyticsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo = &state.repositories.api_usage;

    let conversation_usage = repo
        .get_conversation_usage(user.id, query.conversation_id)
        .await?;

    Ok(Json(conversation_usage))
}

/// Export usage data as CSV
pub async fn export_usage_csv(
    State(state): State<AppState>,
    user: UserResponse,
    Query(query): Query<AnalyticsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let repo = &state.repositories.api_usage;

    let usage_records = repo
        .get_usage_for_export(user.id, query.start_date, query.end_date, query.limit)
        .await?;

    // Create CSV content
    let mut csv_content = String::new();
    csv_content.push_str("Date,Model,Provider,Prompt Tokens,Completion Tokens,Total Tokens,Cost (USD)\n");

    for record in usage_records {
        let cost_usd = record.cost_cents.unwrap_or(0) as f64 / 100.0;
        csv_content.push_str(&format!(
            "{},{},{},{},{},{},{:.4}\n",
            record.created_at.format("%Y-%m-%d %H:%M:%S"),
            record.model,
            record.provider,
            record.tokens_prompt.unwrap_or(0),
            record.tokens_completion.unwrap_or(0),
            record.tokens_prompt.unwrap_or(0) + record.tokens_completion.unwrap_or(0),
            cost_usd
        ));
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        "content-type",
        "text/csv".parse().unwrap(),
    );
    headers.insert(
        "content-disposition",
        format!("attachment; filename=\"usage_export_{}.csv\"", Utc::now().format("%Y%m%d_%H%M%S"))
            .parse()
            .unwrap(),
    );

    Ok((headers, csv_content))
}

/// Calculate cost for different models (utility function for cost calculation)
pub fn calculate_cost_cents(model: &str, prompt_tokens: u32, completion_tokens: u32) -> u32 {
    match model {
        // OpenAI GPT-4 pricing (as of 2024)
        "gpt-4" | "gpt-4-0613" => {
            // Input: $0.03 per 1K tokens, Output: $0.06 per 1K tokens
            let input_cost = (prompt_tokens as f64 / 1000.0) * 3.0; // $0.03 per 1K tokens in cents
            let output_cost = (completion_tokens as f64 / 1000.0) * 6.0; // $0.06 per 1K tokens in cents
            ((input_cost + output_cost) * 100.0) as u32 // Convert to cents
        },
        "gpt-4-turbo" | "gpt-4-turbo-preview" => {
            // Input: $0.01 per 1K tokens, Output: $0.03 per 1K tokens
            let input_cost = (prompt_tokens as f64 / 1000.0) * 1.0;
            let output_cost = (completion_tokens as f64 / 1000.0) * 3.0;
            ((input_cost + output_cost) * 100.0) as u32
        },
        "gpt-3.5-turbo" => {
            // Input: $0.0005 per 1K tokens, Output: $0.0015 per 1K tokens
            let input_cost = (prompt_tokens as f64 / 1000.0) * 0.05; // 0.05 cents per 1K tokens
            let output_cost = (completion_tokens as f64 / 1000.0) * 0.15;
            ((input_cost + output_cost) * 100.0) as u32
        },

        // Anthropic Claude pricing (as of 2024)
        "claude-3-opus-20240229" => {
            // Input: $15 per 1M tokens, Output: $75 per 1M tokens
            let input_cost = (prompt_tokens as f64 / 1_000_000.0) * 1500.0; // $15 per 1M tokens in cents
            let output_cost = (completion_tokens as f64 / 1_000_000.0) * 7500.0;
            ((input_cost + output_cost) * 100.0) as u32
        },
        "claude-3-sonnet-20240229" => {
            // Input: $3 per 1M tokens, Output: $15 per 1M tokens
            let input_cost = (prompt_tokens as f64 / 1_000_000.0) * 300.0;
            let output_cost = (completion_tokens as f64 / 1_000_000.0) * 1500.0;
            ((input_cost + output_cost) * 100.0) as u32
        },
        "claude-3-haiku-20240307" => {
            // Input: $0.25 per 1M tokens, Output: $1.25 per 1M tokens
            let input_cost = (prompt_tokens as f64 / 1_000_000.0) * 25.0;
            let output_cost = (completion_tokens as f64 / 1_000_000.0) * 125.0;
            ((input_cost + output_cost) * 100.0) as u32
        },

        // Default pricing for unknown models (similar to GPT-3.5-turbo)
        _ => {
            let input_cost = (prompt_tokens as f64 / 1000.0) * 0.05;
            let output_cost = (completion_tokens as f64 / 1000.0) * 0.15;
            ((input_cost + output_cost) * 100.0) as u32
        }
    }
}

/// Health check endpoint for analytics service
pub async fn analytics_health() -> impl IntoResponse {
    Json(serde_json::json!({
        "service": "analytics",
        "status": "healthy",
        "timestamp": Utc::now()
    }))
}