use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Conversation {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: Option<String>,
    pub model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub role: MessageRole,
    pub content: String,
    pub tokens_used: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text")]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    #[sqlx(rename = "user")]
    User,
    #[sqlx(rename = "assistant")]
    Assistant,
    #[sqlx(rename = "system")]
    System,
}

impl std::str::FromStr for MessageRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(MessageRole::User),
            "assistant" => Ok(MessageRole::Assistant),
            "system" => Ok(MessageRole::System),
            _ => Err(format!("Invalid message role: {}", s)),
        }
    }
}

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let role_str = match self {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        };
        write!(f, "{}", role_str)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MessageEmbedding {
    pub id: Uuid,
    pub message_id: Uuid,
    pub embedding: Vec<f32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attachment {
    pub id: Uuid,
    pub message_id: Uuid,
    pub filename: String,
    pub content_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub storage_path: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiUsage {
    pub id: Uuid,
    pub user_id: Uuid,
    pub model: String,
    pub tokens_prompt: Option<i32>,
    pub tokens_completion: Option<i32>,
    pub cost_cents: Option<i32>,
    pub created_at: DateTime<Utc>,
}

// Request/Response DTOs
#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 3, max = 100))]
    pub username: String,
    #[validate(length(min = 6))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateConversationRequest {
    pub title: Option<String>,
    #[validate(length(min = 1))]
    pub model: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateMessageRequest {
    pub conversation_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub role: MessageRole,
    #[validate(length(min = 1))]
    pub content: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct CreateMessageResponse {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: MessageRole,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ConversationWithMessages {
    pub conversation: Conversation,
    pub messages: Vec<Message>,
}

#[derive(Debug, Serialize)]
pub struct PaginationParams {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: Some(1),
            limit: Some(20),
        }
    }
}