//! JWT Test Utilities for Integration Tests
//!
//! This module provides utilities for generating real JWT tokens in tests,
//! replacing the insecure mock tokens that were previously used.
//! 
//! SECURITY: These functions generate real JWT tokens using actual AuthService
//! and JwtConfig to ensure integration tests validate real token security.

use crate::{
    config::JwtConfig,
    models::User,
};
use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

/// Test JWT configuration with a known test secret
pub const TEST_JWT_SECRET: &str = "test-jwt-secret-that-is-32-characters-long-for-security!";

/// Creates a test JWT configuration for integration tests
pub fn create_test_jwt_config() -> Result<JwtConfig> {
    JwtConfig::new(TEST_JWT_SECRET.to_string())
}

/// Creates a test user for JWT token generation
pub fn create_test_user() -> User {
    User {
        id: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap(),
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        password_hash: "$argon2id$v=19$m=65536,t=2,p=1$test$hash".to_string(), // Mock hash
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

/// Creates a test admin user for JWT token generation
pub fn create_test_admin_user() -> User {
    User {
        id: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440001").unwrap(),
        email: "admin@workbench.com".to_string(),
        username: "admin".to_string(),
        password_hash: "$argon2id$v=19$m=65536,t=2,p=1$admin$hash".to_string(), // Mock hash
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

/// Creates a test AuthService configuration for JWT operations
///
/// NOTE: This creates a minimal configuration for JWT generation/validation
/// without requiring database dependencies for integration tests.
pub fn create_test_auth_config() -> Result<JwtConfig> {
    create_test_jwt_config()
}

/// Generates a valid JWT token for testing using real JWT logic
///
/// This replaces the insecure `create_test_jwt_token()` function that returned
/// "mock.jwt.token" and ensures tests validate real JWT security.
pub fn create_test_jwt_token() -> Result<String> {
    let jwt_config = create_test_jwt_config()?;
    let test_user = create_test_user();

    generate_jwt_token_for_user(&test_user, &jwt_config)
}

/// Core JWT token generation function using real JWT logic
///
/// This function replicates the logic from AuthService::generate_jwt_token
/// but without requiring database dependencies for testing.
fn generate_jwt_token_for_user(user: &User, jwt_config: &JwtConfig) -> Result<String> {
    use jsonwebtoken::{encode, Header, EncodingKey};
    use crate::models::JwtClaims;
    use chrono::Duration;

    let now = Utc::now();
    let expiration = now + Duration::minutes(15); // Token valid for 15 minutes

    let claims = JwtClaims {
        sub: user.id.to_string(),
        email: user.email.clone(),
        username: user.username.clone(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
        key_version: jwt_config.current_version,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
    )
    .map_err(|e| anyhow::anyhow!("Failed to generate JWT token: {}", e))
}

/// Generates a valid JWT token for a specific user
pub fn create_jwt_token_for_user(user: &User) -> Result<String> {
    let jwt_config = create_test_jwt_config()?;
    generate_jwt_token_for_user(user, &jwt_config)
}

/// Generates an admin JWT token for testing admin-only endpoints
pub fn create_test_admin_jwt_token() -> Result<String> {
    let admin_user = create_test_admin_user();
    create_jwt_token_for_user(&admin_user)
}

/// Generates an expired JWT token for testing token expiration scenarios
pub fn create_expired_jwt_token() -> Result<String> {
    use jsonwebtoken::{encode, Header, EncodingKey};
    use crate::models::JwtClaims;
    use chrono::Duration;

    let jwt_config = create_test_jwt_config()?;
    let test_user = create_test_user();

    let now = Utc::now();
    let expiration = now - Duration::minutes(30); // Token expired 30 minutes ago

    let claims = JwtClaims {
        sub: test_user.id.to_string(),
        email: test_user.email,
        username: test_user.username,
        exp: expiration.timestamp() as usize,
        iat: (now - Duration::hours(1)).timestamp() as usize,
        key_version: jwt_config.current_version,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
    )
    .map_err(|e| anyhow::anyhow!("Failed to generate expired JWT token: {}", e))
}

/// Generates an invalid JWT token for testing authentication failures
pub fn create_invalid_jwt_token() -> String {
    "invalid.jwt.token.with.wrong.signature".to_string()
}

/// Validates that a JWT token is properly formatted and contains expected claims
pub fn validate_test_jwt_token(token: &str) -> Result<bool> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
    use crate::models::JwtClaims;

    let jwt_config = create_test_jwt_config()?;
    let validation = Validation::new(Algorithm::HS256);

    match decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        &validation,
    ) {
        Ok(token_data) => {
            // Verify the token contains expected test user information
            Ok(token_data.claims.email == "test@workbench.com"
               || token_data.claims.email == "admin@workbench.com")
        }
        Err(_) => Ok(false),
    }
}

/// JWT Token Test Scenarios
/// 
/// This enum represents different JWT token scenarios for comprehensive testing
#[derive(Debug, Clone)]
pub enum JwtTestScenario {
    /// Valid token for regular user
    ValidUser,
    /// Valid token for admin user
    ValidAdmin,
    /// Token that has expired
    Expired,
    /// Token with invalid signature
    Invalid,
    /// Malformed token string
    Malformed,
}

impl JwtTestScenario {
    /// Generate a JWT token for the specified test scenario
    pub fn generate_token(&self) -> Result<String> {
        match self {
            JwtTestScenario::ValidUser => create_test_jwt_token(),
            JwtTestScenario::ValidAdmin => create_test_admin_jwt_token(),
            JwtTestScenario::Expired => create_expired_jwt_token(),
            JwtTestScenario::Invalid => Ok(create_invalid_jwt_token()),
            JwtTestScenario::Malformed => Ok("not.a.jwt".to_string()),
        }
    }
    
    /// Get the expected HTTP status code for this scenario when used in API calls
    pub fn expected_status_code(&self) -> u16 {
        match self {
            JwtTestScenario::ValidUser | JwtTestScenario::ValidAdmin => 200,
            JwtTestScenario::Expired | JwtTestScenario::Invalid | JwtTestScenario::Malformed => 401,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_create_test_jwt_token_generates_valid_token() {
        let token = create_test_jwt_token().unwrap();

        // Verify it's not the old mock token
        assert_ne!(token, "mock.jwt.token");

        // Verify it's a properly formatted JWT (3 parts separated by dots)
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Verify token validates correctly
        let is_valid = validate_test_jwt_token(&token).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_create_test_admin_jwt_token() {
        let token = create_test_admin_jwt_token().unwrap();

        // Verify it's not the old mock token
        assert_ne!(token, "mock.jwt.token");

        // Verify it's a properly formatted JWT
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Verify token validates correctly
        let is_valid = validate_test_jwt_token(&token).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_create_expired_jwt_token() {
        let token = create_expired_jwt_token().unwrap();

        // Verify it's a properly formatted JWT
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Verify token is recognized as invalid due to expiration
        let is_valid = validate_test_jwt_token(&token).unwrap();
        assert!(!is_valid);
    }
    
    #[test]
    fn test_create_invalid_jwt_token() {
        let token = create_invalid_jwt_token();
        assert_eq!(token, "invalid.jwt.token.with.wrong.signature");
    }
    
    #[test]
    fn test_jwt_test_scenarios() {
        // Test valid user scenario
        let valid_token = JwtTestScenario::ValidUser.generate_token().unwrap();
        assert_ne!(valid_token, "mock.jwt.token");
        assert_eq!(JwtTestScenario::ValidUser.expected_status_code(), 200);

        // Test invalid scenario
        let invalid_token = JwtTestScenario::Invalid.generate_token().unwrap();
        assert_eq!(invalid_token, "invalid.jwt.token.with.wrong.signature");
        assert_eq!(JwtTestScenario::Invalid.expected_status_code(), 401);

        // Test malformed scenario
        let malformed_token = JwtTestScenario::Malformed.generate_token().unwrap();
        assert_eq!(malformed_token, "not.a.jwt");
        assert_eq!(JwtTestScenario::Malformed.expected_status_code(), 401);
    }

    #[test]
    fn test_jwt_config_validation() {
        let config = create_test_jwt_config().unwrap();

        // Verify the test secret meets security requirements
        assert!(config.current_secret.len() >= 32);
        assert_eq!(config.current_version, 1);
        assert!(config.previous_secrets.is_empty());
    }

    #[test]
    fn test_test_users_have_valid_structure() {
        let user = create_test_user();
        assert_eq!(user.email, "test@workbench.com");
        assert_eq!(user.username, "testuser");
        assert!(!user.password_hash.is_empty());

        let admin = create_test_admin_user();
        assert_eq!(admin.email, "admin@workbench.com");
        assert_eq!(admin.username, "admin");
        assert!(!admin.password_hash.is_empty());

        // Ensure different user IDs
        assert_ne!(user.id, admin.id);
    }
}
