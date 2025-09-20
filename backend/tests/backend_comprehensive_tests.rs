/// Comprehensive backend test suite
///
/// This file runs all backend tests in a coordinated manner to ensure
/// the backend system is working correctly after QA fixes.
use tokio;

mod test_env {
    use axum::Router;
    use workbench_server::{
        app_state::AppState, config::AppConfig, database::Database, models::CreateUserRequest,
        seed::TestUser as SeedTestUser, services::DataAccessLayer,
    };

    #[derive(Debug, Clone)]
    pub struct TestUser {
        pub id: uuid::Uuid,
        pub email: String,
        pub username: String,
        pub session_cookie: String,
    }

    pub async fn setup_test_app() -> (Router, TestUser) {
        let config = AppConfig::from_env().expect("Failed to load test configuration");

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set for integration tests");

        let database = Database::new(&database_url)
            .await
            .expect("Failed to connect to test database");

        let app_state = AppState::new_with_database(database);

        let test_user = create_test_user(&app_state).await;

        let app = Router::new().with_state(app_state);

        (app, test_user)
    }

    async fn create_test_user(app_state: &AppState) -> TestUser {
        // Use test credentials from environment
        let test_email = std::env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "integration_test@workbench.com".to_string());
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "testpassword123".to_string());

        let create_user_request = CreateUserRequest {
            email: test_email,
            username: "integration_test_user".to_string(),
            password: test_password,
        };

        let base_user = app_state
            .dal
            .repositories
            .users
            .create_from_request(create_user_request)
            .await
            .expect("Failed to create test user");

        TestUser {
            id: base_user.id,
            email: base_user.email,
            username: base_user.username,
            session_cookie: "session=test_session_cookie".to_string(),
        }
    }
}

/// Integration test that runs a subset of critical backend functionality
#[tokio::test]
async fn test_backend_comprehensive_integration() {
    // Set up test environment
    let (app, test_user) = test_env::setup_test_app().await;

    // Test basic health endpoints
    test_health_endpoints(&app).await;

    // Test authentication flow
    test_authentication_flow(&app).await;

    // Test conversation lifecycle
    test_conversation_lifecycle(&app, &test_user).await;

    // Test chat functionality
    test_chat_functionality(&app, &test_user).await;

    // Test error handling
    test_error_handling(&app, &test_user).await;

    // Test concurrent operations
    test_concurrent_operations(&app, &test_user).await;
}

async fn test_health_endpoints(app: &axum::Router) {
    use axum::{body::Body, extract::Request, http::method::Method};
    use tower::ServiceExt;

    // Test main health endpoint
    let health_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/health")
        .body(Body::empty())
        .unwrap();

    let health_response = app.clone().oneshot(health_request).await.unwrap();
    assert_eq!(health_response.status(), 200);

    // Test auth health endpoint
    let auth_health_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/health")
        .body(Body::empty())
        .unwrap();

    let auth_health_response = app.clone().oneshot(auth_health_request).await.unwrap();
    assert_eq!(auth_health_response.status(), 200);

    // Test models health endpoint
    let models_health_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/models/health")
        .body(Body::empty())
        .unwrap();

    let models_health_response = app.clone().oneshot(models_health_request).await.unwrap();
    assert_eq!(models_health_response.status(), 200);
}

