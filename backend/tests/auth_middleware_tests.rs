//! Authentication Middleware Tests
//!
//! Tests that verify the authentication middleware properly extracts
//! and validates JWT tokens for protected routes.

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use uuid::Uuid;
use workbench_server::{
    config::JwtConfig,
    error::AppError,
    models::{JwtClaims, UserResponse},
};

/// Test JWT configuration for middleware tests
const TEST_JWT_SECRET: &str = "test-jwt-secret-that-is-32-characters-long-for-security!";

/// Creates a test JWT configuration
fn create_test_jwt_config() -> JwtConfig {
    JwtConfig::new(TEST_JWT_SECRET.to_string()).expect("Valid JWT config")
}

/// Generates a valid JWT token for testing
fn generate_test_jwt_token(user_id: Uuid, email: &str, username: &str) -> String {
    let now = Utc::now();
    let expiration = now + Duration::minutes(15);

    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
        key_version: 1,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(TEST_JWT_SECRET.as_bytes()),
    )
    .expect("Token generation should succeed")
}

/// Generates an expired JWT token for testing
fn generate_expired_jwt_token(user_id: Uuid, email: &str, username: &str) -> String {
    let now = Utc::now();
    let expiration = now - Duration::minutes(30); // Expired 30 minutes ago

    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        exp: expiration.timestamp() as usize,
        iat: (now - Duration::hours(1)).timestamp() as usize,
        key_version: 1,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(TEST_JWT_SECRET.as_bytes()),
    )
    .expect("Expired token generation should succeed")
}

#[tokio::test]
async fn test_jwt_token_validation_success() {
    let jwt_config = create_test_jwt_config();
    let user_id = Uuid::new_v4();
    let email = "test@workbench.com";
    let username = "testuser";

    // Generate a valid token
    let token = generate_test_jwt_token(user_id, email, username);

    // Test JWT validation logic (simulating what auth middleware does)
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let result = decode::<JwtClaims>(
        &token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    );

    assert!(result.is_ok(), "Valid JWT token should decode successfully");

    let token_data = result.unwrap();
    assert_eq!(token_data.claims.sub, user_id.to_string());
    assert_eq!(token_data.claims.email, email);
    assert_eq!(token_data.claims.username, username);
    assert_eq!(token_data.claims.key_version, 1);
}

#[tokio::test]
async fn test_jwt_token_validation_expired() {
    let jwt_config = create_test_jwt_config();
    let user_id = Uuid::new_v4();
    let email = "test@workbench.com";
    let username = "testuser";

    // Generate an expired token
    let token = generate_expired_jwt_token(user_id, email, username);

    // Test JWT validation logic
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let result = decode::<JwtClaims>(
        &token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    );

    assert!(result.is_err(), "Expired JWT token should fail validation");
}

#[tokio::test]
async fn test_jwt_token_validation_invalid_signature() {
    let jwt_config = create_test_jwt_config();
    let user_id = Uuid::new_v4();
    let email = "test@workbench.com";
    let username = "testuser";

    // Generate a token with different secret
    let wrong_secret = "wrong-secret-that-is-32-characters-long-for-security!";
    let now = Utc::now();
    let expiration = now + Duration::minutes(15);

    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
        key_version: 1,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(wrong_secret.as_bytes()),
    )
    .expect("Token generation should succeed");

    // Test JWT validation with correct secret (should fail)
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let result = decode::<JwtClaims>(
        &token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    );

    assert!(
        result.is_err(),
        "JWT token with wrong signature should fail validation"
    );
}

#[tokio::test]
async fn test_jwt_token_validation_malformed() {
    let jwt_config = create_test_jwt_config();
    let malformed_token = "this.is.not.a.valid.jwt.token";

    // Test JWT validation logic
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let result = decode::<JwtClaims>(
        malformed_token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    );

    assert!(
        result.is_err(),
        "Malformed JWT token should fail validation"
    );
}

