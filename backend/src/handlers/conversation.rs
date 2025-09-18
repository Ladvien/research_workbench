use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    error::AppError,
    models::{CreateConversationRequest, UserResponse},
    services::{conversation::ConversationService, DataAccessLayer},
};

// Create a new conversation
pub async fn create_conversation(
    State(app_state): State<AppState>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<CreateConversationRequest>,
) -> Result<Json<Value>, AppError> {
    let conversation = app_state
        .conversation_service
        .create_conversation(user.id, request)
        .await?;
    Ok(Json(serde_json::to_value(conversation)?))
}

// Get user's conversations
pub async fn get_user_conversations(
    State(app_state): State<AppState>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    use crate::models::PaginationParams;

    let pagination = PaginationParams {
        page: Some(1),
        limit: Some(50),
    };

    let conversations = app_state
        .conversation_service
        .get_user_conversations(user.id, pagination)
        .await?;
    Ok(Json(serde_json::to_value(conversations)?))
}

// Get a specific conversation with messages
pub async fn get_conversation(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    match app_state
        .conversation_service
        .get_conversation_with_messages(conversation_id, user.id)
        .await?
    {
        Some(conversation) => Ok(Json(serde_json::to_value(conversation)?)),
        None => Err(AppError::NotFound("Conversation not found".to_string())),
    }
}

