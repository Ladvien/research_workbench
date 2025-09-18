use crate::{
    config::AppConfig,
    database::Database,
    services::{
        auth::AuthService, chat::ChatService, conversation::ConversationService,
        session::SessionManager, DataAccessLayer,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub auth_service: AuthService,
    pub conversation_service: ConversationService,
    pub chat_service: ChatService,
    pub dal: DataAccessLayer,
    pub config: AppConfig,
    pub session_manager: Option<SessionManager>,
}

impl AppState {
    pub fn new(
        auth_service: AuthService,
        conversation_service: ConversationService,
        chat_service: ChatService,
        dal: DataAccessLayer,
        config: AppConfig,
        session_manager: Option<SessionManager>,
    ) -> Self {
        Self {
            auth_service,
            conversation_service,
            chat_service,
            dal,
            config,
            session_manager,
        }
    }

    /// Create AppState with just a database (for testing)
    pub fn new_with_database(database: Database) -> Self {
        let _pool = database.pool();
        let config = AppConfig::default();
        let dal = DataAccessLayer::new(database.clone());

        Self {
            auth_service: AuthService::new(
                dal.repositories.users.clone(),
                dal.repositories.refresh_tokens.clone(),
                config.jwt_config.clone(),
            ),
            conversation_service: ConversationService::new(dal.clone()),
            chat_service: ChatService::new(dal.clone()),
            dal,
            config,
            session_manager: None,
        }
    }
}
