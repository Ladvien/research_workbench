//! Refresh Token Security Tests
//! 
//! Comprehensive tests for JWT refresh token system according to OWASP best practices:
//! - 15-minute JWT access token expiry
//! - 7-day refresh token expiry
//! - Refresh token rotation on use
//! - Secure token storage with SHA-256 hashing
//! - Proper cleanup on logout/password change

use chrono::{Duration, Utc};
use std::collections::HashMap;
use uuid::Uuid;
use workbench_server::{
    config::JwtConfig,
    database::Database,
    error::AppError,
    models::{LoginRequest, RegisterRequest},
    repositories::refresh_token::RefreshTokenRepository,
    services::{auth::AuthService, DataAccessLayer},
};

/// Test database setup helper
async fn setup_test_database() -> Result<Database, AppError> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@192.168.1.104:5432/workbench".to_string());
    
    Database::new(&database_url)
        .await
        .map_err(|e| AppError::InternalServerError(format!("Database setup failed: {}", e)))
}

/// Create test auth service with proper configuration
async fn create_test_auth_service() -> Result<AuthService, AppError> {
    let database = setup_test_database().await?;
    let dal = DataAccessLayer::new(database);
    
    let jwt_config = JwtConfig {
        current_secret: "test_secret_key_for_refresh_token_tests_that_is_long_enough".to_string(),
        previous_secrets: HashMap::new(),
        current_version: 1,
    };
    
    Ok(AuthService::new(
        dal.users().clone(),
        dal.refresh_tokens().clone(),
        jwt_config,
    ))
}

