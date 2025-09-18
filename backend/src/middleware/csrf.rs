use axum::{
    extract::{FromRequestParts, Request, State},
    http::{header, request::Parts, HeaderMap, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum::async_trait;
use base64::{engine::general_purpose, Engine as _};
use chrono;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use tracing::{debug, warn};

use crate::{app_state::AppState, error::AppError};

/// CSRF token configuration
const CSRF_TOKEN_LENGTH: usize = 32;
const CSRF_COOKIE_NAME: &str = "csrf-token";
const CSRF_HEADER_NAME: &str = "X-CSRF-Token";
const CSRF_SESSION_KEY: &str = "csrf_token";

/// CSRF protection modes
#[derive(Debug, Clone)]
pub enum CSRFMode {
    /// Double submit cookie pattern - most secure
    DoubleSubmitCookie,
    /// Session-based CSRF tokens
    SessionBased,
}

/// CSRF token struct
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CSRFToken {
    pub value: String,
    pub timestamp: i64,
}

impl CSRFToken {
    /// Generate a new CSRF token
    pub fn new() -> Self {
        let mut token_bytes = vec![0u8; CSRF_TOKEN_LENGTH];
        OsRng.fill_bytes(&mut token_bytes);
        let value = general_purpose::URL_SAFE_NO_PAD.encode(&token_bytes);
        
        Self {
            value,
            timestamp: chrono::Utc::now().timestamp(),
        }
    }

    /// Check if token is expired (24 hours)
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        (now - self.timestamp) > 86400 // 24 hours
    }

    /// Validate token format
    pub fn is_valid_format(&self) -> bool {
        !self.value.is_empty() && self.value.len() >= 16
    }
}

/// CSRF protection middleware extractor
pub struct CSRFProtection {
    pub token: CSRFToken,
}

#[async_trait]
impl FromRequestParts<AppState> for CSRFProtection {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Only protect POST, PUT, DELETE, PATCH requests
        match parts.method {
            Method::GET | Method::HEAD | Method::OPTIONS => {
                // Allow safe methods through with a new token
                let token = CSRFToken::new();
                return Ok(CSRFProtection { token });
            }
            _ => {} // Continue validation for unsafe methods
        }

        // Extract session for session-based CSRF
        let session = Session::from_request_parts(parts, &())
            .await
            .map_err(|_| {
                warn!("CSRF: Session not available for validation");
                AppError::CSRFValidationFailed("Session required for CSRF protection".to_string())
            })?;

        // Extract CSRF token from headers
        let submitted_token = extract_csrf_token_from_headers(&parts.headers)
            .ok_or_else(|| {
                warn!("CSRF: No CSRF token found in headers");
                AppError::CSRFValidationFailed("CSRF token required".to_string())
            })?;

        // Validate using double-submit cookie pattern
        validate_double_submit_token(parts, &session, &submitted_token).await?
            .ok_or_else(|| {
                warn!("CSRF: Token validation failed");
                AppError::CSRFValidationFailed("Invalid CSRF token".to_string())
            })
    }
}

/// Extract CSRF token from request headers
fn extract_csrf_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(CSRF_HEADER_NAME)
        .and_then(|value| value.to_str().ok())
        .map(|s| s.to_string())
}

/// Extract CSRF token from cookies
fn extract_csrf_token_from_cookies(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|cookie| {
            let cookie = cookie.trim();
            if let Some(value) = cookie.strip_prefix(&format!("{}=", CSRF_COOKIE_NAME)) {
                Some(value.to_string())
            } else {
                None
            }
        })
}

/// Validate double-submit CSRF token
async fn validate_double_submit_token(
    parts: &Parts,
    session: &Session,
    submitted_token: &str,
) -> Result<Option<CSRFProtection>, AppError> {
    // Get token from cookie
    let cookie_token = extract_csrf_token_from_cookies(parts)
        .ok_or_else(|| {
            warn!("CSRF: No CSRF token found in cookies");
            AppError::CSRFValidationFailed("CSRF cookie required".to_string())
        })?;

    // Tokens must match (double-submit pattern)
    if submitted_token != cookie_token {
        warn!("CSRF: Header and cookie tokens do not match");
        return Err(AppError::CSRFValidationFailed(
            "CSRF token mismatch".to_string(),
        ));
    }

    // Additionally validate against session token for extra security
    let session_token: Option<String> = session
        .get(CSRF_SESSION_KEY)
        .await
        .map_err(|e| {
            warn!("CSRF: Session error: {}", e);
            AppError::InternalServerError(format!("Session error: {}", e))
        })?;

    if let Some(session_token) = session_token {
        if submitted_token != session_token {
            warn!("CSRF: Token does not match session token");
            return Err(AppError::CSRFValidationFailed(
                "Invalid session CSRF token".to_string(),
            ));
        }
    }

    // Validate token format
    if submitted_token.len() < 16 {
        warn!("CSRF: Token too short");
        return Err(AppError::CSRFValidationFailed(
            "Invalid token format".to_string(),
        ));
    }

    let token = CSRFToken {
        value: submitted_token.to_string(),
        timestamp: chrono::Utc::now().timestamp(),
    };

    debug!("CSRF: Token validation successful");
    Ok(Some(CSRFProtection { token }))
}

