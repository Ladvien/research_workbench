use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

pub mod anthropic;
pub mod openai;

use crate::error::AppError;

/// Unified model for chat messages across all LLM providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Unified request structure for chat completions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
}

/// Unified response structure for chat completions
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
    pub usage: Option<Usage>,
    pub model: String,
    pub provider: String,
}

/// Token usage information
#[derive(Debug, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Streaming event types
#[derive(Debug, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event_type: StreamEventType,
    pub data: Option<String>,
    pub usage: Option<Usage>,
    pub model: Option<String>,
    pub provider: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamEventType {
    Token,
    Usage,
    Error,
    Done,
}

/// Supported LLM providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    OpenAI,
    Anthropic,
}

/// Available models with their provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: Provider,
    pub max_tokens: u32,
    pub supports_streaming: bool,
    pub cost_per_token: Option<f32>,
}

/// Trait for LLM service implementations
#[async_trait]
pub trait LLMService: Send + Sync {
    /// Get the provider type
    fn provider(&self) -> Provider;

    /// Get available models for this provider
    fn available_models(&self) -> Vec<ModelInfo>;

    /// Send a non-streaming chat completion request
    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, AppError>;

    /// Send a streaming chat completion request
    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, AppError>> + Send>>, AppError>;
}

/// Factory for creating LLM service instances
pub struct LLMServiceFactory;

impl LLMServiceFactory {
    /// Create a service instance for the given provider
    pub fn create_service(
        provider: &Provider,
        config: &crate::config::AppConfig,
    ) -> Result<Box<dyn LLMService>, AppError> {
        match provider {
            Provider::OpenAI => {
                let service = openai::OpenAIService::new(config.clone())?;
                Ok(Box::new(service))
            }
            Provider::Anthropic => {
                let service = anthropic::AnthropicService::new(config.clone())?;
                Ok(Box::new(service))
            }
        }
    }

    /// Get all available models across all providers
    pub fn available_models() -> Vec<ModelInfo> {
        vec![
            // OpenAI models
            ModelInfo {
                id: "gpt-4".to_string(),
                name: "GPT-4".to_string(),
                provider: Provider::OpenAI,
                max_tokens: 4096,
                supports_streaming: true,
                cost_per_token: Some(0.03),
            },
            ModelInfo {
                id: "gpt-3.5-turbo".to_string(),
                name: "GPT-3.5 Turbo".to_string(),
                provider: Provider::OpenAI,
                max_tokens: 4096,
                supports_streaming: true,
                cost_per_token: Some(0.002),
            },
            // Anthropic models
            ModelInfo {
                id: "claude-3-sonnet-20240229".to_string(),
                name: "Claude 3 Sonnet".to_string(),
                provider: Provider::Anthropic,
                max_tokens: 4096,
                supports_streaming: true,
                cost_per_token: Some(0.015),
            },
            ModelInfo {
                id: "claude-3-haiku-20240307".to_string(),
                name: "Claude 3 Haiku".to_string(),
                provider: Provider::Anthropic,
                max_tokens: 4096,
                supports_streaming: true,
                cost_per_token: Some(0.0025),
            },
        ]
    }

    /// Parse model ID to determine provider
    pub fn provider_from_model(model_id: &str) -> Result<Provider, AppError> {
        if model_id.starts_with("gpt-") {
            Ok(Provider::OpenAI)
        } else if model_id.starts_with("claude-") {
            Ok(Provider::Anthropic)
        } else {
            Err(AppError::BadRequest(format!("Unknown model: {}", model_id)))
        }
    }
}
