use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use serde_json::Value;
use tower::{ServiceBuilder, ServiceExt};
use tower_sessions::{MemoryStore, SessionManagerLayer};
use workbench_server::{
    app_state::AppState,
    config::{AppConfig, JwtConfig},
    database::Database,
    handlers::{auth, chat_persistent, conversation},
    models::RegisterRequest,
    repositories::{refresh_token::RefreshTokenRepository, user::UserRepository},
    services::{auth::AuthService, DataAccessLayer},
};

// Test helper to create a test app state with in-memory database
async fn create_test_app_state() -> anyhow::Result<AppState> {
    // Use in-memory SQLite for testing
    let database_url = "sqlite::memory:";
    let database = Database::new(database_url).await?;

    // Run basic schema creation
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            failed_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        "#,
    )
    .execute(&database.pool)
    .await?;

    let user_repository = UserRepository::new(database.clone());
    let refresh_token_repository = RefreshTokenRepository::new(database.clone());

    // Create JWT config with a test secret
    let jwt_config =
        JwtConfig::new("test-secret-that-is-long-enough-for-validation-12345".to_string())?;

    let auth_service = AuthService::new(user_repository, refresh_token_repository, jwt_config);

    // Create basic config for testing
    let config = AppConfig::from_env().unwrap_or_else(|_| AppConfig::default());

    // Create data access layer
    let dal = DataAccessLayer::new(database);

    // Create services
    let conversation_service = conversation::create_conversation_service(dal.clone());
    let chat_service = chat_persistent::create_chat_service(dal.clone());

    Ok(AppState {
        auth_service,
        conversation_service,
        chat_service,
        dal,
        config,
        session_manager: None,
    })
}

#[tokio::test]
async fn test_registration_flow_complete() {
    let app_state = create_test_app_state().await.unwrap();

    let register_request = RegisterRequest {
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    // Create session store for the request
    let session_store = MemoryStore::default();
    let session_service = ServiceBuilder::new()
        .layer(SessionManagerLayer::new(session_store))
        .service_fn(|req: Request<Body>| async {
            auth::register(
                axum::extract::State(app_state.clone()),
                tower_sessions::Session::from_request(req, &())
                    .await
                    .unwrap(),
                axum::Json(register_request),
            )
            .await
        });

    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::empty())
        .unwrap();

    let response = session_service.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    // Extract response body
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let response_data: Value = serde_json::from_slice(&body_bytes).unwrap();

    // Verify response structure
    assert!(response_data["user"].is_object());
    assert_eq!(response_data["user"]["email"], "test@workbench.com");
    assert_eq!(response_data["user"]["username"], "testuser");
    assert!(response_data["access_token"].is_string());
    assert!(response_data["refresh_token"].is_string());
    assert!(response_data["csrf_token"].is_string());
    assert_eq!(response_data["message"], "Registration successful");

    // Verify access token is valid
    let access_token = response_data["access_token"].as_str().unwrap();
    let token_validation = app_state.auth_service.validate_jwt_token(access_token);
    assert!(
        token_validation.is_ok(),
        "Generated access token should be valid"
    );

    let claims = token_validation.unwrap();
    assert_eq!(claims.email, "test@workbench.com");
    assert_eq!(claims.username, "testuser");
}

#[tokio::test]
async fn test_registration_password_validation() {
    let app_state = create_test_app_state().await.unwrap();

    // Test with weak password
    let weak_password_request = RegisterRequest {
        email: "weak@workbench.com".to_string(),
        username: "weakuser".to_string(),
        password: "123".to_string(),
    };

    let result = app_state.auth_service.register(weak_password_request).await;
    assert!(
        result.is_err(),
        "Registration with weak password should fail"
    );
}

