use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use tower_sessions::Session;
use std::net::IpAddr;

use crate::{app_state::AppState, error::AppError, models::UserResponse};

// Auth middleware extractor that provides the current user
// This will automatically extract the user from the JWT token in cookies
#[async_trait]
impl FromRequestParts<AppState> for UserResponse {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Try to get the token from cookies first
        let token = extract_token_from_cookies(parts)
            .or_else(|| extract_token_from_header(parts))
            .ok_or_else(|| {
                AppError::AuthenticationError("No authentication token found".to_string())
            })?;

        // SECURITY FIX: Validate JWT format before processing
        if !AuthUtils::validate_jwt_format(&token) {
            return Err(AppError::AuthenticationError(
                "Invalid token format".to_string()
            ));
        }

        // Validate the token and get user information
        let user = state.auth_service.get_current_user(&token).await?;

        Ok(user)
    }
}

// Helper function to extract token from cookies (SECURE VERSION)
fn extract_token_from_cookies(parts: &Parts) -> Option<String> {
    let cookie_header = parts.headers.get(header::COOKIE)?.to_str().ok()?;

    // SECURITY FIX: Validate cookie header to prevent injection
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if let Some(token_value) = cookie.strip_prefix("token=") {
            // Additional validation: ensure token contains only valid JWT characters
            if !token_value.is_empty() &&
               token_value.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') {
                return Some(token_value.to_string());
            }
        }
    }
    None
}

// Helper function to extract token from Authorization header (SECURE VERSION)
fn extract_token_from_header(parts: &Parts) -> Option<String> {
    let header_value = parts.headers.get(header::AUTHORIZATION)?.to_str().ok()?;

    // SECURITY FIX: Validate header format strictly to prevent injection
    if header_value.starts_with("Bearer ") && header_value.len() > 7 {
        let token = &header_value[7..];
        // Additional validation: ensure token contains only valid JWT characters
        if token.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') {
            Some(token.to_string())
        } else {
            None
        }
    } else {
        None
    }
}

// Optional auth middleware that doesn't reject requests without tokens
// but provides None if not authenticated
pub struct OptionalAuth(pub Option<UserResponse>);

#[async_trait]
impl FromRequestParts<AppState> for OptionalAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match UserResponse::from_request_parts(parts, state).await {
            Ok(user) => Ok(OptionalAuth(Some(user))),
            Err(AppError::AuthenticationError(_)) => Ok(OptionalAuth(None)),
            Err(e) => Err(e),
        }
    }
}

// Session-based auth extractor (alternative to JWT)
pub struct SessionUser(pub UserResponse);

#[async_trait]
impl FromRequestParts<AppState> for SessionUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, &())
            .await
            .map_err(|_| AppError::AuthenticationError("Session not available".to_string()))?;

        let user_id_str: Option<String> = session
            .get("user_id")
            .await
            .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

        let user_id_str = user_id_str
            .ok_or_else(|| AppError::AuthenticationError("No user session found".to_string()))?;

        let user_id = uuid::Uuid::parse_str(&user_id_str)
            .map_err(|_| AppError::AuthenticationError("Invalid user ID in session".to_string()))?;

        let user = state
            .auth_service
            .get_user_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::AuthenticationError("User not found".to_string()))?;

        Ok(SessionUser(user.into()))
    }
}

/// Secure authentication utility functions
pub struct AuthUtils;

impl AuthUtils {
    /// Extract real client IP address from request headers (SECURITY FIX)
    pub fn extract_client_ip(parts: &Parts) -> Option<std::sync::Arc<str>> {
        // Try to get the real IP from various headers in order of preference
        // X-Forwarded-For (from load balancers/proxies)
        if let Some(forwarded_for) = parts.headers.get("x-forwarded-for") {
            if let Ok(header_value) = forwarded_for.to_str() {
                // Take the first IP address from the comma-separated list
                if let Some(first_ip) = header_value.split(',').next() {
                    let ip = first_ip.trim();
                    // Validate IP format
                    if ip.parse::<IpAddr>().is_ok() {
                        return Some(std::sync::Arc::from(ip));
                    }
                }
            }
        }

        // X-Real-IP (from nginx)
        if let Some(real_ip) = parts.headers.get("x-real-ip") {
            if let Ok(header_value) = real_ip.to_str() {
                let ip = header_value.trim();
                if ip.parse::<IpAddr>().is_ok() {
                    return Some(std::sync::Arc::from(ip));
                }
            }
        }

        // CF-Connecting-IP (from Cloudflare)
        if let Some(cf_ip) = parts.headers.get("cf-connecting-ip") {
            if let Ok(header_value) = cf_ip.to_str() {
                let ip = header_value.trim();
                if ip.parse::<IpAddr>().is_ok() {
                    return Some(std::sync::Arc::from(ip));
                }
            }
        }

        // Fall back to connection info (this won't work with load balancers)
        None // Connection remote addr not available in request parts
    }

    /// Extract User-Agent header safely (SECURITY FIX)
    pub fn extract_user_agent(parts: &Parts) -> Option<std::sync::Arc<str>> {
        if let Some(user_agent) = parts.headers.get(header::USER_AGENT) {
            if let Ok(ua_str) = user_agent.to_str() {
                // Limit length to prevent DoS attacks
                let max_length = 500;
                let ua = if ua_str.len() > max_length {
                    &ua_str[..max_length]
                } else {
                    ua_str
                };

                // Basic sanitization - remove potentially dangerous characters
                let sanitized = ua
                    .chars()
                    .filter(|c| c.is_ascii_graphic() || c.is_ascii_whitespace())
                    .collect::<String>()
                    .trim()
                    .to_string();

                if !sanitized.is_empty() {
                    return Some(std::sync::Arc::from(sanitized.as_str()));
                }
            }
        }
        None
    }

    /// Validate JWT token format for basic security (prevents injection)
    pub fn validate_jwt_format(token: &str) -> bool {
        // JWT should have exactly 3 parts separated by dots
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return false;
        }

        // Each part should only contain valid base64url characters
        for part in parts {
            if part.is_empty() || !part.chars().all(|c| {
                c.is_alphanumeric() || c == '-' || c == '_'
            }) {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn test_jwt_format_validation() {
        // Valid JWT format
        let valid_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        assert!(AuthUtils::validate_jwt_format(valid_jwt), "Valid JWT should pass validation");

        // Invalid JWT formats that could be injection attempts
        let invalid_jwts = vec![
            "", // Empty
            "not.a.jwt", // Too few parts
            "header.payload", // Missing signature
            "header.payload.signature.extra", // Too many parts
            "header$.payload.signature", // Invalid characters
            "header.payload.signature with spaces", // Spaces in token
            "../../../etc/passwd", // Path traversal attempt
            "<script>alert('xss')</script>", // XSS attempt
            "'; DROP TABLE users; --", // SQL injection attempt
        ];

        for invalid_jwt in invalid_jwts {
            assert!(
                !AuthUtils::validate_jwt_format(invalid_jwt),
                "Invalid JWT '{}' should fail validation",
                invalid_jwt
            );
        }
    }

    // Note: IP and User-Agent extraction tests would require complex mocking
    // These are tested through integration tests in the auth handlers
}
