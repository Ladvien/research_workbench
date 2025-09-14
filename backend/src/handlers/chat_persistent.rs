use axum::{
    extract::{Path, State},
    response::Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::UserResponse,
    services::{chat::{ChatService, SendMessageRequest}, DataAccessLayer},
};

pub type ChatState = State<ChatService>;

// Send a message to a conversation with persistence
pub async fn send_message(
    State(service): ChatState,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<SendMessageRequest>,
) -> Result<Json<Value>, AppError> {
    // Save user message to database
    let user_message = service
        .send_message(user.id, conversation_id, request.content.clone())
        .await?;

    // For now, we'll just return the saved message
    // Later we can integrate with LLM here to generate assistant response
    Ok(Json(serde_json::json!({
        "user_message": user_message,
        "conversation_id": conversation_id,
        "status": "saved"
    })))
}

// Get all messages in a conversation
pub async fn get_messages(
    State(service): ChatState,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let messages = service
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
    State(service): ChatState,
    Path((_conversation_id, parent_id)): Path<(Uuid, Uuid)>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<CreateBranchRequest>,
) -> Result<Json<Value>, AppError> {
    let branch_message = service
        .create_message_branch(user.id, parent_id, request.content, request.role)
        .await?;

    Ok(Json(serde_json::to_value(branch_message)?))
}

// Get message thread (all messages leading to a specific message)
pub async fn get_message_thread(
    State(service): ChatState,
    Path(message_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let thread = service.get_message_thread(user.id, message_id).await?;
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