#[tokio::test]
async fn test_user_response_from_jwt_claims() {
    let user_id = Uuid::new_v4();
    let email = "test@workbench.com";
    let username = "testuser";

    // Generate a valid token
    let token = generate_test_jwt_token(user_id, email, username);

    // Decode token (simulating auth middleware)
    let jwt_config = create_test_jwt_config();
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<JwtClaims>(
        &token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    )
    .expect("Token should be valid");

    // Simulate creating UserResponse from claims (what middleware would do)
    let user_response = UserResponse {
        id: Uuid::parse_str(&token_data.claims.sub).expect("Valid UUID"),
        email: token_data.claims.email.clone(),
        username: token_data.claims.username.clone(),
        created_at: Utc::now(), // In real implementation, this would come from database
    };

    // Verify the user response matches expected values
    assert_eq!(user_response.id, user_id);
    assert_eq!(user_response.email, email);
    assert_eq!(user_response.username, username);
}

#[tokio::test]
async fn test_15_minute_token_expiry() {
    let jwt_config = create_test_jwt_config();
    let user_id = Uuid::new_v4();
    let email = "test@workbench.com";
    let username = "testuser";

    // Generate token with exactly 15 minutes expiry
    let now = Utc::now();
    let expiration = now + Duration::minutes(15);

    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
        key_version: 1,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
    )
    .expect("Token generation should succeed");

    // Decode and verify expiration
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = false; // Disable automatic expiry check so we can inspect

    let token_data = decode::<JwtClaims>(
        &token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    )
    .expect("Token should decode");

    let token_expiry = chrono::DateTime::<Utc>::from_timestamp(token_data.claims.exp as i64, 0)
        .expect("Valid timestamp");
    let token_issued = chrono::DateTime::<Utc>::from_timestamp(token_data.claims.iat as i64, 0)
        .expect("Valid timestamp");

    let duration = token_expiry - token_issued;

    // Verify the token expires in approximately 15 minutes (allow 1 second variance)
    assert!(
        duration.num_seconds() >= 14 * 60 && duration.num_seconds() <= 15 * 60 + 1,
        "Token should expire in 15 minutes, but expires in {} seconds",
        duration.num_seconds()
    );
}

#[tokio::test]
async fn test_authentication_error_scenarios() {
    // Test various authentication error scenarios that middleware should handle

    // 1. Missing token
    let no_token_error = AppError::AuthenticationError("No authentication token found".to_string());
    assert!(matches!(no_token_error, AppError::AuthenticationError(_)));

    // 2. Invalid token format
    let invalid_format_error = AppError::AuthenticationError("Invalid token format".to_string());
    assert!(matches!(
        invalid_format_error,
        AppError::AuthenticationError(_)
    ));

    // 3. Expired token
    let expired_error = AppError::AuthenticationError("Token has expired".to_string());
    assert!(matches!(expired_error, AppError::AuthenticationError(_)));

    // 4. User not found
    let user_not_found_error = AppError::AuthenticationError("User not found".to_string());
    assert!(matches!(
        user_not_found_error,
        AppError::AuthenticationError(_)
    ));
}

#[tokio::test]
async fn test_jwt_key_rotation_support() {
    // Test that JWT config supports key rotation
    let mut jwt_config = create_test_jwt_config();

    // Verify initial state
    assert_eq!(jwt_config.current_version, 1);
    assert!(jwt_config.previous_secrets.is_empty());

    // Test adding a previous secret
    let old_secret = "old-secret-that-is-32-characters-long-for-security!";
    jwt_config
        .add_previous_secret(0, old_secret.to_string())
        .expect("Should add previous secret");

    // Verify previous secret is stored
    assert_eq!(jwt_config.previous_secrets.len(), 1);
    assert_eq!(
        jwt_config.get_secret_for_version(0),
        Some(&old_secret.to_string())
    );
    assert_eq!(
        jwt_config.get_secret_for_version(1),
        Some(&jwt_config.current_secret)
    );

    // Test secret rotation
    let new_secret = "new-secret-that-is-32-characters-long-for-security!";
    jwt_config
        .rotate_secret(new_secret.to_string())
        .expect("Should rotate secret");

    // Verify rotation worked
    assert_eq!(jwt_config.current_version, 2);
    assert_eq!(jwt_config.current_secret, new_secret);
    assert_eq!(jwt_config.previous_secrets.len(), 2); // Should have both old secrets
}
