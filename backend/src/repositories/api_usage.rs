use crate::database::Database;
use crate::error::AppError;
use crate::models::ApiUsage;
use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ApiUsageRepository {
    db: Database,
}

impl ApiUsageRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Create a new API usage record
    pub async fn create(&self, api_usage: &ApiUsage) -> Result<ApiUsage, AppError> {
        let record = sqlx::query_as::<_, ApiUsage>(
            r#"
            INSERT INTO api_usage (id, user_id, model, provider, tokens_prompt, tokens_completion, cost_cents, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, model, provider, tokens_prompt, tokens_completion, cost_cents, created_at
            "#
        )
        .bind(api_usage.id)
        .bind(api_usage.user_id)
        .bind(&api_usage.model)
        .bind(&api_usage.provider)
        .bind(api_usage.tokens_prompt)
        .bind(api_usage.tokens_completion)
        .bind(api_usage.cost_cents)
        .bind(api_usage.created_at)
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create API usage record: {}", e)))?;

        Ok(record)
    }

    /// Get usage statistics for a user within a date range
    pub async fn get_usage_stats_by_user(
        &self,
        user_id: Uuid,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
    ) -> Result<UsageStats, AppError> {
        let start = start_date.unwrap_or_else(|| Utc::now() - chrono::Duration::days(30));
        let end = end_date.unwrap_or_else(Utc::now);

        let row = sqlx::query(
            r#"
            SELECT
                COALESCE(SUM(tokens_prompt), 0) as total_prompt_tokens,
                COALESCE(SUM(tokens_completion), 0) as total_completion_tokens,
                COALESCE(SUM(tokens_prompt + tokens_completion), 0) as total_tokens,
                COALESCE(SUM(cost_cents), 0) as total_cost_cents,
                COUNT(*) as total_requests
            FROM api_usage
            WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
            "#,
        )
        .bind(user_id)
        .bind(start)
        .bind(end)
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get usage stats: {}", e)))?;

        Ok(UsageStats {
            total_prompt_tokens: row
                .try_get::<Option<i64>, _>("total_prompt_tokens")?
                .unwrap_or(0) as u64,
            total_completion_tokens: row
                .try_get::<Option<i64>, _>("total_completion_tokens")?
                .unwrap_or(0) as u64,
            total_tokens: row.try_get::<Option<i64>, _>("total_tokens")?.unwrap_or(0) as u64,
            total_cost_cents: row
                .try_get::<Option<i64>, _>("total_cost_cents")?
                .unwrap_or(0) as u64,
            total_requests: row.try_get::<i64, _>("total_requests")? as u64,
        })
    }

    /// Get usage breakdown by model for a user
    pub async fn get_usage_by_model(
        &self,
        user_id: Uuid,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
    ) -> Result<Vec<ModelUsage>, AppError> {
        let start = start_date.unwrap_or_else(|| Utc::now() - chrono::Duration::days(30));
        let end = end_date.unwrap_or_else(Utc::now);

        let rows = sqlx::query(
            r#"
            SELECT
                model,
                provider,
                COALESCE(SUM(tokens_prompt), 0) as prompt_tokens,
                COALESCE(SUM(tokens_completion), 0) as completion_tokens,
                COALESCE(SUM(tokens_prompt + tokens_completion), 0) as total_tokens,
                COALESCE(SUM(cost_cents), 0) as cost_cents,
                COUNT(*) as requests
            FROM api_usage
            WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
            GROUP BY model, provider
            ORDER BY total_tokens DESC
            "#,
        )
        .bind(user_id)
        .bind(start)
        .bind(end)
        .fetch_all(&self.db.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get usage by model: {}", e)))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(ModelUsage {
                model: row
                    .try_get("model")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                provider: row
                    .try_get("provider")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                prompt_tokens: row
                    .try_get::<Option<i64>, _>("prompt_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                completion_tokens: row
                    .try_get::<Option<i64>, _>("completion_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                total_tokens: row
                    .try_get::<Option<i64>, _>("total_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                cost_cents: row
                    .try_get::<Option<i64>, _>("cost_cents")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                requests: row
                    .try_get::<i64, _>("requests")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    as u64,
            });
        }
        Ok(result)
    }

    /// Get daily usage trends for a user
    pub async fn get_daily_usage_trends(
        &self,
        user_id: Uuid,
        days: u32,
    ) -> Result<Vec<DailyUsage>, AppError> {
        let start = Utc::now() - chrono::Duration::days(days as i64);

        let rows = sqlx::query(
            r#"
            SELECT
                DATE(created_at) as usage_date,
                COALESCE(SUM(tokens_prompt), 0) as prompt_tokens,
                COALESCE(SUM(tokens_completion), 0) as completion_tokens,
                COALESCE(SUM(tokens_prompt + tokens_completion), 0) as total_tokens,
                COALESCE(SUM(cost_cents), 0) as cost_cents,
                COUNT(*) as requests
            FROM api_usage
            WHERE user_id = $1 AND created_at >= $2
            GROUP BY DATE(created_at)
            ORDER BY usage_date ASC
            "#,
        )
        .bind(user_id)
        .bind(start)
        .fetch_all(&self.db.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get daily usage trends: {}", e)))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(DailyUsage {
                date: row
                    .try_get::<Option<chrono::NaiveDate>, _>("usage_date")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap(),
                prompt_tokens: row
                    .try_get::<Option<i64>, _>("prompt_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                completion_tokens: row
                    .try_get::<Option<i64>, _>("completion_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                total_tokens: row
                    .try_get::<Option<i64>, _>("total_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                cost_cents: row
                    .try_get::<Option<i64>, _>("cost_cents")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                requests: row
                    .try_get::<i64, _>("requests")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    as u64,
            });
        }
        Ok(result)
    }

    /// Get usage records for CSV export
    pub async fn get_usage_for_export(
        &self,
        user_id: Uuid,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
        limit: Option<u32>,
    ) -> Result<Vec<ApiUsage>, AppError> {
        let start = start_date.unwrap_or_else(|| Utc::now() - chrono::Duration::days(30));
        let end = end_date.unwrap_or_else(Utc::now);
        let limit = limit.unwrap_or(1000);

        let records = sqlx::query_as::<_, ApiUsage>(
        r#"
            SELECT id, user_id, model, provider, tokens_prompt, tokens_completion, cost_cents, created_at
            FROM api_usage
            WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
            ORDER BY created_at DESC
            LIMIT $4
            "#
    )
        .bind(user_id)
        .bind(start)
        .bind(end)
        .bind(limit as i64)
        .fetch_all(&self.db.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get usage for export: {}", e)))?;

        Ok(records)
    }

    /// Get per-conversation token counts
    pub async fn get_conversation_usage(
        &self,
        user_id: Uuid,
        conversation_id: Option<Uuid>,
    ) -> Result<Vec<ConversationUsage>, AppError> {
        let query = if let Some(conv_id) = conversation_id {
            // Get usage for specific conversation
            sqlx::query(
                r#"
                SELECT
                    c.id as conversation_id,
                    c.title,
                    c.model,
                    c.provider,
                    COALESCE(SUM(au.tokens_prompt), 0) as prompt_tokens,
                    COALESCE(SUM(au.tokens_completion), 0) as completion_tokens,
                    COALESCE(SUM(au.tokens_prompt + au.tokens_completion), 0) as total_tokens,
                    COALESCE(SUM(au.cost_cents), 0) as cost_cents,
                    COUNT(au.id) as requests
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                LEFT JOIN api_usage au ON au.user_id = c.user_id
                    AND au.model = c.model
                    AND au.created_at >= c.created_at
                    AND au.created_at <= COALESCE(c.updated_at, NOW())
                WHERE c.user_id = $1 AND c.id = $2
                GROUP BY c.id, c.title, c.model, c.provider
                "#,
            )
            .bind(user_id)
            .bind(conv_id)
            .fetch_all(&self.db.pool)
            .await
        } else {
            // Get usage for all conversations
            sqlx::query(
                r#"
                SELECT
                    c.id as conversation_id,
                    c.title,
                    c.model,
                    c.provider,
                    COALESCE(SUM(au.tokens_prompt), 0) as prompt_tokens,
                    COALESCE(SUM(au.tokens_completion), 0) as completion_tokens,
                    COALESCE(SUM(au.tokens_prompt + au.tokens_completion), 0) as total_tokens,
                    COALESCE(SUM(au.cost_cents), 0) as cost_cents,
                    COUNT(au.id) as requests
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                LEFT JOIN api_usage au ON au.user_id = c.user_id
                    AND au.model = c.model
                    AND au.created_at >= c.created_at
                    AND au.created_at <= COALESCE(c.updated_at, NOW())
                WHERE c.user_id = $1
                GROUP BY c.id, c.title, c.model, c.provider
                ORDER BY total_tokens DESC
                "#,
            )
            .bind(user_id)
            .fetch_all(&self.db.pool)
            .await
        };

        let rows = query
            .map_err(|e| AppError::Database(format!("Failed to get conversation usage: {}", e)))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(ConversationUsage {
                conversation_id: row
                    .try_get("conversation_id")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                title: row
                    .try_get("title")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                model: row
                    .try_get("model")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                provider: row
                    .try_get("provider")
                    .map_err(|e| AppError::Database(e.to_string()))?,
                prompt_tokens: row
                    .try_get::<Option<i64>, _>("prompt_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                completion_tokens: row
                    .try_get::<Option<i64>, _>("completion_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                total_tokens: row
                    .try_get::<Option<i64>, _>("total_tokens")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                cost_cents: row
                    .try_get::<Option<i64>, _>("cost_cents")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .unwrap_or(0) as u64,
                requests: row
                    .try_get::<i64, _>("requests")
                    .map_err(|e| AppError::Database(e.to_string()))?
                    as u64,
            });
        }
        Ok(result)
    }
}

// DTO structs for analytics responses
#[derive(Debug, serde::Serialize)]
pub struct UsageStats {
    pub total_prompt_tokens: u64,
    pub total_completion_tokens: u64,
    pub total_tokens: u64,
    pub total_cost_cents: u64,
    pub total_requests: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct ModelUsage {
    pub model: String,
    pub provider: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cost_cents: u64,
    pub requests: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct DailyUsage {
    pub date: chrono::NaiveDate,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cost_cents: u64,
    pub requests: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct ConversationUsage {
    pub conversation_id: Uuid,
    pub title: Option<String>,
    pub model: String,
    pub provider: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cost_cents: u64,
    pub requests: u64,
}
