use crate::{
    config::AppConfig,
    services::{
        auth::AuthService, chat::ChatService, conversation::ConversationService, DataAccessLayer,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub auth_service: AuthService,
    pub conversation_service: ConversationService,
    pub chat_service: ChatService,
    pub dal: DataAccessLayer,
    pub config: AppConfig,
}

impl AppState {
    pub fn new(
        auth_service: AuthService,
        conversation_service: ConversationService,
        chat_service: ChatService,
        dal: DataAccessLayer,
        config: AppConfig,
    ) -> Self {
        Self {
            auth_service,
            conversation_service,
            chat_service,
            dal,
            config,
        }
    }
}
