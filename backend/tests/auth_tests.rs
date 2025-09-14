use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
use tower::ServiceExt;
use workbench_server::{
    database::Database,
    models::{User, CreateUserRequest},
    repositories::UserRepository,
    services::{auth::AuthService, DataAccessLayer},
};

#[tokio::test]
async fn test_user_registration_success() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    let response = auth_service.register(workbench_server::models::RegisterRequest {
        email: "test@example.com".to_string(),
        username: "testuser".to_string(),
        password: "password123".to_string(),
    }).await;

    assert!(response.is_ok());
    let register_response = response.unwrap();
    assert_eq!(register_response.user.email, "test@example.com");
    assert_eq!(register_response.user.username, "testuser");
    assert!(!register_response.access_token.is_empty());
}

#[tokio::test]
async fn test_user_registration_duplicate_email() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // First registration should succeed
    let _first = auth_service.register(workbench_server::models::RegisterRequest {
        email: "duplicate@example.com".to_string(),
        username: "user1".to_string(),
        password: "password123".to_string(),
    }).await.unwrap();

    // Second registration with same email should fail
    let response = auth_service.register(workbench_server::models::RegisterRequest {
        email: "duplicate@example.com".to_string(),
        username: "user2".to_string(),
        password: "password123".to_string(),
    }).await;

    assert!(response.is_err());
}

#[tokio::test]
async fn test_user_login_success() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // Register a user first
    let register_response = auth_service.register(workbench_server::models::RegisterRequest {
        email: "login@example.com".to_string(),
        username: "loginuser".to_string(),
        password: "password123".to_string(),
    }).await.unwrap();

    // Now try to login
    let login_response = auth_service.login(workbench_server::models::LoginRequest {
        email: "login@example.com".to_string(),
        password: "password123".to_string(),
    }).await;

    assert!(login_response.is_ok());
    let login_result = login_response.unwrap();
    assert_eq!(login_result.user.email, "login@example.com");
    assert!(!login_result.access_token.is_empty());
}

#[tokio::test]
async fn test_user_login_invalid_credentials() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // Register a user first
    let _register_response = auth_service.register(workbench_server::models::RegisterRequest {
        email: "invalid@example.com".to_string(),
        username: "invaliduser".to_string(),
        password: "password123".to_string(),
    }).await.unwrap();

    // Try to login with wrong password
    let login_response = auth_service.login(workbench_server::models::LoginRequest {
        email: "invalid@example.com".to_string(),
        password: "wrongpassword".to_string(),
    }).await;

    assert!(login_response.is_err());
}

#[tokio::test]
async fn test_jwt_token_generation_and_validation() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // Create a test user
    let user = workbench_server::models::User {
        id: uuid::Uuid::new_v4(),
        email: "jwt@example.com".to_string(),
        username: "jwtuser".to_string(),
        password_hash: "hash".to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // Generate JWT token
    let token = auth_service.generate_jwt_token(&user).unwrap();
    assert!(!token.is_empty());

    // Validate JWT token
    let claims = auth_service.validate_jwt_token(&token).unwrap();
    assert_eq!(claims.sub, user.id.to_string());
    assert_eq!(claims.email, user.email);
    assert_eq!(claims.username, user.username);
}

#[tokio::test]
async fn test_jwt_token_validation_invalid_token() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // Try to validate an invalid token
    let result = auth_service.validate_jwt_token("invalid.jwt.token");
    assert!(result.is_err());
}

#[tokio::test]
async fn test_extract_user_id_from_token() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench_test".to_string());

    let database = Database::new(&database_url).await.unwrap();
    let user_repo = UserRepository::new(database);
    let auth_service = AuthService::new(user_repo, "test-secret".to_string());

    // Create a test user
    let user_id = uuid::Uuid::new_v4();
    let user = workbench_server::models::User {
        id: user_id,
        email: "extract@example.com".to_string(),
        username: "extractuser".to_string(),
        password_hash: "hash".to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // Generate JWT token
    let token = auth_service.generate_jwt_token(&user).unwrap();

    // Extract user ID from token
    let extracted_id = auth_service.extract_user_id_from_token(&token).unwrap();
    assert_eq!(extracted_id, user_id);
}

// Integration tests for HTTP endpoints would require setting up the full app
// These would test the actual HTTP handlers, middleware, and response format
// For now, we're testing the core authentication logic