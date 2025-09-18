use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use redis::{AsyncCommands, Client};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
// tower_governor is available if needed for more advanced rate limiting

use crate::{app_state::AppState, config::RateLimitConfig, error::AppError};

// Simple user representation for rate limiting
#[derive(Debug, Clone)]
pub struct UserInfo {
    pub id: uuid::Uuid,
    pub email: String,
    pub is_admin: bool,
    pub is_premium: bool,
}

/// User tier for determining rate limit multipliers
#[derive(Debug, Clone, PartialEq)]
pub enum UserTier {
    Free,
    Premium,
    Admin,
}

impl UserTier {
    /// Get rate limit multiplier for this tier
    pub fn multiplier(&self, config: &RateLimitConfig) -> u32 {
        match self {
            UserTier::Free => 1,
            UserTier::Premium => config.premium_multiplier,
            UserTier::Admin => config.premium_multiplier * 2, // Admins get double premium
        }
    }

    /// Determine user tier from user info
    pub fn from_user_info(user_info: &UserInfo) -> Self {
        if user_info.is_admin {
            UserTier::Admin
        } else if user_info.is_premium {
            UserTier::Premium
        } else {
            UserTier::Free
        }
    }
}

/// Rate limit information for headers
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    pub limit: u32,
    pub remaining: u32,
    pub reset_time: u64,
    pub retry_after: Option<u64>,
}

impl RateLimitInfo {
    /// Convert to response headers
    pub fn to_headers(&self) -> Result<HeaderMap, AppError> {
        let mut headers = HeaderMap::new();

        headers.insert(
            HeaderName::from_static("x-ratelimit-limit"),
            HeaderValue::from_str(&self.limit.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("x-ratelimit-remaining"),
            HeaderValue::from_str(&self.remaining.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("x-ratelimit-reset"),
            HeaderValue::from_str(&self.reset_time.to_string())?,
        );

        if let Some(retry_after) = self.retry_after {
            headers.insert(
                HeaderName::from_static("retry-after"),
                HeaderValue::from_str(&retry_after.to_string())?,
            );
        }

        Ok(headers)
    }
}

/// Circuit breaker state for Redis connections
#[derive(Debug, Clone)]
pub enum CircuitBreakerState {
    Closed,   // Normal operation
    Open,     // Circuit is open, failing fast
    HalfOpen, // Testing if service is back
}

/// Circuit breaker for Redis connections
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    state: Arc<Mutex<CircuitBreakerState>>,
    failure_count: Arc<Mutex<u32>>,
    last_failure_time: Arc<Mutex<Option<Instant>>>,
    failure_threshold: u32,
    timeout_duration: Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, timeout_duration: Duration) -> Self {
        Self {
            state: Arc::new(Mutex::new(CircuitBreakerState::Closed)),
            failure_count: Arc::new(Mutex::new(0)),
            last_failure_time: Arc::new(Mutex::new(None)),
            failure_threshold,
            timeout_duration,
        }
    }

