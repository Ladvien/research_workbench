use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use tower_sessions::Session;

use crate::{
    app_state::AppState,
    error::AppError,
    models::UserResponse,
};

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
            .ok_or_else(|| AppError::AuthenticationError("No authentication token found".to_string()))?;

        // Validate the token and get user information
        let user = state.auth_service.get_current_user(&token).await?;

        Ok(user)
    }
}

// Helper function to extract token from cookies
fn extract_token_from_cookies(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|cookie| {
            let cookie = cookie.trim();
            if cookie.starts_with("token=") {
                Some(cookie[6..].to_string())
            } else {
                None
            }
        })
}

// Helper function to extract token from Authorization header
fn extract_token_from_header(parts: &Parts) -> Option<String> {
    let header_value = parts.headers.get(header::AUTHORIZATION)?.to_str().ok()?;

    if header_value.starts_with("Bearer ") {
        Some(header_value[7..].to_string())
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
        let session = Session::from_request_parts(parts, &()).await
            .map_err(|_| AppError::AuthenticationError("Session not available".to_string()))?;

        let user_id_str: Option<String> = session.get("user_id").await
            .map_err(|e| AppError::InternalServerError(format!("Session error: {}", e)))?;

        let user_id_str = user_id_str
            .ok_or_else(|| AppError::AuthenticationError("No user session found".to_string()))?;

        let user_id = uuid::Uuid::parse_str(&user_id_str)
            .map_err(|_| AppError::AuthenticationError("Invalid user ID in session".to_string()))?;

        let user = state.auth_service.get_user_by_id(user_id).await?
            .ok_or_else(|| AppError::AuthenticationError("User not found".to_string()))?;

        Ok(SessionUser(user.into()))
    }
}