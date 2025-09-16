//! Integration tests for authentication endpoints
//!
//! This module tests the complete authentication flow including:
//! - Password change functionality
//! - Session information retrieval
//! - Session invalidation
//! - Redis failure scenarios
//! - Concurrent session management
//! - Rate limiting on auth endpoints

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    response::Response,
    routing::{get, post},
    Router,
};
use axum_test::TestServer;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::time::sleep;
use tower::ServiceBuilder;
use tower_sessions::{MemoryStore, SessionManagerLayer};
use uuid::Uuid;

use workbench_server::{
    app_state::AppState,
    config::{AppConfig, CookieSecurityConfig, JwtConfig},
    database::Database,
    error::AppError,
    handlers::auth,
    middleware::auth::auth_middleware,
    models::{ChangePasswordRequest, LoginRequest, RegisterRequest},
    repositories::{user::UserRepository, Repository, RepositoryManager},
    services::{
        auth::AuthService,
        password::PasswordValidator,
        session::{SessionData, SessionManager},
        DataAccessLayer,
    },
};

/// Test helper to create a test app with authentication routes
async fn create_test_app() -> Result<(TestServer, AppState), Box<dyn std::error::Error>> {
    // For testing, we'll use a mock setup without actual database operations
    // Create a mock database pool (this is simplified for testing)
    let database_url = std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/workbench_test".to_string());

    // Try to connect to test database, if fails, skip these tests
    let database = match Database::new(&database_url).await {
        Ok(db) => db,
        Err(_) => {
            // If no test database available, create a minimal mock
            // For now, we'll skip actual database operations
            eprintln!("Warning: Test database not available, using mock setup");
            return Err("Test database not available".into());
        }
    };

    // Create repositories
    let user_repository = UserRepository::new(database.clone());
    let repository_manager = RepositoryManager::new(database.clone());
    let data_access = DataAccessLayer::new(repository_manager);

    // Create JWT config for testing
    let jwt_config = JwtConfig {
        current_secret: "test-secret-that-is-long-enough-for-validation".to_string(),
        current_version: 1,
        previous_secrets: HashMap::new(),
    };

    // Create session manager (no Redis for testing)
    let session_manager = SessionManager::new(
        None, // No Redis
        Some(database.pool.clone()),
        5,  // max 5 sessions per user
        24, // 24 hour timeout
    );

    // Create auth service with session manager
    let auth_service =
        AuthService::new(user_repository, jwt_config).with_session_manager(session_manager);

    // Create app config
    let app_config = AppConfig {
        database_url: "sqlite::memory:".to_string(),
        jwt_secret: "test-secret-that-is-long-enough-for-validation".to_string(),
        redis_url: None,
        server_host: "127.0.0.1".to_string(),
        server_port: 3000,
        environment: "test".to_string(),
        cookie_security: CookieSecurityConfig {
            secure: false,
            same_site: "Lax".to_string(),
        },
        anthropic_api_key: "test-key".to_string(),
        anthropic_model: "claude-3-haiku-20240307".to_string(),
        anthropic_max_tokens: 4000,
        anthropic_temperature: 0.7,
        claude_code_binary_path: "/usr/local/bin/claude".to_string(),
        claude_code_session_timeout: 300,
        rate_limit: workbench_server::config::RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        },
        storage_path: "/tmp/test-storage".to_string(),
    };

    let app_state = AppState {
        data_access,
        auth_service,
        config: app_config,
    };

    // Create session layer for testing
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store);

    // Create router with auth routes
    let app = Router::new()
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/auth/me", get(auth::me))
        .route("/api/v1/auth/change-password", post(auth::change_password))
        .route("/api/v1/auth/session-info", get(auth::session_info))
        .route(
            "/api/v1/auth/invalidate-sessions",
            post(auth::invalidate_all_sessions),
        )
        .route("/api/v1/auth/health", get(auth::auth_health))
        .route(
            "/api/v1/auth/check-password-strength",
            post(auth::check_password_strength),
        )
        .layer(ServiceBuilder::new().layer(session_layer))
        .layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ))
        .with_state(app_state.clone());

    let server = TestServer::new(app)?;
    Ok((server, app_state))
}

/// Test helper to register a test user
async fn register_test_user(
    server: &TestServer,
    email: &str,
    username: &str,
    password: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let register_request = RegisterRequest {
        email: email.to_string(),
        username: username.to_string(),
        password: password.to_string(),
    };

    let response = server
        .post("/api/v1/auth/register")
        .json(&register_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::CREATED);

    // Extract token from Set-Cookie header
    let set_cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Parse token from cookie
    let token = set_cookie
        .split(';')
        .next()
        .unwrap_or("")
        .split('=')
        .nth(1)
        .unwrap_or("")
        .to_string();

    Ok(token)
}

/// Test helper to login a user
async fn login_user(
    server: &TestServer,
    email: &str,
    password: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let login_request = LoginRequest {
        email: email.to_string(),
        password: password.to_string(),
    };

    let response = server.post("/api/v1/auth/login").json(&login_request).await;

    assert_eq!(response.status_code(), StatusCode::CREATED);

    // Extract token from Set-Cookie header
    let set_cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Parse token from cookie
    let token = set_cookie
        .split(';')
        .next()
        .unwrap_or("")
        .split('=')
        .nth(1)
        .unwrap_or("")
        .to_string();

    Ok(token)
}

