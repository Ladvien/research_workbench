use axum::{response::Json, http::StatusCode};
use serde_json::{json, Value};

/// Health check endpoint
pub async fn health_check() -> Result<Json<Value>, StatusCode> {
    let response = json!({
        "status": "healthy",
        "service": "workbench-server",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    Ok(Json(response))
}