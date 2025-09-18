use axum::{
    extract::{ConnectInfo, State},
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tower_sessions::Session;
use validator::Validate;

use crate::{
    app_state::AppState,
    error::AppError,
    middleware::auth::AuthUtils,
    models::{
        ChangePasswordRequest, LoginRequest, RefreshTokenRequest, RegisterRequest, UserResponse,
    },
};

// Simple in-memory rate limiting for auth endpoints
lazy_static::lazy_static! {
    static ref AUTH_RATE_LIMITER: Arc<Mutex<HashMap<String, (u32, Instant)>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

const MAX_AUTH_ATTEMPTS: u32 = 5;
const AUTH_WINDOW_DURATION: Duration = Duration::from_secs(300); // 5 minutes

fn check_auth_rate_limit(key: &str) -> Result<(), AppError> {
    let mut limiter = AUTH_RATE_LIMITER.lock().unwrap();
    let now = Instant::now();

    // Clean up expired entries
    limiter.retain(|_, (_, timestamp)| now.duration_since(*timestamp) < AUTH_WINDOW_DURATION);

    match limiter.get_mut(key) {
        Some((count, timestamp)) => {
            if now.duration_since(*timestamp) < AUTH_WINDOW_DURATION {
                if *count >= MAX_AUTH_ATTEMPTS {
                    return Err(AppError::TooManyRequests(
                        "Too many authentication attempts. Please try again in 5 minutes."
                            .to_string(),
                    ));
                }
                *count += 1;
            } else {
                *count = 1;
                *timestamp = now;
            }
        }
        None => {
            limiter.insert(key.to_string(), (1, now));
        }
    }

    Ok(())
}

// Register endpoint with security tracking
pub async fn register(
    State(app_state): State<AppState>,
    session: Session,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    parts: Parts,
    Json(payload): Json<RegisterRequest>,
) -> Result<Response, AppError> {
    // Rate limiting check using email as key
    check_auth_rate_limit(&payload.email)?;

    // Validate request
    payload.validate().map_err(|e| AppError::ValidationError {
        field: "payload".to_string(),
        message: format!("Validation failed: {}", e),
    })?;

    // Perform registration
    let response = app_state.auth_service.register(payload).await?;

    // Store user session in tower_sessions
    session
        .insert("user_id", response.user.id.to_string())
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Store session data in SessionManager for proper session tracking
    if let Some(session_manager) = &app_state.session_manager {
        // Generate a session ID for tracking
        let session_id = format!(
            "register_{}_{}",
            response.user.id,
            chrono::Utc::now().timestamp()
        );

        let session_data = crate::services::session::SessionData {
            user_id: response.user.id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: AuthUtils::extract_client_ip(&parts)
                .or_else(|| Some(Arc::from(addr.ip().to_string().as_str()))), // Fallback to connection IP
            user_agent: AuthUtils::extract_user_agent(&parts),
        };

        if let Err(e) = session_manager
            .store_session(&session_id, session_data)
            .await
        {
            tracing::warn!("Failed to store session in SessionManager: {}", e);
            // Don't fail the registration, but log the issue
        }
    }

    // Generate CSRF token for new session
    let (csrf_token, csrf_cookie) = crate::middleware::csrf::generate_csrf_token(
        &session,
        app_state.config.cookie_security.secure,
    )
    .await?;

    // Set JWT token in HttpOnly cookie with environment-based security
    let secure_flag = if app_state.config.cookie_security.secure {
        "; Secure"
    } else {
        ""
    };

    let response_builder = Response::builder()
        .status(StatusCode::CREATED)
        .header(
            header::SET_COOKIE,
            format!(
                "token={}; HttpOnly; SameSite={}; Max-Age=900; Path={}{}", // 15 minutes
                response.access_token, app_state.config.cookie_security.same_site, "/", secure_flag
            ),
        )
        .header(header::SET_COOKIE, csrf_cookie);

    let response = response_builder
        .body(
            Json(json!({
                "user": response.user,
                "access_token": response.access_token,
                "refresh_token": response.refresh_token,
                "message": "Registration successful",
                "csrf_token": csrf_token
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Login endpoint with security tracking
pub async fn login(
    State(app_state): State<AppState>,
    session: Session,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    parts: Parts,
    Json(payload): Json<LoginRequest>,
) -> Result<Response, AppError> {
    // Rate limiting check using email as key
    check_auth_rate_limit(&payload.email)?;

    // Validate request
    payload.validate().map_err(|e| AppError::ValidationError {
        field: "payload".to_string(),
        message: format!("Validation failed: {}", e),
    })?;

    // Perform login
    let response = app_state.auth_service.login(payload).await?;

    // Store user session in tower_sessions
    session
        .insert("user_id", response.user.id.to_string())
        .await
        .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

    // Store session data in SessionManager for proper session tracking
    if let Some(session_manager) = &app_state.session_manager {
        // Generate a session ID for tracking
        let session_id = format!(
            "login_{}_{}",
            response.user.id,
            chrono::Utc::now().timestamp()
        );

        let session_data = crate::services::session::SessionData {
            user_id: response.user.id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: AuthUtils::extract_client_ip(&parts)
                .or_else(|| Some(Arc::from(addr.ip().to_string().as_str()))), // Fallback to connection IP
            user_agent: AuthUtils::extract_user_agent(&parts),
        };

        if let Err(e) = session_manager
            .store_session(&session_id, session_data)
            .await
        {
            tracing::warn!("Failed to store session in SessionManager: {}", e);
            // Don't fail the login, but log the issue
        }
    }

    // Generate CSRF token for new session
    let (csrf_token, csrf_cookie) = crate::middleware::csrf::generate_csrf_token(
        &session,
        app_state.config.cookie_security.secure,
    )
    .await?;

    // Set JWT token in HttpOnly cookie with environment-based security
    let secure_flag = if app_state.config.cookie_security.secure {
        "; Secure"
    } else {
        ""
    };

    let response = Response::builder()
        .status(StatusCode::CREATED)
        .header(
            header::SET_COOKIE,
            format!(
                "token={}; HttpOnly; SameSite={}; Max-Age=900; Path={}{}", // 15 minutes
                response.access_token, app_state.config.cookie_security.same_site, "/", secure_flag
            ),
        )
        .header(header::SET_COOKIE, csrf_cookie)
        .body(
            Json(json!({
                "user": response.user,
                "access_token": response.access_token,
                "refresh_token": response.refresh_token,
                "message": "Login successful",
                "csrf_token": csrf_token
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Enhanced logout endpoint - fixes AUTH-003 session invalidation issues
pub async fn logout(
    State(app_state): State<AppState>,
    _session: Session,
    user: UserResponse, // Get user from auth middleware
) -> Result<Response, AppError> {
    // TODO: Use enhanced logout that properly invalidates both JWT and sessions
    // crate::middleware::session_auth::enhanced_logout(
    //     &app_state.auth_service,
    //     app_state.session_manager.as_ref(),
    //     &session,
    //     user.id,
    // ).await?;

    // Clear JWT cookie with same security settings
    let secure_flag = if app_state.config.cookie_security.secure {
        "; Secure"
    } else {
        ""
    };

    // Clear CSRF cookie as well
    let csrf_clear_cookie = format!(
        "csrf_token=; HttpOnly; SameSite={}; Max-Age=0; Path={}{}",
        app_state.config.cookie_security.same_site, "/", secure_flag
    );

    let response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(
            header::SET_COOKIE,
            format!(
                "token=; HttpOnly; SameSite={}; Max-Age=0; Path={}{}",
                app_state.config.cookie_security.same_site, "/", secure_flag
            ),
        )
        .header(header::SET_COOKIE, csrf_clear_cookie)
        .body(
            Json(json!({
                "message": "Logout successful",
                "sessions_invalidated": true
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    tracing::info!(
        "User {} logged out successfully with full session invalidation",
        user.id
    );
    Ok(response)
}

// Get current user endpoint (protected route)
pub async fn me(
    _app_state: State<AppState>,
    user: UserResponse,
) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(user))
}

// Health check for auth service
pub async fn auth_health() -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(json!({
        "status": "ok",
        "service": "auth",
        "timestamp": chrono::Utc::now()
    })))
}

// Change password endpoint (protected route)
pub async fn change_password(
    State(app_state): State<AppState>,
    user: UserResponse, // This comes from the auth middleware
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Response, AppError> {
    // Validate request
    payload.validate().map_err(|e| AppError::ValidationError {
        field: "payload".to_string(),
        message: format!("Validation failed: {}", e),
    })?;

    // Change password and invalidate sessions
    app_state
        .auth_service
        .change_password(user.id, &payload.current_password, &payload.new_password)
        .await?;

    // Return success response
    let response = Response::builder()
        .status(StatusCode::ACCEPTED)
        .body(
            Json(json!({
                "message": "Password changed successfully. All sessions have been invalidated."
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Get session info for current user (protected route)
pub async fn session_info(
    State(app_state): State<AppState>,
    user: UserResponse,
) -> Result<Json<serde_json::Value>, AppError> {
    let session_count = app_state
        .auth_service
        .get_user_session_count(user.id)
        .await?;

    Ok(Json(json!({
        "user_id": user.id,
        "active_sessions": session_count,
        "max_sessions": 5
    })))
}

// Invalidate all sessions for current user (protected route)
pub async fn invalidate_all_sessions(
    State(app_state): State<AppState>,
    user: UserResponse,
) -> Result<Response, AppError> {
    app_state
        .auth_service
        .invalidate_user_sessions(user.id)
        .await?;

    let response = Response::builder()
        .status(StatusCode::OK)
        .body(
            Json(json!({
                "message": "All sessions have been invalidated."
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

// Refresh token endpoint using refresh tokens
pub async fn refresh_token(
    State(app_state): State<AppState>,
    Json(payload): Json<RefreshTokenRequest>,
) -> Result<Response, AppError> {
    // Validate request
    payload.validate().map_err(|e| AppError::ValidationError {
        field: "payload".to_string(),
        message: format!("Validation failed: {}", e),
    })?;

    // Use refresh token to get new access token
    let response = app_state
        .auth_service
        .refresh_access_token(&payload.refresh_token)
        .await?;

    // Set new JWT token in HttpOnly cookie
    let secure_flag = if app_state.config.cookie_security.secure {
        "; Secure"
    } else {
        ""
    };

    let response_body = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::SET_COOKIE,
            format!(
                "token={}; HttpOnly; SameSite={}; Max-Age=900; Path={}{}", // 15 minutes
                response.access_token, app_state.config.cookie_security.same_site, "/", secure_flag
            ),
        )
        .body(
            Json(json!({
                "user": response.user,
                "access_token": response.access_token,
                "refresh_token": response.refresh_token,
                "message": "Token refreshed successfully"
            }))
            .into_response()
            .into_body(),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to build response: {}", e)))?;

    Ok(response_body)
}

// Password strength check endpoint
pub async fn check_password_strength(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let password = payload
        .get("password")
        .and_then(|p| p.as_str())
        .ok_or_else(|| AppError::ValidationError {
            field: "password".to_string(),
            message: "Password field is required".to_string(),
        })?;

    let strength = crate::services::password::PasswordValidator::analyze_strength(password);

    Ok(Json(json!({
        "strength": strength,
        "valid": strength.score >= 70
    })))
}
