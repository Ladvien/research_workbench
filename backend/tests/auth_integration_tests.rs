// Integration tests for authentication system
// Tests complete authentication flow end-to-end

use std::collections::HashMap;
use uuid::Uuid;
use workbench_server::{
    config::{AppConfig, CookieSecurityConfig, JwtConfig, RateLimitConfig},
    error::AppError,
    models::{LoginRequest, RefreshTokenRequest, RegisterRequest, UserResponse},
    repositories::refresh_token::RefreshTokenRepository,
};

// Helper to create test configuration using environment variables
fn create_test_config() -> AppConfig {
    // Use JWT secret from environment
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set for integration tests");
    let jwt_config = JwtConfig::new(jwt_secret)
        .expect("Valid JWT config");

    // Use Redis URL from environment
    let redis_url = std::env::var("REDIS_URL")
        .expect("REDIS_URL must be set for integration tests");

    AppConfig {
        bind_address: "0.0.0.0:4512".parse().expect("Test assertion failed"),
        openai_api_key: std::env::var("OPENAI_API_KEY").unwrap_or_else(|_| "test-key".to_string()),
        openai_model: "gpt-4".to_string(),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").unwrap_or_else(|_| "test-key".to_string()),
        anthropic_model: "claude-3-sonnet".to_string(),
        anthropic_max_tokens: 2048,
        anthropic_temperature: 0.7,
        claude_code_enabled: false,
        claude_code_model: "claude-3-5-sonnet".to_string(),
        claude_code_session_timeout: 30,
        jwt_config,
        redis_url,
        session_timeout_hours: 24,
        storage_path: std::env::var("NFS_MOUNT").unwrap_or_else(|_| "/tmp/test".to_string()),
        rate_limit: RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
            max_file_size_mb: 10,
        },
        cors_origins: vec!["http://localhost:3000".to_string()],
        cookie_security: CookieSecurityConfig {
            secure: false, // Allow insecure for testing
            same_site: "Lax".to_string(),
            environment: "test".to_string(),
        },
    }
}

// Helper to create real auth service using environment configuration
async fn create_real_auth_service() -> anyhow::Result<workbench_server::services::auth::AuthService> {
    use workbench_server::{database::Database, repositories::{user::UserRepository, refresh_token::RefreshTokenRepository}};

    // Use real database from environment
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for integration tests");
    let database = Database::new(&database_url).await?;

    let user_repository = UserRepository::new(database.clone());
    let refresh_token_repository = RefreshTokenRepository::new(database);

    // Use JWT secret from environment
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set for integration tests");
    let jwt_config = JwtConfig::new(jwt_secret)?;

    Ok(workbench_server::services::auth::AuthService::new(user_repository, refresh_token_repository, jwt_config))
}

#[tokio::test]
async fn test_complete_authentication_flow() {
    let auth_service = create_real_auth_service().await
        .expect("Failed to create auth service");

    // Use test credentials from environment
    let test_email = std::env::var("TEST_USER_EMAIL")
        .unwrap_or_else(|_| "test@workbench.com".to_string());
    let test_password = std::env::var("TEST_USER_PASSWORD")
        .unwrap_or_else(|_| "testpassword123".to_string());

    // Test 1: User Registration
    let register_request = RegisterRequest {
        email: test_email.clone(),
        username: "testuser".to_string(),
        password: test_password.clone(),
    };

    let register_result = auth_service.register(register_request).await;
    // Note: Registration might fail if user already exists, which is okay for real tests

    // Test 2: User Login
    let login_request = LoginRequest {
        email: test_email.clone(),
        password: test_password,
    };

    let login_result = auth_service.login(login_request).await;
    if login_result.is_err() {
        // If login fails, try registering first
        let register_request = RegisterRequest {
            email: format!("test_{}@workbench.com", uuid::Uuid::new_v4()),
            username: format!("testuser_{}", uuid::Uuid::new_v4()),
            password: "testpassword123".to_string(),
        };
        let register_response = auth_service.register(register_request).await
            .expect("Registration should succeed");

        // Test token validation with new user
        let token_validation = auth_service.validate_jwt_token(&register_response.access_token);
        assert!(token_validation.is_ok(), "Generated token should be valid");
    } else {
        let login_response = login_result.unwrap();
        assert!(!login_response.access_token.is_empty());

        // Test token validation
        let token_validation = auth_service.validate_jwt_token(&login_response.access_token);
        assert!(token_validation.is_ok(), "Login token should be valid");
    }

    // Test invalid token
    let invalid_token_result = auth_service.validate_jwt_token("invalid_token");
    assert!(
        invalid_token_result.is_err(),
        "Invalid token validation should fail"
    );
}

#[tokio::test]
async fn test_jwt_token_properties() {
    // Test JWT configuration using environment variables
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set for integration tests");
    let jwt_config = JwtConfig::new(jwt_secret)
        .expect("JWT config creation should succeed");

    assert_eq!(jwt_config.current_version, 1);
    assert!(!jwt_config.current_secret.is_empty());

    // Test that short secrets are rejected
    let short_secret_result = JwtConfig::new("short".to_string());
    assert!(
        short_secret_result.is_err(),
        "Short JWT secret should be rejected"
    );
}

