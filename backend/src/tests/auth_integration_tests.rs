use std::sync::Arc;
use uuid::Uuid;

use crate::{
    config::{AppConfig, JwtConfig},
    database::Database,
    models::{RegisterRequest, LoginRequest, User, CreateUserRequest},
    repositories::{user::UserRepository, refresh_token::RefreshTokenRepository, Repository},
    services::auth::AuthService,
};

// Test helper to create a test database and auth service using real environment configuration
async fn create_test_auth_service() -> anyhow::Result<(AuthService, Database)> {
    // Use real database from environment
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for integration tests");
    let database = Database::new(&database_url).await?;

    let user_repository = UserRepository::new(database.clone());
    let refresh_token_repository = RefreshTokenRepository::new(database.clone());

    // Use JWT secret from environment
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set for integration tests");
    let jwt_config = JwtConfig::new(jwt_secret)?;

    let auth_service = AuthService::new(user_repository, refresh_token_repository, jwt_config);

    Ok((auth_service, database))
}

#[cfg(test)]
mod auth_integration_tests {
    use super::*;
    
    #[tokio::test]
    async fn test_complete_registration_flow() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Use test credentials from environment
        let test_email = std::env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "test@workbench.com".to_string());
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "testpassword123".to_string());

        let register_request = RegisterRequest {
            email: test_email.clone(),
            username: "testuser".to_string(),
            password: test_password.clone(),
        };
        
        // Test registration
        let register_response = auth_service.register(register_request).await;
        assert!(register_response.is_ok(), "Registration should succeed");
        
        let response = register_response.unwrap();
        assert_eq!(response.user.email, test_email);
        assert_eq!(response.user.username, "testuser");
        assert!(!response.access_token.is_empty(), "Should generate JWT token");
        
        // Verify the token is valid
        let token_validation = auth_service.validate_jwt_token(&response.access_token);
        assert!(token_validation.is_ok(), "Generated token should be valid");
        
        let claims = token_validation.unwrap();
        assert_eq!(claims.email, test_email);
        assert_eq!(claims.username, "testuser");
    }
    
    #[tokio::test]
    async fn test_complete_login_flow() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // First register a user
        // Use test credentials from environment
        let test_email = std::env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "login@workbench.com".to_string());
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "loginpassword123".to_string());

        let register_request = RegisterRequest {
            email: test_email.clone(),
            username: "loginuser".to_string(),
            password: test_password.clone(),
        };

        auth_service.register(register_request).await.unwrap();

        // Then try to login
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: test_password,
        };
        
        let login_response = auth_service.login(login_request).await;
        assert!(login_response.is_ok(), "Login should succeed");
        
        let response = login_response.unwrap();
        assert_eq!(response.user.email, test_email);
        assert_eq!(response.user.username, "loginuser");
        assert!(!response.access_token.is_empty(), "Should generate JWT token");
        
        // Verify the token is valid
        let token_validation = auth_service.validate_jwt_token(&response.access_token);
        assert!(token_validation.is_ok(), "Generated token should be valid");
    }
    
    #[tokio::test]
    async fn test_login_with_wrong_password() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Use test credentials from environment but with wrong password for negative test
        let test_email = "wrongpass@workbench.com".to_string(); // Use different email for this test
        let correct_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "correctpassword123".to_string());
        let wrong_password = "wrongpassword123".to_string();

        // First register a user
        let register_request = RegisterRequest {
            email: test_email.clone(),
            username: "wrongpassuser".to_string(),
            password: correct_password,
        };

        auth_service.register(register_request).await.unwrap();

        // Try to login with wrong password
        let login_request = LoginRequest {
            email: test_email,
            password: wrong_password,
        };
        
        let login_response = auth_service.login(login_request).await;
        assert!(login_response.is_err(), "Login should fail with wrong password");
    }
    
    #[tokio::test]
    async fn test_get_current_user_from_token() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Use test credentials from environment
        let test_email = std::env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "getuser@workbench.com".to_string());
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "getuserpassword123".to_string());

        // Register and get token
        let register_request = RegisterRequest {
            email: test_email.clone(),
            username: "getusertest".to_string(),
            password: test_password,
        };

        let register_response = auth_service.register(register_request).await.unwrap();
        let token = register_response.access_token;

        // Test get_current_user
        let current_user_result = auth_service.get_current_user(&token).await;
        assert!(current_user_result.is_ok(), "Should get current user from valid token");

        let user = current_user_result.unwrap();
        assert_eq!(user.email, test_email);
        assert_eq!(user.username, "getusertest");
    }
    
    #[tokio::test]
    async fn test_duplicate_email_registration() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Use test password from environment
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "password123".to_string());

        let register_request1 = RegisterRequest {
            email: "duplicate@workbench.com".to_string(),
            username: "user1".to_string(),
            password: test_password.clone(),
        };

        let register_request2 = RegisterRequest {
            email: "duplicate@workbench.com".to_string(),
            username: "user2".to_string(),
            password: test_password,
        };
        
        // First registration should succeed
        let result1 = auth_service.register(register_request1).await;
        assert!(result1.is_ok(), "First registration should succeed");
        
        // Second registration with same email should fail
        let result2 = auth_service.register(register_request2).await;
        assert!(result2.is_err(), "Duplicate email registration should fail");
    }
    
    #[tokio::test]
    async fn test_duplicate_username_registration() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Use test password from environment
        let test_password = std::env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "password123".to_string());

        let register_request1 = RegisterRequest {
            email: "user1@workbench.com".to_string(),
            username: "duplicate_username".to_string(),
            password: test_password.clone(),
        };

        let register_request2 = RegisterRequest {
            email: "user2@workbench.com".to_string(),
            username: "duplicate_username".to_string(),
            password: test_password,
        };
        
        // First registration should succeed
        let result1 = auth_service.register(register_request1).await;
        assert!(result1.is_ok(), "First registration should succeed");
        
        // Second registration with same username should fail
        let result2 = auth_service.register(register_request2).await;
        assert!(result2.is_err(), "Duplicate username registration should fail");
    }
    
    #[tokio::test]
    async fn test_invalid_token_validation() {
        let (auth_service, _db) = create_test_auth_service().await.unwrap();
        
        // Test with completely invalid token
        let invalid_token = "invalid.token.here";
        let result = auth_service.validate_jwt_token(invalid_token);
        assert!(result.is_err(), "Invalid token should fail validation");
        
        // Test with empty token
        let empty_token = "";
        let result = auth_service.validate_jwt_token(empty_token);
        assert!(result.is_err(), "Empty token should fail validation");
    }
}
