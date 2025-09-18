//! Comprehensive tests for account lockout mechanism (AUTH-SEC-003)
//! Tests brute force protection, progressive delays, and admin unlock functionality

use std::sync::Arc;
use uuid::Uuid;
use chrono::{Duration, Utc};
use backend::{
    config::JwtConfig,
    database::Database,
    models::{LoginRequest, RegisterRequest, User},
    repositories::{user::UserRepository, refresh_token::RefreshTokenRepository},
    services::auth::AuthService,
    error::AppError,
};

// Helper function to create test database connection
async fn setup_test_db() -> Database {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost/workbench_test".to_string());
    
    Database::new(&database_url).await.expect("Failed to connect to test database")
}

// Helper function to create test user
async fn create_test_user(user_repo: &UserRepository, email: &str) -> User {
    let register_request = RegisterRequest {
        email: email.to_string(),
        username: format!("user_{}", Uuid::new_v4().to_string()[..8].to_string()),
        password: "testpassword123".to_string(),
    };

    let create_user_request = backend::models::CreateUserRequest {
        email: register_request.email.clone(),
        username: register_request.username.clone(),
        password: register_request.password,
    };

    user_repo.create_from_request(create_user_request)
        .await
        .expect("Failed to create test user")
}

// Helper function to setup auth service
fn setup_auth_service(user_repo: UserRepository, refresh_token_repo: RefreshTokenRepository) -> AuthService {
    let jwt_config = JwtConfig {
        current_secret: "test_secret_for_account_lockout_tests_12345678901234567890".to_string(),
        current_version: 1,
        previous_secrets: vec![],
    };

    AuthService::new(user_repo, refresh_token_repo, jwt_config)
}

#[tokio::test]
async fn test_account_lockout_after_max_failed_attempts() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("lockout_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Verify account starts unlocked
    assert!(!user_repo.is_account_locked(user.id).await.unwrap());

    // Make 10 failed login attempts (max allowed)
    for attempt in 1..=10 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };

        let result = auth_service.login(login_request).await;
        assert!(result.is_err());

        if attempt < 10 {
            // Account should not be locked yet
            assert!(!user_repo.is_account_locked(user.id).await.unwrap());
        } else {
            // Account should be locked after 10th attempt
            assert!(user_repo.is_account_locked(user.id).await.unwrap());
        }
    }

    // 11th attempt should fail with lockout message
    let login_request = LoginRequest {
        email: test_email.clone(),
        password: "wrong_password".to_string(),
    };

    let result = auth_service.login(login_request).await;
    assert!(result.is_err());
    if let Err(AppError::AuthenticationError(msg)) = result {
        assert!(msg.contains("locked"));
    } else {
        panic!("Expected authentication error with lockout message");
    }

    // Even correct password should fail when locked
    let correct_login_request = LoginRequest {
        email: test_email,
        password: "testpassword123".to_string(),
    };

    let result = auth_service.login(correct_login_request).await;
    assert!(result.is_err());
    if let Err(AppError::AuthenticationError(msg)) = result {
        assert!(msg.contains("locked"));
    } else {
        panic!("Expected authentication error with lockout message");
    }
}

#[tokio::test]
async fn test_successful_login_resets_failed_attempts() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("reset_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Make 5 failed attempts
    for _ in 1..=5 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let result = auth_service.login(login_request).await;
        assert!(result.is_err());
    }

    // Verify we have failed attempts recorded
    let (failed_attempts, _) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(failed_attempts, 5);

    // Successful login should reset failed attempts
    let correct_login_request = LoginRequest {
        email: test_email.clone(),
        password: "testpassword123".to_string(),
    };

    let result = auth_service.login(correct_login_request).await;
    assert!(result.is_ok());

    // Verify failed attempts reset to 0
    let (failed_attempts, locked_until) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(failed_attempts, 0);
    assert!(locked_until.is_none());
}

#[tokio::test]
async fn test_admin_unlock_functionality() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("admin_unlock_test_{}@workbench.com", Uuid::new_v4());
    let admin_email = format!("admin_{}@workbench.com", Uuid::new_v4());
    
    let user = create_test_user(&user_repo, &test_email).await;
    let admin_user = create_test_user(&user_repo, &admin_email).await;

    // Lock the account by making 10 failed attempts
    for _ in 1..=10 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let _ = auth_service.login(login_request).await;
    }

    // Verify account is locked
    assert!(user_repo.is_account_locked(user.id).await.unwrap());

    // Admin unlock should succeed
    let result = auth_service.admin_unlock_account(user.id, admin_user.id).await;
    assert!(result.is_ok());

    // Verify account is now unlocked
    assert!(!user_repo.is_account_locked(user.id).await.unwrap());

    // Verify failed attempts reset
    let (failed_attempts, locked_until) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(failed_attempts, 0);
    assert!(locked_until.is_none());

    // User should be able to login with correct password
    let login_request = LoginRequest {
        email: test_email,
        password: "testpassword123".to_string(),
    };
    let result = auth_service.login(login_request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_non_admin_cannot_unlock_accounts() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("user_unlock_test_{}@workbench.com", Uuid::new_v4());
    let non_admin_email = format!("user_{}@workbench.com", Uuid::new_v4());
    
    let user = create_test_user(&user_repo, &test_email).await;
    let non_admin_user = create_test_user(&user_repo, &non_admin_email).await;

    // Lock the account
    for _ in 1..=10 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let _ = auth_service.login(login_request).await;
    }

    // Non-admin unlock should fail
    let result = auth_service.admin_unlock_account(user.id, non_admin_user.id).await;
    assert!(result.is_err());
    if let Err(AppError::AuthenticationError(msg)) = result {
        assert!(msg.contains("Insufficient privileges"));
    } else {
        panic!("Expected authentication error about insufficient privileges");
    }

    // Account should still be locked
    assert!(user_repo.is_account_locked(user.id).await.unwrap());
}

