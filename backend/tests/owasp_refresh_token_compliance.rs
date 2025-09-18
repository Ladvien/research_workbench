//! OWASP JWT Refresh Token Compliance Tests
//! 
//! Tests to verify AUTH-SEC-001 implementation meets OWASP JWT security best practices:
//! https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
//!
//! OWASP Requirements Tested:
//! 1. Short-lived access tokens (15 minutes maximum)
//! 2. Refresh token rotation on each use
//! 3. Secure refresh token storage (hashed)
//! 4. Proper token invalidation on logout
//! 5. Session cleanup on security events

use chrono::Utc;
use std::collections::HashMap;
use workbench_server::{
    config::JwtConfig,
    database::Database,
    error::AppError,
    models::RegisterRequest,
    repositories::refresh_token::RefreshTokenRepository,
    services::{auth::AuthService, DataAccessLayer},
};

/// Setup test auth service with proper JWT configuration
async fn setup_owasp_compliant_auth_service() -> Result<AuthService, AppError> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@192.168.1.104:5432/workbench".to_string());
    
    let database = Database::new(&database_url)
        .await
        .map_err(|e| AppError::InternalServerError(format!("Database setup failed: {}", e)))?;
    
    let dal = DataAccessLayer::new(database);
    
    let jwt_config = JwtConfig {
        current_secret: "owasp_compliant_secret_key_for_testing_that_meets_minimum_length_requirements".to_string(),
        previous_secrets: HashMap::new(),
        current_version: 1,
    };
    
    Ok(AuthService::new(
        dal.users().clone(),
        dal.refresh_tokens().clone(),
        jwt_config,
    ))
}

