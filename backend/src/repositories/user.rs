use crate::{
    database::Database,
    models::{CreateUserRequest, User},
    repositories::Repository,
};
use anyhow::Result;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct UserRepository {
    database: Database,
}

impl UserRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT id, email, username, password_hash, created_at, updated_at
            FROM users
            WHERE email = $1
            "#,
        )
        .bind(email)
        .fetch_optional(&self.database.pool)
        .await?;

        Ok(user)
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT id, email, username, password_hash, created_at, updated_at
            FROM users
            WHERE username = $1
            "#,
        )
        .bind(username)
        .fetch_optional(&self.database.pool)
        .await?;

        Ok(user)
    }

    pub async fn create_from_request(&self, request: CreateUserRequest) -> Result<User> {
        // Hash the password
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(request.password.as_bytes(), &salt)?
            .to_string();

        let id = Uuid::new_v4();

        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (id, email, username, password_hash)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, username, password_hash, failed_attempts, locked_until, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(&request.email)
        .bind(&request.username)
        .bind(&password_hash)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(user)
    }

    pub async fn verify_password(&self, user: &User, password: &str) -> Result<bool> {
        let parsed_hash = PasswordHash::new(&user.password_hash)?;
        let argon2 = Argon2::default();

        Ok(argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    pub async fn update_password(&self, user_id: Uuid, new_password: &str) -> Result<bool> {
        // Hash the new password
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(new_password.as_bytes(), &salt)?
            .to_string();

        let rows_affected = sqlx::query(
            r#"
            UPDATE users
            SET password_hash = $1, updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(&password_hash)
        .bind(user_id)
        .execute(&self.database.pool)
        .await?
        .rows_affected();

        Ok(rows_affected > 0)
    }

    pub async fn email_exists(&self, email: &str) -> Result<bool> {
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
            .bind(email)
            .fetch_one(&self.database.pool)
            .await?;

        Ok(count > 0)
    }

    pub async fn username_exists(&self, username: &str) -> Result<bool> {
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = $1")
            .bind(username)
            .fetch_one(&self.database.pool)
            .await?;

        Ok(count > 0)
    }

    /// Check if user account is currently locked (TODO: implement after database migration)
    pub async fn is_account_locked(&self, _user_id: Uuid) -> Result<bool> {
        // TODO: Implement after database migration adds lockout fields
        Ok(false)
    }

    /// Increment failed login attempts (TODO: implement after database migration)
    pub async fn record_failed_login(&self, _user_id: Uuid) -> Result<bool> {
        // TODO: Implement after database migration adds lockout fields
        Ok(true)
    }

    /// Reset failed login attempts (TODO: implement after database migration)
    pub async fn reset_failed_attempts(&self, _user_id: Uuid) -> Result<bool> {
        // TODO: Implement after database migration adds lockout fields
        Ok(true)
    }

    /// Admin function to unlock a specific user account (TODO: implement after database migration)
    pub async fn admin_unlock_account(&self, _user_id: Uuid, _admin_user_id: Uuid) -> Result<bool> {
        // TODO: Implement after database migration adds lockout fields
        Ok(false)
    }

    /// Get account lockout status (TODO: implement after database migration)
    pub async fn get_lockout_status(&self, _user_id: Uuid) -> Result<Option<(i32, Option<DateTime<Utc>>)>> {
        // TODO: Implement after database migration adds lockout fields
        Ok(None)
    }

    /// Unlock expired accounts (TODO: implement after database migration)
    pub async fn unlock_expired_accounts(&self) -> Result<i32> {
        // TODO: Implement after database migration adds lockout fields
        Ok(0)
    }
}

#[async_trait]
impl Repository<User, Uuid> for UserRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT id, email, username, password_hash, created_at, updated_at
            FROM users
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.database.pool)
        .await?;

        Ok(user)
    }

    async fn create(&self, user: User) -> Result<User> {
        let created = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (id, email, username, password_hash)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, username, password_hash, created_at, updated_at
            "#,
        )
        .bind(user.id)
        .bind(&user.email)
        .bind(&user.username)
        .bind(&user.password_hash)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(created)
    }

    async fn update(&self, user: User) -> Result<User> {
        let updated = sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET email = $2, username = $3, password_hash = $4, updated_at = NOW()
            WHERE id = $1
            RETURNING id, email, username, password_hash, created_at, updated_at
            "#,
        )
        .bind(user.id)
        .bind(&user.email)
        .bind(&user.username)
        .bind(&user.password_hash)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(updated)
    }

    async fn delete(&self, id: Uuid) -> Result<bool> {
        let rows_affected = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.database.pool)
            .await?
            .rows_affected();

        Ok(rows_affected > 0)
    }
}
