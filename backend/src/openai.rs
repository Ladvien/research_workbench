use async_openai::{
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
        ChatCompletionRequestUserMessage, CreateChatCompletionRequest,
        CreateChatCompletionResponse,
    },
    Client as OpenAIClient,
};
use futures::Stream;
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

use crate::{config::AppConfig, error::AppError};

#[derive(Debug, Clone)]
pub struct OpenAIService {
    client: OpenAIClient<async_openai::config::OpenAIConfig>,
    config: AppConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
    pub usage: Option<Usage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event_type: StreamEventType,
    pub data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamEventType {
    Token,
    Usage,
    Error,
    Done,
}

impl OpenAIService {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        let openai_config =
            async_openai::config::OpenAIConfig::new().with_api_key(&config.openai_api_key);

        let client = OpenAIClient::with_config(openai_config);

        Ok(Self { client, config })
    }

    #[allow(deprecated)] // function_call field required by async-openai v0.20 struct
    pub async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        tracing::info!("Sending chat completion request to OpenAI");

        // Convert our message format to OpenAI format
        let messages: Result<Vec<ChatCompletionRequestMessage>, AppError> = request
            .messages
            .into_iter()
            .map(|msg| match msg.role.as_str() {
                "system" => Ok(ChatCompletionRequestMessage::System(
                    ChatCompletionRequestSystemMessage {
                        content: msg.content,
                        role: async_openai::types::Role::System,
                        name: None,
                    },
                )),
                "user" => Ok(ChatCompletionRequestMessage::User(
                    ChatCompletionRequestUserMessage {
                        content: async_openai::types::ChatCompletionRequestUserMessageContent::Text(
                            msg.content,
                        ),
                        role: async_openai::types::Role::User,
                        name: None,
                    },
                )),
                "assistant" => Ok(ChatCompletionRequestMessage::Assistant(
                    async_openai::types::ChatCompletionRequestAssistantMessage {
                        content: Some(msg.content),
                        role: async_openai::types::Role::Assistant,
                        name: None,
                        tool_calls: None,
                        function_call: None,
                    },
                )),
                _ => Err(AppError::BadRequest(format!("Invalid role: {}", msg.role))),
            })
            .collect();

        let messages = messages?;

        let openai_request = CreateChatCompletionRequest {
            model: request.model.unwrap_or(self.config.openai_model.clone()),
            messages,
            temperature: Some(
                request
                    .temperature
                    .unwrap_or(self.config.openai_temperature),
            ),
            max_tokens: Some(request.max_tokens.unwrap_or(self.config.openai_max_tokens) as u16),
            ..Default::default()
        };

        let response = self
            .client
            .chat()
            .create(openai_request)
            .await
            .map_err(|e| AppError::OpenAI(e.to_string()))?;

        self.extract_response(response).await
    }

    async fn extract_response(
        &self,
        response: CreateChatCompletionResponse,
    ) -> Result<ChatResponse, AppError> {
        let choice = response
            .choices
            .first()
            .ok_or_else(|| AppError::OpenAI("No choices in OpenAI response".to_string()))?;

        let message = &choice.message;
        let content = message.content.as_deref().unwrap_or("").to_string();

        let usage = response.usage.map(|u| Usage {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
        });

        Ok(ChatResponse {
            message: ChatMessage {
                role: "assistant".to_string(),
                content,
            },
            usage,
        })
    }

    #[allow(deprecated)] // function_call field required by async-openai v0.20 struct
    pub async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<impl Stream<Item = Result<StreamEvent, AppError>>, AppError> {
        tracing::info!("Sending streaming chat completion request to OpenAI");

        // Convert our message format to OpenAI format (same as non-streaming)
        let messages: Result<Vec<ChatCompletionRequestMessage>, AppError> = request
            .messages
            .into_iter()
            .map(|msg| match msg.role.as_str() {
                "system" => Ok(ChatCompletionRequestMessage::System(
                    ChatCompletionRequestSystemMessage {
                        content: msg.content,
                        role: async_openai::types::Role::System,
                        name: None,
                    },
                )),
                "user" => Ok(ChatCompletionRequestMessage::User(
                    ChatCompletionRequestUserMessage {
                        content: async_openai::types::ChatCompletionRequestUserMessageContent::Text(
                            msg.content,
                        ),
                        role: async_openai::types::Role::User,
                        name: None,
                    },
                )),
                "assistant" => Ok(ChatCompletionRequestMessage::Assistant(
                    async_openai::types::ChatCompletionRequestAssistantMessage {
                        content: Some(msg.content),
                        role: async_openai::types::Role::Assistant,
                        name: None,
                        tool_calls: None,
                        function_call: None,
                    },
                )),
                _ => Err(AppError::BadRequest(format!("Invalid role: {}", msg.role))),
            })
            .collect();

        let messages = messages?;

        let openai_request = CreateChatCompletionRequest {
            model: request.model.unwrap_or(self.config.openai_model.clone()),
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

        Ok(stream.map(|result| {
            match result {
                Ok(response) => {
                    // Handle the streaming response
                    if let Some(choice) = response.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            return Ok(StreamEvent {
                                event_type: StreamEventType::Token,
                                data: Some(content.to_string()),
                            });
                        }
                        if choice.finish_reason.is_some() {
                            return Ok(StreamEvent {
                                event_type: StreamEventType::Done,
                                data: None,
                            });
                        }
                    }
                    // If no content, skip this chunk
                    Ok(StreamEvent {
                        event_type: StreamEventType::Token,
                        data: Some("".to_string()),
                    })
                }
                Err(e) => Ok(StreamEvent {
                    event_type: StreamEventType::Error,
                    data: Some(e.to_string()),
                }),
            }
        }))
    }
}
