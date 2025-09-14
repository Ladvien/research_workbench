use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{CreateConversationRequest, PaginationParams},
    services::{conversation::ConversationService, DataAccessLayer},
};

pub type ConversationState = State<ConversationService>;

// Create a new conversation
pub async fn create_conversation(
    State(service): ConversationState,
    Extension(user_id): Extension<Uuid>, // This would come from auth middleware
    Json(request): Json<CreateConversationRequest>,
) -> Result<Json<Value>, AppError> {
    let conversation = service.create_conversation(user_id, request).await?;
    Ok(Json(serde_json::to_value(conversation)?))
}

// Get user's conversations with pagination
pub async fn get_user_conversations(
    State(service): ConversationState,
    Extension(user_id): Extension<Uuid>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<Value>, AppError> {
    let conversations = service.get_user_conversations(user_id, pagination).await?;
    Ok(Json(serde_json::to_value(conversations)?))
}

// Get a specific conversation with messages
pub async fn get_conversation(
    State(service): ConversationState,
    Path(conversation_id): Path<Uuid>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<Value>, AppError> {
    match service
        .get_conversation_with_messages(conversation_id, user_id)
        .await?
    {
        Some(conversation) => Ok(Json(serde_json::to_value(conversation)?)),
        None => Err(AppError::NotFound("Conversation not found".to_string())),
    }
}

// Update conversation title
pub async fn update_conversation_title(
    State(service): ConversationState,
    Path(conversation_id): Path<Uuid>,
    Extension(user_id): Extension<Uuid>,
    Json(request): Json<UpdateTitleRequest>,
) -> Result<Json<Value>, AppError> {
    let updated = service
        .update_conversation_title(conversation_id, user_id, request.title)
        .await?;

    if updated {
        Ok(Json(serde_json::json!({"success": true})))
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Delete a conversation
pub async fn delete_conversation(
    State(service): ConversationState,
    Path(conversation_id): Path<Uuid>,
    Extension(user_id): Extension<Uuid>,
) -> Result<StatusCode, AppError> {
    let deleted = service.delete_conversation(conversation_id, user_id).await?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Get conversation statistics
pub async fn get_conversation_stats(
    State(service): ConversationState,
    Path(conversation_id): Path<Uuid>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<Value>, AppError> {
    let stats = service.get_conversation_stats(conversation_id, user_id).await?;
    Ok(Json(serde_json::to_value(stats)?))
}

#[derive(serde::Deserialize)]
pub struct UpdateTitleRequest {
    pub title: String,
}

// Helper function to create conversation service from DAL
pub fn create_conversation_service(dal: DataAccessLayer) -> ConversationService {
    ConversationService::new(dal)
}