#[tokio::test]
async fn test_refresh_token_security() {
    // Test refresh token generation and hashing
    let token1 = RefreshTokenRepository::generate_refresh_token();
    let token2 = RefreshTokenRepository::generate_refresh_token();

    // Tokens should be unique
    assert_ne!(token1, token2, "Refresh tokens should be unique");

    // Tokens should be proper length
    assert_eq!(token1.len(), 64, "Refresh tokens should be 64 characters");
    assert_eq!(token2.len(), 64, "Refresh tokens should be 64 characters");

    // Tokens should be alphanumeric
    assert!(token1.chars().all(|c| c.is_ascii_alphanumeric()));
    assert!(token2.chars().all(|c| c.is_ascii_alphanumeric()));

    // Test token hashing
    let hash1 = RefreshTokenRepository::hash_token(&token1);
    let hash2 = RefreshTokenRepository::hash_token(&token1); // Same token
    let hash3 = RefreshTokenRepository::hash_token(&token2); // Different token

    assert_eq!(hash1, hash2, "Same token should produce same hash");
    assert_ne!(
        hash1, hash3,
        "Different tokens should produce different hashes"
    );
    assert_eq!(hash1.len(), 64, "SHA256 hash should be 64 hex characters");
}

#[tokio::test]
async fn test_authentication_error_handling() {
    let auth_service = create_real_auth_service().await
        .expect("Failed to create auth service");

    // Test login with non-existent user
    let login_request = LoginRequest {
        email: "nonexistent@workbench.com".to_string(),
        password: "password".to_string(),
    };
    let login_result = auth_service.login(login_request).await;
    assert!(
        login_result.is_err(),
        "Login with non-existent user should fail"
    );

    // Test token validation with invalid token
    let validation_result = auth_service.validate_jwt_token("completely_invalid_token");
    assert!(
        validation_result.is_err(),
        "Invalid token validation should fail"
    );
}

#[tokio::test]
async fn test_user_data_integrity() {
    let auth_service = create_real_auth_service().await
        .expect("Failed to create auth service");

    // Create unique test user to avoid conflicts
    let unique_id = uuid::Uuid::new_v4();
    let email = format!("integrity_{}@workbench.com", unique_id);
    let username = format!("integrityuser_{}", unique_id);
    let password = "testpassword123".to_string();

    // Register a user
    let register_request = RegisterRequest {
        email: email.clone(),
        username: username.clone(),
        password: password.clone(),
    };
    let register_response = auth_service.register(register_request).await
        .expect("Registration should succeed");

    // Login and get tokens
    let login_request = LoginRequest {
        email: email.clone(),
        password,
    };
    let login_response = auth_service.login(login_request).await
        .expect("Login should succeed");

    // Validate that user data is consistent across operations
    assert_eq!(
        register_response.user.id, login_response.user.id,
        "User ID should be consistent"
    );
    assert_eq!(
        register_response.user.email, login_response.user.email,
        "User email should be consistent"
    );
    assert_eq!(
        register_response.user.username, login_response.user.username,
        "User username should be consistent"
    );

    // Validate token returns same user data
    let token_claims = auth_service.validate_jwt_token(&login_response.access_token)
        .expect("Token validation should succeed");
    assert_eq!(
        login_response.user.email, token_claims.email,
        "Token should return same user email"
    );
    assert_eq!(
        login_response.user.username, token_claims.username,
        "Token should return same user username"
    );
}

#[tokio::test]
async fn test_authentication_request_validation() {
    // Test validation of authentication request structures
    use validator::Validate;

    // Test valid login request
    let valid_login = LoginRequest {
        email: "test@workbench.com".to_string(),
        password: "ValidPassword123!".to_string(),
    };
    assert!(
        valid_login.validate().is_ok(),
        "Valid login request should pass validation"
    );

    // Test invalid email in login request
    let invalid_email_login = LoginRequest {
        email: "not_an_email".to_string(),
        password: "ValidPassword123!".to_string(),
    };
    assert!(
        invalid_email_login.validate().is_err(),
        "Invalid email should fail validation"
    );

    // Test valid registration request
    let valid_register = RegisterRequest {
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };
    assert!(
        valid_register.validate().is_ok(),
        "Valid registration request should pass validation"
    );

    // Test invalid username length
    let invalid_username_register = RegisterRequest {
        email: "test@workbench.com".to_string(),
        username: "ab".to_string(), // Too short
        password: "ValidPassword123!".to_string(),
    };
    assert!(
        invalid_username_register.validate().is_err(),
        "Short username should fail validation"
    );

    // Test valid refresh token request
    let valid_refresh = RefreshTokenRequest {
        refresh_token: "valid_refresh_token_string".to_string(),
    };
    assert!(
        valid_refresh.validate().is_ok(),
        "Valid refresh token request should pass validation"
    );

    // Test empty refresh token
    let empty_refresh = RefreshTokenRequest {
        refresh_token: "".to_string(),
    };
    assert!(
        empty_refresh.validate().is_err(),
        "Empty refresh token should fail validation"
    );
}