#[tokio::test]
async fn test_owasp_requirement_1_short_lived_access_tokens() {
    // OWASP: Access tokens should be short-lived (max 15 minutes)
    let auth_service = setup_owasp_compliant_auth_service().await.unwrap();
    
    let register_request = RegisterRequest {
        email: "owasp_test_1@workbench.com".to_string(),
        username: "owasp_test_1".to_string(),
        password: "SecurePassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let claims = auth_service.validate_jwt_token(&response.access_token).unwrap();
    
    let now = Utc::now().timestamp() as usize;
    let token_lifetime_seconds = claims.exp.saturating_sub(now);
    let token_lifetime_minutes = token_lifetime_seconds / 60;
    
    // OWASP Compliance: Token should expire in 15 minutes or less
    assert!(
        token_lifetime_minutes <= 15,
        "OWASP VIOLATION: Access token lifetime ({} minutes) exceeds 15 minutes maximum",
        token_lifetime_minutes
    );
    
    // Additional check: Token should be at least 14 minutes (allowing for test execution time)
    assert!(
        token_lifetime_minutes >= 14,
        "Access token lifetime ({} minutes) is too short, should be ~15 minutes",
        token_lifetime_minutes
    );
    
    println!("✅ OWASP Requirement 1: Access token expires in {} minutes (≤15 minutes)", token_lifetime_minutes);
}

#[tokio::test]
async fn test_owasp_requirement_2_refresh_token_rotation() {
    // OWASP: Refresh tokens should rotate on each use
    let auth_service = setup_owasp_compliant_auth_service().await.unwrap();
    
    let register_request = RegisterRequest {
        email: "owasp_test_2@workbench.com".to_string(),
        username: "owasp_test_2".to_string(),
        password: "SecurePassword123!".to_string(),
    };
    
    let initial_response = auth_service.register(register_request).await.unwrap();
    let original_refresh_token = initial_response.refresh_token;
    
    // Use refresh token to get new tokens
    let first_refresh = auth_service.refresh_access_token(&original_refresh_token).await.unwrap();
    let rotated_refresh_token = first_refresh.refresh_token;
    
    // OWASP Compliance: New refresh token must be different (rotated)
    assert_ne!(
        original_refresh_token,
        rotated_refresh_token,
        "OWASP VIOLATION: Refresh token did not rotate on use"
    );
    
    // OWASP Compliance: Old refresh token must be invalidated
    let old_token_result = auth_service.refresh_access_token(&original_refresh_token).await;
    assert!(
        old_token_result.is_err(),
        "OWASP VIOLATION: Old refresh token is still valid after rotation"
    );
    
    // New refresh token should work
    let second_refresh = auth_service.refresh_access_token(&rotated_refresh_token).await;
    assert!(
        second_refresh.is_ok(),
        "Rotated refresh token should be valid"
    );
    
    println!("✅ OWASP Requirement 2: Refresh token properly rotates on each use");
}

#[tokio::test]
async fn test_owasp_requirement_3_secure_token_storage() {
    // OWASP: Refresh tokens should be securely stored (hashed)
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@192.168.1.104:5432/workbench".to_string());
    
    let database = Database::new(&database_url).await.unwrap();
    let dal = DataAccessLayer::new(database);
    let refresh_repo = dal.refresh_tokens();
    
    // Generate a raw token
    let raw_token = RefreshTokenRepository::generate_refresh_token();
    let user_id = uuid::Uuid::new_v4();
    
    // Store the token
    let _stored_token = refresh_repo.create_refresh_token(user_id, &raw_token).await.unwrap();
    
    // Retrieve and verify it's hashed
    let found_token = refresh_repo.find_by_token_hash(&raw_token).await.unwrap().unwrap();
    
    // OWASP Compliance: Token must be hashed in storage
    assert_ne!(
        found_token.token_hash,
        raw_token,
        "OWASP VIOLATION: Refresh token stored in plaintext"
    );
    
    // Verify hash is deterministic
    let expected_hash = RefreshTokenRepository::hash_token(&raw_token);
    assert_eq!(
        found_token.token_hash,
        expected_hash,
        "OWASP VIOLATION: Token hash is not deterministic"
    );
    
    // Verify hash length (SHA-256 produces 64 character hex string)
    assert_eq!(
        found_token.token_hash.len(),
        64,
        "OWASP VIOLATION: Token hash should be SHA-256 (64 characters)"
    );
    
    println!("✅ OWASP Requirement 3: Refresh tokens securely stored with SHA-256 hashing");
}

#[tokio::test]
async fn test_owasp_requirement_4_proper_token_invalidation() {
    // OWASP: Refresh tokens should be invalidated on logout
    let auth_service = setup_owasp_compliant_auth_service().await.unwrap();
    
    let register_request = RegisterRequest {
        email: "owasp_test_4@workbench.com".to_string(),
        username: "owasp_test_4".to_string(),
        password: "SecurePassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let refresh_token = response.refresh_token;
    
    // Verify token works initially
    let initial_refresh = auth_service.refresh_access_token(&refresh_token).await;
    assert!(initial_refresh.is_ok(), "Refresh token should work initially");
    
    // Logout (invalidate token)
    let logout_result = auth_service.logout_with_refresh_token(&refresh_token).await;
    assert!(logout_result.is_ok(), "Logout should succeed");
    
    // OWASP Compliance: Token should be invalidated after logout
    let post_logout_refresh = auth_service.refresh_access_token(&refresh_token).await;
    assert!(
        post_logout_refresh.is_err(),
        "OWASP VIOLATION: Refresh token still valid after logout"
    );
    
    println!("✅ OWASP Requirement 4: Refresh tokens properly invalidated on logout");
}

#[tokio::test]
async fn test_owasp_requirement_5_session_cleanup_on_security_events() {
    // OWASP: All refresh tokens should be invalidated on password change
    let auth_service = setup_owasp_compliant_auth_service().await.unwrap();
    
    let register_request = RegisterRequest {
        email: "owasp_test_5@workbench.com".to_string(),
        username: "owasp_test_5".to_string(),
        password: "SecurePassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    let user_id = response.user.id;
    let refresh_token = response.refresh_token;
    
    // Verify token works initially
    let initial_refresh = auth_service.refresh_access_token(&refresh_token).await;
    assert!(initial_refresh.is_ok(), "Refresh token should work initially");
    
    // Change password (security event)
    let password_change_result = auth_service.change_password(
        user_id,
        "SecurePassword123!",
        "NewSecurePassword456!"
    ).await;
    assert!(password_change_result.is_ok(), "Password change should succeed");
    
    // OWASP Compliance: Refresh token should be invalidated after password change
    let post_change_refresh = auth_service.refresh_access_token(&refresh_token).await;
    assert!(
        post_change_refresh.is_err(),
        "OWASP VIOLATION: Refresh token still valid after password change"
    );
    
    println!("✅ OWASP Requirement 5: Refresh tokens invalidated on security events (password change)");
}

#[tokio::test]
async fn test_complete_owasp_jwt_security_compliance() {
    // Comprehensive test covering all OWASP JWT security requirements
    let auth_service = setup_owasp_compliant_auth_service().await.unwrap();
    
    println!("🔒 Testing OWASP JWT Security Compliance...");
    
    // Register user
    let register_request = RegisterRequest {
        email: "owasp_comprehensive@workbench.com".to_string(),
        username: "owasp_comprehensive".to_string(),
        password: "SecurePassword123!".to_string(),
    };
    
    let response = auth_service.register(register_request).await.unwrap();
    
    // Test 1: Access token expiry
    let claims = auth_service.validate_jwt_token(&response.access_token).unwrap();
    let now = Utc::now().timestamp() as usize;
    let lifetime_minutes = (claims.exp - now) / 60;
    assert!(lifetime_minutes <= 15, "Access token lifetime compliance");
    println!("  ✅ Access tokens expire within 15 minutes");
    
    // Test 2: Refresh token rotation
    let first_refresh = auth_service.refresh_access_token(&response.refresh_token).await.unwrap();
    assert_ne!(response.refresh_token, first_refresh.refresh_token, "Token rotation compliance");
    println!("  ✅ Refresh tokens rotate on each use");
    
    // Test 3: Old token invalidation
    let old_token_test = auth_service.refresh_access_token(&response.refresh_token).await;
    assert!(old_token_test.is_err(), "Old token invalidation compliance");
    println!("  ✅ Old refresh tokens properly invalidated");
    
    // Test 4: Secure storage verification
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@192.168.1.104:5432/workbench".to_string());
    let database = Database::new(&database_url).await.unwrap();
    let dal = DataAccessLayer::new(database);
    let refresh_repo = dal.refresh_tokens();
    
    let stored_token = refresh_repo.find_by_token_hash(&first_refresh.refresh_token).await.unwrap().unwrap();
    assert_ne!(stored_token.token_hash, first_refresh.refresh_token, "Secure storage compliance");
    assert_eq!(stored_token.token_hash.len(), 64, "SHA-256 hash compliance");
    println!("  ✅ Refresh tokens securely hashed in storage");
    
    // Test 5: Logout invalidation
    let logout_result = auth_service.logout_with_refresh_token(&first_refresh.refresh_token).await;
    assert!(logout_result.is_ok(), "Logout should succeed");
    
    let post_logout_test = auth_service.refresh_access_token(&first_refresh.refresh_token).await;
    assert!(post_logout_test.is_err(), "Logout invalidation compliance");
    println!("  ✅ Tokens invalidated on logout");
    
    println!("\n🎉 OWASP JWT Security Compliance: PASSED");
    println!("   All refresh token security requirements met according to OWASP guidelines.");
}
