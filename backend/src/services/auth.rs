use crate::{
    config::JwtConfig,
    error::AppError,
    models::{
        JwtClaims, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, User,
        UserResponse,
    },
    repositories::{refresh_token::RefreshTokenRepository, user::UserRepository, Repository},
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
    refresh_token_repository: RefreshTokenRepository,
    jwt_config: Arc<JwtConfig>,
    session_manager: Option<SessionManager>,
}

impl AuthService {
    pub fn new(
        user_repository: UserRepository,
        refresh_token_repository: RefreshTokenRepository,
        jwt_config: JwtConfig,
    ) -> Self {
        Self {
            user_repository,
            refresh_token_repository,
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

        // Generate JWT token (15 minutes)
        let access_token = self.generate_jwt_token(&user)?;

        // Generate refresh token (7 days)
        let refresh_token = RefreshTokenRepository::generate_refresh_token();
        self.refresh_token_repository
            .create_refresh_token(user.id, &refresh_token)
            .await?;

        Ok(RegisterResponse {
            user: user.into(),
            access_token,
            refresh_token,
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

        // TODO: Account lockout check - commented out until database migration is ready
        // if self.user_repository.is_account_locked(user.id).await? {
        //     return Err(AppError::AuthenticationError(
        //         "Account temporarily locked due to multiple failed login attempts".to_string(),
        //     ));
        // }

        // Verify password
        let is_valid = self
            .user_repository
            .verify_password(&user, &request.password)
            .await?;

        if !is_valid {
            // TODO: Record failed login attempt - commented out until database migration is ready
            // self.user_repository.record_failed_login(user.id).await?;
            return Err(AppError::AuthenticationError(
                "Invalid credentials".to_string(),
            ));
        }

        // TODO: Reset failed attempts on successful login - commented out until database migration is ready
        // self.user_repository.reset_failed_attempts(user.id).await?;

        // Generate JWT token (15 minutes)
        let access_token = self.generate_jwt_token(&user)?;

        // Generate refresh token (7 days)
        let refresh_token = RefreshTokenRepository::generate_refresh_token();
        self.refresh_token_repository
            .create_refresh_token(user.id, &refresh_token)
            .await?;

        Ok(LoginResponse {
            user: user.into(),
            access_token,
            refresh_token,
        })
    }

    pub fn generate_jwt_token(&self, user: &User) -> Result<String, AppError> {
        let now = Utc::now();
        let expiration = now + Duration::minutes(15); // Token valid for 15 minutes

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

    /// Generate access token for a user (for refresh endpoint)
    pub async fn generate_access_token(&self, user_id: Uuid) -> Result<String, AppError> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

        self.generate_jwt_token(&user)
    }

    /// Refresh access token using refresh token
    pub async fn refresh_access_token(
        &self,
        refresh_token: &str,
    ) -> Result<LoginResponse, AppError> {
        // Find refresh token in database
        let token_record = self
            .refresh_token_repository
            .find_by_token_hash(refresh_token)
            .await?
            .ok_or_else(|| {
                AppError::AuthenticationError("Invalid or expired refresh token".to_string())
            })?;

        // Get user
        let user = self
            .user_repository
            .find_by_id(token_record.user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

        // Generate new access token
        let access_token = self.generate_jwt_token(&user)?;

        // Implement refresh token rotation: invalidate old token and create new one
        self.refresh_token_repository
            .invalidate_token(refresh_token)
            .await?;
        let new_refresh_token = RefreshTokenRepository::generate_refresh_token();
        self.refresh_token_repository
            .create_refresh_token(user.id, &new_refresh_token)
            .await?;

        Ok(LoginResponse {
            user: user.into(),
            access_token,
            refresh_token: new_refresh_token,
        })
    }

    /// Logout - invalidate refresh token
    pub async fn logout_with_refresh_token(&self, refresh_token: &str) -> Result<(), AppError> {
        self.refresh_token_repository
            .invalidate_token(refresh_token)
            .await?;
        Ok(())
    }

    /// Admin function to unlock a user account (TODO: implement after database migration)
    pub async fn admin_unlock_account(
        &self,
        _user_id: Uuid,
        _admin_user_id: Uuid,
    ) -> Result<(), AppError> {
        // TODO: Implement after database migration adds lockout fields
        Err(AppError::InternalServerError(
            "Account unlock feature not yet implemented - requires database migration".to_string(),
        ))
    }

    /// Get account lockout status (TODO: implement after database migration)
    pub async fn get_account_lockout_status(
        &self,
        _user_id: Uuid,
    ) -> Result<Option<(i32, Option<chrono::DateTime<chrono::Utc>>)>, AppError> {
        // TODO: Implement after database migration adds lockout fields
        Ok(None)
    }

    /// Background task to unlock expired accounts (TODO: implement after database migration)
    pub async fn unlock_expired_accounts(&self) -> Result<i32, AppError> {
        // TODO: Implement after database migration adds lockout fields
        Ok(0)
    }
}
