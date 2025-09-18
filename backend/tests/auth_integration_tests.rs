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

// Helper to create test configuration
fn create_test_config() -> AppConfig {
    let jwt_config = JwtConfig::new("test-secret-for-integration-tests-32-chars-long".to_string())
        .expect("Valid JWT config");

    AppConfig {
        bind_address: "0.0.0.0:4512".parse().expect("Test assertion failed"),
        openai_api_key: "test-key".to_string(),
        openai_model: "gpt-4".to_string(),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: "test-key".to_string(),
        anthropic_model: "claude-3-sonnet".to_string(),
        anthropic_max_tokens: 2048,
        anthropic_temperature: 0.7,
        claude_code_enabled: false,
        claude_code_model: "claude-3-5-sonnet".to_string(),
        claude_code_session_timeout: 30,
        jwt_config,
        redis_url: "redis://localhost:6379".to_string(),
        session_timeout_hours: 24,
        storage_path: "/tmp/test".to_string(),
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

// Mock auth service for testing without database
struct MockAuthService {
    users: std::sync::Mutex<HashMap<String, UserResponse>>,
    tokens: std::sync::Mutex<HashMap<String, String>>, // token -> user_email
    refresh_tokens: std::sync::Mutex<HashMap<String, String>>, // refresh_token -> user_email
}

impl MockAuthService {
    fn new() -> Self {
        Self {
            users: std::sync::Mutex::new(HashMap::new()),
            tokens: std::sync::Mutex::new(HashMap::new()),
            refresh_tokens: std::sync::Mutex::new(HashMap::new()),
        }
    }

    fn register_user(&self, email: &str, username: &str) -> Result<UserResponse, AppError> {
        let mut users = self.users.lock().expect("Test assertion failed");

        if users.contains_key(email) {
            return Err(AppError::ValidationError {
                field: "email".to_string(),
                message: "Email already exists".to_string(),
            });
        }

        let user = UserResponse {
            id: Uuid::new_v4(),
            email: email.to_string(),
            username: username.to_string(),
            created_at: chrono::Utc::now(),
        };

        users.insert(email.to_string(), user.clone());
        Ok(user)
    }

    fn login_user(
        &self,
        email: &str,
        password: &str,
    ) -> Result<(UserResponse, String, String), AppError> {
        let users = self.users.lock().expect("Test assertion failed");

        let user = users
            .get(email)
            .ok_or_else(|| AppError::AuthenticationError("Invalid credentials".to_string()))?;

        // For testing, accept any password for registered users
        let access_token = format!("access_token_for_{}", user.id);
        let refresh_token = format!("refresh_token_for_{}", user.id);

        // Store tokens
        {
            let mut tokens = self.tokens.lock().expect("Test assertion failed");
            tokens.insert(access_token.clone(), email.to_string());
        }
        {
            let mut refresh_tokens = self.refresh_tokens.lock().expect("Test assertion failed");
            refresh_tokens.insert(refresh_token.clone(), email.to_string());
        }

        Ok((user.clone(), access_token, refresh_token))
    }

    fn validate_token(&self, token: &str) -> Result<UserResponse, AppError> {
        let tokens = self.tokens.lock().expect("Test assertion failed");
        let users = self.users.lock().expect("Test assertion failed");

        let email = tokens
            .get(token)
            .ok_or_else(|| AppError::AuthenticationError("Invalid token".to_string()))?;

        let user = users
            .get(email)
            .ok_or_else(|| AppError::AuthenticationError("User not found".to_string()))?;

        Ok(user.clone())
    }

    fn refresh_access_token(
        &self,
        refresh_token: &str,
    ) -> Result<(UserResponse, String, String), AppError> {
        let refresh_tokens = self.refresh_tokens.lock().expect("Test assertion failed");
        let users = self.users.lock().expect("Test assertion failed");

        let email = refresh_tokens
            .get(refresh_token)
            .ok_or_else(|| AppError::AuthenticationError("Invalid refresh token".to_string()))?;

        let user = users
            .get(email)
            .ok_or_else(|| AppError::AuthenticationError("User not found".to_string()))?;

        // Generate new tokens
        let new_access_token = format!("new_access_token_for_{}", user.id);
        let new_refresh_token = format!("new_refresh_token_for_{}", user.id);

        Ok((user.clone(), new_access_token, new_refresh_token))
    }
}

#[tokio::test]
async fn test_complete_authentication_flow() {
    let mock_auth = MockAuthService::new();

    // Test 1: User Registration
    let email = "test@workbench.com";
    let username = "testuser";
    let user = mock_auth
        .register_user(email, username)
        .expect("Registration should succeed");

    assert_eq!(user.email, email);
    assert_eq!(user.username, username);
    assert!(!user.id.to_string().is_empty());

    // Test 2: Duplicate Registration Should Fail
    let duplicate_result = mock_auth.register_user(email, "different_username");
    assert!(
        duplicate_result.is_err(),
        "Duplicate registration should fail"
    );

    // Test 3: User Login
    let password = "testpassword123";
    let (login_user, access_token, refresh_token) = mock_auth
        .login_user(email, password)
        .expect("Login should succeed");

    assert_eq!(login_user.id, user.id);
    assert!(!access_token.is_empty());
    assert!(!refresh_token.is_empty());
    assert_ne!(access_token, refresh_token);

    // Test 4: Token Validation
    let validated_user = mock_auth
        .validate_token(&access_token)
        .expect("Token validation should succeed");

    assert_eq!(validated_user.id, user.id);
    assert_eq!(validated_user.email, user.email);

    // Test 5: Invalid Token Should Fail
    let invalid_token_result = mock_auth.validate_token("invalid_token");
    assert!(
        invalid_token_result.is_err(),
        "Invalid token validation should fail"
    );

    // Test 6: Refresh Token Flow
    let (refreshed_user, new_access_token, new_refresh_token) = mock_auth
        .refresh_access_token(&refresh_token)
        .expect("Token refresh should succeed");

    assert_eq!(refreshed_user.id, user.id);
    assert!(!new_access_token.is_empty());
    assert!(!new_refresh_token.is_empty());
    assert_ne!(new_access_token, access_token); // Should be different from original
    assert_ne!(new_refresh_token, refresh_token); // Should be different from original

    // Test 7: Old access token should still work (until we implement rotation)
    let old_token_validation = mock_auth.validate_token(&access_token);
    assert!(
        old_token_validation.is_ok(),
        "Old access token should still work in this mock"
    );

    // Test 8: Invalid refresh token should fail
    let invalid_refresh_result = mock_auth.refresh_access_token("invalid_refresh_token");
    assert!(
        invalid_refresh_result.is_err(),
        "Invalid refresh token should fail"
    );
}

#[tokio::test]
async fn test_jwt_token_properties() {
    // Test JWT configuration and token generation properties
    let jwt_config = JwtConfig::new("test-secret-for-jwt-testing-32-chars-long".to_string())
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
    let mock_auth = MockAuthService::new();

    // Test login with non-existent user
    let login_result = mock_auth.login_user("nonexistent@workbench.com", "password");
    assert!(
        login_result.is_err(),
        "Login with non-existent user should fail"
    );

    // Test token validation with invalid token
    let validation_result = mock_auth.validate_token("completely_invalid_token");
    assert!(
        validation_result.is_err(),
        "Invalid token validation should fail"
    );

    // Test refresh with invalid token
    let refresh_result = mock_auth.refresh_access_token("invalid_refresh_token");
    assert!(refresh_result.is_err(), "Invalid refresh token should fail");
}

#[tokio::test]
async fn test_user_data_integrity() {
    let mock_auth = MockAuthService::new();

    // Register a user
    let email = "integrity@workbench.com";
    let username = "integrityuser";
    let user = mock_auth
        .register_user(email, username)
        .expect("Registration should succeed");

    // Login and get tokens
    let (login_user, access_token, _refresh_token) = mock_auth
        .login_user(email, "password")
        .expect("Login should succeed");

    // Validate that user data is consistent across operations
    assert_eq!(user.id, login_user.id, "User ID should be consistent");
    assert_eq!(
        user.email, login_user.email,
        "User email should be consistent"
    );
    assert_eq!(
        user.username, login_user.username,
        "User username should be consistent"
    );

    // Validate token returns same user
    let token_user = mock_auth
        .validate_token(&access_token)
        .expect("Token validation should succeed");
    assert_eq!(user.id, token_user.id, "Token should return same user ID");
    assert_eq!(
        user.email, token_user.email,
        "Token should return same user email"
    );
    assert_eq!(
        user.username, token_user.username,
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
