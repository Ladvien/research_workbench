use crate::{
    config::JwtConfig,
    error::AppError,
    models::{
        JwtClaims, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, User,
        UserResponse,
    },
    repositories::{user::UserRepository, Repository},
    services::session::SessionManager,
};
use anyhow::Result;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AuthService {
    user_repository: UserRepository,
    jwt_config: Arc<JwtConfig>,
    session_manager: Option<SessionManager>,
}

impl AuthService {
    pub fn new(user_repository: UserRepository, jwt_config: JwtConfig) -> Self {
        Self {
            user_repository,
            jwt_config: Arc::new(jwt_config),
            session_manager: None,
        }
    }

    pub fn with_session_manager(mut self, session_manager: SessionManager) -> Self {
        self.session_manager = Some(session_manager);
        self
    }

    pub async fn register(&self, request: RegisterRequest) -> Result<RegisterResponse, AppError> {
        // Check if email already exists
        if self.user_repository.email_exists(&request.email).await? {
            return Err(AppError::ValidationError {
                field: "email".to_string(),
                message: "Email already exists".to_string(),
            });
        }

        // Check if username already exists
        if self
            .user_repository
            .username_exists(&request.username)
            .await?
        {
            return Err(AppError::ValidationError {
                field: "username".to_string(),
                message: "Username already exists".to_string(),
            });
        }

        // Create user request
        let create_user_request = crate::models::CreateUserRequest {
            email: request.email.clone(),
            username: request.username.clone(),
            password: request.password,
        };

        // Create user
        let user = self
            .user_repository
            .create_from_request(create_user_request)
            .await?;

        // Generate JWT token
        let token = self.generate_jwt_token(&user)?;

        Ok(RegisterResponse {
            user: user.into(),
            access_token: token,
        })
    }

    pub async fn login(&self, request: LoginRequest) -> Result<LoginResponse, AppError> {
        // Find user by email
        let user = self
            .user_repository
            .find_by_email(&request.email)
            .await?
            .ok_or(AppError::AuthenticationError(
                "Invalid credentials".to_string(),
            ))?;

        // Verify password
        let is_valid = self
            .user_repository
            .verify_password(&user, &request.password)
            .await?;
        if !is_valid {
            return Err(AppError::AuthenticationError(
                "Invalid credentials".to_string(),
            ));
        }

        // Generate JWT token
        let token = self.generate_jwt_token(&user)?;

        Ok(LoginResponse {
            user: user.into(),
            access_token: token,
        })
    }

    pub fn generate_jwt_token(&self, user: &User) -> Result<String, AppError> {
        let now = Utc::now();
        let expiration = now + Duration::hours(24); // Token valid for 24 hours

        let claims = JwtClaims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            username: user.username.clone(),
            exp: expiration.timestamp() as usize,
            iat: now.timestamp() as usize,
            key_version: self.jwt_config.current_version,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_config.current_secret.as_bytes()),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to generate JWT: {}", e)))?;

        Ok(token)
    }

    pub fn validate_jwt_token(&self, token: &str) -> Result<JwtClaims, AppError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        // First, try to decode with current secret to get the version
        let current_secret_result = decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_config.current_secret.as_bytes()),
            &validation,
        );

        // If current secret works, return the result
        if let Ok(token_data) = current_secret_result {
            return Ok(token_data.claims);
        }

        // If current secret fails, try previous secrets for rotation support
        // We need to decode without verification first to get the key_version
        let mut no_verify_validation = Validation::new(Algorithm::HS256);
        no_verify_validation.validate_exp = false;
        no_verify_validation.insecure_disable_signature_validation();

        if let Ok(unverified_token) = decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(b"dummy"), // Won't be used due to validate_signature = false
            &no_verify_validation,
        ) {
            let key_version = unverified_token.claims.key_version;

            // Try to get the secret for this version
            if let Some(secret) = self.jwt_config.get_secret_for_version(key_version) {
                let token_data = decode::<JwtClaims>(
                    token,
                    &DecodingKey::from_secret(secret.as_bytes()),
                    &validation,
                )
                .map_err(|e| AppError::AuthenticationError(format!("Invalid token: {}", e)))?;

                return Ok(token_data.claims);
            }
        }

        // If all secrets fail, return authentication error
        Err(AppError::AuthenticationError(
            "Invalid or expired token".to_string(),
        ))
    }

    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, AppError> {
        self.user_repository
            .find_by_id(user_id)
            .await
            .map_err(|e| AppError::InternalServerError(format!("Failed to get user: {}", e)))
    }

    pub async fn get_current_user(&self, token: &str) -> Result<UserResponse, AppError> {
        let claims = self.validate_jwt_token(token)?;
        let user_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::AuthenticationError("Invalid user ID in token".to_string()))?;

        let user = self
            .get_user_by_id(user_id)
            .await?
            .ok_or(AppError::AuthenticationError("User not found".to_string()))?;

        Ok(user.into())
    }

    pub fn extract_user_id_from_token(&self, token: &str) -> Result<Uuid, AppError> {
        let claims = self.validate_jwt_token(token)?;
        Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::AuthenticationError("Invalid user ID in token".to_string()))
    }

    /// Change user password and invalidate all sessions
    pub async fn change_password(
        &self,
        user_id: Uuid,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), AppError> {
        // Get user and verify current password
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

        // Verify current password
        let is_valid = self
            .user_repository
            .verify_password(&user, current_password)
            .await?;
        if !is_valid {
            return Err(AppError::AuthenticationError(
                "Current password is incorrect".to_string(),
            ));
        }

        // Update password (this will be implemented in user repository)
        self.user_repository
            .update_password(user_id, new_password)
            .await?;

        // Invalidate all sessions for this user
        if let Some(session_manager) = &self.session_manager {
            session_manager.invalidate_user_sessions(user_id).await?;
            tracing::info!(
                "Invalidated all sessions for user {} after password change",
                user_id
            );
        }

        Ok(())
    }

    /// Invalidate all sessions for a user (for admin use)
    pub async fn invalidate_user_sessions(&self, user_id: Uuid) -> Result<(), AppError> {
        if let Some(session_manager) = &self.session_manager {
            session_manager.invalidate_user_sessions(user_id).await?;
            tracing::info!("Invalidated all sessions for user {}", user_id);
        }
        Ok(())
    }

    /// Get session count for a user (for monitoring)
    pub async fn get_user_session_count(&self, user_id: Uuid) -> Result<usize, AppError> {
        if let Some(session_manager) = &self.session_manager {
            session_manager.get_user_session_count(user_id).await
        } else {
            Ok(0)
        }
    }
}
