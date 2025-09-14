use crate::app_state::AppState;
use crate::error::AppError;
use crate::models::UserResponse;
use crate::models::{AttachmentResponse, FileUploadResponse};
use crate::repositories::Repository;
use crate::services::file::{FileService, FileUploadForm};
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue};
use axum::response::Response;
use axum_typed_multipart::TypedMultipart;
use std::str::FromStr;
use uuid::Uuid;

pub async fn upload_file(
    State(state): State<AppState>,
    user: UserResponse,
    TypedMultipart(form): TypedMultipart<FileUploadForm>,
) -> Result<axum::Json<FileUploadResponse>, AppError> {
    tracing::info!("File upload request from user: {}", user.id);

    // Parse message_id from form data
    let message_id = Uuid::from_str(&form.message_id)
        .map_err(|_| AppError::BadRequest("Invalid message_id format".to_string()))?;

    // Verify that the message exists and belongs to the user
    let message = state
        .dal
        .messages()
        .find_by_id(message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    let conversation = state
        .dal
        .conversations()
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    // Verify user owns the conversation
    if conversation.user_id != user.id {
        return Err(AppError::Forbidden(
            "You don't have permission to upload files to this message".to_string(),
        ));
    }

    // Check user storage quota (example: 100MB per user)
    const MAX_USER_STORAGE: i64 = 100 * 1024 * 1024; // 100MB
    let file_service = FileService::new(state.dal.attachments().clone(), state.config.storage_path.clone());
    let current_usage = file_service.get_user_storage_usage(user.id).await?;

    let file_size = form.file.contents.as_file().metadata()?.len() as i64;
    if current_usage + file_size > MAX_USER_STORAGE {
        return Err(AppError::BadRequest(format!(
            "Upload would exceed storage quota. Current usage: {}MB, Max: {}MB",
            current_usage / (1024 * 1024),
            MAX_USER_STORAGE / (1024 * 1024)
        )));
    }

    // Upload the file
    let upload_result = file_service.upload_file(message_id, form.file).await?;

    tracing::info!(
        "File uploaded successfully: {} ({})",
        upload_result.filename,
        upload_result.id
    );

    Ok(axum::Json(upload_result))
}

pub async fn download_file(
    State(state): State<AppState>,
    user: UserResponse,
    Path(attachment_id): Path<Uuid>,
) -> Result<Response, AppError> {
    tracing::info!("File download request: {} from user: {}", attachment_id, user.id);

    let file_service = FileService::new(state.dal.attachments().clone(), state.config.storage_path.clone());
    let (attachment, file_content) = file_service.get_file(attachment_id).await?;

    // Verify user has access to this file by checking message ownership
    let message = state
        .dal
        .messages()
        .find_by_id(attachment.message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    let conversation = state
        .dal
        .conversations()
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden(
            "You don't have permission to download this file".to_string(),
        ));
    }

    // Create response with appropriate headers
    let mut headers = HeaderMap::new();

    if let Some(content_type) = &attachment.content_type {
        headers.insert("content-type", HeaderValue::from_str(content_type)?);
    } else {
        headers.insert("content-type", HeaderValue::from_static("application/octet-stream"));
    }

    headers.insert(
        "content-disposition",
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", attachment.filename))?,
    );

    if let Some(size) = attachment.size_bytes {
        headers.insert("content-length", HeaderValue::from_str(&size.to_string())?);
    }

    let response = Response::builder()
        .status(200)
        .body(axum::body::Body::from(file_content))?;

    let (mut parts, body) = response.into_parts();
    parts.headers = headers;

    Ok(Response::from_parts(parts, body))
}

pub async fn delete_file(
    State(state): State<AppState>,
    user: UserResponse,
    Path(attachment_id): Path<Uuid>,
) -> Result<axum::Json<serde_json::Value>, AppError> {
    tracing::info!("File delete request: {} from user: {}", attachment_id, user.id);

    // Get attachment to verify ownership
    let attachment = state
        .dal
        .attachments()
        .find_by_id(attachment_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Attachment not found".to_string()))?;

    // Verify user has access to delete this file
    let message = state
        .dal
        .messages()
        .find_by_id(attachment.message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    let conversation = state
        .dal
        .conversations()
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden(
            "You don't have permission to delete this file".to_string(),
        ));
    }

    // Delete the file
    let file_service = FileService::new(state.dal.attachments().clone(), state.config.storage_path.clone());
    let deleted = file_service.delete_file(attachment_id).await?;

    if deleted {
        tracing::info!("File deleted successfully: {}", attachment_id);
        Ok(axum::Json(serde_json::json!({
            "success": true,
            "message": "File deleted successfully"
        })))
    } else {
        Err(AppError::InternalServerError(
            "Failed to delete file".to_string(),
        ))
    }
}

pub async fn get_message_attachments(
    State(state): State<AppState>,
    user: UserResponse,
    Path(message_id): Path<Uuid>,
) -> Result<axum::Json<Vec<AttachmentResponse>>, AppError> {
    tracing::info!("Get message attachments: {} from user: {}", message_id, user.id);

    // Verify user has access to this message
    let message = state
        .dal
        .messages()
        .find_by_id(message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".to_string()))?;

    let conversation = state
        .dal
        .conversations()
        .find_by_id(message.conversation_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Conversation not found".to_string()))?;

    if conversation.user_id != user.id {
        return Err(AppError::Forbidden(
            "You don't have permission to access this message's attachments".to_string(),
        ));
    }

    // Get attachments
    let file_service = FileService::new(state.dal.attachments().clone(), state.config.storage_path.clone());
    let attachments = file_service.get_message_attachments(message_id).await?;

    Ok(axum::Json(attachments))
}