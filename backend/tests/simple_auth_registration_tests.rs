// Removed unused imports: std::sync::Arc, uuid::Uuid
use workbench_server::{
    config::JwtConfig,
    database::Database,
    models::{RegisterRequest, LoginRequest},
    repositories::{user::UserRepository, refresh_token::RefreshTokenRepository},
    services::auth::AuthService,
};

// Test helper to create a test auth service with PostgreSQL database
async fn create_test_auth_service() -> anyhow::Result<(AuthService, Database)> {
    // Use real PostgreSQL for testing since Database is hardcoded for PG
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://ladvien:postgres@localhost:5432/workbench".to_string());

    let database = Database::new(&database_url).await?;

    // Clean up test data from previous runs - only core fields for now
    sqlx::query("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@workbench.com')")
        .execute(&database.pool)
        .await
        .ok(); // Ignore errors if table doesn't exist

    sqlx::query("DELETE FROM users WHERE email LIKE '%@workbench.com'")
        .execute(&database.pool)
        .await
        .ok(); // Ignore errors if table doesn't exist

    // Ensure basic tables exist - only core fields to match existing implementation
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(&database.pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(&database.pool)
    .await?;

    let user_repository = UserRepository::new(database.clone());
    let refresh_token_repository = RefreshTokenRepository::new(database.clone());

    // Create JWT config with a test secret
    let jwt_config = JwtConfig::new("test-secret-that-is-long-enough-for-validation-12345".to_string())?;

    let auth_service = AuthService::new(user_repository, refresh_token_repository, jwt_config);

    Ok((auth_service, database))
}

#[tokio::test]
async fn test_complete_registration_flow() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let register_request = RegisterRequest {
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        password: "ValidPassword123!".to_string(),
    };

    // Test registration
    let register_response = auth_service.register(register_request).await;
    if let Err(ref e) = register_response {
        eprintln!("Registration failed with error: {}", e);
        eprintln!("Error details: {:?}", e);
    }
    assert!(register_response.is_ok(), "Registration should succeed: {:?}", register_response.err());

    let response = register_response.unwrap();
    assert_eq!(response.user.email, "test@workbench.com");
    assert_eq!(response.user.username, "testuser");
    assert!(!response.access_token.is_empty(), "Should generate JWT token");
    assert!(!response.refresh_token.is_empty(), "Should generate refresh token");

    // Verify the token is valid
    let token_validation = auth_service.validate_jwt_token(&response.access_token);
    assert!(token_validation.is_ok(), "Generated token should be valid");

    let claims = token_validation.unwrap();
    assert_eq!(claims.email, "test@workbench.com");
    assert_eq!(claims.username, "testuser");
}

#[tokio::test]
async fn test_complete_login_flow_after_registration() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    // First register a user
    let register_request = RegisterRequest {
        email: "login@workbench.com".to_string(),
        username: "loginuser".to_string(),
        password: "LoginPassword123!".to_string(),
    };

    auth_service.register(register_request).await.unwrap();

    // Then try to login
    let login_request = LoginRequest {
        email: "login@workbench.com".to_string(),
        password: "LoginPassword123!".to_string(),
    };

    let login_response = auth_service.login(login_request).await;
    assert!(login_response.is_ok(), "Login should succeed");

    let response = login_response.unwrap();
    assert_eq!(response.user.email, "login@workbench.com");
    assert_eq!(response.user.username, "loginuser");
    assert!(!response.access_token.is_empty(), "Should generate JWT token");

    // Verify the token is valid
    let token_validation = auth_service.validate_jwt_token(&response.access_token);
    assert!(token_validation.is_ok(), "Generated token should be valid");
}

#[tokio::test]
async fn test_login_with_wrong_password() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    // First register a user
    let register_request = RegisterRequest {
        email: "wrongpass@workbench.com".to_string(),
        username: "wrongpassuser".to_string(),
        password: "CorrectPassword123!".to_string(),
    };

    auth_service.register(register_request).await.unwrap();

    // Try to login with wrong password
    let login_request = LoginRequest {
        email: "wrongpass@workbench.com".to_string(),
        password: "WrongPassword123!".to_string(),
    };

    let login_response = auth_service.login(login_request).await;
    assert!(login_response.is_err(), "Login should fail with wrong password");
}

#[tokio::test]
async fn test_duplicate_email_registration() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let register_request1 = RegisterRequest {
        email: "duplicate@workbench.com".to_string(),
        username: "user1".to_string(),
        password: "Password123!".to_string(),
    };

    let register_request2 = RegisterRequest {
        email: "duplicate@workbench.com".to_string(),
        username: "user2".to_string(),
        password: "Password456!".to_string(),
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

    let register_request1 = RegisterRequest {
        email: "user1@workbench.com".to_string(),
        username: "duplicate_username".to_string(),
        password: "Password123!".to_string(),
    };

    let register_request2 = RegisterRequest {
        email: "user2@workbench.com".to_string(),
        username: "duplicate_username".to_string(),
        password: "Password456!".to_string(),
    };

    // First registration should succeed
    let result1 = auth_service.register(register_request1).await;
    assert!(result1.is_ok(), "First registration should succeed");

    // Second registration with same username should fail
    let result2 = auth_service.register(register_request2).await;
    assert!(result2.is_err(), "Duplicate username registration should fail");
}