/// Create a test user for authentication tests
async fn create_test_user(auth_service: &AuthService) -> Result<uuid::Uuid, AppError> {
    let register_request = RegisterRequest {
        email: format!("test_refresh_{}@workbench.com", Uuid::new_v4()),
        username: format!("test_refresh_{}", Uuid::new_v4()),
        password: "SecureTestPassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await?;
    Ok(response.user.id)
}

#[tokio::test]
async fn test_jwt_token_15_minute_expiry() {
    let auth_service = create_test_auth_service().await.unwrap();
    let user_id = create_test_user(&auth_service).await.unwrap();
    
    // Generate access token
    let access_token = auth_service.generate_access_token(user_id).await.unwrap();
    
    // Validate token is initially valid
    let claims = auth_service.validate_jwt_token(&access_token).unwrap();
    assert_eq!(claims.sub, user_id.to_string());
    
    // Check expiration is approximately 15 minutes (allowing for test execution time)
    let now = Utc::now().timestamp() as usize;
    let expected_expiry = now + (15 * 60); // 15 minutes
    let tolerance = 30; // 30 seconds tolerance
    
    assert!(
        claims.exp >= expected_expiry - tolerance && claims.exp <= expected_expiry + tolerance,
        "JWT expiry should be approximately 15 minutes. Expected: {}, Got: {}",
        expected_expiry,
        claims.exp
    );
}

#[tokio::test]
async fn test_refresh_token_7_day_expiry() {
    let auth_service = create_test_auth_service().await.unwrap();
    let user_id = create_test_user(&auth_service).await.unwrap();
    
    // Login to get refresh token
    let login_request = LoginRequest {
        email: "test_refresh_7day@workbench.com".to_string(),
        password: "SecureTestPassword123!".to_string(),
    };
    
    // First create the user
    let register_request = RegisterRequest {
        email: login_request.email.clone(),
        username: "test_refresh_7day".to_string(),
        password: login_request.password.clone(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let refresh_token = response.refresh_token;
    
    // Get refresh token repository to check expiry
    let database = setup_test_database().await.unwrap();
    let dal = DataAccessLayer::new(database);
    let refresh_repo = dal.refresh_tokens();
    
    // Find the refresh token in database
    let token_record = refresh_repo.find_by_token_hash(&refresh_token).await.unwrap().unwrap();
    
    // Check expiration is approximately 7 days
    let now = Utc::now();
    let expected_expiry = now + Duration::days(7);
    let tolerance = Duration::minutes(5); // 5 minutes tolerance
    
    assert!(
        token_record.expires_at >= expected_expiry - tolerance && 
        token_record.expires_at <= expected_expiry + tolerance,
        "Refresh token expiry should be approximately 7 days. Expected: {}, Got: {}",
        expected_expiry,
        token_record.expires_at
    );
}

#[tokio::test]
async fn test_refresh_token_rotation() {
    let auth_service = create_test_auth_service().await.unwrap();
    
    // Create and register user
    let register_request = RegisterRequest {
        email: "test_rotation@workbench.com".to_string(),
        username: "test_rotation".to_string(),
        password: "SecureTestPassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let original_refresh_token = response.refresh_token;
    let original_access_token = response.access_token;
    
    // Use refresh token to get new tokens
    let refresh_response = auth_service.refresh_access_token(&original_refresh_token).await.unwrap();
    let new_refresh_token = refresh_response.refresh_token;
    let new_access_token = refresh_response.access_token;
    
    // Verify tokens are different (rotation occurred)
    assert_ne!(original_refresh_token, new_refresh_token, "Refresh token should rotate");
    assert_ne!(original_access_token, new_access_token, "Access token should be new");
    
    // Verify old refresh token is invalidated
    let old_token_result = auth_service.refresh_access_token(&original_refresh_token).await;
    assert!(old_token_result.is_err(), "Old refresh token should be invalidated");
    
    // Verify new refresh token works
    let second_refresh = auth_service.refresh_access_token(&new_refresh_token).await;
    assert!(second_refresh.is_ok(), "New refresh token should work");
}

#[tokio::test]
async fn test_refresh_token_hashing() {
    let database = setup_test_database().await.unwrap();
    let dal = DataAccessLayer::new(database);
    let refresh_repo = dal.refresh_tokens();
    
    // Generate a token
    let raw_token = RefreshTokenRepository::generate_refresh_token();
    let user_id = Uuid::new_v4();
    
    // Store the token
    let _stored_token = refresh_repo.create_refresh_token(user_id, &raw_token).await.unwrap();
    
    // Verify the raw token is not stored directly
    let token_hash = RefreshTokenRepository::hash_token(&raw_token);
    let found_token = refresh_repo.find_by_token_hash(&raw_token).await.unwrap().unwrap();
    
    assert_eq!(found_token.token_hash, token_hash, "Token should be hashed before storage");
    assert_ne!(found_token.token_hash, raw_token, "Raw token should not be stored");
}

#[tokio::test]
async fn test_refresh_token_cleanup_on_password_change() {
    let auth_service = create_test_auth_service().await.unwrap();
    
    // Create and register user
    let register_request = RegisterRequest {
        email: "test_cleanup@workbench.com".to_string(),
        username: "test_cleanup".to_string(),
        password: "SecureTestPassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let user_id = response.user.id;
    let refresh_token = response.refresh_token;
    
    // Verify refresh token works initially
    let refresh_result = auth_service.refresh_access_token(&refresh_token).await;
    assert!(refresh_result.is_ok(), "Refresh token should work initially");
    
    // Change password
    let change_result = auth_service.change_password(
        user_id,
        "SecureTestPassword123!",
        "NewSecurePassword456!"
    ).await;
    assert!(change_result.is_ok(), "Password change should succeed");
    
    // Verify refresh token is invalidated after password change
    let refresh_after_change = auth_service.refresh_access_token(&refresh_token).await;
    assert!(refresh_after_change.is_err(), "Refresh token should be invalidated after password change");
}

#[tokio::test]
async fn test_refresh_token_cleanup_on_logout() {
    let auth_service = create_test_auth_service().await.unwrap();
    
    // Create and register user
    let register_request = RegisterRequest {
        email: "test_logout@workbench.com".to_string(),
        username: "test_logout".to_string(),
        password: "SecureTestPassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let refresh_token = response.refresh_token;
    
    // Verify refresh token works initially
    let refresh_result = auth_service.refresh_access_token(&refresh_token).await;
    assert!(refresh_result.is_ok(), "Refresh token should work initially");
    
    // Logout with refresh token
    let logout_result = auth_service.logout_with_refresh_token(&refresh_token).await;
    assert!(logout_result.is_ok(), "Logout should succeed");
    
    // Verify refresh token is invalidated after logout
    let refresh_after_logout = auth_service.refresh_access_token(&refresh_token).await;
    assert!(refresh_after_logout.is_err(), "Refresh token should be invalidated after logout");
}

#[tokio::test]
async fn test_refresh_token_invalid_token() {
    let auth_service = create_test_auth_service().await.unwrap();
    
    // Try to use completely invalid token
    let invalid_token = "invalid_token_123";
    let result = auth_service.refresh_access_token(invalid_token).await;
    assert!(result.is_err(), "Invalid refresh token should fail");
    
    // Try to use expired token format
    let fake_token = RefreshTokenRepository::generate_refresh_token();
    let result = auth_service.refresh_access_token(&fake_token).await;
    assert!(result.is_err(), "Non-existent refresh token should fail");
}

#[tokio::test]
async fn test_refresh_token_generation_uniqueness() {
    // Generate multiple tokens and ensure they're unique
    let mut tokens = std::collections::HashSet::new();
    
    for _ in 0..1000 {
        let token = RefreshTokenRepository::generate_refresh_token();
        assert_eq!(token.len(), 64, "Token should be 64 characters long");
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()), "Token should be alphanumeric");
        assert!(tokens.insert(token), "All generated tokens should be unique");
    }
}

#[tokio::test]
async fn test_refresh_token_hash_consistency() {
    let token = "test_token_for_hashing";
    
    // Hash the same token multiple times
    let hash1 = RefreshTokenRepository::hash_token(token);
    let hash2 = RefreshTokenRepository::hash_token(token);
    let hash3 = RefreshTokenRepository::hash_token(token);
    
    assert_eq!(hash1, hash2, "Hash should be deterministic");
    assert_eq!(hash2, hash3, "Hash should be deterministic");
    
    // Verify different tokens produce different hashes
    let different_token = "different_token_for_hashing";
    let different_hash = RefreshTokenRepository::hash_token(different_token);
    assert_ne!(hash1, different_hash, "Different tokens should produce different hashes");
}

#[tokio::test]
async fn test_owasp_security_requirements() {
    let auth_service = create_test_auth_service().await.unwrap();
    
    // Create and register user
    let register_request = RegisterRequest {
        email: "test_owasp@workbench.com".to_string(),
        username: "test_owasp".to_string(),
        password: "SecureTestPassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    
    // OWASP Requirement 1: Short-lived access tokens (15 minutes)
    let claims = auth_service.validate_jwt_token(&response.access_token).unwrap();
    let now = Utc::now().timestamp() as usize;
    let token_lifetime = claims.exp - now;
    assert!(token_lifetime <= 16 * 60, "Access token should expire within 16 minutes (15 + 1 for tolerance)");
    
    // OWASP Requirement 2: Refresh token rotation
    let first_refresh = auth_service.refresh_access_token(&response.refresh_token).await.unwrap();
    assert_ne!(response.refresh_token, first_refresh.refresh_token, "Refresh token must rotate");
    
    // OWASP Requirement 3: Secure storage (hashed)
    let database = setup_test_database().await.unwrap();
    let dal = DataAccessLayer::new(database);
    let refresh_repo = dal.refresh_tokens();
    
    let stored_token = refresh_repo.find_by_token_hash(&first_refresh.refresh_token).await.unwrap().unwrap();
    assert_ne!(stored_token.token_hash, first_refresh.refresh_token, "Refresh token must be hashed in storage");
    
    // OWASP Requirement 4: Proper invalidation
    let old_token_result = auth_service.refresh_access_token(&response.refresh_token).await;
    assert!(old_token_result.is_err(), "Old refresh token must be invalidated");
}
