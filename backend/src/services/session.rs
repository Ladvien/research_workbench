use crate::error::AppError;
use chrono::{DateTime, Utc};
use redis::{AsyncCommands, Client as RedisClient};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub user_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionManager {
    redis_client: Option<RedisClient>,
    postgres_pool: Option<PgPool>,
    // Fallback in-memory store for when both Redis and Postgres are unavailable
    memory_store: Arc<RwLock<HashMap<String, SessionData>>>,
    max_sessions_per_user: usize,
    session_timeout_hours: u64,
}

impl SessionManager {
    pub fn new(
        redis_url: Option<String>,
        postgres_pool: Option<PgPool>,
        max_sessions_per_user: usize,
        session_timeout_hours: u64,
    ) -> Self {
        let redis_client = if let Some(url) = redis_url {
            match RedisClient::open(url) {
                Ok(client) => {
                    tracing::info!("Redis client initialized for session storage");
                    Some(client)
                }
                Err(e) => {
                    tracing::warn!("Failed to connect to Redis for sessions: {}", e);
                    None
                }
            }
        } else {
            None
        };

        Self {
            redis_client,
            postgres_pool,
            memory_store: Arc::new(RwLock::new(HashMap::new())),
            max_sessions_per_user,
            session_timeout_hours,
        }
    }