    pub fn can_execute(&self) -> bool {
        let Ok(mut state) = self.state.lock() else {
            tracing::error!("Circuit breaker state lock poisoned, allowing execution");
            return true;
        };
        let last_failure = match self.last_failure_time.lock() {
            Ok(guard) => *guard,
            Err(_) => {
                tracing::error!("Circuit breaker last_failure_time lock poisoned");
                None
            }
        };

        match *state {
            CircuitBreakerState::Closed => true,
            CircuitBreakerState::Open => {
                if let Some(last_failure_time) = last_failure {
                    if last_failure_time.elapsed() >= self.timeout_duration {
                        *state = CircuitBreakerState::HalfOpen;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            CircuitBreakerState::HalfOpen => true,
        }
    }

    pub fn record_success(&self) {
        let Ok(mut state) = self.state.lock() else {
            tracing::error!("Circuit breaker state lock poisoned on record_success");
            return;
        };
        let Ok(mut failure_count) = self.failure_count.lock() else {
            tracing::error!("Circuit breaker failure_count lock poisoned on record_success");
            return;
        };
        let Ok(mut last_failure) = self.last_failure_time.lock() else {
            tracing::error!("Circuit breaker last_failure_time lock poisoned on record_success");
            return;
        };

        *state = CircuitBreakerState::Closed;
        *failure_count = 0;
        *last_failure = None;
    }

    pub fn record_failure(&self) {
        let Ok(mut state) = self.state.lock() else {
            tracing::error!("Circuit breaker state lock poisoned on record_failure");
            return;
        };
        let Ok(mut failure_count) = self.failure_count.lock() else {
            tracing::error!("Circuit breaker failure_count lock poisoned on record_failure");
            return;
        };
        let Ok(mut last_failure) = self.last_failure_time.lock() else {
            tracing::error!("Circuit breaker last_failure_time lock poisoned on record_failure");
            return;
        };

        *failure_count += 1;
        *last_failure = Some(Instant::now());

        if *failure_count >= self.failure_threshold {
            *state = CircuitBreakerState::Open;
        }
    }
}

/// In-memory rate limiter for fallback
#[derive(Debug, Clone)]
struct InMemoryRateLimit {
    count: u32,
    window_start: Instant,
}

/// In-memory rate limiting service
#[derive(Clone)]
pub struct InMemoryRateLimiter {
    limits: Arc<Mutex<HashMap<String, InMemoryRateLimit>>>,
    window_duration: Duration,
}

impl Default for InMemoryRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl InMemoryRateLimiter {
    pub fn new() -> Self {
        Self {
            limits: Arc::new(Mutex::new(HashMap::new())),
            window_duration: Duration::from_secs(3600), // 1 hour window
        }
    }

    pub fn check_rate_limit(&self, key: &str, limit: u32) -> Result<RateLimitInfo, AppError> {
        let mut limits = self
            .limits
            .lock()
            .map_err(|_| AppError::InternalServerError("Rate limiter lock poisoned".to_string()))?;
        let now = Instant::now();

        let entry = limits.entry(key.to_string()).or_insert(InMemoryRateLimit {
            count: 0,
            window_start: now,
        });

        // Reset window if expired
        if now.duration_since(entry.window_start) >= self.window_duration {
            entry.count = 0;
            entry.window_start = now;
        }

        entry.count += 1;

        let remaining = limit.saturating_sub(entry.count);

        let reset_time = get_current_timestamp() + self.window_duration.as_secs();

        let retry_after = if remaining == 0 {
            Some(reset_time - get_current_timestamp())
        } else {
            None
        };

        Ok(RateLimitInfo {
            limit,
            remaining,
            reset_time,
            retry_after,
        })
    }

    pub fn cleanup_expired(&self) {
        let Ok(mut limits) = self.limits.lock() else {
            tracing::error!("Rate limiter cleanup: lock poisoned");
            return;
        };
        let now = Instant::now();

        limits.retain(|_, entry| now.duration_since(entry.window_start) < self.window_duration);
    }
}

/// Redis-based rate limiting service with circuit breaker
#[derive(Clone)]
pub struct RateLimitService {
    redis_client: Option<Client>,
    in_memory_limiter: InMemoryRateLimiter,
    circuit_breaker: CircuitBreaker,
    config: RateLimitConfig,
}

impl RateLimitService {
    /// Create a new rate limiting service with Redis and fallback
    pub fn new(redis_url: &str, config: RateLimitConfig) -> Self {
        let redis_client = Client::open(redis_url)
            .map_err(|e| {
                tracing::warn!(
                    "Failed to create Redis client: {}, falling back to in-memory",
                    e
                );
                e
            })
            .ok();

        let circuit_breaker = CircuitBreaker::new(
            5,                       // failure threshold
            Duration::from_secs(60), // timeout duration
        );

        Self {
            redis_client,
            in_memory_limiter: InMemoryRateLimiter::new(),
            circuit_breaker,
            config,
        }
    }

    /// Create a new rate limiting service with only in-memory fallback
    pub fn new_in_memory_only(config: RateLimitConfig) -> Self {
        Self {
            redis_client: None,
            in_memory_limiter: InMemoryRateLimiter::new(),
            circuit_breaker: CircuitBreaker::new(5, Duration::from_secs(60)),
            config,
        }
    }

    /// Check rate limit for a specific key and limit type with fallback
    pub async fn check_rate_limit(
        &self,
        key: &str,
        limit_type: RateLimitType,
        user_tier: UserTier,
    ) -> Result<RateLimitInfo, AppError> {
        let base_limit = match limit_type {
            RateLimitType::Global => self.config.global_requests_per_hour,
            RateLimitType::Api => self.config.api_requests_per_hour,
            RateLimitType::Upload => self.config.uploads_per_hour,
        };

        let limit = base_limit * user_tier.multiplier(&self.config);

        // Try Redis first if available and circuit breaker allows
        if let Some(ref redis_client) = self.redis_client {
            if self.circuit_breaker.can_execute() {
                match self.check_redis_rate_limit(redis_client, key, limit).await {
                    Ok(rate_info) => {
                        self.circuit_breaker.record_success();
                        return Ok(rate_info);
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Redis rate limiting failed: {}, falling back to in-memory",
                            e
                        );
                        self.circuit_breaker.record_failure();
                    }
                }
            } else {
                tracing::debug!("Circuit breaker is open, using in-memory rate limiting");
            }
        }

        // Fallback to in-memory rate limiting
        self.in_memory_limiter.check_rate_limit(key, limit)
    }

    /// Check rate limit using Redis
    async fn check_redis_rate_limit(
        &self,
        redis_client: &Client,
        key: &str,
        limit: u32,
    ) -> Result<RateLimitInfo, AppError> {
        let mut conn = redis_client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Redis connection failed: {}", e)))?;

        let window_key = format!("rate_limit:{}:{}", key, get_current_hour());

        // Use Redis INCR to atomically increment and get current count
        let current_count: u32 = conn
            .incr(&window_key, 1)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Redis INCR failed: {}", e)))?;

        // Set expiry on first increment
        if current_count == 1 {
            conn.expire::<_, ()>(&window_key, 3600)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("Redis EXPIRE failed: {}", e)))?;
        }

        let remaining = limit.saturating_sub(current_count);
        let reset_time = get_next_hour_timestamp();
        let retry_after = if remaining == 0 {
            Some(reset_time - get_current_timestamp())
        } else {
            None
        };

        Ok(RateLimitInfo {
            limit,
            remaining,
            reset_time,
            retry_after,
        })
    }

