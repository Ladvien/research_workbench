use crate::{
    models::{User, JwtClaims, UserResponse, LoginRequest, RegisterRequest, LoginResponse, RegisterResponse},
    repositories::{user::UserRepository, Repository},
    error::AppError,
};
use anyhow::Result;
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey, Algorithm};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AuthService {
    user_repository: UserRepository,
    jwt_secret: Arc<String>,
}

impl AuthService {
    pub fn new(user_repository: UserRepository, jwt_secret: String) -> Self {
        Self {
            user_repository,
            jwt_secret: Arc::new(jwt_secret),
        }
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
        if self.user_repository.username_exists(&request.username).await? {
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
        let user = self.user_repository.create_from_request(create_user_request).await?;

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
            .ok_or(AppError::AuthenticationError("Invalid credentials".to_string()))?;

        // Verify password
        let is_valid = self.user_repository.verify_password(&user, &request.password).await?;
        if !is_valid {
            return Err(AppError::AuthenticationError("Invalid credentials".to_string()));
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
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_ref().as_bytes()),
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to generate JWT: {}", e)))?;

        Ok(token)
    }

    pub fn validate_jwt_token(&self, token: &str) -> Result<JwtClaims, AppError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let token_data = decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_ref().as_bytes()),
            &validation,
        )
        .map_err(|e| AppError::AuthenticationError(format!("Invalid token: {}", e)))?;

        Ok(token_data.claims)
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
}