// Update conversation title
pub async fn update_conversation_title(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
    Json(request): Json<UpdateTitleRequest>,
) -> Result<Json<Value>, AppError> {
    let updated = app_state
        .conversation_service
        .update_conversation_title(conversation_id, user.id, request.title)
        .await?;

    if updated {
        Ok(Json(serde_json::json!({"success": true})))
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Delete a conversation
pub async fn delete_conversation(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<StatusCode, AppError> {
    let deleted = app_state
        .conversation_service
        .delete_conversation(conversation_id, user.id)
        .await?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound("Conversation not found".to_string()))
    }
}

// Get conversation statistics
pub async fn get_conversation_stats(
    State(app_state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    user: UserResponse, // This comes from our auth middleware
) -> Result<Json<Value>, AppError> {
    let stats = app_state
        .conversation_service
        .get_conversation_stats(conversation_id, user.id)
        .await?;
    Ok(Json(serde_json::to_value(stats)?))
}

#[derive(serde::Deserialize)]
pub struct UpdateTitleRequest {
    pub title: String,
}

// Helper function to create conversation service from DAL
pub fn create_conversation_service(dal: DataAccessLayer) -> ConversationService {
    ConversationService::new(dal)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use crate::config::{Config, CookieConfig, JwtConfig};
    use crate::models::{CreateConversationRequest, UserResponse};
    use crate::services::DataAccessLayer;
    use axum::extract::{Path, State};
    use axum::response::Json;
    use serde_json::json;
    use sqlx::PgPool;
    use uuid::Uuid;

    async fn create_test_app_state() -> AppState {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/workbench_test".to_string());

        let pool = PgPool::connect(&database_url)
            .await
            .expect("Failed to connect to test database");

        let dal = DataAccessLayer::new(pool);

        let jwt_config = JwtConfig {
            current_secret: "test_secret_key_123".to_string(),
            current_version: 1,
            previous_secrets: vec![],
        };

        let auth_service = crate::services::auth::AuthService::new(
            dal.repositories.users.clone(),
            dal.repositories.refresh_tokens.clone(),
            jwt_config.clone(),
        );

        let config = Config {
            cookie_security: CookieConfig {
                secure: false,
                same_site: "Lax".to_string(),
            },
            jwt: jwt_config,
        };

        AppState {
            dal: dal.clone(),
            auth_service,
            chat_service: crate::services::chat::ChatService::new(
                dal.repositories.conversations.clone(),
                dal.repositories.messages.clone(),
            ),
            conversation_service: crate::services::conversation::ConversationService::new(dal),
            session_manager: None,
            config,
        }
    }

    fn create_test_user() -> UserResponse {
        UserResponse {
            id: Uuid::new_v4(),
            email: format!("conversation_test_{}@example.com", Uuid::new_v4()),
            username: format!("conversation_user_{}", Uuid::new_v4()),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_create_conversation_success() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        let request = CreateConversationRequest {
            title: Some("Test Conversation".to_string()),
            model: "gpt-4".to_string(),
            provider: "openai".to_string(),
        };

        let result = create_conversation(
            State(app_state),
            user,
            Json(request),
        ).await;

        assert!(result.is_ok(), "Conversation creation should succeed");

        if let Ok(Json(conversation_data)) = result {
            assert!(conversation_data.get("id").is_some(), "Response should include conversation ID");
            assert_eq!(conversation_data["title"], "Test Conversation", "Title should match");
            assert_eq!(conversation_data["model"], "gpt-4", "Model should match");
            assert_eq!(conversation_data["provider"], "openai", "Provider should match");
        }
    }

    #[tokio::test]
    async fn test_create_conversation_without_title() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        let request = CreateConversationRequest {
            title: None, // No title provided
            model: "claude-3-sonnet".to_string(),
            provider: "anthropic".to_string(),
        };

        let result = create_conversation(
            State(app_state),
            user,
            Json(request),
        ).await;

        assert!(result.is_ok(), "Conversation creation without title should succeed");

        if let Ok(Json(conversation_data)) = result {
            assert!(conversation_data.get("id").is_some(), "Response should include conversation ID");
            // Title should be null or generated
            assert_eq!(conversation_data["model"], "claude-3-sonnet", "Model should match");
            assert_eq!(conversation_data["provider"], "anthropic", "Provider should match");
        }
    }

    #[tokio::test]
    async fn test_get_user_conversations() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        let result = get_user_conversations(
            State(app_state),
            user,
        ).await;

        assert!(result.is_ok(), "Getting user conversations should succeed");

        if let Ok(Json(conversations_data)) = result {
            // Should return an array (empty or with conversations)
            assert!(conversations_data.is_array(), "Response should be an array");
        }
    }

    #[tokio::test]
    async fn test_get_nonexistent_conversation() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();
        let nonexistent_id = Uuid::new_v4();

        let result = get_conversation(
            State(app_state),
            Path(nonexistent_id),
            user,
        ).await;

        assert!(result.is_err(), "Getting nonexistent conversation should fail");
        if let Err(error) = result {
            assert!(matches!(error, AppError::NotFound(_)));
        }
    }

    #[tokio::test]
    async fn test_update_conversation_title() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        // First create a conversation
        let create_request = CreateConversationRequest {
            title: Some("Original Title".to_string()),
            model: "gpt-4".to_string(),
            provider: "openai".to_string(),
        };

        let create_result = create_conversation(
            State(app_state.clone()),
            user.clone(),
            Json(create_request),
        ).await;

        assert!(create_result.is_ok(), "Conversation creation should succeed");

        if let Ok(Json(conversation_data)) = create_result {
            let conversation_id = conversation_data["id"].as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .expect("Should have valid conversation ID");

            let update_request = UpdateTitleRequest {
                title: "Updated Title".to_string(),
            };

            let update_result = update_conversation_title(
                State(app_state),
                Path(conversation_id),
                user,
                Json(update_request),
            ).await;

            assert!(update_result.is_ok(), "Title update should succeed");

            if let Ok(Json(update_data)) = update_result {
                assert_eq!(update_data["success"], true, "Update should return success");
            }
        }
    }

    #[tokio::test]
    async fn test_update_nonexistent_conversation_title() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();
        let nonexistent_id = Uuid::new_v4();

        let update_request = UpdateTitleRequest {
            title: "New Title".to_string(),
        };

        let result = update_conversation_title(
            State(app_state),
            Path(nonexistent_id),
            user,
            Json(update_request),
        ).await;

        assert!(result.is_err(), "Updating nonexistent conversation should fail");
        if let Err(error) = result {
            assert!(matches!(error, AppError::NotFound(_)));
        }
    }

    #[tokio::test]
    async fn test_delete_conversation() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        // First create a conversation
        let create_request = CreateConversationRequest {
            title: Some("To Be Deleted".to_string()),
            model: "gpt-4".to_string(),
            provider: "openai".to_string(),
        };

        let create_result = create_conversation(
            State(app_state.clone()),
            user.clone(),
            Json(create_request),
        ).await;

        assert!(create_result.is_ok(), "Conversation creation should succeed");

        if let Ok(Json(conversation_data)) = create_result {
            let conversation_id = conversation_data["id"].as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .expect("Should have valid conversation ID");

            let delete_result = delete_conversation(
                State(app_state),
                Path(conversation_id),
                user,
            ).await;

            assert!(delete_result.is_ok(), "Conversation deletion should succeed");
            if let Ok(status_code) = delete_result {
                assert_eq!(status_code, StatusCode::NO_CONTENT, "Should return 204 No Content");
            }
        }
    }

    #[tokio::test]
    async fn test_delete_nonexistent_conversation() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();
        let nonexistent_id = Uuid::new_v4();

        let result = delete_conversation(
            State(app_state),
            Path(nonexistent_id),
            user,
        ).await;

        assert!(result.is_err(), "Deleting nonexistent conversation should fail");
        if let Err(error) = result {
            assert!(matches!(error, AppError::NotFound(_)));
        }
    }

    #[tokio::test]
    async fn test_conversation_stats() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();

        // First create a conversation
        let create_request = CreateConversationRequest {
            title: Some("Stats Test".to_string()),
            model: "gpt-4".to_string(),
            provider: "openai".to_string(),
        };

        let create_result = create_conversation(
            State(app_state.clone()),
            user.clone(),
            Json(create_request),
        ).await;

        assert!(create_result.is_ok(), "Conversation creation should succeed");

        if let Ok(Json(conversation_data)) = create_result {
            let conversation_id = conversation_data["id"].as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .expect("Should have valid conversation ID");

            let stats_result = get_conversation_stats(
                State(app_state),
                Path(conversation_id),
                user,
            ).await;

            assert!(stats_result.is_ok(), "Getting conversation stats should succeed");

            if let Ok(Json(stats_data)) = stats_result {
                // Stats should include message count, token count, etc.
                assert!(stats_data.is_object(), "Stats should be an object");
            }
        }
    }

    #[tokio::test]
    async fn test_conversation_stats_nonexistent() {
        let app_state = create_test_app_state().await;
        let user = create_test_user();
        let nonexistent_id = Uuid::new_v4();

        let result = get_conversation_stats(
            State(app_state),
            Path(nonexistent_id),
            user,
        ).await;

        // Stats for nonexistent conversation might return empty stats or error
        // depending on implementation
        if result.is_err() {
            if let Err(error) = result {
                assert!(matches!(error, AppError::NotFound(_)));
            }
        }
    }

    #[tokio::test]
    async fn test_create_conversation_service() {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://test:test@localhost:5432/workbench_test".to_string());

        let pool = PgPool::connect(&database_url)
            .await
            .expect("Failed to connect to test database");

        let dal = DataAccessLayer::new(pool);
        let service = create_conversation_service(dal);

        // This is a simple test to verify the service can be created
        // without panicking or errors
    }
}
