use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use rand::rngs::OsRng;

pub struct TestUser {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub password: String,
}

impl TestUser {
    pub fn new(id: &str, email: &str, username: &str, password: &str) -> Self {
        Self {
            id: Uuid::parse_str(id).expect("Invalid UUID"),
            email: email.to_string(),
            username: username.to_string(),
            password: password.to_string(),
        }
    }
}

pub async fn seed_test_users(pool: &PgPool) -> Result<()> {
    // Get test user credentials from environment
    let test_user_email = std::env::var("TEST_USER_EMAIL")
        .unwrap_or_else(|_| "test@workbench.com".to_string());
    let test_user_password = std::env::var("TEST_USER_PASSWORD")
        .unwrap_or_else(|_| "testpassword123".to_string());

    // Get admin user credentials from environment
    let admin_email = std::env::var("ADMIN_EMAIL")
        .unwrap_or_else(|_| "admin@workbench.com".to_string());
    let admin_password = std::env::var("ADMIN_PASSWORD")
        .unwrap_or_else(|_| "adminpassword123".to_string());

    let test_users = vec![
        TestUser::new(
            "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            &test_user_email,
            "testuser",
            &test_user_password,
        ),
        TestUser::new(
            "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
            &admin_email,
            "adminuser",
            &admin_password,
        ),
    ];

    let argon2 = Argon2::default();

    for user in test_users {
        // Check if user already exists
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)"
        )
        .bind(&user.email)
        .fetch_one(pool)
        .await?;

        if !exists {
            // Hash the password
            let salt = SaltString::generate(&mut OsRng);
            let password_hash = argon2
                .hash_password(user.password.as_bytes(), &salt)
                .map_err(|e| anyhow::anyhow!("Failed to hash password: {}", e))?
                .to_string();

            // Insert the user
            sqlx::query(
                "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)"
            )
            .bind(user.id)
            .bind(&user.email)
            .bind(&user.username)
            .bind(&password_hash)
            .execute(pool)
            .await?;

            tracing::info!("Created test user: {}", user.email);
        } else {
            tracing::debug!("Test user already exists: {}", user.email);
        }
    }

    // Create sample conversations for the main test user
    let test_user_id = Uuid::parse_str("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")?;

    let conv_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE user_id = $1)"
    )
    .bind(test_user_id)
    .fetch_one(pool)
    .await?;

    if !conv_exists {
        let conv_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO conversations (id, user_id, title, model) VALUES ($1, $2, $3, $4)"
        )
        .bind(conv_id)
        .bind(test_user_id)
        .bind("Sample Conversation")
        .bind("gpt-4")
        .execute(pool)
        .await?;

        // Add sample messages
        let msg1_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)"
        )
        .bind(msg1_id)
        .bind(conv_id)
        .bind("user")
        .bind("Hello, this is a test message")
        .execute(pool)
        .await?;

        let msg2_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO messages (id, conversation_id, role, content, parent_id) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(msg2_id)
        .bind(conv_id)
        .bind("assistant")
        .bind("Hello! This is a test response")
        .bind(msg1_id)
        .execute(pool)
        .await?;

        tracing::info!("Created sample conversation and messages for test user");
    }

    Ok(())
}