/// CSRF middleware function
pub async fn csrf_middleware(
    State(_app_state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let method = request.method().clone();
    let uri = request.uri().clone();

    debug!("CSRF middleware: {} {}", method, uri);

    // Skip CSRF protection for safe methods and certain endpoints
    if should_skip_csrf_protection(&method, uri.path()) {
        debug!("CSRF: Skipping protection for {} {}", method, uri.path());
        return Ok(next.run(request).await);
    }

    // For POST/PUT/DELETE requests, validate CSRF token
    if matches!(method, Method::POST | Method::PUT | Method::DELETE | Method::PATCH) {
        // Extract session from request
        let session = request.extensions().get::<Session>().cloned();
        
        if let Some(session) = session {
            // Generate and store CSRF token in session if not exists
            let csrf_token: Option<String> = session
                .get(CSRF_SESSION_KEY)
                .await
                .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

            if csrf_token.is_none() {
                let new_token = CSRFToken::new();
                session
                    .insert(CSRF_SESSION_KEY, new_token.value.clone())
                    .await
                    .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;
                debug!("CSRF: Generated new session token");
            }
        }
    }

    // Continue with request processing
    let mut response = next.run(request).await;

    // Add CSRF token to response headers for client
    if matches!(method, Method::GET | Method::POST) {
        if let Some(session) = response.extensions().get::<Session>() {
            if let Ok(Some(token)) = session.get::<String>(CSRF_SESSION_KEY).await {
                response.headers_mut().insert(
                    "X-CSRF-Token",
                    token.parse().unwrap_or_else(|_| header::HeaderValue::from_static("")),
                );
            }
        }
    }

    Ok(response)
}

/// Check if CSRF protection should be skipped for this request
pub fn should_skip_csrf_protection(method: &Method, path: &str) -> bool {
    // Skip for safe HTTP methods
    if matches!(method, &Method::GET | &Method::HEAD | &Method::OPTIONS) {
        return true;
    }

    // Skip for health check endpoints
    if path.contains("/health") {
        return true;
    }

    // Skip for auth login/register endpoints (they establish the session)
    if path == "/api/v1/auth/login" || path == "/api/v1/auth/register" {
        return true;
    }

    false
}

/// Generate CSRF token for response
pub async fn generate_csrf_token(
    session: &Session,
    secure_cookie: bool,
) -> Result<(String, String), AppError> {
    let token = CSRFToken::new();
    
    // Store in session
    session
        .insert(CSRF_SESSION_KEY, token.value.clone())
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Create cookie header value
    let cookie_value = if secure_cookie {
        format!(
            "{}={}; HttpOnly; Secure; SameSite=Strict; Path=/",
            CSRF_COOKIE_NAME, token.value
        )
    } else {
        format!(
            "{}={}; HttpOnly; SameSite=Strict; Path=/",
            CSRF_COOKIE_NAME, token.value
        )
    };

    debug!("CSRF: Generated token for session");
    Ok((token.value, cookie_value))
}

/// CSRF token endpoint handler
pub async fn get_csrf_token(
    session: Session,
    State(app_state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let (token, cookie_header) = generate_csrf_token(
        &session,
        app_state.config.cookie_security.secure,
    ).await?;

    let response = axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::SET_COOKIE, cookie_header)
        .header("Content-Type", "application/json")
        .body(
            serde_json::json!({
                "csrf_token": token,
                "timestamp": chrono::Utc::now().timestamp()
            })
            .to_string(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csrf_token_generation() {
        let token = CSRFToken::new();
        assert!(!token.value.is_empty());
        assert!(token.value.len() >= 16);
        assert!(token.is_valid_format());
        assert!(!token.is_expired());
    }

    #[test]
    fn test_csrf_token_validation() {
        let token = CSRFToken::new();
        assert!(token.is_valid_format());
        
        let invalid_token = CSRFToken {
            value: "short".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        assert!(!invalid_token.is_valid_format());
    }

    #[test]
    fn test_should_skip_csrf_protection() {
        assert!(should_skip_csrf_protection(&Method::GET, "/api/users"));
        assert!(should_skip_csrf_protection(&Method::HEAD, "/api/users"));
        assert!(should_skip_csrf_protection(&Method::OPTIONS, "/api/users"));
        assert!(should_skip_csrf_protection(&Method::POST, "/api/v1/health"));
        assert!(should_skip_csrf_protection(&Method::POST, "/api/v1/auth/login"));
        assert!(should_skip_csrf_protection(&Method::POST, "/api/v1/auth/register"));
        
        assert!(!should_skip_csrf_protection(&Method::POST, "/api/v1/users"));
        assert!(!should_skip_csrf_protection(&Method::PUT, "/api/v1/users/1"));
        assert!(!should_skip_csrf_protection(&Method::DELETE, "/api/v1/users/1"));
    }
}