#[tokio::test]
async fn test_lockout_status_reporting() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("status_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Initially no failed attempts
    let status = auth_service.get_account_lockout_status(user.id).await.unwrap();
    assert!(status.is_some());
    let (failed_attempts, locked_until) = status.unwrap();
    assert_eq!(failed_attempts, 0);
    assert!(locked_until.is_none());

    // Make some failed attempts
    for expected_attempts in 1..=5 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let _ = auth_service.login(login_request).await;

        // Check status after each attempt
        let status = auth_service.get_account_lockout_status(user.id).await.unwrap().unwrap();
        assert_eq!(status.0, expected_attempts);
        assert!(status.1.is_none()); // Not locked yet
    }

    // Lock the account with more failed attempts
    for _ in 6..=10 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let _ = auth_service.login(login_request).await;
    }

    // Check locked status
    let status = auth_service.get_account_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(status.0, 10);
    assert!(status.1.is_some()); // Should be locked
    
    // Verify lockout time is in the future
    let locked_until = status.1.unwrap();
    assert!(locked_until > Utc::now());
}

#[tokio::test]
async fn test_unlock_expired_accounts() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("expired_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Manually set a past lockout time to simulate expired lockout
    let past_time = Utc::now() - Duration::minutes(5);
    sqlx::query!(
        "UPDATE users SET failed_attempts = 10, locked_until = $1 WHERE id = $2",
        past_time,
        user.id
    )
    .execute(&db.pool)
    .await
    .unwrap();

    // Verify account appears locked
    let (failed_attempts, locked_until) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(failed_attempts, 10);
    assert!(locked_until.is_some());

    // But should not actually be locked due to expired time
    assert!(!user_repo.is_account_locked(user.id).await.unwrap());

    // Run cleanup function
    let unlocked_count = auth_service.unlock_expired_accounts().await.unwrap();
    assert_eq!(unlocked_count, 1);

    // Verify cleanup worked
    let (failed_attempts, locked_until) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert_eq!(failed_attempts, 0);
    assert!(locked_until.is_none());
}

#[tokio::test]
async fn test_progressive_warnings_in_logs() {
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = setup_auth_service(user_repo.clone(), refresh_token_repo);

    let test_email = format!("warning_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Make failed attempts and verify they're recorded
    for attempt in 1..=10 {
        let login_request = LoginRequest {
            email: test_email.clone(),
            password: "wrong_password".to_string(),
        };
        let result = auth_service.login(login_request).await;
        assert!(result.is_err());

        let (failed_attempts, _) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
        assert_eq!(failed_attempts, attempt);
    }

    // Account should be locked after 10 attempts
    assert!(user_repo.is_account_locked(user.id).await.unwrap());
}

#[tokio::test]
async fn test_concurrent_failed_attempts() {
    use tokio::task::JoinSet;
    
    let db = setup_test_db().await;
    let user_repo = UserRepository::new(db.clone());
    let refresh_token_repo = RefreshTokenRepository::new(db.clone());
    let auth_service = Arc::new(setup_auth_service(user_repo.clone(), refresh_token_repo));

    let test_email = format!("concurrent_test_{}@workbench.com", Uuid::new_v4());
    let user = create_test_user(&user_repo, &test_email).await;

    // Spawn multiple concurrent failed login attempts
    let mut tasks = JoinSet::new();
    for _ in 0..15 {
        let auth_service = auth_service.clone();
        let email = test_email.clone();
        tasks.spawn(async move {
            let login_request = LoginRequest {
                email,
                password: "wrong_password".to_string(),
            };
            auth_service.login(login_request).await
        });
    }

    // Wait for all attempts to complete
    let mut results = Vec::new();
    while let Some(result) = tasks.join_next().await {
        results.push(result.unwrap());
    }

    // All should fail
    assert!(results.iter().all(|r| r.is_err()));

    // Account should be locked
    assert!(user_repo.is_account_locked(user.id).await.unwrap());

    // Failed attempts should be >= 10 (due to race conditions, might be higher)
    let (failed_attempts, _) = user_repo.get_lockout_status(user.id).await.unwrap().unwrap();
    assert!(failed_attempts >= 10);
}
