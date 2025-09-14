use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    models::{
        ConversationTreeResponse, EditMessageRequest, EditMessageResponse, SwitchBranchRequest,
        SwitchBranchResponse, UserResponse,
    },
    repositories::{message::MessageRepository, Repository},
};

/// Edit a message and create a new branch
pub async fn edit_message(
    State(app_state): State<AppState>,
    Path(message_id): Path<Uuid>,
    user: UserResponse,
    Json(request): Json<EditMessageRequest>,
) -> Result<Json<EditMessageResponse>, AppError> {
    // Validate user owns the message through conversation ownership
    let message_repo = app_state.dal.messages();
    let conversation_repo = app_state.dal.conversations();

    // Get the original message
    let original_message = message_repo
        .find_by_id(message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    // Verify user owns the conversation
    let conversation = conversation_repo
        .find_by_id(original_message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Get messages that will be deactivated (downstream from edit point)
    let downstream_messages = get_downstream_messages(&message_repo, message_id).await?;
    let affected_message_ids: Vec<Uuid> = downstream_messages.iter().map(|m| m.id).collect();

    // Perform the edit and branch creation
    let edited_message = message_repo
        .edit_message_and_branch(message_id, request.content)
        .await?;

    Ok(Json(EditMessageResponse {
        message: edited_message,
        affected_messages: affected_message_ids,
    }))
}

/// Switch to a different branch in the conversation
pub async fn switch_branch(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse,
    Json(request): Json<SwitchBranchRequest>,
) -> Result<Json<SwitchBranchResponse>, AppError> {
    let message_repo = app_state.dal.messages();
    let conversation_repo = app_state.dal.conversations();

    // Verify user owns the conversation
    let conversation = conversation_repo
        .find_by_id(conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Switch to the target branch
    let active_messages = message_repo
        .switch_to_branch(request.target_message_id)
        .await?;

    Ok(Json(SwitchBranchResponse {
        active_messages,
        success: true,
    }))
}

/// Get the full conversation tree with branch information
pub async fn get_conversation_tree(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse,
) -> Result<Json<ConversationTreeResponse>, AppError> {
    let message_repo = app_state.dal.messages();
    let conversation_repo = app_state.dal.conversations();

    // Verify user owns the conversation
    let conversation = conversation_repo
        .find_by_id(conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Get all messages in the conversation tree
    let all_messages = message_repo.find_conversation_tree(conversation_id).await?;

    // Get branch information
    let branches = message_repo
        .get_conversation_branches(conversation_id)
        .await?;

    // Get the current active thread
    let active_thread = message_repo
        .find_active_conversation_thread(conversation_id)
        .await?;
    let active_thread_ids: Vec<Uuid> = active_thread.iter().map(|m| m.id).collect();

    Ok(Json(ConversationTreeResponse {
        messages: all_messages,
        branches,
        active_thread: active_thread_ids,
    }))
}

/// Get branches for a specific message
pub async fn get_message_branches(
    State(app_state): State<AppState>,
    Path(message_id): Path<Uuid>,
    user: UserResponse,
) -> Result<Json<Value>, AppError> {
    let message_repo = app_state.dal.messages();
    let conversation_repo = app_state.dal.conversations();

    // Get the message to verify conversation ownership
    let message = message_repo
        .find_by_id(message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    // Verify user owns the conversation
    let conversation = conversation_repo
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Get branches for this message
    let branches = message_repo.find_message_branches(message_id).await?;

    Ok(Json(serde_json::to_value(branches)?))
}

/// Delete a message (soft delete by setting is_active = false)
pub async fn delete_message(
    State(app_state): State<AppState>,
    Path(message_id): Path<Uuid>,
    user: UserResponse,
) -> Result<StatusCode, AppError> {
    let message_repo = app_state.dal.messages();
    let conversation_repo = app_state.dal.conversations();

    // Get the message to verify conversation ownership
    let message = message_repo
        .find_by_id(message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    // Verify user owns the conversation
    let conversation = conversation_repo
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    // Perform soft delete
    let deleted = message_repo.delete(message_id).await?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound("Message not found".to_string()))
    }
}

/// Helper function to get downstream messages (messages that will be affected by editing)
async fn get_downstream_messages(
    message_repo: &MessageRepository,
    message_id: Uuid,
) -> Result<Vec<crate::models::Message>, AppError> {
    // This is a simplified version - in a real implementation, you'd want to
    // recursively find all child messages that would be deactivated
    let branches = message_repo.find_message_branches(message_id).await?;
    Ok(branches)
}