pub async fn init_database_schema(pool: &PgPool) -> Result<()> {
    // Enable extensions
    sqlx::query("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
        .execute(pool)
        .await?;

    sqlx::query("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"")
        .execute(pool)
        .await?;

    // Try to enable vector extension (may not be available in all environments)
    let _ = sqlx::query("CREATE EXTENSION IF NOT EXISTS \"vector\"")
        .execute(pool)
        .await;

    // Create tables
    sqlx::query(include_str!("../db/schema.sql"))
        .execute(pool)
        .await?;

    tracing::info!("Database schema initialized");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_user_credentials_from_environment() {
        // Test that environment variables are properly read

        // Set test environment variables
        env::set_var("TEST_USER_EMAIL", "test-env@workbench.com");
        env::set_var("TEST_USER_PASSWORD", "test-env-password");
        env::set_var("ADMIN_EMAIL", "admin-env@workbench.com");
        env::set_var("ADMIN_PASSWORD", "admin-env-password");

        // Test user credentials
        let test_user_email = env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "test@workbench.com".to_string());
        let test_user_password = env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "testpassword123".to_string());

        assert_eq!(test_user_email, "test-env@workbench.com");
        assert_eq!(test_user_password, "test-env-password");

        // Admin credentials
        let admin_email = env::var("ADMIN_EMAIL")
            .unwrap_or_else(|_| "admin@workbench.com".to_string());
        let admin_password = env::var("ADMIN_PASSWORD")
            .unwrap_or_else(|_| "adminpassword123".to_string());

        assert_eq!(admin_email, "admin-env@workbench.com");
        assert_eq!(admin_password, "admin-env-password");

        // Clean up environment variables
        env::remove_var("TEST_USER_EMAIL");
        env::remove_var("TEST_USER_PASSWORD");
        env::remove_var("ADMIN_EMAIL");
        env::remove_var("ADMIN_PASSWORD");
    }

    #[test]
    fn test_user_credentials_defaults() {
        // Test that defaults are used when environment variables are not set

        // Ensure environment variables are not set
        env::remove_var("TEST_USER_EMAIL");
        env::remove_var("TEST_USER_PASSWORD");
        env::remove_var("ADMIN_EMAIL");
        env::remove_var("ADMIN_PASSWORD");

        // Test user credentials
        let test_user_email = env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "test@workbench.com".to_string());
        let test_user_password = env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "testpassword123".to_string());

        assert_eq!(test_user_email, "test@workbench.com");
        assert_eq!(test_user_password, "testpassword123");

        // Admin credentials
        let admin_email = env::var("ADMIN_EMAIL")
            .unwrap_or_else(|_| "admin@workbench.com".to_string());
        let admin_password = env::var("ADMIN_PASSWORD")
            .unwrap_or_else(|_| "adminpassword123".to_string());

        assert_eq!(admin_email, "admin@workbench.com");
        assert_eq!(admin_password, "adminpassword123");
    }

    #[test]
    fn test_user_creation_consistency() {
        // Test that TestUser creation works correctly
        let test_user = TestUser::new(
            "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            "test@workbench.com",
            "testuser",
            "testpassword123",
        );

        assert_eq!(test_user.email, "test@workbench.com");
        assert_eq!(test_user.username, "testuser");
        assert_eq!(test_user.password, "testpassword123");
        assert_eq!(test_user.id.to_string(), "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");

        let admin_user = TestUser::new(
            "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
            "admin@workbench.com",
            "adminuser",
            "adminpassword123",
        );

        assert_eq!(admin_user.email, "admin@workbench.com");
        assert_eq!(admin_user.username, "adminuser");
        assert_eq!(admin_user.password, "adminpassword123");
        assert_eq!(admin_user.id.to_string(), "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12");
    }

    #[test]
    fn test_no_hardcoded_old_credentials() {
        // Ensure old inconsistent credentials are not used anywhere
        let test_user_email = env::var("TEST_USER_EMAIL")
            .unwrap_or_else(|_| "test@workbench.com".to_string());
        let test_user_password = env::var("TEST_USER_PASSWORD")
            .unwrap_or_else(|_| "testpassword123".to_string());

        // Verify we're not using old credentials
        assert_ne!(test_user_email, "cthomasbrittain@yahoo.com");
        assert_ne!(test_user_password, "IVMPEscH33EhfnlPZcAwpkfR");

        // Verify we're using standardized credentials
        assert!(test_user_email.contains("@workbench.com") || test_user_email.contains("@test"));
        assert!(test_user_password.len() >= 8); // Minimum password length
    }
}