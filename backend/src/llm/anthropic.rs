use async_trait::async_trait;
use futures::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::time::Duration;
use tokio_stream;

use super::{
    ChatRequest, ChatResponse, LLMService, ModelInfo, Provider, StreamEvent, StreamEventType, Usage,
};
use crate::{config::AppConfig, error::AppError};

#[derive(Debug, Clone)]
pub struct AnthropicService {
    client: Client,
    config: AppConfig,
}

#[derive(Debug, Serialize)]
struct AnthropicChatRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
    temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicChatResponse {
    content: Vec<AnthropicContent>,
    usage: Option<AnthropicUsage>,
    #[allow(dead_code)]
    model: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

impl AnthropicService {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        if config.anthropic_api_key.is_empty() {
            return Err(AppError::BadRequest(
                "Anthropic API key not configured".to_string(),
            ));
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| AppError::Anthropic(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client, config })
    }

    fn convert_messages(&self, messages: Vec<super::ChatMessage>) -> Vec<AnthropicMessage> {
        messages
            .into_iter()
            .filter_map(|msg| {
                // Skip system messages for now as Anthropic handles them differently
                if msg.role == "system" {
                    None
                } else {
                    Some(AnthropicMessage {
                        role: msg.role,
                        content: msg.content,
                    })
                }
            })
            .collect()
    }

    async fn call_anthropic_api(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        let anthropic_messages = self.convert_messages(request.messages);

        if anthropic_messages.is_empty() {
            return Err(AppError::BadRequest(
                "No valid messages to send to Anthropic".to_string(),
            ));
        }

        let anthropic_request = AnthropicChatRequest {
            model: request.model.clone(),
            max_tokens: request.max_tokens.unwrap_or(self.config.anthropic_max_tokens),
            messages: anthropic_messages,
            temperature: request.temperature.or(Some(self.config.anthropic_temperature)),
        };

        tracing::debug!("Sending request to Anthropic API: {:?}", anthropic_request);

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("Content-Type", "application/json")
            .header("x-api-key", &self.config.anthropic_api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&anthropic_request)
            .send()
            .await
            .map_err(|e| AppError::Anthropic(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());

            let error_message = format!("Anthropic API error {}: {}", status, error_text);

            // Return error regardless of status
            return Err(AppError::Anthropic(error_message));
        }

        let anthropic_response: AnthropicChatResponse = response
            .json()
            .await
            .map_err(|e| AppError::Anthropic(format!("Failed to parse response: {}", e)))?;

        let content = anthropic_response
            .content
            .iter()
            .filter_map(|c| c.text.as_ref())
            .cloned()
            .collect::<Vec<_>>()
            .join("");

        let usage = anthropic_response.usage.map(|u| Usage {
            prompt_tokens: u.input_tokens,
            completion_tokens: u.output_tokens,
            total_tokens: u.input_tokens + u.output_tokens,
        });

        Ok(ChatResponse {
            message: super::ChatMessage {
                role: "assistant".to_string(),
                content,
            },
            usage,
            model: request.model,
            provider: "anthropic".to_string(),
        })
    }

}

fn is_retryable_anthropic_error(error: &AppError) -> bool {
    match error {
        AppError::Anthropic(msg) => {
            msg.contains("429") || // Rate limit
            msg.contains("500") || // Internal server error
            msg.contains("502") || // Bad gateway
            msg.contains("503") || // Service unavailable
            msg.contains("504") || // Gateway timeout
            msg.contains("timeout") ||
            msg.contains("rate_limit")
        }
        _ => false,
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
        tracing::info!(
            "Sending chat completion request to Anthropic for model: {}",
            request.model
        );

        // Simple retry logic without complex closures for now
        let mut attempts = 0;
        let max_attempts = 3;
        let mut delay = Duration::from_millis(1000);

        loop {
            attempts += 1;

            match self.call_anthropic_api(request.clone()).await {
                Ok(response) => return Ok(response),
                Err(e) if attempts >= max_attempts => return Err(e),
                Err(e) if is_retryable_anthropic_error(&e) => {
                    tracing::warn!("Retryable error (attempt {}/{}): {}", attempts, max_attempts, e);
                    tokio::time::sleep(delay).await;
                    delay *= 2; // Exponential backoff
                }
                Err(e) => return Err(e),
            }
        }
    }

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, AppError>> + Send>>, AppError> {
        tracing::info!(
            "Sending streaming chat completion request to Anthropic for model: {}",
            request.model
        );

        // For now, use non-streaming and simulate streaming
        // TODO: Implement actual Anthropic streaming when supported
        let response = self.chat_completion(request.clone()).await?;
        let model = request.model.clone();
        let model_final = model.clone();

        // Split content into words for streaming simulation
        let words: Vec<String> = response.message.content
            .split_whitespace()
            .map(|w| format!("{} ", w))
            .collect();

        let word_stream = tokio_stream::iter(words.into_iter().enumerate()).map(move |(i, word)| {
            if i == 0 {
                Ok(StreamEvent {
                    event_type: StreamEventType::Token,
                    data: Some(word),
                    usage: None,
                    model: Some(model.clone()),
                    provider: Some("anthropic".to_string()),
                })
            } else {
                Ok(StreamEvent {
                    event_type: StreamEventType::Token,
                    data: Some(word),
                    usage: None,
                    model: Some(model.clone()),
                    provider: Some("anthropic".to_string()),
                })
            }
        });

        let final_stream = word_stream.chain(tokio_stream::once(Ok(StreamEvent {
            event_type: StreamEventType::Done,
            data: None,
            usage: response.usage,
            model: Some(model_final),
            provider: Some("anthropic".to_string()),
        })));

        Ok(Box::pin(final_stream))
    }
}