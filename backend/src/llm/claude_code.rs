use async_trait::async_trait;
use futures::Stream;
use serde::Deserialize;
use std::pin::Pin;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use super::{ChatMessage, ChatRequest, ChatResponse, LLMService, ModelInfo, Provider, StreamEvent, StreamEventType, Usage};
use crate::config::AppConfig;
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct ClaudeCodeService {
    config: AppConfig,
    session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct ClaudeCodeResponse {
    #[serde(rename = "type")]
    response_type: String,
    subtype: Option<String>,
    result: String,
    session_id: Option<String>,
    #[serde(default)]
    usage: Option<ClaudeCodeUsage>,
    #[serde(rename = "modelUsage")]
    model_usage: Option<std::collections::HashMap<String, ClaudeCodeModelUsage>>,
}

#[derive(Debug, Deserialize)]
struct ClaudeCodeUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCodeModelUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_read_input_tokens: Option<u32>,
    cache_creation_input_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ClaudeCodeStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    content: Option<String>,
    usage: Option<ClaudeCodeUsage>,
    model: Option<String>,
}

impl ClaudeCodeService {
    pub fn new(config: AppConfig) -> Result<Self, AppError> {
        Ok(Self {
            config,
            session_id: None,
        })
    }

    pub fn with_session_id(mut self, session_id: Uuid) -> Self {
        self.session_id = Some(session_id);
        self
    }

    async fn execute_claude_command(&self, prompt: &str, stream: bool) -> Result<tokio::process::Child, AppError> {
        let mut cmd = Command::new("claude");

        // Add basic flags
        cmd.arg("--print"); // Non-interactive mode

        if stream {
            cmd.arg("--output-format").arg("stream-json");
        } else {
            cmd.arg("--output-format").arg("json");
        }

        // Add model specification if configured
        if !self.config.claude_code_model.is_empty() {
            // Extract model name from full model ID (e.g., "claude-3-5-sonnet-20241022" -> "sonnet")
            let model_name = if self.config.claude_code_model.contains("sonnet") {
                "sonnet"
            } else if self.config.claude_code_model.contains("haiku") {
                "haiku"
            } else if self.config.claude_code_model.contains("opus") {
                "opus"
            } else {
                "sonnet" // default
            };
            cmd.arg("--model").arg(model_name);
        }

        // Add session ID for conversation continuity
        if let Some(session_id) = self.session_id {
            cmd.arg("--session-id").arg(session_id.to_string());
        }

        // Add the prompt
        cmd.arg(prompt);

        // Configure stdio
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        tracing::debug!("Executing Claude Code CLI command: {:?}", cmd);

        let child = cmd.spawn().map_err(|e| {
            tracing::error!("Failed to spawn Claude Code CLI process: {}", e);
            AppError::InternalServerError(format!("Claude Code CLI not available: {}", e))
        })?;

        Ok(child)
    }

    fn convert_usage(
        usage: Option<ClaudeCodeUsage>,
        model_usage: Option<&std::collections::HashMap<String, ClaudeCodeModelUsage>>
    ) -> Option<Usage> {
        // Prefer model_usage if available, fallback to usage
        if let Some(model_usage_map) = model_usage {
            if let Some((_, model_usage)) = model_usage_map.iter().next() {
                let input_tokens = model_usage.input_tokens.unwrap_or(0)
                    + model_usage.cache_read_input_tokens.unwrap_or(0)
                    + model_usage.cache_creation_input_tokens.unwrap_or(0);
                let output_tokens = model_usage.output_tokens.unwrap_or(0);
                return Some(Usage {
                    prompt_tokens: input_tokens,
                    completion_tokens: output_tokens,
                    total_tokens: input_tokens + output_tokens,
                });
            }
        }

        // Fallback to legacy usage format
        usage.map(|u| Usage {
            prompt_tokens: u.input_tokens.unwrap_or(0),
            completion_tokens: u.output_tokens.unwrap_or(0),
            total_tokens: u.total_tokens.unwrap_or(
                u.input_tokens.unwrap_or(0) + u.output_tokens.unwrap_or(0)
            ),
        })
    }

    fn build_prompt_from_messages(messages: &[ChatMessage]) -> String {
        if messages.len() == 1 {
            // Single message - just return the content
            messages[0].content.clone()
        } else {
            // Multiple messages - format as conversation
            let mut prompt = String::new();
            for (i, message) in messages.iter().enumerate() {
                if i > 0 {
                    prompt.push('\n');
                }
                match message.role.as_str() {
                    "user" => prompt.push_str(&format!("Human: {}", message.content)),
                    "assistant" => prompt.push_str(&format!("Assistant: {}", message.content)),
                    "system" => prompt.push_str(&format!("System: {}", message.content)),
                    _ => prompt.push_str(&message.content),
                }
            }
            prompt
        }
    }
}

