use axum::{
    extract::{Path, State},
    response::Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    llm::{ChatMessage, ChatRequest, LLMServiceFactory},
    models::{MessageRole, UserResponse},
    repositories::Repository,
    services::{
        chat::{ChatService, SendMessageRequest},
        DataAccessLayer,
    },
};

// Send a message to a conversation with persistence
pub async fn send_message(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<SendMessageRequest>,
) -> Result<Json<Value>, AppError> {
    // Get the conversation to find out which model to use
    let conversation_repo = app_state.dal.conversations();
    let conversation = conversation_repo
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

    // Create LLM request
    let llm_request = ChatRequest {
        model: conversation.model.clone(),
        messages: chat_messages,
        temperature: None,
        max_tokens: None,
        stream: Some(false),
    };

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

    // Call the LLM service
    let llm_response = llm_service.chat_completion(llm_request).await?;

    // Save assistant response to database
    let assistant_message = app_state
        .chat_service
        .send_assistant_message(conversation_id, llm_response.message.content.clone())
        .await?;

    Ok(Json(serde_json::json!({
        "user_message": user_message,
        "assistant_message": assistant_message,
        "conversation_id": conversation_id,
        "status": "completed"
    })))
}

// Get all messages in a conversation
pub async fn get_messages(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let messages = app_state
        .chat_service
        .get_conversation_messages(user.id, conversation_id)
        .await?;

    Ok(Json(serde_json::json!({
        "conversation_id": conversation_id,
        "messages": messages,
        "total_count": messages.len()
    })))
}

// Create a message branch (for conversation threading)
pub async fn create_message_branch(
    State(app_state): State<AppState>,
    Path((_conversation_id, parent_id)): Path<(Uuid, Uuid)>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<CreateBranchRequest>,
) -> Result<Json<Value>, AppError> {
    let branch_message = app_state
        .chat_service
        .create_message_branch(user.id, parent_id, request.content, request.role)
        .await?;

    Ok(Json(serde_json::to_value(branch_message)?))
}

// Get message thread (all messages leading to a specific message)
pub async fn get_message_thread(
    State(app_state): State<AppState>,
    Path(message_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let thread = app_state
        .chat_service
        .get_message_thread(user.id, message_id)
        .await?;
    Ok(Json(serde_json::to_value(thread)?))
}

#[derive(serde::Deserialize)]
pub struct CreateBranchRequest {
    pub content: String,
    pub role: crate::models::MessageRole,
}

// Helper function to create chat service from DAL
pub fn create_chat_service(dal: DataAccessLayer) -> ChatService {
    ChatService::new(dal)
}
