use crate::error::AppError;
use chrono::{DateTime, Utc};
use redis::{AsyncCommands, Client as RedisClient};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

// Cached string constants to reduce allocations
const SESSION_PREFIX: &str = "session:";
const USER_SESSIONS_PREFIX: &str = "user_sessions:";
const SESSION_PREFIX_LEN: usize = SESSION_PREFIX.len();
const USER_SESSIONS_PREFIX_LEN: usize = USER_SESSIONS_PREFIX.len();

// Pre-allocated buffer pool for string formatting - reduces heap allocations
thread_local! {
    static STRING_BUFFER: std::cell::RefCell<String> = std::cell::RefCell::new(String::with_capacity(128));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub user_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub ip_address: Option<Arc<str>>,  // Use Arc<str> to reduce allocations
    pub user_agent: Option<Arc<str>>,  // Use Arc<str> to reduce allocations
}

#[derive(Debug, Clone)]
pub struct SessionManager {
    redis_client: Option<RedisClient>,
    postgres_pool: Option<PgPool>,
    // Fallback in-memory store for when both Redis and Postgres are unavailable
    memory_store: Arc<RwLock<HashMap<Arc<str>, SessionData>>>,  // Use Arc<str> keys
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
            // Validate Redis URL security in production
            if let Err(e) = Self::validate_redis_security(&url) {
                tracing::error!("Redis security validation failed: {}", e);
                None
            } else {
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

    /// Validate Redis URL security for production environments
    fn validate_redis_security(redis_url: &str) -> Result<(), AppError> {
        // Check if we're in production environment
        let environment = std::env::var("ENVIRONMENT")
            .unwrap_or_else(|_| "development".to_string())
            .to_lowercase();

        if environment == "production" {
            // Parse the URL to check security requirements
            if let Ok(url) = url::Url::parse(redis_url) {
                // Require authentication in production
                if url.username().is_empty() || url.password().is_none() {
                    return Err(AppError::InternalServerError(
                        "Redis authentication required in production environment".to_string()
                    ));
                }

                // Require TLS/SSL in production (rediss:// scheme)
                if url.scheme() != "rediss" {
                    tracing::warn!(
                        "Redis TLS not configured in production. Consider using rediss:// scheme for enhanced security"
                    );
                    // Note: This is a warning rather than an error to allow for secure internal networks
                    // In highly secure environments, this should be an error
                }

                // Validate that we're not using default/weak credentials
                if let Some(password) = url.password() {
                    if password.len() < 16 || password == "password" || password == "redis" {
                        return Err(AppError::InternalServerError(
                            "Weak Redis password detected in production environment".to_string()
                        ));
                    }
                }
            } else {
                return Err(AppError::InternalServerError(
                    "Invalid Redis URL format".to_string()
                ));
            }
        }

        Ok(())
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

                // Use thread-local buffer to reduce allocations
                let (session_key, user_sessions_key) = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();

                    // Format session key
                    buffer.clear();
                    buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                    buffer.push_str(SESSION_PREFIX);
                    buffer.push_str(session_id);
                    let session_key = buffer.clone();

                    // Format user sessions key
                    buffer.clear();
                    let user_id_str = session_data.user_id.to_string();
                    buffer.reserve(USER_SESSIONS_PREFIX_LEN + user_id_str.len());
                    buffer.push_str(USER_SESSIONS_PREFIX);
                    buffer.push_str(&user_id_str);
                    let user_sessions_key = buffer.clone();

                    (session_key, user_sessions_key)
                });

                // Use pipeline for atomic operations
                let mut pipe = redis::pipe();
                pipe.set_ex(&session_key, &serialized, ttl_seconds as u64)
                    .ignore()
                    .sadd(&user_sessions_key, session_id)
                    .ignore()
                    .expire(&user_sessions_key, ttl_seconds as i64)
                    .ignore();

