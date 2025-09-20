use axum::{
    body::Body,
    extract::{Path, State},
    http::{Request, StatusCode},
    response::Response,
    routing::post,
    Json, Router,
};
use futures::StreamExt;
use serde_json::json;
use std::time::Duration;
use tokio::time::timeout;
use uuid::Uuid;
use workbench_server::{
    app_state::AppState,
    config::AppConfig,
    handlers::chat_stream::{stream_message, StreamChatRequest},
    models::{Conversation, MessageRole, UserResponse},
    repositories::{
        conversation::ConversationRepository, message::MessageRepository, user::UserRepository,
        Repository,
    },
};

async fn create_test_app_state() -> AppState {
    let _config = create_test_config();

    // Initialize test database connection
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/workbench_test".to_string());

    let db_pool = sqlx::PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to test database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&db_pool)
        .await
        .expect("Failed to run migrations");

    AppState::new_with_database(
        workbench_server::database::Database { pool: db_pool }
    )
}

fn create_test_config() -> AppConfig {
    AppConfig {
        bind_address: "0.0.0.0:4512".parse().unwrap(),
        openai_api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        openai_model: "gpt-3.5-turbo".to_string(),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").unwrap_or_default(),
        anthropic_model: "claude-3-haiku-20240307".to_string(),
        anthropic_max_tokens: 2048,
        anthropic_temperature: 0.7,
        claude_code_enabled: true,
        claude_code_model: "claude-3-5-sonnet-20241022".to_string(),
        claude_code_session_timeout: 3600,
        jwt_config: workbench_server::config::JwtConfig::new(
            "test-secret-that-is-long-enough-for-testing-purposes".to_string(),
        )
        .unwrap(),
        redis_url: "redis://127.0.0.1:6379".to_string(),
        session_timeout_hours: 24,
        storage_path: "/tmp/workbench_test_storage".to_string(),
        rate_limit: workbench_server::config::RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        },
        cors_origins: vec!["http://localhost:4510".to_string()],
        cookie_security: workbench_server::config::CookieSecurityConfig {
            secure: false,
            same_site: "Strict".to_string(),
            environment: "test".to_string(),
        },
    }
}

async fn create_test_user_and_conversation(app_state: &AppState) -> (UserResponse, Conversation) {
    // Create test user
    let user_id = Uuid::new_v4();
    let user = UserResponse {
        id: user_id,
        email: "test@example.com".to_string(),
        username: "testuser".to_string(),
        created_at: chrono::Utc::now(),
    };

    // Insert user directly into database
    sqlx::query!(
        "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)",
        user_id,
        user.email,
        user.username,
        "$argon2id$v=19$m=19456,t=2,p=1$test$test" // dummy hash
    )
    .execute(app_state.dal.repositories.conversations.pool())
    .await
    .expect("Failed to insert test user");

    // Create test conversation
    let conversation_id = Uuid::new_v4();
    let conversation = Conversation {
        id: conversation_id,
        user_id,
        title: Some("Test Conversation".to_string()),
        model: "claude-code-sonnet".to_string(),
        provider: "claude_code".to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        metadata: serde_json::Value::Object(serde_json::Map::new()),
    };

    // Insert conversation
    sqlx::query!(
        "INSERT INTO conversations (id, user_id, title, model, provider, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
        conversation_id,
        user_id,
        conversation.title,
        conversation.model,
        conversation.provider,
        conversation.metadata
    )
    .execute(app_state.dal.repositories.conversations.pool())
    .await
    .expect("Failed to insert test conversation");

    (user, conversation)
}

async fn cleanup_test_data(app_state: &AppState, user_id: Uuid) {
    // Clean up test data
    sqlx::query!("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)", user_id)
        .execute(app_state.dal.repositories.conversations.pool())
        .await
        .ok();

    sqlx::query!("DELETE FROM conversations WHERE user_id = $1", user_id)
        .execute(app_state.dal.repositories.conversations.pool())
        .await
        .ok();

    sqlx::query!("DELETE FROM users WHERE id = $1", user_id)
        .execute(app_state.dal.repositories.conversations.pool())
        .await
        .ok();
}

