use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),

    #[error("OpenAI API error: {0}")]
    OpenAI(String),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Rate limited")]
    RateLimit,

    #[error("Authentication required")]
    Unauthorized,

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Internal(ref err) => {
                tracing::error!("Internal server error: {}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::OpenAI(ref msg) => {
                tracing::error!("OpenAI error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.as_str())
            }
            AppError::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::RateLimit => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Authentication required"),
            AppError::NotFound(ref msg) => (StatusCode::NOT_FOUND, msg.as_str()),
            AppError::Database(ref msg) => {
                tracing::error!("Database error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error occurred")
            }
            AppError::Validation(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
        };

        let body = Json(json!({
            "error": error_message,
            "status": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

// Implement From traits for common error types
impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::OpenAI(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(format!("JSON parsing error: {}", err))
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(err: argon2::password_hash::Error) -> Self {
        AppError::Internal(anyhow::anyhow!("Password hashing error: {}", err))
    }
}