#[async_trait]
impl LLMService for ClaudeCodeService {
    fn provider(&self) -> Provider {
        Provider::ClaudeCode
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "claude-code-sonnet".to_string(),
                name: "Claude 3.5 Sonnet (via Claude Code)".to_string(),
                provider: Provider::ClaudeCode,
                max_tokens: 8192,
                supports_streaming: true,
                cost_per_token: None, // No direct cost since using subscription
            },
            ModelInfo {
                id: "claude-code-haiku".to_string(),
                name: "Claude 3.5 Haiku (via Claude Code)".to_string(),
                provider: Provider::ClaudeCode,
                max_tokens: 8192,
                supports_streaming: true,
                cost_per_token: None,
            },
            ModelInfo {
                id: "claude-code-opus".to_string(),
                name: "Claude 3 Opus (via Claude Code)".to_string(),
                provider: Provider::ClaudeCode,
                max_tokens: 4096,
                supports_streaming: true,
                cost_per_token: None,
            },
        ]
    }

    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        if !self.config.claude_code_enabled {
            return Err(AppError::BadRequest("Claude Code integration is disabled".to_string()));
        }

        let prompt = Self::build_prompt_from_messages(&request.messages);
        let child = self.execute_claude_command(&prompt, false).await?;

        let output = child.wait_with_output().await.map_err(|e| {
            tracing::error!("Failed to wait for Claude Code CLI process: {}", e);
            AppError::InternalServerError(format!("Claude Code CLI execution failed: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!("Claude Code CLI failed with status {}: {}", output.status, stderr);
            return Err(AppError::InternalServerError(format!(
                "Claude Code CLI failed: {}", stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        tracing::debug!("Claude Code CLI response: {}", stdout);

        let claude_response: ClaudeCodeResponse = serde_json::from_str(&stdout)
            .map_err(|e| {
                tracing::error!("Failed to parse Claude Code CLI JSON response: {} - Response: {}", e, stdout);
                AppError::InternalServerError(format!("Failed to parse Claude Code response: {}", e))
            })?;

        Ok(ChatResponse {
            message: ChatMessage {
                role: "assistant".to_string(),
                content: claude_response.result,
            },
            usage: Self::convert_usage(claude_response.usage, claude_response.model_usage.as_ref()),
            model: request.model.clone(),
            provider: "claude-code".to_string(),
        })
    }

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, AppError>> + Send>>, AppError> {
        if !self.config.claude_code_enabled {
            return Err(AppError::BadRequest("Claude Code integration is disabled".to_string()));
        }

        let prompt = Self::build_prompt_from_messages(&request.messages);
        let mut child = self.execute_claude_command(&prompt, true).await?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::InternalServerError("Failed to capture Claude Code CLI stdout".to_string())
        })?;

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        let stream = async_stream::stream! {
            while let Some(line) = lines.next_line().await.unwrap_or(None) {
                if line.trim().is_empty() {
                    continue;
                }

                match serde_json::from_str::<ClaudeCodeStreamEvent>(&line) {
                    Ok(event) => {
                        match event.event_type.as_str() {
                            "content_block_delta" | "content" => {
                                if let Some(content) = event.content {
                                    yield Ok(StreamEvent {
                                        event_type: StreamEventType::Token,
                                        data: Some(content),
                                        usage: Self::convert_usage(event.usage, None),
                                        model: event.model,
                                        provider: Some("claude-code".to_string()),
                                    });
                                }
                            }
                            "message_stop" | "done" => {
                                yield Ok(StreamEvent {
                                    event_type: StreamEventType::Done,
                                    data: None,
                                    usage: Self::convert_usage(event.usage, None),
                                    model: event.model,
                                    provider: Some("claude-code".to_string()),
                                });
                                break;
                            }
                            "error" => {
                                yield Err(AppError::InternalServerError(
                                    event.content.unwrap_or_else(|| "Unknown Claude Code error".to_string())
                                ));
                                break;
                            }
                            _ => {
                                // Ignore unknown event types
                                tracing::debug!("Unknown Claude Code stream event type: {}", event.event_type);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to parse Claude Code stream event: {} - Line: {}", e, line);
                        yield Err(AppError::InternalServerError(format!("Stream parsing error: {}", e)));
                        break;
                    }
                }
            }

            // Wait for the process to complete
            if let Err(e) = child.wait().await {
                tracing::error!("Claude Code CLI process failed: {}", e);
                yield Err(AppError::InternalServerError(format!("Claude Code CLI process failed: {}", e)));
            }
        };

        Ok(Box::pin(stream))
    }
}