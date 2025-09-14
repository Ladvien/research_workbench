use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use serde_json::{json, Value};

use crate::{
    app_state::AppState,
    error::AppError,
    llm::{LLMServiceFactory, Provider},
};

/// Get all available models across all providers
pub async fn get_models(
    State(_app_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let models = LLMServiceFactory::available_models();

    let response = json!({
        "models": models,
        "status": "success",
        "count": models.len()
    });

    Ok(Json(response))
}

/// Get models for a specific provider
pub async fn get_models_by_provider(
    State(_app_state): State<AppState>,
    axum::extract::Path(provider): axum::extract::Path<String>,
) -> Result<Json<Value>, AppError> {
    let provider = provider.to_lowercase();
    let all_models = LLMServiceFactory::available_models();

    let filtered_models: Vec<_> = all_models
        .into_iter()
        .filter(|model| {
            match provider.as_str() {
                "openai" => matches!(model.provider, Provider::OpenAI),
                "anthropic" => matches!(model.provider, Provider::Anthropic),
                _ => false,
            }
        })
        .collect();

    if filtered_models.is_empty() {
        return Err(AppError::NotFound(format!("No models found for provider: {}", provider)));
    }

    let response = json!({
        "models": filtered_models,
        "provider": provider,
        "status": "success",
        "count": filtered_models.len()
    });

    Ok(Json(response))
}

/// Get configuration for a specific model
pub async fn get_model_config(
    State(_app_state): State<AppState>,
    axum::extract::Path(model_id): axum::extract::Path<String>,
) -> Result<Json<Value>, AppError> {
    let all_models = LLMServiceFactory::available_models();

    let model = all_models
        .into_iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| AppError::NotFound(format!("Model not found: {}", model_id)))?;

    let provider = LLMServiceFactory::provider_from_model(&model_id)?;

    let response = json!({
        "model": model,
        "provider": provider,
        "status": "success"
    });

    Ok(Json(response))
}

/// Health check endpoint for model service
pub async fn models_health() -> Result<(StatusCode, Json<Value>), AppError> {
    let response = json!({
        "status": "healthy",
        "service": "models",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "available_providers": ["openai", "anthropic"]
    });

    Ok((StatusCode::OK, Json(response)))
}