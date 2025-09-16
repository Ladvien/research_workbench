use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: ErrorDetails,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorDetails {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub request_id: String,
}

impl ErrorResponse {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            error: ErrorDetails {
                code: code.to_string(),
                message: message.to_string(),
                details: None,
                timestamp: chrono::Utc::now(),
                request_id: format!("req_{}", Uuid::new_v4().simple()),
            },
        }
    }

    pub fn with_details(code: &str, message: &str, details: serde_json::Value) -> Self {
        Self {
            error: ErrorDetails {
                code: code.to_string(),
                message: message.to_string(),
                details: Some(details),
                timestamp: chrono::Utc::now(),
                request_id: format!("req_{}", Uuid::new_v4().simple()),
            },
        }
    }
}

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
        let (status, error_response) = match self {
            AppError::Internal(ref err) => {
                tracing::error!("Internal server error: {}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse::new("INTERNAL_SERVER_ERROR", "Internal server error occurred"),
                )
            }
            AppError::OpenAI(ref msg) => {
                tracing::error!("OpenAI error: {}", msg);
                (
                    StatusCode::BAD_GATEWAY,
                    ErrorResponse::new("EXTERNAL_API_ERROR", msg),
                )
            }
            AppError::Anthropic(ref msg) => {
                tracing::error!("Anthropic error: {}", msg);
                (
                    StatusCode::BAD_GATEWAY,
                    ErrorResponse::new("EXTERNAL_API_ERROR", msg),
                )
            }
            AppError::BadRequest(ref msg) => (
                StatusCode::BAD_REQUEST,
                ErrorResponse::new("BAD_REQUEST", msg),
            ),
            AppError::RateLimit => (
                StatusCode::TOO_MANY_REQUESTS,
                ErrorResponse::new("RATE_LIMIT_EXCEEDED", "Rate limit exceeded"),
            ),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                ErrorResponse::new("UNAUTHORIZED", "Authentication required"),
            ),
            AppError::NotFound(ref msg) => (
                StatusCode::NOT_FOUND,
                ErrorResponse::new("NOT_FOUND", msg),
            ),
            AppError::Forbidden(ref msg) => (
                StatusCode::FORBIDDEN,
                ErrorResponse::new("FORBIDDEN", msg),
            ),
            AppError::Database(ref msg) => {
                tracing::error!("Database error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse::new("DATABASE_ERROR", "Database error occurred"),
                )
            }
            AppError::Validation(ref msg) => (
                StatusCode::BAD_REQUEST,
                ErrorResponse::new("VALIDATION_ERROR", msg),
            ),
            AppError::AuthenticationError(ref msg) => (
                StatusCode::UNAUTHORIZED,
                ErrorResponse::new("AUTHENTICATION_ERROR", msg),
            ),
            AppError::ValidationError {
                ref field,
                ref message,
            } => {
                let details = json!({
                    "field": field,
                    "reason": message
                });
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(ErrorResponse::with_details(
                        "VALIDATION_ERROR",
                        &format!("Validation failed on field '{}'", field),
                        details,
                    )),
                )
                    .into_response()
            }
            AppError::InternalServerError(ref msg) => {
                tracing::error!("Internal server error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse::new("INTERNAL_SERVER_ERROR", "Internal server error occurred"),
                )
            }
            AppError::TooManyRequests(ref msg) => (
                StatusCode::TOO_MANY_REQUESTS,
                ErrorResponse::new("TOO_MANY_REQUESTS", msg),
            ),
        };

        (status, Json(error_response)).into_response()
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
