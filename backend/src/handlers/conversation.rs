use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    models::{CreateConversationRequest, PaginationParams, UserResponse},
    services::{conversation::ConversationService, DataAccessLayer},
};

// Create a new conversation
pub async fn create_conversation(
    State(app_state): State<AppState>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<CreateConversationRequest>,
) -> Result<Json<Value>, AppError> {
    let conversation = app_state.conversation_service.create_conversation(user.id, request).await?;
    Ok(Json(serde_json::to_value(conversation)?))
}

// Get user's conversations with pagination (temporary - no auth for now)
pub async fn get_user_conversations() -> Result<Json<Value>, AppError> {
    // For now, return empty array until authentication is properly configured
    let empty_conversations: Vec<serde_json::Value> = vec![];
    Ok(Json(serde_json::to_value(empty_conversations)?))
}

// Get a specific conversation with messages
pub async fn get_conversation(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    match app_state
        .conversation_service
        .get_conversation_with_messages(conversation_id, user.id)
        .await?
    {
        Some(conversation) => Ok(Json(serde_json::to_value(conversation)?)),
        None => Err(AppError::NotFound("Conversation not found".to_string())),
    }
}

// Update conversation title
pub async fn update_conversation_title(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<UpdateTitleRequest>,
) -> Result<Json<Value>, AppError> {
    let updated = app_state
        .conversation_service
        .update_conversation_title(conversation_id, user.id, request.title)
        .await?;

    if updated {
        Ok(Json(serde_json::json!({"success": true})))
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Delete a conversation
pub async fn delete_conversation(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<StatusCode, AppError> {
    let deleted = app_state
        .conversation_service
        .delete_conversation(conversation_id, user.id)
        .await?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Get conversation statistics
pub async fn get_conversation_stats(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let stats = app_state
        .conversation_service
        .get_conversation_stats(conversation_id, user.id)
        .await?;
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
