use async_trait::async_trait;
use futures::Stream;
use serde::Deserialize;
use std::pin::Pin;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;

use super::{
    ChatMessage, ChatRequest, ChatResponse, LLMService, ModelInfo, Provider, StreamEvent,
    StreamEventType, Usage,
};
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
    #[allow(dead_code)]
    response_type: String,
    #[allow(dead_code)]
    subtype: Option<String>,
    #[allow(dead_code)]
    is_error: Option<bool>,
    #[allow(dead_code)]
    duration_ms: Option<u64>,
    #[allow(dead_code)]
    duration_api_ms: Option<u64>,
    #[allow(dead_code)]
    num_turns: Option<u32>,
    result: String,
    #[allow(dead_code)]
    session_id: Option<String>,
    #[allow(dead_code)]
    total_cost_usd: Option<f64>,
    #[serde(default)]
    usage: Option<ClaudeCodeUsage>,
    #[serde(rename = "modelUsage")]
    model_usage: Option<std::collections::HashMap<String, ClaudeCodeModelUsage>>,
    #[allow(dead_code)]
    permission_denials: Option<Vec<serde_json::Value>>,
    #[allow(dead_code)]
    uuid: Option<String>,
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

    async fn check_claude_cli_availability(&self) -> Result<(), AppError> {
        // Check if Claude CLI is available
        let claude_path = if cfg!(target_os = "macos") {
            "/opt/homebrew/bin/claude"
        } else {
            "/home/ladvien/.npm-global/bin/claude"
        };

        let output = std::process::Command::new(claude_path)
            .arg("--version")
            .output();

        match output {
            Ok(output) if output.status.success() => {
                tracing::debug!(
                    "Claude CLI available: {}",
                    String::from_utf8_lossy(&output.stdout)
                );
                Ok(())
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(AppError::InternalServerError(format!(
                    "Claude CLI failed version check: {}",
                    stderr
                )))
            }
            Err(e) => Err(AppError::InternalServerError(format!(
                "Claude CLI not found at {}: {}",
                claude_path, e
            ))),
        }
    }

    async fn execute_claude_command(
        &self,
        prompt: &str,
        stream: bool,
    ) -> Result<(tokio::process::Child, String), AppError> {
        // Check CLI availability first
        self.check_claude_cli_availability().await?;

        let claude_path = if cfg!(target_os = "macos") {
            "/opt/homebrew/bin/claude"
        } else {
            "/home/ladvien/.npm-global/bin/claude"
        };

        let mut cmd = Command::new(claude_path);

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

        // Configure stdio and working directory
        let working_dir = if cfg!(target_os = "macos") {
            "/Users/ladvien/research_workbench"
        } else {
            "/mnt/datadrive_m2/research_workbench"
        };

        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .current_dir(working_dir);

        // Set up a minimal, clean environment for Claude CLI
        // Only preserve essential environment variables needed for Claude authentication
        cmd.env_clear();

        // Essential system variables
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }
        if let Ok(user) = std::env::var("USER") {
            cmd.env("USER", user);
        }
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }

        // Claude-specific environment variables (if they exist)
        for var in [
            "CLAUDECODE",
            "CLAUDE_CODE_ENTRYPOINT",
            "CLAUDE_CODE_SSE_PORT",
        ] {
            if let Ok(value) = std::env::var(var) {
                tracing::debug!("Preserving environment variable: {}={}", var, value);
                cmd.env(var, value);
            }
        }

        // Get the final command for debugging
        let claude_path = if cfg!(target_os = "macos") {
            "/opt/homebrew/bin/claude"
        } else {
            "/home/ladvien/.npm-global/bin/claude"
        };

        let args: Vec<String> = std::iter::once(claude_path.to_string())
            .chain(
                cmd.as_std()
                    .get_args()
                    .map(|s| s.to_string_lossy().to_string()),
            )
            .collect();
        let command_debug = format!("Command: {:?}", args);
        tracing::info!("Executing Claude Code CLI: {}", command_debug);

        // Log environment variables being passed
        tracing::debug!("Environment variables passed to Claude CLI:");
        for (key, value) in cmd.as_std().get_envs() {
            if let (Some(k), Some(v)) = (key.to_str(), value.and_then(|v| v.to_str())) {
                tracing::debug!("  {}={}", k, v);
            }
        }

        let child = cmd.spawn().map_err(|e| {
            tracing::error!("Failed to spawn Claude Code CLI process: {}", e);
            tracing::error!("Command: {}", command_debug);
            AppError::InternalServerError(format!("Claude Code CLI not available: {}", e))
        })?;

        tracing::debug!(
            "Claude Code CLI process spawned successfully, PID: {:?}",
            child.id()
        );
        Ok((child, command_debug))
    }

    fn convert_usage(
        usage: Option<ClaudeCodeUsage>,
        model_usage: Option<&std::collections::HashMap<String, ClaudeCodeModelUsage>>,
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
            total_tokens: u
                .total_tokens
                .unwrap_or(u.input_tokens.unwrap_or(0) + u.output_tokens.unwrap_or(0)),
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
            return Err(AppError::BadRequest(
                "Claude Code integration is disabled".to_string(),
            ));
        }

        let prompt = Self::build_prompt_from_messages(&request.messages);
        tracing::info!("Claude Code chat_completion prompt: '{}'", prompt);
        let (child, command_debug) = self.execute_claude_command(&prompt, false).await?;

        // Add timeout to prevent hanging - Claude Code should respond within 120 seconds
        let timeout_duration = Duration::from_secs(120);
        tracing::debug!(
            "Waiting for Claude Code CLI response with timeout: {:?}",
            timeout_duration
        );

        let output = timeout(timeout_duration, child.wait_with_output())
            .await
            .map_err(|_| {
                tracing::error!(
                    "Claude Code CLI process timed out after {:?}",
                    timeout_duration
                );
                AppError::InternalServerError(format!(
                    "Claude Code CLI process timed out after {:?}",
                    timeout_duration
                ))
            })?
            .map_err(|e| {
                tracing::error!("Failed to wait for Claude Code CLI process: {}", e);
                AppError::InternalServerError(format!("Claude Code CLI execution failed: {}", e))
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // If command failed but we have JSON output, try to parse it for error details
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!("Claude Code CLI failed with status {}", output.status);
            tracing::error!("Claude Code CLI stderr: '{}'", stderr);
            tracing::error!("Claude Code CLI stdout: '{}'", stdout);
            let working_dir = if cfg!(target_os = "macos") {
                "/Users/ladvien/research_workbench"
            } else {
                "/mnt/datadrive_m2/research_workbench"
            };
            tracing::error!("Claude Code CLI working directory: {}", working_dir);
            tracing::error!("Claude Code CLI command: {}", command_debug);

            // Try to parse the JSON response to get a more specific error
            if let Ok(claude_response) = serde_json::from_str::<ClaudeCodeResponse>(&stdout) {
                if claude_response.is_error.unwrap_or(false) {
                    tracing::error!("Claude Code API error: {}", claude_response.result);
                    return Err(AppError::InternalServerError(format!(
                        "Claude Code API error: {}",
                        claude_response.result
                    )));
                }
            }

            return Err(AppError::InternalServerError(format!(
                "Claude Code CLI failed with status {}: stderr: '{}', stdout: '{}'",
                output.status, stderr, stdout
            )));
        }

        tracing::debug!("Claude Code CLI response: {}", stdout);

        let claude_response: ClaudeCodeResponse = serde_json::from_str(&stdout).map_err(|e| {
            tracing::error!(
                "Failed to parse Claude Code CLI JSON response: {} - Response: {}",
                e,
                stdout
            );
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
            return Err(AppError::BadRequest(
                "Claude Code integration is disabled".to_string(),
            ));
        }

        let prompt = Self::build_prompt_from_messages(&request.messages);
        let (mut child, _command_debug) = self.execute_claude_command(&prompt, true).await?;

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
