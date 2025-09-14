use axum::response::Json;

use crate::{
    error::AppError,
    openai::{ChatRequest, ChatResponse, OpenAIService},
    config::AppConfig,
};

#[derive(Debug, Clone)]
pub struct AppState {
    pub openai_service: OpenAIService,
}

impl AppState {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        let openai_service = OpenAIService::new(config)?;

        Ok(Self {
            openai_service,
        })
    }
}

pub async fn send_message(
    Json(request): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, AppError> {
    tracing::info!("Received chat request with {} messages", request.messages.len());

    // Validate the request
    if request.messages.is_empty() {
        return Err(AppError::BadRequest("Messages cannot be empty".to_string()));
    }

    // Create OpenAI service (we'll improve this with proper DI later)
    let config = AppConfig::from_env()?;
    let openai_service = OpenAIService::new(config)?;

    // Send request to OpenAI
    let response = openai_service.chat_completion(request).await?;

    tracing::info!("Successfully processed chat request");

    Ok(Json(response))
}