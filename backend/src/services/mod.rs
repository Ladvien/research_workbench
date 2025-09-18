pub mod auth;
pub mod chat;
pub mod conversation;
pub mod embedding;
// pub mod file;  // Temporarily disabled
pub mod password;
pub mod redis_session_store;
pub mod session;

use crate::{database::Database, repositories::RepositoryManager};
use std::sync::Arc;

// Data Access Layer - combines repositories and provides business logic
#[derive(Debug, Clone)]
pub struct DataAccessLayer {
    pub repositories: Arc<RepositoryManager>,
}

impl DataAccessLayer {
    pub fn new(database: Database) -> Self {
        let repositories = Arc::new(RepositoryManager::new(database));
        Self { repositories }
    }

    // Convenience methods to access repositories
    pub fn conversations(&self) -> &crate::repositories::conversation::ConversationRepository {
        &self.repositories.conversations
    }

    pub fn messages(&self) -> &crate::repositories::message::MessageRepository {
        &self.repositories.messages
    }

    pub fn users(&self) -> &crate::repositories::user::UserRepository {
        &self.repositories.users
    }

    pub fn attachments(&self) -> &crate::repositories::attachment::AttachmentRepository {
        &self.repositories.attachments
    }

    pub fn embeddings(&self) -> &crate::repositories::embedding::EmbeddingRepository {
        &self.repositories.embeddings
    }

    pub fn refresh_tokens(&self) -> &crate::repositories::refresh_token::RefreshTokenRepository {
        &self.repositories.refresh_tokens
    }
}
