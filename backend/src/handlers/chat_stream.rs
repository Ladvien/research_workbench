use axum::{
    extract::{Path, State},
    response::{sse::Event, Sse},
    Json,
};
use futures::Stream;
use futures::stream::StreamExt;
use serde_json;
use std::{convert::Infallible, time::Duration};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    llm::{ChatMessage, ChatRequest, LLMServiceFactory},
    models::{MessageRole, UserResponse},
};

#[derive(serde::Deserialize, Debug)]
pub struct StreamChatRequest {
    pub content: String,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

/// Create optimized streaming chunks for better performance than word-by-word streaming
fn create_optimized_streaming_chunks(content: &str, avg_chunk_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current_chunk = String::with_capacity(avg_chunk_size * 2);
    let words: Vec<&str> = content.split_whitespace().collect();

    for word in words {
        // Add word to current chunk
        if !current_chunk.is_empty() {
            current_chunk.push(' ');
        }
        current_chunk.push_str(word);

        // If chunk is getting close to target size, finish it
        if current_chunk.len() >= avg_chunk_size {
            // Try to end at a natural break point
            if word.ends_with(['.', '!', '?', ':', ';', ',']) {
                chunks.push(current_chunk.clone());
                current_chunk.clear();
            } else if current_chunk.len() >= avg_chunk_size * 2 {
                // Force break if too long
                chunks.push(current_chunk.clone());
                current_chunk.clear();
            }
        }
    }

    // Add remaining content
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    // Ensure we have reasonable chunks
    if chunks.is_empty() {
        chunks.push(content.to_string());
    }

    chunks
}

// Streaming endpoint that uses the actual LLM service
pub async fn stream_message(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse,
    Json(request): Json<StreamChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    tracing::info!(
        "Starting streaming for conversation {} from user {} with content: '{}'",
        conversation_id,
        user.id,
        request.content.chars().take(100).collect::<String>()
    );

    // Optimized: Get conversation and verify ownership in a single query
    tracing::debug!("Looking up conversation with ID: {} for user: {}", conversation_id, user.id);
    let conversation = sqlx::query_as::<_, crate::models::Conversation>(
        r#"
        SELECT id, user_id, title, model, provider, created_at, updated_at, metadata
        FROM conversations
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(conversation_id)
    .bind(user.id)
    .fetch_optional(app_state.dal.repositories.conversations.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    tracing::info!(
        "Found conversation: provider={}, model={}, title='{}'",
        conversation.provider,
        conversation.model,
        conversation.title.as_deref().unwrap_or("No title")
    );

    // Save user message to database
    tracing::debug!("Saving user message to database");
    let _user_message = app_state
        .chat_service
        .send_message(user.id, conversation_id, request.content.clone())
        .await?;
    tracing::debug!("User message saved successfully");

    // Get conversation history for context
    tracing::debug!("Loading conversation history");
    let messages = app_state
        .chat_service
        .get_conversation_messages(user.id, conversation_id)
        .await?;
    tracing::debug!(
        "Loaded {} messages for conversation context",
        messages.len()
    );

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
    let provider = match conversation.provider.to_lowercase().as_str() {
        "openai" | "open_a_i" => crate::llm::Provider::OpenAI,
        "anthropic" => crate::llm::Provider::Anthropic,
        "claude_code" | "claudecode" => crate::llm::Provider::ClaudeCode,
        _ => {
            // Try to derive provider from model ID as fallback
            match crate::llm::LLMServiceFactory::provider_from_model(&conversation.model) {
                Ok(provider) => provider,
                Err(_) => {
                    return Err(AppError::BadRequest(format!(
                        "Invalid provider '{}' and cannot derive from model '{}'",
                        conversation.provider, conversation.model
                    )))
                }
            }
        }
    };

    let llm_service = LLMServiceFactory::create_service(&provider, config)?;
    tracing::info!("Created LLM service for provider: {:?}", provider);

    // For now, since streaming isn't fully implemented in Claude Code,
    // let's do a non-streaming request and simulate streaming
    let llm_request_non_stream = ChatRequest {
        model: conversation.model.clone(),
        messages: chat_messages.clone(),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: Some(false),
    };

    tracing::info!(
        "Calling LLM service with model: {}, {} messages, provider: {:?}",
        conversation.model,
        chat_messages.len(),
        provider
    );

    // Call the LLM service
    let start_time = std::time::Instant::now();
    let llm_response = llm_service.chat_completion(llm_request_non_stream).await?;
    let duration = start_time.elapsed();

    tracing::info!(
        "LLM service call completed in {:?}, response length: {} chars",
        duration,
        llm_response.message.content.len()
    );

    // Save assistant response to database
    tracing::debug!("Saving assistant response to database");
    let assistant_message = app_state
        .chat_service
        .send_assistant_message(conversation_id, llm_response.message.content.clone())
        .await?;
    tracing::debug!("Assistant response saved with ID: {}", assistant_message.id);

    // Create a stream that sends the response as tokens
    let content = llm_response.message.content;
    let message_id = assistant_message.id;

    // Optimized: Create streaming chunks for better performance
    let chunks = create_optimized_streaming_chunks(&content, 15); // Average 15 chars per chunk

    tracing::info!(
        "Starting optimized stream simulation with {} chunks for message ID: {}",
        chunks.len(),
        message_id
    );

    // First send a start event with metadata
    let start_stream = futures::stream::once(async move {
        tracing::debug!("Sending stream start event for message ID: {}", message_id);
        Ok::<Event, Infallible>(
            Event::default().data(
                serde_json::json!({
                    "type": "start",
                    "data": {
                        "conversationId": conversation_id,
                        "messageId": message_id
                    }
                })
                .to_string(),
            ),
        )
    });

    // Send optimized chunks as token events with throttling for better perceived performance
    let chunk_stream = futures::stream::iter(chunks.into_iter().enumerate())
        .map(move |(i, chunk)| {
            tracing::trace!(
                "Sending chunk {} for message ID: {}: '{}'",
                i,
                message_id,
                chunk.chars().take(20).collect::<String>()
            );
            Ok::<Event, Infallible>(
                Event::default().data(
                    serde_json::json!({
                        "type": "token",
                        "data": {
                            "content": chunk
                        }
                    })
                    .to_string(),
                ),
            )
        }); // Removed throttle for now to fix compilation

    let stream = start_stream
        .chain(chunk_stream)
        .chain(futures::stream::once(async move {
            // Send completion event
            tracing::debug!(
                "Sending stream completion event for message ID: {}",
                message_id
            );
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