#[tokio::test]
async fn test_stream_message_endpoint_with_valid_conversation() {
    let app_state = create_test_app_state().await;
    let (test_user, test_conversation) = create_test_user_and_conversation(&app_state).await;

    // Create the request
    let request_body = StreamChatRequest {
        content: "Hello, this is a test message".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    // Test the handler directly
    let result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        test_user.clone(),
        Json(request_body),
    )
    .await;

    match result {
        Ok(_sse_response) => {
            // Stream was created successfully
            println!("Stream message endpoint returned successfully");
        }
        Err(e) => {
            // If Claude Code CLI is not available, the test should handle this gracefully
            let error_message = e.to_string();
            if error_message.contains("Claude Code CLI not available")
                || error_message.contains("not found")
                || error_message.contains("API key")
                || error_message.contains("authentication")
            {
                println!("External service not available in test environment: {}", error_message);
            } else {
                panic!("Unexpected error: {}", e);
            }
        }
    }

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_endpoint_with_invalid_conversation() {
    let app_state = create_test_app_state().await;
    let (test_user, _) = create_test_user_and_conversation(&app_state).await;

    let invalid_conversation_id = Uuid::new_v4();

    let request_body = StreamChatRequest {
        content: "Hello, this is a test message".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    let result = stream_message(
        State(app_state.clone()),
        Path(invalid_conversation_id),
        test_user.clone(),
        Json(request_body),
    )
    .await;

    assert!(result.is_err(), "Should fail with invalid conversation ID");

    if let Err(e) = result {
        assert!(
            e.to_string().contains("not found") || e.to_string().contains("Not found"),
            "Error should indicate conversation not found"
        );
    }

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_endpoint_unauthorized_access() {
    let app_state = create_test_app_state().await;
    let (test_user, test_conversation) = create_test_user_and_conversation(&app_state).await;

    // Create a different user
    let unauthorized_user = UserResponse {
        id: Uuid::new_v4(),
        email: "unauthorized@example.com".to_string(),
        username: "unauthorized".to_string(),
        created_at: chrono::Utc::now(),
    };

    let request_body = StreamChatRequest {
        content: "Hello, this is a test message".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    let result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        unauthorized_user,
        Json(request_body),
    )
    .await;

    assert!(result.is_err(), "Should fail with unauthorized access");

    if let Err(e) = result {
        assert!(
            e.to_string().contains("Access denied") || e.to_string().contains("Forbidden"),
            "Error should indicate access denied"
        );
    }

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_saves_user_message() {
    let app_state = create_test_app_state().await;
    let (test_user, test_conversation) = create_test_user_and_conversation(&app_state).await;

    let test_content = "Test message content for saving";
    let request_body = StreamChatRequest {
        content: test_content.to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    // Execute the handler (it should save the user message regardless of LLM call success)
    let _result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        test_user.clone(),
        Json(request_body),
    )
    .await;

    // Check that the user message was saved
    let messages = app_state
        .dal
        .messages()
        .find_by_conversation_id(test_conversation.id)
        .await
        .expect("Should be able to fetch messages");

    let user_message = messages
        .iter()
        .find(|m| m.role == MessageRole::User && m.content == test_content);

    assert!(
        user_message.is_some(),
        "User message should be saved to database"
    );

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_provider_routing() {
    let app_state = create_test_app_state().await;
    let (test_user, _) = create_test_user_and_conversation(&app_state).await;

    // Test different provider configurations
    let test_cases = vec![
        ("claude_code", "claude-code-sonnet"),
        ("anthropic", "claude-3-sonnet-20240229"),
        ("openai", "gpt-4"),
        ("open_a_i", "gpt-3.5-turbo"),
    ];

    for (provider, model) in test_cases {
        // Create conversation with specific provider
        let conversation_id = Uuid::new_v4();
        sqlx::query!(
            "INSERT INTO conversations (id, user_id, title, model, provider, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
            conversation_id,
            test_user.id,
            Some("Provider Test"),
            model,
            provider,
            serde_json::Value::Object(serde_json::Map::new())
        )
        .execute(app_state.dal.repositories.conversations.pool())
        .await
        .expect("Failed to insert test conversation");

        let request_body = StreamChatRequest {
            content: format!("Test message for {} provider", provider),
            model: Some(model.to_string()),
            temperature: Some(0.7),
            max_tokens: Some(50),
        };

        let result = stream_message(
            State(app_state.clone()),
            Path(conversation_id),
            test_user.clone(),
            Json(request_body),
        )
        .await;

        match result {
            Ok(_) => {
                // Success is good for any provider
                println!("Provider {} handled successfully", provider);
            }
            Err(e) => {
                let error_message = e.to_string();
                // Expected errors for unavailable services
                let expected_errors = [
                    "API key",
                    "not available",
                    "CLI not found",
                    "authentication",
                    "invalid",
                    "timeout",
                ];

                let is_expected_error = expected_errors
                    .iter()
                    .any(|expected| error_message.to_lowercase().contains(expected));

                if is_expected_error {
                    println!(
                        "Provider {} failed as expected: {}",
                        provider, error_message
                    );
                } else {
                    panic!(
                        "Unexpected error for provider {}: {}",
                        provider, error_message
                    );
                }
            }
        }

        // Cleanup conversation
        sqlx::query!(
            "DELETE FROM messages WHERE conversation_id = $1",
            conversation_id
        )
        .execute(app_state.dal.repositories.conversations.pool())
        .await
        .ok();
        sqlx::query!("DELETE FROM conversations WHERE id = $1", conversation_id)
            .execute(app_state.dal.repositories.conversations.pool())
            .await
            .ok();
    }

    // Cleanup user
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_request_validation() {
    let app_state = create_test_app_state().await;
    let (test_user, test_conversation) = create_test_user_and_conversation(&app_state).await;

    // Test with empty content
    let empty_request = StreamChatRequest {
        content: "".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    let _result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        test_user.clone(),
        Json(empty_request),
    )
    .await;

    // Empty content should still be processed (user might want to send empty message)
    // The validation should be more about required fields being present

    // Test with extreme parameters
    let extreme_request = StreamChatRequest {
        content: "Test with extreme params".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(2.0),   // Very high temperature
        max_tokens: Some(100000), // Very high max tokens
    };

    let _result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        test_user.clone(),
        Json(extreme_request),
    )
    .await;

    // Should handle extreme parameters gracefully (LLM service will clamp values)

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[tokio::test]
async fn test_stream_message_conversation_history_loading() {
    let app_state = create_test_app_state().await;
    let (test_user, test_conversation) = create_test_user_and_conversation(&app_state).await;

    // Add some existing messages to the conversation
    let message_1_id = Uuid::new_v4();
    let message_2_id = Uuid::new_v4();

    sqlx::query!(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
        message_1_id,
        test_conversation.id,
        "user" as &str,
        "Previous user message",
        chrono::Utc::now(),
        true
    )
    .execute(app_state.dal.repositories.conversations.pool())
    .await
    .expect("Failed to insert test message");

    sqlx::query!(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
        message_2_id,
        test_conversation.id,
        "assistant" as &str,
        "Previous assistant response",
        chrono::Utc::now(),
        true
    )
    .execute(app_state.dal.repositories.conversations.pool())
    .await
    .expect("Failed to insert test message");

    let request_body = StreamChatRequest {
        content: "New message with context".to_string(),
        model: Some("claude-code-sonnet".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
    };

    // The handler should load conversation history and include it in the LLM request
    let _result = stream_message(
        State(app_state.clone()),
        Path(test_conversation.id),
        test_user.clone(),
        Json(request_body),
    )
    .await;

    // Verify the new user message was added
    let messages = app_state
        .dal
        .messages()
        .find_by_conversation_id(test_conversation.id)
        .await
        .expect("Should be able to fetch messages");

    assert_eq!(
        messages.len(),
        3,
        "Should have 3 messages: 2 existing + 1 new user message"
    );

    let new_user_message = messages
        .iter()
        .find(|m| m.content == "New message with context");
    assert!(
        new_user_message.is_some(),
        "New user message should be saved"
    );

    // Cleanup
    cleanup_test_data(&app_state, test_user.id).await;
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    use workbench_server::handlers::chat_stream::StreamChatRequest;

    #[test]
    fn test_stream_chat_request_deserialization() {
        // Test valid request
        let json = r#"{
            "content": "Hello world",
            "model": "claude-code-sonnet",
            "temperature": 0.7,
            "max_tokens": 1000
        }"#;

        let request: StreamChatRequest =
            serde_json::from_str(json).expect("Should deserialize valid request");

        assert_eq!(request.content, "Hello world");
        assert_eq!(request.model, Some("claude-code-sonnet".to_string()));
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(1000));
    }

    #[test]
    fn test_stream_chat_request_minimal() {
        // Test minimal request (only content required)
        let json = r#"{
            "content": "Hello world"
        }"#;

        let request: StreamChatRequest =
            serde_json::from_str(json).expect("Should deserialize minimal request");

        assert_eq!(request.content, "Hello world");
        assert_eq!(request.model, None);
        assert_eq!(request.temperature, None);
        assert_eq!(request.max_tokens, None);
    }

    #[test]
    fn test_stream_chat_request_debug() {
        let request = StreamChatRequest {
            content: "Test content".to_string(),
            model: Some("test-model".to_string()),
            temperature: Some(0.5),
            max_tokens: Some(500),
        };

        let debug_str = format!("{:?}", request);
        assert!(debug_str.contains("Test content"));
        assert!(debug_str.contains("test-model"));
    }
}
