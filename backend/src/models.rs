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
    pub provider: String,
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
#[sqlx(type_name = "varchar")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageEmbedding {
    pub id: Uuid,
    pub message_id: Uuid,
    pub embedding: Vec<f32>,
    pub created_at: DateTime<Utc>,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for MessageEmbedding {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;

        Ok(MessageEmbedding {
            id: row.try_get("id")?,
            message_id: row.try_get("message_id")?,
            embedding: row.try_get("embedding")?,
            created_at: row.try_get("created_at")?,
        })
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiUsage {
    pub id: Uuid,
    pub user_id: Uuid,
    pub model: String,
    pub provider: String,
    pub tokens_prompt: Option<i32>,
    pub tokens_completion: Option<i32>,
    pub cost_cents: Option<i32>,
    pub created_at: DateTime<Utc>,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for ApiUsage {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;

        Ok(ApiUsage {
            id: row.try_get("id")?,
            user_id: row.try_get("user_id")?,
            model: row.try_get("model")?,
            provider: row.try_get("provider")?,
            tokens_prompt: row.try_get("tokens_prompt")?,
            tokens_completion: row.try_get("tokens_completion")?,
            cost_cents: row.try_get("cost_cents")?,
            created_at: row.try_get("created_at")?,
        })
    }
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
    pub provider: Option<String>,
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

// Authentication DTOs
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 6))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub user: UserResponse,
    pub access_token: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            username: user.username,
            created_at: user.created_at,
        }
    }
}

// JWT Claims
#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String, // user_id
    pub email: String,
    pub username: String,
    pub exp: usize, // expiration time
    pub iat: usize, // issued at
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 3, max = 100))]
    pub username: String,
    #[validate(length(min = 6))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub user: UserResponse,
    pub access_token: String,
}

// File attachment DTOs
#[derive(Debug, Deserialize, Validate)]
pub struct FileUploadRequest {
    pub message_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct FileUploadResponse {
    pub id: Uuid,
    pub message_id: Uuid,
    pub filename: String,
    pub content_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub upload_url: String,
    pub created_at: DateTime<Utc>,
}

impl From<Attachment> for FileUploadResponse {
    fn from(attachment: Attachment) -> Self {
        Self {
            id: attachment.id,
            message_id: attachment.message_id,
            filename: attachment.filename,
            content_type: attachment.content_type,
            size_bytes: attachment.size_bytes,
            upload_url: format!("/api/files/{}", attachment.id),
            created_at: attachment.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AttachmentResponse {
    pub id: Uuid,
    pub filename: String,
    pub content_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub download_url: String,
    pub created_at: DateTime<Utc>,
}

impl From<Attachment> for AttachmentResponse {
    fn from(attachment: Attachment) -> Self {
        Self {
            id: attachment.id,
            filename: attachment.filename,
            content_type: attachment.content_type,
            size_bytes: attachment.size_bytes,
            download_url: format!("/api/files/{}", attachment.id),
            created_at: attachment.created_at,
        }
    }
}

// Branching-related DTOs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub parent_id: Uuid,
    pub branch_count: u32,
    pub branches: Vec<BranchOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchOption {
    pub id: Uuid,
    pub preview: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize, Validate)]
pub struct EditMessageRequest {
    #[validate(length(min = 1))]
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct EditMessageResponse {
    pub message: Message,
    pub affected_messages: Vec<Uuid>, // Messages that were deactivated
}

#[derive(Debug, Deserialize)]
pub struct SwitchBranchRequest {
    pub target_message_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct SwitchBranchResponse {
    pub active_messages: Vec<Message>,
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct ConversationTreeResponse {
    pub messages: Vec<Message>,
    pub branches: Vec<BranchInfo>,
    pub active_thread: Vec<Uuid>,
}

// Search-related DTOs
#[derive(Debug, Deserialize, Validate)]
pub struct SearchRequest {
    #[validate(length(min = 1, max = 500))]
    pub query: String,
    pub limit: Option<i64>,
    pub similarity_threshold: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<SearchResultResponse>,
    pub total_found: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResultResponse {
    pub message_id: Uuid,
    pub content: String,
    pub role: MessageRole,
    pub created_at: DateTime<Utc>,
    pub conversation_id: Uuid,
    pub conversation_title: Option<String>,
    pub similarity: f32,
    pub preview: String,
}

impl SearchResultResponse {
    pub fn from_search_result(result: crate::repositories::embedding::SearchResult) -> Self {
        let preview = if result.content.len() > 150 {
            format!("{}...", &result.content[..150])
        } else {
            result.content.clone()
        };

        Self {
            message_id: result.message_id,
            content: result.content,
            role: result.role,
            created_at: result.created_at,
            conversation_id: result.conversation_id,
            conversation_title: result.conversation_title,
            similarity: result.similarity,
            preview,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct EmbeddingJobResponse {
    pub processed_count: usize,
    pub success: bool,
}