    /// Clean up expired in-memory entries
    pub fn cleanup_expired(&self) {
        self.in_memory_limiter.cleanup_expired();
    }

    /// Check if user is admin and admin override is enabled
    pub fn is_admin_override_allowed(&self, user_tier: &UserTier) -> bool {
        self.config.admin_override_enabled && matches!(user_tier, UserTier::Admin)
    }
}

/// Rate limit types
#[derive(Debug, Clone, Copy)]
pub enum RateLimitType {
    Global,
    Api,
    Upload,
}

/// Middleware for API-specific rate limiting (user-based) with circuit breaker
pub async fn api_rate_limit_middleware(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    // Try to extract user info from request extensions (set by auth middleware)
    let user_tier = if let Some(user) = request.extensions().get::<crate::models::UserResponse>() {
        // Determine tier based on user properties (in a real app, you would check user.role or subscription)
        if user.email.ends_with("@admin.com") {
            UserTier::Admin
        } else if user.email.ends_with("@premium.com") {
            UserTier::Premium
        } else {
            UserTier::Free
        }
    } else {
        UserTier::Free
    };

    let rate_service = RateLimitService::new(
        &app_state.config.redis_url,
        app_state.config.rate_limit.clone(),
    );

    // Determine rate limiting key
    let key = if let Some(user) = request.extensions().get::<crate::models::UserResponse>() {
        format!("user:{}", user.id)
    } else {
        // Fall back to IP-based limiting for unauthenticated requests
        let ip = get_client_ip(&request).unwrap_or_else(|| "unknown".to_string());
        format!("ip:{}", ip)
    };

    // Skip rate limiting for admin users if override is enabled
    if rate_service.is_admin_override_allowed(&user_tier) {
        return Ok(next.run(request).await);
    }

    // Check rate limit with fallback
    let rate_info = rate_service
        .check_rate_limit(&key, RateLimitType::Api, user_tier)
        .await?;

    // Add rate limit headers to the request for downstream handlers
    request.extensions_mut().insert(rate_info.clone());

    // Check if rate limit exceeded
    if rate_info.remaining == 0 {
        let error_response = Json(json!({
            "error": "rate_limit_exceeded",
            "message": format!(
                "API rate limit of {} requests per hour exceeded. Try again in {} seconds.",
                rate_info.limit,
                rate_info.retry_after.unwrap_or(0)
            ),
            "details": {
                "limit": rate_info.limit,
                "reset_time": rate_info.reset_time,
                "retry_after": rate_info.retry_after
            }
        }));

        let mut response = (StatusCode::TOO_MANY_REQUESTS, error_response).into_response();

        // Add rate limit headers to response
        if let Ok(rl_headers) = rate_info.to_headers() {
            response.headers_mut().extend(rl_headers);
        }

        return Ok(response);
    }

    // Rate limit OK, continue with request
    let mut response = next.run(request).await;

    // Add rate limit headers to successful response
    if let Ok(headers) = rate_info.to_headers() {
        response.headers_mut().extend(headers);
    }

    Ok(response)
}

