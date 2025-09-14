use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use tower_sessions::Session;
use validator::Validate;

use crate::{
    app_state::AppState,
    error::AppError,
    models::{LoginRequest, RegisterRequest, UserResponse},
};

// Register endpoint
pub async fn register(
    State(app_state): State<AppState>,
    session: Session,
    Json(payload): Json<RegisterRequest>,
) -> Result<Response, AppError> {
    // Validate request
    payload.validate().map_err(|e| {
        AppError::ValidationError {
            field: "payload".to_string(),
            message: format!("Validation failed: {}", e),
        }
    })?;

    // Perform registration
    let response = app_state.auth_service.register(payload).await?;

    // Store user session
    session
        .insert("user_id", response.user.id.to_string())
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Set JWT token in HttpOnly cookie
    let response_builder = Response::builder()
        .status(StatusCode::CREATED)
        .header(
            header::SET_COOKIE,
            format!(
                "token={}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/",
                response.access_token
            ),
        );

    let response = response_builder
        .body(
            Json(json!({
                "user": response.user,
                "message": "Registration successful"
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Login endpoint
pub async fn login(
    State(app_state): State<AppState>,
    session: Session,
    Json(payload): Json<LoginRequest>,
) -> Result<Response, AppError> {
    // Validate request
    payload.validate().map_err(|e| {
        AppError::ValidationError {
            field: "payload".to_string(),
            message: format!("Validation failed: {}", e),
        }
    })?;

    // Perform login
    let response = app_state.auth_service.login(payload).await?;

    // Store user session
    session
        .insert("user_id", response.user.id.to_string())
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Set JWT token in HttpOnly cookie
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::SET_COOKIE,
            format!(
                "token={}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/",
                response.access_token
            ),
        )
        .body(
            Json(json!({
                "user": response.user,
                "message": "Login successful"
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Logout endpoint
pub async fn logout(session: Session) -> Result<Response, AppError> {
    // Clear session
    session
        .flush()
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Clear JWT cookie
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::SET_COOKIE,
            "token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
        )
        .body(
            Json(json!({
                "message": "Logout successful"
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Get current user endpoint (protected route)
pub async fn me(
    _app_state: State<AppState>,
    user: UserResponse,
) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(user))
}

// Health check for auth service
pub async fn auth_health() -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(json!({
        "status": "ok",
        "service": "auth",
        "timestamp": chrono::Utc::now()
    })))
}