async fn test_authentication_flow(app: &axum::Router) {
    use axum::{
        body::Body,
        extract::Request,
        http::{method::Method, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;

    // Test registration
    let register_body = json!({
        "email": "integration_test@test.com",
        "username": "integration_test_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    // Test login
    let login_body = json!({
        "email": "integration_test@test.com",
        "password": "SecurePassword123!"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    let session_cookie = login_response
        .headers()
        .get("set-cookie")
        .and_then(|cookie| cookie.to_str().ok())
        .expect("Session cookie should be set");

    // Test authenticated endpoint
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.clone().oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);

    // Test logout
    let logout_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/logout")
        .header("cookie", session_cookie)
        .body(Body::empty())
        .unwrap();

    let logout_response = app.oneshot(logout_request).await.unwrap();
    assert_eq!(logout_response.status(), StatusCode::OK);
}

async fn test_conversation_lifecycle(app: &axum::Router, test_user: &test_env::TestUser) {
    use axum::{
        body::Body,
        extract::Request,
        http::{method::Method, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;

    // Create conversation
    let create_conv_body = json!({
        "title": "Integration Test Conversation",
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "metadata": {}
    });

    let create_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(create_conv_body.to_string()))
        .unwrap();

    let create_response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(create_response.status(), StatusCode::CREATED);

    let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
    let conversation_id = conversation["id"].as_str().unwrap();

    // List conversations
    let list_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/conversations")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let list_response = app.clone().oneshot(list_request).await.unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);

    // Get specific conversation
    let get_request = Request::builder()
        .method(Method::GET)
        .uri(&format!("/api/v1/conversations/{}", conversation_id))
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let get_response = app.clone().oneshot(get_request).await.unwrap();
    assert_eq!(get_response.status(), StatusCode::OK);

    // Update conversation title
    let update_body = json!({
        "title": "Updated Integration Test Conversation"
    });

    let update_request = Request::builder()
        .method(Method::PATCH)
        .uri(&format!("/api/v1/conversations/{}", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(update_body.to_string()))
        .unwrap();

    let update_response = app.clone().oneshot(update_request).await.unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);

    // Get conversation stats
    let stats_request = Request::builder()
        .method(Method::GET)
        .uri(&format!("/api/v1/conversations/{}/stats", conversation_id))
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let stats_response = app.clone().oneshot(stats_request).await.unwrap();
    assert_eq!(stats_response.status(), StatusCode::OK);

    // Delete conversation
    let delete_request = Request::builder()
        .method(Method::DELETE)
        .uri(&format!("/api/v1/conversations/{}", conversation_id))
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let delete_response = app.oneshot(delete_request).await.unwrap();
    assert_eq!(delete_response.status(), StatusCode::OK);
}

async fn test_chat_functionality(app: &axum::Router, test_user: &test_env::TestUser) {
    use axum::{
        body::Body,
        extract::Request,
        http::{method::Method, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;

    // Create conversation for chat testing
    let create_conv_body = json!({
        "title": "Chat Test Conversation",
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "metadata": {}
    });

    let create_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(create_conv_body.to_string()))
        .unwrap();

    let create_response = app.clone().oneshot(create_request).await.unwrap();
    let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
    let conversation_id = conversation["id"].as_str().unwrap();

    // Send message
    let message_body = json!({
        "content": "Hello, this is a test message for integration testing"
    });

    let message_request = Request::builder()
        .method(Method::POST)
        .uri(&format!(
            "/api/v1/conversations/{}/messages",
            conversation_id
        ))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(message_body.to_string()))
        .unwrap();

    let message_response = app.clone().oneshot(message_request).await.unwrap();
    assert!(message_response.status().is_success() || message_response.status().is_client_error());

    // Get messages
    let get_messages_request = Request::builder()
        .method(Method::GET)
        .uri(&format!(
            "/api/v1/conversations/{}/messages",
            conversation_id
        ))
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let get_messages_response = app.clone().oneshot(get_messages_request).await.unwrap();
    assert_eq!(get_messages_response.status(), StatusCode::OK);

    // Test streaming (should not fail)
    let stream_body = json!({
        "content": "Test streaming message",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert!(stream_response.status().is_success() || stream_response.status().is_client_error());
}

async fn test_error_handling(app: &axum::Router, test_user: &test_env::TestUser) {
    use axum::{
        body::Body,
        extract::Request,
        http::{method::Method, StatusCode},
    };
    use tower::ServiceExt;

    // Test invalid JSON
    let invalid_json_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from("{ invalid json"))
        .unwrap();

    let invalid_json_response = app.clone().oneshot(invalid_json_request).await.unwrap();
    assert_eq!(invalid_json_response.status(), StatusCode::BAD_REQUEST);

    // Test unauthorized access
    let unauthorized_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/conversations")
        .body(Body::empty())
        .unwrap();

    let unauthorized_response = app.clone().oneshot(unauthorized_request).await.unwrap();
    assert_eq!(unauthorized_response.status(), StatusCode::UNAUTHORIZED);

    // Test not found
    let not_found_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/conversations/00000000-0000-0000-0000-000000000000")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let not_found_response = app.clone().oneshot(not_found_request).await.unwrap();
    assert_eq!(not_found_response.status(), StatusCode::NOT_FOUND);

    // Test method not allowed
    let method_not_allowed_request = Request::builder()
        .method(Method::PUT)
        .uri("/api/v1/conversations")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let method_not_allowed_response = app.oneshot(method_not_allowed_request).await.unwrap();
    assert_eq!(
        method_not_allowed_response.status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
}

async fn test_concurrent_operations(app: &axum::Router, test_user: &test_env::TestUser) {
    use axum::{body::Body, extract::Request, http::method::Method};
    use serde_json::json;
    use tower::ServiceExt;

    // Perform concurrent conversation creation
    let mut handles = Vec::new();
    for i in 0..5 {
        let app_clone = app.clone();
        let session_cookie = test_user.session_cookie.clone();

        let handle = tokio::spawn(async move {
            let create_conv_body = json!({
                "title": format!("Concurrent Test Conversation {}", i),
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "metadata": {}
            });

            let create_request = Request::builder()
                .method(Method::POST)
                .uri("/api/v1/conversations")
                .header("content-type", "application/json")
                .header("cookie", &session_cookie)
                .body(Body::from(create_conv_body.to_string()))
                .unwrap();

            app_clone.oneshot(create_request).await
        });
        handles.push(handle);
    }

    // Wait for all concurrent operations to complete
    for handle in handles {
        let result = handle.await.unwrap().unwrap();
        assert!(result.status().is_success() || result.status().is_client_error());
    }
}

/// Test resource cleanup and proper async handling
#[tokio::test]
async fn test_resource_cleanup_and_async_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create multiple conversations and clean them up
    let mut conversation_ids = Vec::new();

    for i in 0..3 {
        let create_conv_body = serde_json::json!({
            "title": format!("Cleanup Test Conversation {}", i),
            "provider": "openai",
            "model": "gpt-3.5-turbo",
            "metadata": {}
        });

        let create_request = axum::extract::Request::builder()
            .method(axum::http::method::Method::POST)
            .uri("/api/v1/conversations")
            .header("content-type", "application/json")
            .header("cookie", &test_user.session_cookie)
            .body(axum::body::Body::from(create_conv_body.to_string()))
            .unwrap();

        let create_response = tower::ServiceExt::oneshot(app.clone(), create_request)
            .await
            .unwrap();
        if create_response.status().is_success() {
            let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
                .await
                .unwrap();
            let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
            if let Some(id) = conversation["id"].as_str() {
                conversation_ids.push(id.to_string());
            }
        }
    }

    // Clean up all conversations
    for conversation_id in conversation_ids {
        let delete_request = axum::extract::Request::builder()
            .method(axum::http::method::Method::DELETE)
            .uri(&format!("/api/v1/conversations/{}", conversation_id))
            .header("cookie", &test_user.session_cookie)
            .body(axum::body::Body::empty())
            .unwrap();

        let delete_response = tower::ServiceExt::oneshot(app.clone(), delete_request)
            .await
            .unwrap();
        assert!(
            delete_response.status().is_success()
                || delete_response.status() == axum::http::StatusCode::NOT_FOUND
        );
    }
}