    /// Store session data
    pub async fn store_session(
        &self,
        session_id: &str,
        session_data: SessionData,
    ) -> Result<(), AppError> {
        // Try Redis first
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let serialized = serde_json::to_string(&session_data).map_err(|e| {
                    AppError::InternalServerError(format!("Serialization error: {}", e))
                })?;

                let ttl_seconds = self.session_timeout_hours * 3600;
                let result: Result<(), redis::RedisError> = conn
                    .set_ex(
                        format!("session:{}", session_id),
                        serialized,
                        ttl_seconds as u64,
                    )
                    .await;

                if result.is_ok() {
                    tracing::debug!("Session {} stored in Redis", session_id);
                    // Also enforce session limits per user
                    self.enforce_session_limits(&session_data.user_id).await?;
                    return Ok(());
                } else {
                    tracing::warn!("Failed to store session in Redis: {:?}", result);
                }
            }
        }

        // Fallback to PostgreSQL
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!(
                r#"
                INSERT INTO user_sessions (session_id, user_id, data, expires_at)
                VALUES ($1, $2, $3, NOW() + $4 * INTERVAL '1 hour')
                ON CONFLICT (session_id) 
                DO UPDATE SET 
                    data = EXCLUDED.data,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW()
                "#,
                session_id,
                session_data.user_id,
                serde_json::to_value(&session_data).map_err(|e| AppError::InternalServerError(
                    format!("Serialization error: {}", e)
                ))?,
                self.session_timeout_hours as i64
            )
            .execute(pool)
            .await;

            if result.is_ok() {
                tracing::debug!("Session {} stored in PostgreSQL", session_id);
                self.enforce_session_limits_pg(&session_data.user_id)
                    .await?;
                return Ok(());
            } else {
                tracing::warn!("Failed to store session in PostgreSQL: {:?}", result);
            }
        }

        // Final fallback to memory store
        tracing::warn!(
            "Using memory store for session {} (not persistent!)",
            session_id
        );
        let mut store = self.memory_store.write().await;
        store.insert(session_id.to_string(), session_data);
        Ok(())
    }

    /// Retrieve session data
    pub async fn get_session(&self, session_id: &str) -> Result<Option<SessionData>, AppError> {
        // Try Redis first
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let result: Result<Option<String>, redis::RedisError> =
                    conn.get(format!("session:{}", session_id)).await;

                match result {
                    Ok(Some(data)) => match serde_json::from_str::<SessionData>(&data) {
                        Ok(session_data) => {
                            tracing::debug!("Session {} retrieved from Redis", session_id);
                            return Ok(Some(session_data));
                        }
                        Err(e) => {
                            tracing::warn!("Failed to deserialize session from Redis: {}", e);
                        }
                    },
                    Ok(None) => {
                        tracing::debug!("Session {} not found in Redis", session_id);
                    }
                    Err(e) => {
                        tracing::warn!("Redis error retrieving session: {}", e);
                    }
                }
            }
        }

        // Fallback to PostgreSQL
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!(
                "SELECT data FROM user_sessions WHERE session_id = $1 AND expires_at > NOW()",
                session_id
            )
            .fetch_optional(pool)
            .await;

            match result {
                Ok(Some(row)) => match serde_json::from_value::<SessionData>(row.data) {
                    Ok(session_data) => {
                        tracing::debug!("Session {} retrieved from PostgreSQL", session_id);
                        return Ok(Some(session_data));
                    }
                    Err(e) => {
                        tracing::warn!("Failed to deserialize session from PostgreSQL: {}", e);
                    }
                },
                Ok(None) => {
                    tracing::debug!("Session {} not found in PostgreSQL", session_id);
                }
                Err(e) => {
                    tracing::warn!("PostgreSQL error retrieving session: {}", e);
                }
            }
        }

        // Check memory store as last resort
        let store = self.memory_store.read().await;
        Ok(store.get(session_id).cloned())
    }

    /// Delete a specific session
    pub async fn delete_session(&self, session_id: &str) -> Result<(), AppError> {
        let mut any_success = false;

        // Delete from Redis
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let result: Result<u64, redis::RedisError> =
                    conn.del(format!("session:{}", session_id)).await;

                if result.is_ok() {
                    any_success = true;
                    tracing::debug!("Session {} deleted from Redis", session_id);
                }
            }
        }

        // Delete from PostgreSQL
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!(
                "DELETE FROM user_sessions WHERE session_id = $1",
                session_id
            )
            .execute(pool)
            .await;

            if result.is_ok() {
                any_success = true;
                tracing::debug!("Session {} deleted from PostgreSQL", session_id);
            }
        }

        // Delete from memory store
        let mut store = self.memory_store.write().await;
        if store.remove(session_id).is_some() {
            any_success = true;
            tracing::debug!("Session {} deleted from memory store", session_id);
        }

        if any_success {
            Ok(())
        } else {
            Err(AppError::NotFound("Session not found".to_string()))
        }
    }

    /// Delete all sessions for a specific user (used on password change)
    pub async fn invalidate_user_sessions(&self, user_id: Uuid) -> Result<(), AppError> {
        let mut deleted_count = 0;

        // Delete from Redis using pattern scan
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                // Get all session keys and check which belong to this user
                let keys: Result<Vec<String>, redis::RedisError> = conn.keys("session:*").await;

                if let Ok(session_keys) = keys {
                    for key in session_keys {
                        if let Ok(Some(data_str)) = conn.get::<_, Option<String>>(&key).await {
                            if let Ok(session_data) = serde_json::from_str::<SessionData>(&data_str)
                            {
                                if session_data.user_id == user_id {
                                    let _: Result<u64, redis::RedisError> = conn.del(&key).await;
                                    deleted_count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Delete from PostgreSQL
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!("DELETE FROM user_sessions WHERE user_id = $1", user_id)
                .execute(pool)
                .await;

            if let Ok(result) = result {
                deleted_count += result.rows_affected();
            }
        }

        // Delete from memory store
        let mut store = self.memory_store.write().await;
        let to_remove: Vec<String> = store
            .iter()
            .filter_map(|(key, data)| {
                if data.user_id == user_id {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        for key in to_remove {
            store.remove(&key);
            deleted_count += 1;
        }

        tracing::info!(
            "Invalidated {} sessions for user {}",
            deleted_count,
            user_id
        );
        Ok(())
    }

    /// Clean up expired sessions
    pub async fn cleanup_expired_sessions(&self) -> Result<u64, AppError> {
        let mut total_cleaned = 0;

        // Clean up PostgreSQL expired sessions
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!("DELETE FROM user_sessions WHERE expires_at <= NOW()")
                .execute(pool)
                .await;

            if let Ok(result) = result {
                total_cleaned += result.rows_affected();
                tracing::debug!(
                    "Cleaned {} expired sessions from PostgreSQL",
                    result.rows_affected()
                );
            }
        }

        // Redis handles TTL automatically, but we can clean memory store
        let now = Utc::now();
        let timeout_duration = chrono::Duration::hours(self.session_timeout_hours as i64);

        let mut store = self.memory_store.write().await;
        let to_remove: Vec<String> = store
            .iter()
            .filter_map(|(key, data)| {
                if now.signed_duration_since(data.last_accessed) > timeout_duration {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        for key in to_remove {
            store.remove(&key);
            total_cleaned += 1;
        }

        if total_cleaned > 0 {
            tracing::info!("Cleaned up {} expired sessions", total_cleaned);
        }

        Ok(total_cleaned)
    }

    /// Enforce session limits per user
    async fn enforce_session_limits(&self, user_id: &Uuid) -> Result<(), AppError> {
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                // Get all session keys and find sessions for this user
                let keys: Result<Vec<String>, redis::RedisError> = conn.keys("session:*").await;

                if let Ok(session_keys) = keys {
                    let mut user_sessions = Vec::new();

                    for key in session_keys {
                        if let Ok(Some(data_str)) = conn.get::<_, Option<String>>(&key).await {
                            if let Ok(session_data) = serde_json::from_str::<SessionData>(&data_str)
                            {
                                if session_data.user_id == *user_id {
                                    user_sessions.push((key.clone(), session_data.last_accessed));
                                }
                            }
                        }
                    }

                    // If user has too many sessions, remove the oldest ones
                    if user_sessions.len() > self.max_sessions_per_user {
                        user_sessions.sort_by(|a, b| a.1.cmp(&b.1)); // Sort by last_accessed
                        let sessions_to_remove = user_sessions.len() - self.max_sessions_per_user;

                        for (key, _) in user_sessions.iter().take(sessions_to_remove) {
                            let _: Result<u64, redis::RedisError> = conn.del(key).await;
                            tracing::debug!("Removed old session {} due to limit", key);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Enforce session limits in PostgreSQL
    async fn enforce_session_limits_pg(&self, user_id: &Uuid) -> Result<(), AppError> {
        if let Some(pool) = &self.postgres_pool {
            // Delete oldest sessions beyond the limit
            let result = sqlx::query!(
                r#"
                DELETE FROM user_sessions 
                WHERE session_id IN (
                    SELECT session_id FROM user_sessions 
                    WHERE user_id = $1 
                    ORDER BY updated_at ASC 
                    OFFSET $2
                )
                "#,
                user_id,
                self.max_sessions_per_user as i64
            )
            .execute(pool)
            .await;

            if let Ok(result) = result {
                if result.rows_affected() > 0 {
                    tracing::debug!(
                        "Removed {} old sessions for user {} due to limit",
                        result.rows_affected(),
                        user_id
                    );
                }
            }
        }
        Ok(())
    }

    /// Get session count for a user (for monitoring)
    pub async fn get_user_session_count(&self, user_id: Uuid) -> Result<usize, AppError> {
        // Try Redis first
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let keys: Result<Vec<String>, redis::RedisError> = conn.keys("session:*").await;

                if let Ok(session_keys) = keys {
                    let mut count = 0;
                    for key in session_keys {
                        if let Ok(Some(data_str)) = conn.get::<_, Option<String>>(&key).await {
                            if let Ok(session_data) = serde_json::from_str::<SessionData>(&data_str)
                            {
                                if session_data.user_id == user_id {
                                    count += 1;
                                }
                            }
                        }
                    }
                    return Ok(count);
                }
            }
        }

        // Fallback to PostgreSQL
        if let Some(pool) = &self.postgres_pool {
            let result = sqlx::query!(
                "SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()",
                user_id
            )
            .fetch_one(pool)
            .await;

            if let Ok(row) = result {
                return Ok(row.count.unwrap_or(0) as usize);
            }
        }

        // Memory store fallback
        let store = self.memory_store.read().await;
        let count = store
            .values()
            .filter(|data| data.user_id == user_id)
            .count();
        Ok(count)
    }
}

// Create the sessions table if using PostgreSQL fallback
// Sessions table is created via migration 20250916000000_add_user_sessions.sql