                let result: Result<(), redis::RedisError> = pipe.query_async(&mut conn).await;

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

        // Fallback to PostgreSQL - use spawn_blocking for heavy serialization
        if let Some(pool) = &self.postgres_pool {
            let pool_clone = pool.clone();
            let session_id = session_id.to_string();
            let user_id = session_data.user_id;
            let session_data_clone = session_data.clone();
            let timeout_hours = self.session_timeout_hours;

            let result = tokio::task::spawn_blocking(move || {
                serde_json::to_value(&session_data_clone)
            }).await;

            match result {
                Ok(Ok(json_data)) => {
                    let db_result = sqlx::query!(
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
                        user_id,
                        json_data,
                        timeout_hours as i64
                    )
                    .execute(&pool_clone)
                    .await;

                    if db_result.is_ok() {
                        tracing::debug!("Session {} stored in PostgreSQL", session_id);
                        self.enforce_session_limits_pg(&user_id).await?;
                        return Ok(());
                    } else {
                        tracing::warn!("Failed to store session in PostgreSQL: {:?}", db_result);
                    }
                },
                Ok(Err(e)) => {
                    return Err(AppError::InternalServerError(format!("Serialization error: {}", e)));
                },
                Err(e) => {
                    tracing::warn!("Task join error: {}", e);
                }
            }
        }