/// Middleware for upload-specific rate limiting with circuit breaker
pub async fn upload_rate_limit_middleware(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let user_tier = if let Some(user) = request.extensions().get::<crate::models::UserResponse>() {
        if user.email.ends_with("@admin.com") {
            UserTier::Admin
        } else if user.email.ends_with("@premium.com") {
            UserTier::Premium
        } else {
            UserTier::Free
        }
    } else {
        UserTier::Free
    };

    let rate_service = RateLimitService::new(
        &app_state.config.redis_url,
        app_state.config.rate_limit.clone(),
    );

    let key = if let Some(user) = request.extensions().get::<crate::models::UserResponse>() {
        format!("user:{}", user.id)
    } else {
        let ip = get_client_ip(&request).unwrap_or_else(|| "unknown".to_string());
        format!("ip:{}", ip)
    };

    // Skip rate limiting for admin users if override is enabled
    if rate_service.is_admin_override_allowed(&user_tier) {
        return Ok(next.run(request).await);
    }

    let rate_info = rate_service
        .check_rate_limit(&key, RateLimitType::Upload, user_tier)
        .await?;

    request.extensions_mut().insert(rate_info.clone());

    if rate_info.remaining == 0 {
        let error_response = Json(json!({
            "error": "upload_rate_limit_exceeded",
            "message": format!(
                "Upload rate limit of {} uploads per hour exceeded. Try again in {} seconds.",
                rate_info.limit,
                rate_info.retry_after.unwrap_or(0)
            ),
            "details": {
                "limit": rate_info.limit,
                "reset_time": rate_info.reset_time,
                "retry_after": rate_info.retry_after
            }
        }));

        let mut response = (StatusCode::TOO_MANY_REQUESTS, error_response).into_response();

        if let Ok(headers) = rate_info.to_headers() {
            response.headers_mut().extend(headers);
        }

        return Ok(response);
    }

    let mut response = next.run(request).await;

    if let Ok(headers) = rate_info.to_headers() {
        response.headers_mut().extend(headers);
    }

    Ok(response)
}

/// Extract client IP from request
pub fn get_client_ip(request: &Request) -> Option<String> {
    // Try X-Forwarded-For header first (for proxies)
    if let Some(forwarded_for) = request.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded_for.to_str() {
            if let Some(first_ip) = forwarded_str.split(',').next() {
                return Some(first_ip.trim().to_string());
            }
        }
    }

    // Try X-Real-IP header (for nginx)
    if let Some(real_ip) = request.headers().get("x-real-ip") {
        if let Ok(ip_str) = real_ip.to_str() {
            return Some(ip_str.to_string());
        }
    }

    // Fallback to connection info (if available)
    request
        .extensions()
        .get::<std::net::SocketAddr>()
        .map(|addr| addr.ip().to_string())
}

