use crate::{database::Database, error::AppError, models::RefreshToken};
use anyhow::Result;
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RefreshTokenRepository {
    database: Database,
}

impl RefreshTokenRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    /// Create a new refresh token for a user
    pub async fn create_refresh_token(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<RefreshToken, AppError> {
        let expires_at = Utc::now() + Duration::days(7); // 7 days expiry
        let token_hash = Self::hash_token(token);

        let refresh_token = sqlx::query_as::<_, RefreshToken>(
            r#"
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            RETURNING id, user_id, token_hash, expires_at, created_at
            "#,
        )
        .bind(user_id)
        .bind(&token_hash)
        .bind(expires_at)
        .fetch_one(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to create refresh token: {}", e))
        })?;

        Ok(refresh_token)
    }

    /// Find a refresh token by its hash
    pub async fn find_by_token_hash(&self, token: &str) -> Result<Option<RefreshToken>, AppError> {
        let token_hash = Self::hash_token(token);

        let refresh_token = sqlx::query_as::<_, RefreshToken>(
            r#"
            SELECT id, user_id, token_hash, expires_at, created_at
            FROM refresh_tokens
            WHERE token_hash = $1 AND expires_at > NOW()
            "#,
        )
        .bind(&token_hash)
        .fetch_optional(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to find refresh token: {}", e))
        })?;

        Ok(refresh_token)
    }

    /// Invalidate a refresh token (delete it)
    pub async fn invalidate_token(&self, token: &str) -> Result<bool, AppError> {
        let token_hash = Self::hash_token(token);

        let rows_affected = sqlx::query(
            r#"
            DELETE FROM refresh_tokens
            WHERE token_hash = $1
            "#,
        )
        .bind(&token_hash)
        .execute(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to invalidate refresh token: {}", e))
        })?
        .rows_affected();

        Ok(rows_affected > 0)
    }

    /// Invalidate all refresh tokens for a user
    pub async fn invalidate_user_tokens(&self, user_id: Uuid) -> Result<u64, AppError> {
        let rows_affected = sqlx::query(
            r#"
            DELETE FROM refresh_tokens
            WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .execute(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to invalidate user tokens: {}", e))
        })?
        .rows_affected();

        Ok(rows_affected)
    }

    /// Clean up expired tokens (called periodically)
    pub async fn cleanup_expired_tokens(&self) -> Result<u64, AppError> {
        let rows_affected = sqlx::query(
            r#"
            DELETE FROM refresh_tokens
            WHERE expires_at < NOW()
            "#,
        )
        .execute(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to cleanup expired tokens: {}", e))
        })?
        .rows_affected();

        tracing::info!("Cleaned up {} expired refresh tokens", rows_affected);
        Ok(rows_affected)
    }

    /// Count active refresh tokens for a user
    pub async fn count_user_tokens(&self, user_id: Uuid) -> Result<i64, AppError> {
        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM refresh_tokens
            WHERE user_id = $1 AND expires_at > NOW()
            "#,
        )
        .bind(user_id)
        .fetch_one(&self.database.pool)
        .await
        .map_err(|e| {
            AppError::InternalServerError(format!("Failed to count user tokens: {}", e))
        })?;

        Ok(count)
    }

    /// Hash a token for secure storage
    pub fn hash_token(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Generate a cryptographically secure refresh token
    pub fn generate_refresh_token() -> String {
        use rand::distributions::Alphanumeric;
        use rand::{thread_rng, Rng};

        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(64) // 64 character token
            .map(char::from)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_token_consistency() {
        let token = "test_token_123";
        let hash1 = RefreshTokenRepository::hash_token(token);
        let hash2 = RefreshTokenRepository::hash_token(token);
        assert_eq!(hash1, hash2, "Token hashing should be deterministic");
    }

    #[test]
    fn test_hash_token_different_inputs() {
        let token1 = "token1";
        let token2 = "token2";
        let hash1 = RefreshTokenRepository::hash_token(token1);
        let hash2 = RefreshTokenRepository::hash_token(token2);
        assert_ne!(
            hash1, hash2,
            "Different tokens should produce different hashes"
        );
    }

    #[test]
    fn test_generate_refresh_token_length() {
        let token = RefreshTokenRepository::generate_refresh_token();
        assert_eq!(
            token.len(),
            64,
            "Generated token should be 64 characters long"
        );
    }

    #[test]
    fn test_generate_refresh_token_uniqueness() {
        let token1 = RefreshTokenRepository::generate_refresh_token();
        let token2 = RefreshTokenRepository::generate_refresh_token();
        assert_ne!(token1, token2, "Generated tokens should be unique");
    }

    #[test]
    fn test_generate_refresh_token_alphanumeric() {
        let token = RefreshTokenRepository::generate_refresh_token();
        assert!(
            token.chars().all(|c| c.is_ascii_alphanumeric()),
            "Token should only contain alphanumeric characters"
        );
    }
}