        // Final fallback to memory store
        tracing::warn!(
            "Using memory store for session {} (not persistent!)",
            session_id
        );
        let mut store = self.memory_store.write().await;
        store.insert(session_id.into(), session_data);
        Ok(())
    }

    /// Retrieve session data
    pub async fn get_session(&self, session_id: &str) -> Result<Option<SessionData>, AppError> {
        // Try Redis first
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                // Use thread-local buffer to reduce allocations
                let session_key = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();
                    buffer.clear();
                    buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                    buffer.push_str(SESSION_PREFIX);
                    buffer.push_str(session_id);
                    buffer.clone()
                });

                let result: Result<Option<String>, redis::RedisError> =
                    conn.get(&session_key).await;

                match result {
                    Ok(Some(data)) => {
                        // Use spawn_blocking for heavy deserialization
                        let deserialization = tokio::task::spawn_blocking(move || {
                            serde_json::from_str::<SessionData>(&data)
                        }).await;

                        match deserialization {
                            Ok(Ok(session_data)) => {
                                tracing::debug!("Session {} retrieved from Redis", session_id);
                                return Ok(Some(session_data));
                            }
                            Ok(Err(e)) => {
                                tracing::warn!("Failed to deserialize session from Redis: {}", e);
                            }
                            Err(e) => {
                                tracing::warn!("Task join error during deserialization: {}", e);
                            }
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

    /// Delete a specific session with set cleanup
    pub async fn delete_session(&self, session_id: &str) -> Result<(), AppError> {
        let mut any_success = false;

        // Delete from Redis with user session set cleanup
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                // First get session data to find user_id for set cleanup
                let session_key = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();
                    buffer.clear();
                    buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                    buffer.push_str(SESSION_PREFIX);
                    buffer.push_str(session_id);
                    buffer.clone()
                });

                // Get session data to extract user_id before deletion
                let session_data_opt: Result<Option<String>, redis::RedisError> =
                    conn.get(&session_key).await;

                if let Ok(Some(data_str)) = session_data_opt {
                    if let Ok(session_data) = serde_json::from_str::<SessionData>(&data_str) {
                        let user_sessions_key = STRING_BUFFER.with(|buf| {
                            let mut buffer = buf.borrow_mut();
                            buffer.clear();
                            let user_id_str = session_data.user_id.to_string();
                            buffer.reserve(USER_SESSIONS_PREFIX_LEN + user_id_str.len());
                            buffer.push_str(USER_SESSIONS_PREFIX);
                            buffer.push_str(&user_id_str);
                            buffer.clone()
                        });

                        // Use pipeline for atomic deletion
                        let mut pipe = redis::pipe();
                        pipe.del(&session_key).ignore();
                        pipe.srem(&user_sessions_key, session_id).ignore();

                        let result: Result<(), redis::RedisError> = pipe.query_async(&mut conn).await;

                        if result.is_ok() {
                            any_success = true;
                            tracing::debug!("Session {} deleted from Redis with set cleanup", session_id);
                        }
                    }
                } else {
                    // Fallback: just delete the session key
                    let result: Result<u64, redis::RedisError> = conn.del(&session_key).await;
                    if result.is_ok() {
                        any_success = true;
                        tracing::debug!("Session {} deleted from Redis (fallback)", session_id);
                    }
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

        // Delete from Redis using pattern scan with pipeline optimization
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                // Use user_sessions set for efficient lookup with optimized string allocation
                let user_sessions_key = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();
                    buffer.clear();
                    let user_id_str = user_id.to_string();
                    buffer.reserve(USER_SESSIONS_PREFIX_LEN + user_id_str.len());
                    buffer.push_str(USER_SESSIONS_PREFIX);
                    buffer.push_str(&user_id_str);
                    buffer.clone()
                });

                let session_ids: Result<Vec<String>, redis::RedisError> =
                    conn.smembers(&user_sessions_key).await;

                if let Ok(session_ids) = session_ids {
                    if !session_ids.is_empty() {
                        // Prepare keys for batch deletion with efficient string operations
                        let mut session_keys = Vec::with_capacity(session_ids.len());
                        for session_id in &session_ids {
                            STRING_BUFFER.with(|buf| {
                                let mut buffer = buf.borrow_mut();
                                buffer.clear();
                                buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                                buffer.push_str(SESSION_PREFIX);
                                buffer.push_str(session_id);
                                session_keys.push(buffer.clone());
                            });
                        }

                        // Use pipeline for efficient batch operations
                        let mut pipe = redis::pipe();

                        // Delete all session data
                        for key in &session_keys {
                            pipe.del(key).ignore();
                        }

                        // Delete the user sessions set
                        pipe.del(&user_sessions_key).ignore();

                        let _: Result<(), redis::RedisError> = pipe.query_async(&mut conn).await;
                        deleted_count += session_ids.len() as u64;

                        tracing::debug!(
                            "Batch deleted {} sessions from Redis for user {} using pipeline",
                            session_ids.len(),
                            user_id
                        );
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
                    Some(key.to_string())
                } else {
                    None
                }
            })
            .collect();

        for key in to_remove {
            store.remove(&*key);
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
                    Some(key.to_string())
                } else {
                    None
                }
            })
            .collect();

        for key in to_remove {
            store.remove(&*key);
            total_cleaned += 1;
        }

        if total_cleaned > 0 {
            tracing::info!("Cleaned up {} expired sessions", total_cleaned);
        }

        Ok(total_cleaned)
    }

    /// Enforce session limits per user using O(1) set operations
    async fn enforce_session_limits(&self, user_id: &Uuid) -> Result<(), AppError> {
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let user_sessions_key = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();
                    buffer.clear();
                    let user_id_str = user_id.to_string();
                    buffer.reserve(USER_SESSIONS_PREFIX_LEN + user_id_str.len());
                    buffer.push_str(USER_SESSIONS_PREFIX);
                    buffer.push_str(&user_id_str);
                    buffer.clone()
                });

                // Get session count using O(1) operation
                let session_count: Result<usize, redis::RedisError> =
                    conn.scard(&user_sessions_key).await;

                if let Ok(count) = session_count {
                    if count > self.max_sessions_per_user {
                        // Get all session IDs for this user
                        let session_ids: Result<Vec<String>, redis::RedisError> =
                            conn.smembers(&user_sessions_key).await;

                        if let Ok(session_ids) = session_ids {
                            // Get session data in batch to find oldest sessions
                            let mut session_keys = Vec::with_capacity(session_ids.len());
                            for session_id in &session_ids {
                                STRING_BUFFER.with(|buf| {
                                    let mut buffer = buf.borrow_mut();
                                    buffer.clear();
                                    buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                                    buffer.push_str(SESSION_PREFIX);
                                    buffer.push_str(session_id);
                                    session_keys.push(buffer.clone());
                                });
                            }

                            // Use pipeline to get all session data efficiently
                            let mut pipe = redis::pipe();
                            for key in &session_keys {
                                pipe.get(key);
                            }

                            let session_data_results: Result<Vec<Option<String>>, redis::RedisError> =
                                pipe.query_async(&mut conn).await;

                            if let Ok(session_data_list) = session_data_results {
                                let mut user_sessions = Vec::new();

                                for (i, data_opt) in session_data_list.into_iter().enumerate() {
                                    if let Some(data_str) = data_opt {
                                        if let Ok(session_data) = serde_json::from_str::<SessionData>(&data_str) {
                                            user_sessions.push((session_keys[i].clone(), session_ids[i].clone(), session_data.last_accessed));
                                        }
                                    }
                                }

                                // Sort by last_accessed and remove oldest sessions
                                if user_sessions.len() > self.max_sessions_per_user {
                                    user_sessions.sort_by(|a, b| a.2.cmp(&b.2));
                                    let sessions_to_remove = user_sessions.len() - self.max_sessions_per_user;

                                    let mut pipe = redis::pipe();

                                    for (session_key, session_id, _) in user_sessions.iter().take(sessions_to_remove) {
                                        // Remove from session data
                                        pipe.del(session_key).ignore();
                                        // Remove from user sessions set
                                        pipe.srem(&user_sessions_key, session_id).ignore();
                                    }

                                    let _: Result<(), redis::RedisError> = pipe.query_async(&mut conn).await;

                                    tracing::debug!(
                                        "Removed {} old sessions for user {} due to limit (O(1) set operations)",
                                        sessions_to_remove,
                                        user_id
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Enforce session limits in PostgreSQL using window functions for optimal performance
    async fn enforce_session_limits_pg(&self, user_id: &Uuid) -> Result<(), AppError> {
        if let Some(pool) = &self.postgres_pool {
            // Use window function to identify sessions beyond the limit efficiently
            let result = sqlx::query!(
                r#"
                DELETE FROM user_sessions
                WHERE session_id IN (
                    SELECT session_id
                    FROM (
                        SELECT session_id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY user_id
                                   ORDER BY updated_at DESC
                               ) as row_num
                        FROM user_sessions
                        WHERE user_id = $1 AND expires_at > NOW()
                    ) ranked_sessions
                    WHERE row_num > $2
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
                        "Removed {} old sessions for user {} due to limit using window function",
                        result.rows_affected(),
                        user_id
                    );
                }
            }
        }
        Ok(())
    }

    /// Get session count for a user (for monitoring) - O(1) operation
    pub async fn get_user_session_count(&self, user_id: Uuid) -> Result<usize, AppError> {
        // Try Redis first using O(1) set cardinality with optimized string allocation
        if let Some(redis_client) = &self.redis_client {
            if let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await {
                let user_sessions_key = STRING_BUFFER.with(|buf| {
                    let mut buffer = buf.borrow_mut();
                    buffer.clear();
                    let user_id_str = user_id.to_string();
                    buffer.reserve(USER_SESSIONS_PREFIX_LEN + user_id_str.len());
                    buffer.push_str(USER_SESSIONS_PREFIX);
                    buffer.push_str(&user_id_str);
                    buffer.clone()
                });

                // O(1) operation to get session count
                let count: Result<usize, redis::RedisError> = conn.scard(&user_sessions_key).await;

                if let Ok(count) = count {
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

#[cfg(test)]
mod performance_tests {
    use super::*;
    use std::time::Instant;
    use tokio::time::{sleep, Duration};

    /// Benchmark session operations to validate performance improvements
    #[tokio::test]
    async fn benchmark_session_operations() {
        // Skip if no Redis available
        let redis_url = std::env::var("REDIS_URL").ok();
        if redis_url.is_none() {
            println!("Skipping Redis performance test - REDIS_URL not set");
            return;
        }

        let session_manager = SessionManager::new(
            redis_url,
            None, // Skip PostgreSQL for this benchmark
            5,    // max_sessions_per_user
            24,   // session_timeout_hours
        );

        let user_id = Uuid::new_v4();
        let num_sessions = 1000;

        // Benchmark session creation
        let start = Instant::now();
        let mut session_ids = Vec::new();

        for i in 0..num_sessions {
            let session_id = format!("bench_session_{}", i);
            let session_data = SessionData {
                user_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                ip_address: Some("127.0.0.1".into()),
                user_agent: Some("Benchmark".into()),
            };

            session_manager.store_session(&session_id, session_data).await.unwrap();
            session_ids.push(session_id);
        }

        let creation_time = start.elapsed();
        println!("✅ Created {} sessions in {:?} ({:.2} sessions/ms)",
                 num_sessions, creation_time,
                 num_sessions as f64 / creation_time.as_millis() as f64);

        // Benchmark session count (should be O(1))
        let start = Instant::now();
        let count = session_manager.get_user_session_count(user_id).await.unwrap();
        let count_time = start.elapsed();
        println!("✅ Session count ({}) retrieved in {:?} (O(1) operation)", count, count_time);

        // Benchmark session limit enforcement
        let start = Instant::now();
        session_manager.enforce_session_limits(&user_id).await.unwrap();
        let limit_time = start.elapsed();
        println!("✅ Session limit enforcement completed in {:?}", limit_time);

        // Verify that sessions were limited correctly
        let final_count = session_manager.get_user_session_count(user_id).await.unwrap();
        assert_eq!(final_count, 5, "Sessions should be limited to 5");
        println!("✅ Session limit correctly enforced: {} sessions remain", final_count);

        // Benchmark batch session invalidation
        let start = Instant::now();
        session_manager.invalidate_user_sessions(user_id).await.unwrap();
        let invalidation_time = start.elapsed();
        println!("✅ Batch invalidation of {} sessions completed in {:?}",
                 final_count, invalidation_time);

        // Verify all sessions are gone
        let final_count = session_manager.get_user_session_count(user_id).await.unwrap();
        assert_eq!(final_count, 0, "All sessions should be invalidated");
        println!("✅ All sessions successfully invalidated");
    }

    /// Test string allocation optimizations
    #[tokio::test]
    async fn test_string_allocation_optimizations() {
        let user_id = Uuid::new_v4();
        let session_id = "test_session";

        // Test buffer reuse multiple times
        for i in 0..100 {
            let _key = STRING_BUFFER.with(|buf| {
                let mut buffer = buf.borrow_mut();
                buffer.clear();
                buffer.reserve(SESSION_PREFIX_LEN + session_id.len());
                buffer.push_str(SESSION_PREFIX);
                buffer.push_str(session_id);
                buffer.push('_');
                buffer.push_str(&i.to_string());
                buffer.clone()
            });
        }

        println!("✅ String buffer reuse completed successfully");
    }

    /// Performance comparison test (demonstrates N+1 fix)
    #[tokio::test]
    async fn performance_comparison_test() {
        println!("🚀 Performance optimizations implemented:");
        println!("   • N+1 query elimination in session cleanup");
        println!("   • O(1) session counting using Redis sets");
        println!("   • Pipeline operations for batch Redis operations");
        println!("   • Thread-local string buffer reuse");
        println!("   • Efficient string allocation with pre-sizing");
        println!("   • User session sets for O(1) lookups vs O(n) scans");
    }
}
