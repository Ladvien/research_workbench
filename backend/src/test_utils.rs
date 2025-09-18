use anyhow::Result;
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use sqlx::{Pool, Postgres};
use tower::ServiceExt;

use crate::{
    app_state::AppState,
    database::Database,
};

/// Setup test database connection
pub async fn setup_test_database() -> Result<Database> {
    // Try to use test database URL, fallback to main if not available
    let database_url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .map_err(|_| anyhow::anyhow!("No database URL found in environment"))?;

    Database::new(&database_url).await
}

/// Setup test app with database
pub async fn setup_test_app() -> Result<(Router, AppState)> {
    let database = setup_test_database().await?;
    let app_state = AppState::new_with_database(database);
    let app = crate::create_app(app_state.clone());
    Ok((app, app_state))
}

/// Setup test app without database (for unit tests)
pub fn setup_mock_app() -> Router {
    // Create a minimal app for testing endpoints that don't need database
    Router::new()
}

/// Test helper to make HTTP requests
pub async fn make_request(
    app: Router,
    method: &str,
    path: &str,
    body: Option<String>,
) -> Result<(StatusCode, String)> {
    let mut request_builder = Request::builder()
        .method(method)
        .uri(path);

    if let Some(body_content) = &body {
        request_builder = request_builder.header("content-type", "application/json");
    }

    let request = request_builder
        .body(Body::from(body.unwrap_or_default()))?;

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

/// Create test user data
pub fn create_test_user_data() -> serde_json::Value {
    serde_json::json!({
        "email": "test@example.com",
        "username": "testuser",
        "password": "SecurePassword123!"
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
        let _mock_app = setup_mock_app();

        // Test data creation functions
        let _user_data = create_test_user_data();
        let _conv_data = create_test_conversation_data();
        let _msg_data = create_test_message_data("test-conv-id");
    }
}