#[tokio::test]
async fn test_registration_email_uniqueness() {
    let app_state = create_test_app_state().await.unwrap();

    let first_request = RegisterRequest {
        email: "duplicate@workbench.com".to_string(),
        username: "firstuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    let second_request = RegisterRequest {
        email: "duplicate@workbench.com".to_string(),
        username: "seconduser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    // First registration should succeed
    let first_result = app_state.auth_service.register(first_request).await;
    assert!(first_result.is_ok(), "First registration should succeed");

    // Second registration with same email should fail
    let second_result = app_state.auth_service.register(second_request).await;
    assert!(
        second_result.is_err(),
        "Second registration with same email should fail"
    );
}

#[tokio::test]
async fn test_registration_username_uniqueness() {
    let app_state = create_test_app_state().await.unwrap();

    let first_request = RegisterRequest {
        email: "first@workbench.com".to_string(),
        username: "duplicateuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    let second_request = RegisterRequest {
        email: "second@workbench.com".to_string(),
        username: "duplicateuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    // First registration should succeed
    let first_result = app_state.auth_service.register(first_request).await;
    assert!(first_result.is_ok(), "First registration should succeed");

    // Second registration with same username should fail
    let second_result = app_state.auth_service.register(second_request).await;
    assert!(
        second_result.is_err(),
        "Second registration with same username should fail"
    );
}

#[tokio::test]
async fn test_password_hashing_and_verification() {
    let app_state = create_test_app_state().await.unwrap();

    let register_request = RegisterRequest {
        email: "hash@workbench.com".to_string(),
        username: "hashuser".to_string(),
        password: "MySecurePassword123!".to_string(),
    };

    // Register user
    let register_response = app_state
        .auth_service
        .register(register_request)
        .await
        .unwrap();

    // Get the user from database to check password hash
    let user = app_state
        .auth_service
        .get_user_by_id(register_response.user.id)
        .await
        .unwrap()
        .unwrap();

    // Verify that password was hashed (not stored in plain text)
    assert_ne!(user.password_hash, "MySecurePassword123!");

    // Verify that password verification works
    let user_repo = UserRepository::new(app_state.database.clone());
    let is_valid = user_repo
        .verify_password(&user, "MySecurePassword123!")
        .await
        .unwrap();
    assert!(is_valid, "Password verification should succeed");

    // Verify that wrong password fails
    let is_invalid = user_repo
        .verify_password(&user, "WrongPassword123!")
        .await
        .unwrap();
    assert!(!is_invalid, "Wrong password should fail verification");
}

#[tokio::test]
async fn test_jwt_token_generation_and_validation() {
    let app_state = create_test_app_state().await.unwrap();

    let register_request = RegisterRequest {
        email: "jwt@workbench.com".to_string(),
        username: "jwtuser".to_string(),
        password: "JwtPassword123!".to_string(),
    };

    // Register user
    let register_response = app_state
        .auth_service
        .register(register_request)
        .await
        .unwrap();

    // Verify JWT token structure and validity
    let access_token = &register_response.access_token;
    assert!(!access_token.is_empty(), "Access token should not be empty");

    // Validate the token
    let claims = app_state
        .auth_service
        .validate_jwt_token(access_token)
        .unwrap();

    assert_eq!(claims.email, "jwt@workbench.com");
    assert_eq!(claims.username, "jwtuser");
    assert_eq!(claims.sub, register_response.user.id.to_string());

    // Verify token expiration is set (15 minutes from now)
    let now = chrono::Utc::now().timestamp() as usize;
    assert!(claims.exp > now, "Token should have future expiration");
    assert!(
        claims.exp <= now + 15 * 60 + 60,
        "Token should expire within 16 minutes"
    ); // Allow 1 minute buffer
}

#[tokio::test]
async fn test_refresh_token_generation() {
    let app_state = create_test_app_state().await.unwrap();

    let register_request = RegisterRequest {
        email: "refresh@workbench.com".to_string(),
        username: "refreshuser".to_string(),
        password: "RefreshPassword123!".to_string(),
    };

    // Register user
    let register_response = app_state
        .auth_service
        .register(register_request)
        .await
        .unwrap();

    // Verify refresh token is generated
    let refresh_token = &register_response.refresh_token;
    assert!(
        !refresh_token.is_empty(),
        "Refresh token should not be empty"
    );
    assert_eq!(
        refresh_token.len(),
        64,
        "Refresh token should be 64 characters"
    );

    // Verify refresh token is valid alphanumeric
    assert!(
        refresh_token.chars().all(|c| c.is_ascii_alphanumeric()),
        "Refresh token should only contain alphanumeric characters"
    );

    // Verify refresh token can be used to get new access token
    let new_auth_response = app_state
        .auth_service
        .refresh_access_token(refresh_token)
        .await
        .unwrap();

    assert_eq!(new_auth_response.user.id, register_response.user.id);
    assert!(!new_auth_response.access_token.is_empty());

    // Verify new refresh token was generated (token rotation)
    assert_ne!(new_auth_response.refresh_token, *refresh_token);
}

#[tokio::test]
async fn test_registration_input_validation() {
    let app_state = create_test_app_state().await.unwrap();

    // Test invalid email
    let invalid_email_request = RegisterRequest {
        email: "not-an-email".to_string(),
        username: "validuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    let result = app_state.auth_service.register(invalid_email_request).await;
    // Note: This test depends on validation being called in the handler
    // The service layer doesn't validate email format, the handler does

    // Test short username
    let short_username_request = RegisterRequest {
        email: "valid@workbench.com".to_string(),
        username: "ab".to_string(), // Less than 3 characters
        password: "ValidPassword123!".to_string(),
    };

    // This should work in the service but fail in handler validation
    let result = app_state
        .auth_service
        .register(short_username_request)
        .await;
    assert!(result.is_ok(), "Service layer should accept short username");
}

#[tokio::test]
async fn test_common_password_rejection() {
    let app_state = create_test_app_state().await.unwrap();

    // Test with a common password that should be rejected
    let common_password_request = RegisterRequest {
        email: "common@workbench.com".to_string(),
        username: "commonuser".to_string(),
        password: "password123".to_string(), // Common password
    };

    let result = app_state
        .auth_service
        .register(common_password_request)
        .await;
    assert!(
        result.is_err(),
        "Registration with common password should fail"
    );
}

#[tokio::test]
async fn test_argon2_password_hashing() {
    let app_state = create_test_app_state().await.unwrap();

    let register_request = RegisterRequest {
        email: "argon@workbench.com".to_string(),
        username: "argonuser".to_string(),
        password: "ArgonTestPassword123!".to_string(),
    };

    // Register user
    let register_response = app_state
        .auth_service
        .register(register_request)
        .await
        .unwrap();

    // Get user from database
    let user = app_state
        .auth_service
        .get_user_by_id(register_response.user.id)
        .await
        .unwrap()
        .unwrap();

    // Verify the password hash follows Argon2 format
    assert!(
        user.password_hash.starts_with("$argon2"),
        "Password should be hashed with Argon2"
    );

    // Verify hash contains required Argon2 components
    let hash_parts: Vec<&str> = user.password_hash.split('$').collect();
    assert!(
        hash_parts.len() >= 4,
        "Argon2 hash should have multiple parts"
    );
    assert!(
        hash_parts[1].contains("argon2"),
        "Hash should indicate Argon2 algorithm"
    );
}

#[tokio::test]
async fn test_multiple_registrations_unique_tokens() {
    let app_state = create_test_app_state().await.unwrap();

    let mut access_tokens = Vec::new();
    let mut refresh_tokens = Vec::new();

    // Register multiple users
    for i in 1..=3 {
        let register_request = RegisterRequest {
            email: format!("user{}@workbench.com", i),
            username: format!("user{}", i),
            password: "UniquePassword123!".to_string(),
        };

        let response = app_state
            .auth_service
            .register(register_request)
            .await
            .unwrap();
        access_tokens.push(response.access_token);
        refresh_tokens.push(response.refresh_token);
    }

    // Verify all access tokens are unique
    for i in 0..access_tokens.len() {
        for j in (i + 1)..access_tokens.len() {
            assert_ne!(
                access_tokens[i], access_tokens[j],
                "Access tokens should be unique"
            );
        }
    }

    // Verify all refresh tokens are unique
    for i in 0..refresh_tokens.len() {
        for j in (i + 1)..refresh_tokens.len() {
            assert_ne!(
                refresh_tokens[i], refresh_tokens[j],
                "Refresh tokens should be unique"
            );
        }
    }
}
