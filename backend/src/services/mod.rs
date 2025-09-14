pub mod chat;
pub mod conversation;

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
}