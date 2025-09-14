use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;
use tokio_stream;

use super::{
    ChatRequest, ChatResponse, LLMService, ModelInfo, Provider, StreamEvent, StreamEventType, Usage,
};
use crate::{config::AppConfig, error::AppError};

#[derive(Debug, Clone)]
pub struct AnthropicService {
    config: AppConfig,
}

impl AnthropicService {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        // TODO: Initialize proper Anthropic client when anthropic crate API is clarified
        Ok(Self { config })
    }
}

#[async_trait]
impl LLMService for AnthropicService {
    fn provider(&self) -> Provider {
        Provider::Anthropic
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
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

    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        // TODO: Implement actual Anthropic API call
        tracing::info!(
            "Anthropic chat completion for model: {} (placeholder)",
            request.model
        );

        // For now, return a placeholder response
        Ok(ChatResponse {
            message: super::ChatMessage {
                role: "assistant".to_string(),
                content: "This is a placeholder response from Anthropic service. The actual integration is pending.".to_string(),
            },
            usage: Some(Usage {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
            }),
            model: request.model.clone(),
            provider: "anthropic".to_string(),
        })
    }

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, AppError>> + Send>>, AppError> {
        // TODO: Implement actual Anthropic streaming
        tracing::info!(
            "Anthropic streaming for model: {} (placeholder)",
            request.model
        );

        let model = request.model.clone();
        let stream = tokio_stream::iter([
            Ok(StreamEvent {
                event_type: StreamEventType::Token,
                data: Some("This ".to_string()),
                usage: None,
                model: Some(model.clone()),
                provider: Some("anthropic".to_string()),
            }),
            Ok(StreamEvent {
                event_type: StreamEventType::Token,
                data: Some("is ".to_string()),
                usage: None,
                model: Some(model.clone()),
                provider: Some("anthropic".to_string()),
            }),
            Ok(StreamEvent {
                event_type: StreamEventType::Token,
                data: Some("a placeholder.".to_string()),
                usage: None,
                model: Some(model.clone()),
                provider: Some("anthropic".to_string()),
            }),
            Ok(StreamEvent {
                event_type: StreamEventType::Done,
                data: None,
                usage: Some(Usage {
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30,
                }),
                model: Some(model.clone()),
                provider: Some("anthropic".to_string()),
            }),
        ]);

        Ok(Box::pin(stream))
    }
}