/// Get current hour as timestamp for rate limiting windows
pub fn get_current_hour() -> u64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    now / 3600 // Round down to current hour
}

/// Get timestamp of next hour boundary
pub fn get_next_hour_timestamp() -> u64 {
    (get_current_hour() + 1) * 3600
}

/// Get current timestamp in seconds
pub fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_user_tier_multipliers() {
        let config = RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        };

        assert_eq!(UserTier::Free.multiplier(&config), 1);
        assert_eq!(UserTier::Premium.multiplier(&config), 5);
        assert_eq!(UserTier::Admin.multiplier(&config), 10);
    }

    #[test]
    fn test_rate_limit_info_headers() {
        let info = RateLimitInfo {
            limit: 100,
            remaining: 75,
            reset_time: 1640995200,
            retry_after: None,
        };

        let headers = info.to_headers().unwrap();
        assert_eq!(headers.get("x-ratelimit-limit").unwrap(), "100");
        assert_eq!(headers.get("x-ratelimit-remaining").unwrap(), "75");
        assert_eq!(headers.get("x-ratelimit-reset").unwrap(), "1640995200");
        assert!(headers.get("retry-after").is_none());
    }

    #[test]
    fn test_time_functions() {
        let current_hour = get_current_hour();
        let next_hour = get_next_hour_timestamp();
        let current_time = get_current_timestamp();

        assert!(next_hour > current_time);
        assert_eq!(next_hour, (current_hour + 1) * 3600);
    }

    #[test]
    fn test_circuit_breaker() {
        let breaker = CircuitBreaker::new(3, Duration::from_millis(100));

        // Initially closed, should allow execution
        assert!(breaker.can_execute());

        // Record failures
        breaker.record_failure();
        assert!(breaker.can_execute()); // Still closed

        breaker.record_failure();
        assert!(breaker.can_execute()); // Still closed

        breaker.record_failure();
        assert!(!breaker.can_execute()); // Now open

        // Wait for timeout and test half-open
        std::thread::sleep(Duration::from_millis(150));
        assert!(breaker.can_execute()); // Half-open

        // Record success to close
        breaker.record_success();
        assert!(breaker.can_execute()); // Closed again
    }

    #[tokio::test]
    async fn test_in_memory_rate_limiter() {
        let limiter = InMemoryRateLimiter::new();
        let key = "test_key";
        let limit = 5;

        // First few requests should pass
        for i in 1..=5 {
            let result = limiter.check_rate_limit(key, limit).unwrap();
            assert_eq!(result.limit, limit);
            assert_eq!(result.remaining, limit - i);
        }

        // Next request should fail
        let result = limiter.check_rate_limit(key, limit).unwrap();
        assert_eq!(result.remaining, 0);
        assert!(result.retry_after.is_some());
    }

    #[tokio::test]
    async fn test_rate_limit_service_fallback() {
        let config = RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        };

        // Test with invalid Redis URL (should fallback to in-memory)
        let service = RateLimitService::new("redis://invalid:6379", config);

        let result = service
            .check_rate_limit("test_key", RateLimitType::Api, UserTier::Free)
            .await;

        assert!(result.is_ok());
        let rate_info = result.unwrap();
        assert_eq!(rate_info.limit, 100); // base limit for API
        assert_eq!(rate_info.remaining, 99); // after first request
    }

    #[test]
    fn test_rate_limit_service_in_memory_only() {
        let config = RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        };

        let service = RateLimitService::new_in_memory_only(config);

        // Test admin override
        assert!(service.is_admin_override_allowed(&UserTier::Admin));
        assert!(!service.is_admin_override_allowed(&UserTier::Free));
        assert!(!service.is_admin_override_allowed(&UserTier::Premium));
    }
}