#[tokio::test]
async fn test_password_hashing_and_verification() {
    let (auth_service, database) = create_test_auth_service().await.unwrap();

    let register_request = RegisterRequest {
        email: "hash@workbench.com".to_string(),
        username: "hashuser".to_string(),
        password: "MySecurePassword123!".to_string(),
    };

    // Register user
    let register_response = auth_service.register(register_request).await.unwrap();

    // Get the user from database to check password hash
    let user = auth_service
        .get_user_by_id(register_response.user.id)
        .await
        .unwrap()
        .unwrap();

    // Verify that password was hashed (not stored in plain text)
    assert_ne!(user.password_hash, "MySecurePassword123!");

    // Verify that password verification works
    let user_repo = UserRepository::new(database.clone());
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
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let register_request = RegisterRequest {
        email: "jwt@workbench.com".to_string(),
        username: "jwtuser".to_string(),
        password: "JwtPassword123!".to_string(),
    };

    // Register user
    let register_response = auth_service.register(register_request).await.unwrap();

    // Verify JWT token structure and validity
    let access_token = &register_response.access_token;
    assert!(!access_token.is_empty(), "Access token should not be empty");

    // Validate the token
    let claims = auth_service
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
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let register_request = RegisterRequest {
        email: "refresh@workbench.com".to_string(),
        username: "refreshuser".to_string(),
        password: "RefreshPassword123!".to_string(),
    };

    // Register user
    let register_response = auth_service.register(register_request).await.unwrap();

    // Verify refresh token is generated
    let refresh_token = &register_response.refresh_token;
    assert!(!refresh_token.is_empty(), "Refresh token should not be empty");
    assert_eq!(refresh_token.len(), 64, "Refresh token should be 64 characters");

    // Verify refresh token is valid alphanumeric
    assert!(
        refresh_token.chars().all(|c| c.is_ascii_alphanumeric()),
        "Refresh token should only contain alphanumeric characters"
    );

    // Verify refresh token can be used to get new access token
    let new_auth_response = auth_service
        .refresh_access_token(refresh_token)
        .await
        .unwrap();

    assert_eq!(new_auth_response.user.id, register_response.user.id);
    assert!(!new_auth_response.access_token.is_empty());

    // Verify new refresh token was generated (token rotation)
    assert_ne!(new_auth_response.refresh_token, *refresh_token);
}

#[tokio::test]
async fn test_password_strength_validation() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    // Test with weak password
    let weak_password_request = RegisterRequest {
        email: "weak@workbench.com".to_string(),
        username: "weakuser".to_string(),
        password: "123".to_string(),
    };

    let result = auth_service.register(weak_password_request).await;
    assert!(result.is_err(), "Registration with weak password should fail");

    // Test with common password
    let common_password_request = RegisterRequest {
        email: "common@workbench.com".to_string(),
        username: "commonuser".to_string(),
        password: "password123".to_string(), // Common password
    };

    let result = auth_service.register(common_password_request).await;
    assert!(result.is_err(), "Registration with common password should fail");
}

#[tokio::test]
async fn test_argon2_password_hashing() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let register_request = RegisterRequest {
        email: "argon@workbench.com".to_string(),
        username: "argonuser".to_string(),
        password: "ArgonTestPassword123!".to_string(),
    };

    // Register user
    let register_response = auth_service.register(register_request).await.unwrap();

    // Get user from database
    let user = auth_service
        .get_user_by_id(register_response.user.id)
        .await
        .unwrap()
        .unwrap();

    // Verify the password hash follows Argon2 format
    assert!(user.password_hash.starts_with("$argon2"), "Password should be hashed with Argon2");

    // Verify hash contains required Argon2 components
    let hash_parts: Vec<&str> = user.password_hash.split('$').collect();
    assert!(hash_parts.len() >= 4, "Argon2 hash should have multiple parts");
    assert!(hash_parts[1].contains("argon2"), "Hash should indicate Argon2 algorithm");
}

#[tokio::test]
async fn test_get_current_user_from_token() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    // Register and get token
    let register_request = RegisterRequest {
        email: "getuser@workbench.com".to_string(),
        username: "getusertest".to_string(),
        password: "GetUserPassword123!".to_string(),
    };

    let register_response = auth_service.register(register_request).await.unwrap();
    let token = register_response.access_token;

    // Test get_current_user
    let current_user_result = auth_service.get_current_user(&token).await;
    assert!(current_user_result.is_ok(), "Should get current user from valid token");

    let user = current_user_result.unwrap();
    assert_eq!(user.email, "getuser@workbench.com");
    assert_eq!(user.username, "getusertest");
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

#[tokio::test]
async fn test_multiple_registrations_unique_tokens() {
    let (auth_service, _db) = create_test_auth_service().await.unwrap();

    let mut access_tokens = Vec::new();
    let mut refresh_tokens = Vec::new();

    // Register multiple users
    for i in 1..=3 {
        let register_request = RegisterRequest {
            email: format!("user{}@workbench.com", i),
            username: format!("user{}", i),
            password: "UniquePassword123!".to_string(),
        };

        let response = auth_service.register(register_request).await.unwrap();
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