#[tokio::test]
async fn test_auth_endpoints_integration() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Test 1: Register a new user
    let token = register_test_user(
        &server,
        "test@example.com",
        "testuser",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Test 2: Get current user info
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", token))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let user_data: Value = response.json();
    assert_eq!(user_data["email"], "test@example.com");
    assert_eq!(user_data["username"], "testuser");

    // Test 3: Get session info
    let response = server
        .get("/api/v1/auth/session-info")
        .add_header("cookie", format!("token={}", token))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let session_info: Value = response.json();
    assert_eq!(session_info["active_sessions"], 1);
    assert_eq!(session_info["max_sessions"], 5);

    // Test 4: Change password
    let change_password_request = ChangePasswordRequest {
        current_password: "SecurePassword123!".to_string(),
        new_password: "NewSecurePassword456!".to_string(),
    };

    let response = server
        .post("/api/v1/auth/change-password")
        .add_header("cookie", format!("token={}", token))
        .json(&change_password_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let change_response: Value = response.json();
    assert!(change_response["message"]
        .as_str()
        .unwrap()
        .contains("Password changed successfully"));

    // Test 5: Old token should be invalid after password change
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", token))
        .await;

    // Should be unauthorized since sessions were invalidated
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 6: Login with new password
    let new_token = login_user(&server, "test@example.com", "NewSecurePassword456!")
        .await
        .unwrap();

    // Test 7: Verify session info after re-login
    let response = server
        .get("/api/v1/auth/session-info")
        .add_header("cookie", format!("token={}", new_token))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let session_info: Value = response.json();
    assert_eq!(session_info["active_sessions"], 1);

    // Test 8: Invalidate all sessions
    let response = server
        .post("/api/v1/auth/invalidate-sessions")
        .add_header("cookie", format!("token={}", new_token))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let invalidate_response: Value = response.json();
    assert!(invalidate_response["message"]
        .as_str()
        .unwrap()
        .contains("All sessions have been invalidated"));

    // Test 9: Token should be invalid after session invalidation
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", new_token))
        .await;

    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_change_password_validation() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Register user
    let token = register_test_user(
        &server,
        "test2@example.com",
        "testuser2",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Test 1: Wrong current password
    let change_password_request = ChangePasswordRequest {
        current_password: "WrongPassword".to_string(),
        new_password: "NewSecurePassword456!".to_string(),
    };

    let response = server
        .post("/api/v1/auth/change-password")
        .add_header("cookie", format!("token={}", token))
        .json(&change_password_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 2: Weak new password
    let change_password_request = ChangePasswordRequest {
        current_password: "SecurePassword123!".to_string(),
        new_password: "weak".to_string(),
    };

    let response = server
        .post("/api/v1/auth/change-password")
        .add_header("cookie", format!("token={}", token))
        .json(&change_password_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::BAD_REQUEST);

    // Test 3: Same password as current
    let change_password_request = ChangePasswordRequest {
        current_password: "SecurePassword123!".to_string(),
        new_password: "SecurePassword123!".to_string(),
    };

    let response = server
        .post("/api/v1/auth/change-password")
        .add_header("cookie", format!("token={}", token))
        .json(&change_password_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);
}

#[tokio::test]
async fn test_concurrent_session_management() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Register user
    register_test_user(
        &server,
        "concurrent@example.com",
        "concurrentuser",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Create multiple concurrent sessions
    let mut tokens = Vec::new();

    for i in 0..3 {
        let token = login_user(&server, "concurrent@example.com", "SecurePassword123!")
            .await
            .unwrap();
        tokens.push(token);

        // Small delay to ensure sessions are created at different times
        sleep(Duration::from_millis(10)).await;
    }

    // Verify all sessions are active
    for (i, token) in tokens.iter().enumerate() {
        let response = server
            .get("/api/v1/auth/session-info")
            .add_header("cookie", format!("token={}", token))
            .await;

        assert_eq!(response.status_code(), StatusCode::OK);

        let session_info: Value = response.json();
        assert_eq!(session_info["active_sessions"], i + 1);
    }

    // Invalidate all sessions from first token
    let response = server
        .post("/api/v1/auth/invalidate-sessions")
        .add_header("cookie", format!("token={}", tokens[0]))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    // Verify all tokens are now invalid
    for token in &tokens {
        let response = server
            .get("/api/v1/auth/me")
            .add_header("cookie", format!("token={}", token))
            .await;

        assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
    }
}

#[tokio::test]
async fn test_session_limit_enforcement() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Register user
    register_test_user(
        &server,
        "limit@example.com",
        "limituser",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Create maximum number of sessions (5)
    let mut tokens = Vec::new();

    for i in 0..5 {
        let token = login_user(&server, "limit@example.com", "SecurePassword123!")
            .await
            .unwrap();
        tokens.push(token);

        // Verify session count
        let response = server
            .get("/api/v1/auth/session-info")
            .add_header("cookie", format!("token={}", token))
            .await;

        assert_eq!(response.status_code(), StatusCode::OK);

        let session_info: Value = response.json();
        assert_eq!(session_info["active_sessions"], i + 1);
        assert_eq!(session_info["max_sessions"], 5);
    }

    // Try to create a 6th session - should succeed but oldest should be evicted
    let sixth_token = login_user(&server, "limit@example.com", "SecurePassword123!")
        .await
        .unwrap();

    // Verify session count is still 5
    let response = server
        .get("/api/v1/auth/session-info")
        .add_header("cookie", format!("token={}", sixth_token))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let session_info: Value = response.json();
    assert_eq!(session_info["active_sessions"], 5);

    // First token should now be invalid
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", tokens[0]))
        .await;

    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Last token should still be valid
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", tokens[4]))
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);
}

#[tokio::test]
async fn test_auth_rate_limiting() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Test 1: Register user first
    register_test_user(
        &server,
        "ratelimit@example.com",
        "ratelimituser",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Test 2: Try multiple failed login attempts
    for i in 0..6 {
        let login_request = LoginRequest {
            email: "ratelimit@example.com".to_string(),
            password: "wrongpassword".to_string(),
        };

        let response = server.post("/api/v1/auth/login").json(&login_request).await;

        if i < 5 {
            // First 5 attempts should return 401 (unauthorized)
            assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
        } else {
            // 6th attempt should be rate limited (429)
            assert_eq!(response.status_code(), StatusCode::TOO_MANY_REQUESTS);

            let error_response: Value = response.json();
            assert!(error_response["message"]
                .as_str()
                .unwrap()
                .contains("Too many authentication attempts"));
        }
    }

    // Test 3: Correct password should also be rate limited
    let login_request = LoginRequest {
        email: "ratelimit@example.com".to_string(),
        password: "SecurePassword123!".to_string(),
    };

    let response = server.post("/api/v1/auth/login").json(&login_request).await;

    assert_eq!(response.status_code(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn test_password_strength_endpoint() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Test 1: Strong password
    let strong_password = json!({
        "password": "StrongPassword123!@#"
    });

    let response = server
        .post("/api/v1/auth/check-password-strength")
        .json(&strong_password)
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let strength_response: Value = response.json();
    assert!(strength_response["valid"].as_bool().unwrap());
    assert!(strength_response["strength"]["score"].as_u64().unwrap() >= 70);

    // Test 2: Weak password
    let weak_password = json!({
        "password": "weak"
    });

    let response = server
        .post("/api/v1/auth/check-password-strength")
        .json(&weak_password)
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let strength_response: Value = response.json();
    assert!(!strength_response["valid"].as_bool().unwrap());
    assert!(strength_response["strength"]["score"].as_u64().unwrap() < 70);

    // Test 3: Missing password field
    let invalid_request = json!({
        "not_password": "test"
    });

    let response = server
        .post("/api/v1/auth/check-password-strength")
        .json(&invalid_request)
        .await;

    assert_eq!(response.status_code(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_unauthorized_access() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Test 1: Access protected endpoint without token
    let response = server.get("/api/v1/auth/me").await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 2: Access with invalid token
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", "token=invalid_token")
        .await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 3: Access change password without token
    let change_password_request = ChangePasswordRequest {
        current_password: "old".to_string(),
        new_password: "new".to_string(),
    };

    let response = server
        .post("/api/v1/auth/change-password")
        .json(&change_password_request)
        .await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 4: Access session info without token
    let response = server.get("/api/v1/auth/session-info").await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);

    // Test 5: Access invalidate sessions without token
    let response = server.post("/api/v1/auth/invalidate-sessions").await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_auth_health_endpoint() {
    let (server, _app_state) = create_test_app().await.unwrap();

    let response = server.get("/api/v1/auth/health").await;
    assert_eq!(response.status_code(), StatusCode::OK);

    let health_response: Value = response.json();
    assert_eq!(health_response["status"], "ok");
    assert_eq!(health_response["service"], "auth");
    assert!(health_response["timestamp"].is_string());
}

#[tokio::test]
async fn test_logout_functionality() {
    let (server, _app_state) = create_test_app().await.unwrap();

    // Register and login user
    let token = register_test_user(
        &server,
        "logout@example.com",
        "logoutuser",
        "SecurePassword123!",
    )
    .await
    .unwrap();

    // Verify user is logged in
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", token))
        .await;
    assert_eq!(response.status_code(), StatusCode::OK);

    // Logout
    let response = server
        .post("/api/v1/auth/logout")
        .add_header("cookie", format!("token={}", token))
        .await;
    assert_eq!(response.status_code(), StatusCode::NO_CONTENT);

    // Verify logout response clears cookie
    let set_cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    assert!(set_cookie.contains("Max-Age=0"));

    // Verify user is logged out
    let response = server
        .get("/api/v1/auth/me")
        .add_header("cookie", format!("token={}", token))
        .await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}
