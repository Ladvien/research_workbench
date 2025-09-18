use async_openai::{
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
        ChatCompletionRequestUserMessage, CreateChatCompletionRequest,
        CreateChatCompletionResponse,
    },
    Client as OpenAIClient,
};
use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;
use std::time::Duration;
use tokio_stream::StreamExt;

use super::{
    ChatRequest, ChatResponse, LLMService, ModelInfo, Provider, StreamEvent, StreamEventType, Usage,
};
use crate::{config::AppConfig, error::AppError};

#[derive(Debug, Clone)]
pub struct OpenAIService {
    client: OpenAIClient<async_openai::config::OpenAIConfig>,
    config: AppConfig,
}

impl OpenAIService {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        if config.openai_api_key.is_empty() {
            return Err(AppError::BadRequest(
                "OpenAI API key not configured".to_string(),
            ));
        }

        let openai_config =
            async_openai::config::OpenAIConfig::new().with_api_key(&config.openai_api_key);

        let client = OpenAIClient::with_config(openai_config);

        Ok(Self { client, config })
    }


    #[allow(deprecated)] // function_call field required by async-openai v0.20 struct
    fn convert_messages(
        &self,
        messages: Vec<super::ChatMessage>,
    ) -> Result<Vec<ChatCompletionRequestMessage>, AppError> {
        messages
            .into_iter()
            .map(|msg| match msg.role.as_str() {
                "system" => Ok(ChatCompletionRequestMessage::System(
                    ChatCompletionRequestSystemMessage {
                        content: msg.content.clone().into(),
                        role: async_openai::types::Role::System,
                        name: None,
                    },
                )),
                "user" => Ok(ChatCompletionRequestMessage::User(
                    ChatCompletionRequestUserMessage {
                        content: msg.content.clone().into(),
                        role: async_openai::types::Role::User,
                        name: None,
                    },
                )),
                "assistant" => Ok(ChatCompletionRequestMessage::Assistant(
                    async_openai::types::ChatCompletionRequestAssistantMessage {
                        content: Some(msg.content.clone()),
                        role: async_openai::types::Role::Assistant,
                        name: None,
                        tool_calls: None,
                        function_call: None,
                    },
                )),
                _ => Err(AppError::BadRequest(format!("Invalid role: {}", msg.role))),
            })
            .collect()
    }

    fn extract_response(
        &self,
        response: CreateChatCompletionResponse,
        model: &str,
    ) -> Result<ChatResponse, AppError> {
        let choice = response
            .choices
            .first()
            .ok_or_else(|| AppError::OpenAI("No choices in OpenAI response".to_string()))?;

        let message = &choice.message;
        let content = message.content.as_ref().unwrap_or(&String::new()).clone();

        let usage = response.usage.map(|u| Usage {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
        });

        Ok(ChatResponse {
            message: super::ChatMessage {
                role: "assistant".to_string(),
                content,
            },
            usage,
            model: model.to_string(),
            provider: "openai".to_string(),
        })
    }
}

#[async_trait]
impl LLMService for OpenAIService {
    fn provider(&self) -> Provider {
        Provider::OpenAI
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
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
        ]
    }

    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        tracing::info!(
            "Sending chat completion request to OpenAI for model: {}",
            request.model
        );

        let request_clone = request.clone();
        let messages = self.convert_messages(request_clone.messages)?;
        let model = request_clone.model.clone();

        // Simple retry logic without complex closures for now
        let mut attempts = 0;
        let max_attempts = 3;
        let mut delay = Duration::from_millis(1000);

        loop {
            attempts += 1;

            let openai_request = CreateChatCompletionRequest {
                model: model.clone(),
                messages: messages.clone(),
                temperature: Some(
                    request_clone.temperature
                        .unwrap_or(self.config.openai_temperature),
                ),
                max_tokens: Some(request_clone.max_tokens.unwrap_or(self.config.openai_max_tokens) as u16),
                ..Default::default()
            };

            match self.client.chat().create(openai_request).await {
                Ok(response) => {
                    return self.extract_response(response, &model);
                }
                Err(e) => {
                    let error = AppError::OpenAI(e.to_string());

                    if attempts >= max_attempts {
                        return Err(error);
                    }

                    if is_retryable_openai_error(&error) {
                        tracing::warn!("Retryable error (attempt {}/{}): {}", attempts, max_attempts, error);
                        tokio::time::sleep(delay).await;
                        delay *= 2; // Exponential backoff
                    } else {
                        return Err(error);
                    }
                }
            }
        }
    }

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, AppError>> + Send>>, AppError> {
        tracing::info!(
            "Sending streaming chat completion request to OpenAI for model: {}",
            request.model
        );

        let messages = self.convert_messages(request.messages)?;
        let model = request.model.clone();

        let openai_request = CreateChatCompletionRequest {
            model: model.clone(),
            messages,
            temperature: Some(
                request
                    .temperature
                    .unwrap_or(self.config.openai_temperature),
            ),
            max_tokens: Some(request.max_tokens.unwrap_or(self.config.openai_max_tokens) as u16),
            stream: Some(true),
            ..Default::default()
        };

        let stream = self
            .client
            .chat()
            .create_stream(openai_request)
            .await
            .map_err(|e| AppError::OpenAI(e.to_string()))?;

        let boxed_stream = Box::pin(stream.map(move |result| {
            match result {
                Ok(response) => {
                    if let Some(choice) = response.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            return Ok(StreamEvent {
                                event_type: StreamEventType::Token,
                                data: Some(content.clone()),
                                usage: None,
                                model: Some(model.clone()),
                                provider: Some("openai".to_string()),
                            });
                        }
                        if choice.finish_reason.is_some() {
                            return Ok(StreamEvent {
                                event_type: StreamEventType::Done,
                                data: None,
                                usage: None,
                                model: Some(model.clone()),
                                provider: Some("openai".to_string()),
                            });
                        }
                    }
                    // If no content, skip this chunk
                    Ok(StreamEvent {
                        event_type: StreamEventType::Token,
                        data: Some("".to_string()),
                        usage: None,
                        model: Some(model.clone()),
                        provider: Some("openai".to_string()),
                    })
                }
                Err(e) => Ok(StreamEvent {
                    event_type: StreamEventType::Error,
                    data: Some(e.to_string()),
                    usage: None,
                    model: Some(model.clone()),
                    provider: Some("openai".to_string()),
                }),
            }
        }));

        Ok(boxed_stream)
    }
}

fn is_retryable_openai_error(error: &AppError) -> bool {
    match error {
        AppError::OpenAI(msg) => {
            // Retry on rate limits, timeouts, and server errors
            msg.contains("rate_limit_exceeded") ||
            msg.contains("timeout") ||
            msg.contains("internal_server_error") ||
            msg.contains("502") ||
            msg.contains("503") ||
            msg.contains("504") ||
            msg.contains("too_many_requests") ||
            msg.contains("server_error")
        }
        _ => false,
    }
}
