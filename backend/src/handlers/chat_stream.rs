use axum::{
    extract::{Path, State},
    response::{sse::Event, Sse},
    Json,
};
use futures::{Stream, StreamExt};
use serde_json;
use std::{convert::Infallible, time::Duration};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    llm::{ChatMessage, ChatRequest, LLMServiceFactory},
    models::{MessageRole, UserResponse},
    repositories::Repository,
};

#[derive(serde::Deserialize, Debug)]
pub struct StreamChatRequest {
    pub content: String,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

// Streaming endpoint that uses the actual LLM service
pub async fn stream_message(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse,
    Json(request): Json<StreamChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    tracing::info!("Starting streaming for conversation {}", conversation_id);

    // Get the conversation to find out which model to use
    let conversation = app_state
        .dal
        .conversations()
        .find_by_id(conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    // Verify user owns the conversation
    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Save user message to database
    let user_message = app_state
        .chat_service
        .send_message(user.id, conversation_id, request.content.clone())
        .await?;

    // Get conversation history for context
    let messages = app_state
        .chat_service
        .get_conversation_messages(user.id, conversation_id)
        .await?;

    // Convert messages to LLM format
    let chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|msg| ChatMessage {
            role: match msg.role {
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::System => "system".to_string(),
            },
            content: msg.content.clone(),
        })
        .collect();

    // Get the appropriate LLM service
    let config = &app_state.config;
    let provider = match conversation.provider.as_str() {
        "open_a_i" | "openai" | "OpenAI" => crate::llm::Provider::OpenAI,
        "anthropic" | "Anthropic" => crate::llm::Provider::Anthropic,
        "claude_code" | "ClaudeCode" => crate::llm::Provider::ClaudeCode,
        _ => {
            return Err(AppError::BadRequest(format!(
                "Invalid provider: {}",
                conversation.provider
            )))
        }
    };

    let llm_service = LLMServiceFactory::create_service(&provider, config)?;

    // For now, since streaming isn't fully implemented in Claude Code,
    // let's do a non-streaming request and simulate streaming
    let llm_request_non_stream = ChatRequest {
        model: conversation.model.clone(),
        messages: chat_messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: Some(false),
    };

    // Call the LLM service
    let llm_response = llm_service.chat_completion(llm_request_non_stream).await?;

    // Save assistant response to database
    let assistant_message = app_state
        .chat_service
        .send_assistant_message(conversation_id, llm_response.message.content.clone())
        .await?;

    // Create a stream that sends the response as tokens
    let content = llm_response.message.content;
    let message_id = assistant_message.id;

    // Split the content into words for simulated streaming
    let words: Vec<String> = content
        .split_whitespace()
        .map(|w| format!("{} ", w))
        .collect();

    let stream = futures::stream::iter(words.into_iter().enumerate())
        .map(move |(i, word)| {
            let event = if i == 0 {
                // Send initial metadata
                Event::default().event("start").data(
                    serde_json::json!({
                        "type": "start",
                        "data": {
                            "conversationId": conversation_id,
                            "messageId": message_id
                        }
                    })
                    .to_string(),
                )
            } else {
                // Send token
                Event::default().data(
                    serde_json::json!({
                        "type": "token",
                        "data": {
                            "content": word
                        }
                    })
                    .to_string(),
                )
            };

            Ok::<Event, Infallible>(event)
        })
        .chain(futures::stream::once(async move {
            // Send completion event
            Ok::<Event, Infallible>(
                Event::default().data(
                    serde_json::json!({
                        "type": "done",
                        "data": {
                            "messageId": message_id.to_string()
                        }
                    })
                    .to_string(),
                ),
            )
        }));

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("keep-alive"),
    ))
}
