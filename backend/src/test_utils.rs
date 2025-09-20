use anyhow::Result;
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use sqlx::{Pool, Postgres};
use tower::ServiceExt;

use crate::{app_state::AppState, database::Database};

/// Setup test database connection using real environment configuration
pub async fn setup_test_database() -> Result<Database> {
    // Use DATABASE_URL from environment (required for real tests)
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL must be set for integration tests"))?;

    Database::new(&database_url).await
}

/// Setup test app with database
pub async fn setup_test_app() -> Result<(Router, AppState)> {
    let database = setup_test_database().await?;
    let app_state = AppState::new_with_database(database);

    // Create a simple app for testing - just basic routes without full middleware
    let app = setup_minimal_app();
    Ok((app, app_state))
}

/// Setup minimal app for basic health checks (no database required)
pub fn setup_minimal_app() -> Router {
    use axum::{routing::get, Json};
    use serde_json::json;

    // Create a minimal app for testing basic endpoints only
    Router::new()
        .route("/health", get(|| async { Json(json!({"status": "ok"})) }))
        .route(
            "/api/health",
            get(|| async { Json(json!({"status": "ok", "service": "api"})) }),
        )
}

/// Test helper to make HTTP requests
pub async fn make_request(
    app: Router,
    method: &str,
    path: &str,
    body: Option<String>,
) -> Result<(StatusCode, String)> {
    let mut request_builder = Request::builder().method(method).uri(path);

    if let Some(body_content) = &body {
        request_builder = request_builder.header("content-type", "application/json");
    }

    let request = request_builder.body(Body::from(body.unwrap_or_default()))?;

    let response = app
        .oneshot(request)
        .await
        .map_err(|e| anyhow::anyhow!("Request failed: {}", e))?;

    let status = response.status();
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read response body: {}", e))?;

    let body_string = String::from_utf8(body_bytes.to_vec())
        .map_err(|e| anyhow::anyhow!("Invalid UTF-8 in response: {}", e))?;

    Ok((status, body_string))
}

/// Test helper for JSON requests
pub async fn make_json_request(
    app: Router,
    method: &str,
    path: &str,
    json_body: serde_json::Value,
) -> Result<(StatusCode, serde_json::Value)> {
    let body_string = serde_json::to_string(&json_body)?;
    let (status, response_body) = make_request(app, method, path, Some(body_string)).await?;

    let json_response: serde_json::Value = if response_body.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_str(&response_body)
            .map_err(|e| anyhow::anyhow!("Failed to parse JSON response: {}", e))?
    };

    Ok((status, json_response))
}

/// Create test user data using environment credentials
pub fn create_test_user_data() -> serde_json::Value {
    let test_email = std::env::var("TEST_USER_EMAIL")
        .unwrap_or_else(|_| "test@workbench.com".to_string());
    let test_password = std::env::var("TEST_USER_PASSWORD")
        .unwrap_or_else(|_| "testpassword123".to_string());

    serde_json::json!({
        "email": test_email,
        "username": "testuser",
        "password": test_password
    })
}

/// Create test conversation data
pub fn create_test_conversation_data() -> serde_json::Value {
    serde_json::json!({
        "title": "Test Conversation",
        "model": "claude-code-opus"
    })
}

/// Create test message data
pub fn create_test_message_data(conversation_id: &str) -> serde_json::Value {
    serde_json::json!({
        "conversation_id": conversation_id,
        "content": "Hello, this is a test message",
        "role": "user"
    })
}

/// Clean up test data
pub async fn cleanup_test_data(pool: &Pool<Postgres>) -> Result<()> {
    // Clean up in reverse order of dependencies
    sqlx::query("DELETE FROM messages WHERE conversation_id LIKE 'test-%'")
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM conversations WHERE id LIKE 'test-%' OR title LIKE 'Test%'")
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM users WHERE email LIKE '%@example.com' OR username LIKE 'test%'")
        .execute(pool)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_setup_functions() {
        // Test that setup functions don't panic
        let _mock_app = setup_minimal_app();

        // Test data creation functions
        let _user_data = create_test_user_data();
        let _conv_data = create_test_conversation_data();
        let _msg_data = create_test_message_data("test-conv-id");
    }
}
