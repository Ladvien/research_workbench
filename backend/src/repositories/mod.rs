pub mod api_usage;
pub mod attachment;
pub mod conversation;
pub mod embedding;
pub mod message;
pub mod user;

use crate::database::Database;
use anyhow::Result;
use async_trait::async_trait;

// Base repository trait for common operations
#[async_trait]
pub trait Repository<T, ID> {
    async fn find_by_id(&self, id: ID) -> Result<Option<T>>;
    async fn create(&self, entity: T) -> Result<T>;
    async fn update(&self, entity: T) -> Result<T>;
    async fn delete(&self, id: ID) -> Result<bool>;
}

// Repository factory to create repository instances
#[derive(Debug)]
pub struct RepositoryManager {
    pub api_usage: api_usage::ApiUsageRepository,
    pub attachments: attachment::AttachmentRepository,
    pub conversations: conversation::ConversationRepository,
    pub embeddings: embedding::EmbeddingRepository,
    pub messages: message::MessageRepository,
    pub users: user::UserRepository,
}

impl RepositoryManager {
    pub fn new(database: Database) -> Self {
        Self {
            api_usage: api_usage::ApiUsageRepository::new(database.clone()),
            attachments: attachment::AttachmentRepository::new(database.clone()),
            conversations: conversation::ConversationRepository::new(database.clone()),
            embeddings: embedding::EmbeddingRepository::new(database.pool()),
            messages: message::MessageRepository::new(database.clone()),
            users: user::UserRepository::new(database),
        }
    }
}
