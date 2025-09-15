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

    #[error("Anthropic API error: {0}")]
    Anthropic(String),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Rate limited")]
    RateLimit,

    #[error("Authentication required")]
    Unauthorized,

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Access forbidden: {0}")]
    Forbidden(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Authentication error: {0}")]
    AuthenticationError(String),

    #[error("Validation error on field {field}: {message}")]
    ValidationError { field: String, message: String },

    #[error("Internal server error: {0}")]
    InternalServerError(String),

    #[error("Too many requests: {0}")]
    TooManyRequests(String),
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
            AppError::Anthropic(ref msg) => {
                tracing::error!("Anthropic error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.as_str())
            }
            AppError::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::RateLimit => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Authentication required"),
            AppError::NotFound(ref msg) => (StatusCode::NOT_FOUND, msg.as_str()),
            AppError::Forbidden(ref msg) => (StatusCode::FORBIDDEN, msg.as_str()),
            AppError::Database(ref msg) => {
                tracing::error!("Database error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error occurred")
            }
            AppError::Validation(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::AuthenticationError(ref msg) => (StatusCode::UNAUTHORIZED, msg.as_str()),
            AppError::ValidationError {
                ref field,
                ref message,
            } => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Validation failed",
                        "field": field,
                        "message": message,
                        "status": 400,
                    })),
                )
                    .into_response()
            }
            AppError::InternalServerError(ref msg) => {
                tracing::error!("Internal server error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::TooManyRequests(ref msg) => (StatusCode::TOO_MANY_REQUESTS, msg.as_str()),
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

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(anyhow::anyhow!("IO error: {}", err))
    }
}

impl From<axum::http::Error> for AppError {
    fn from(err: axum::http::Error) -> Self {
        AppError::Internal(anyhow::anyhow!("HTTP error: {}", err))
    }
}

impl From<axum::http::header::InvalidHeaderValue> for AppError {
    fn from(err: axum::http::header::InvalidHeaderValue) -> Self {
        AppError::BadRequest(format!("Invalid header value: {}", err))
    }
}

impl From<redis::RedisError> for AppError {
    fn from(err: redis::RedisError) -> Self {
        AppError::Internal(anyhow::anyhow!("Redis error: {}", err))
    }
}
