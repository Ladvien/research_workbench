use crate::{
    models::{Conversation, ConversationWithMessages, CreateConversationRequest, PaginationParams},
    repositories::Repository,
    services::DataAccessLayer,
};
use anyhow::Result;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ConversationService {
    dal: DataAccessLayer,
}

impl ConversationService {
    pub fn new(dal: DataAccessLayer) -> Self {
        Self { dal }
    }

    pub async fn create_conversation(
        &self,
        user_id: Uuid,
        request: CreateConversationRequest,
    ) -> Result<Conversation> {
        // Validate that the model is supported
        if !self.is_model_supported(&request.model) {
            return Err(anyhow::anyhow!("Unsupported model: {}", request.model));
        }

        self.dal
            .conversations()
            .create_from_request(user_id, request)
            .await
    }

    pub async fn get_user_conversations(
        &self,
        user_id: Uuid,
        pagination: PaginationParams,
    ) -> Result<Vec<Conversation>> {
        self.dal
            .conversations()
            .find_by_user_id(user_id, pagination)
            .await
    }

    pub async fn get_conversation_with_messages(
        &self,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ConversationWithMessages>> {
        self.dal
            .conversations()
            .find_with_messages(conversation_id, user_id)
            .await
    }

    pub async fn update_conversation_title(
        &self,
        conversation_id: Uuid,
        user_id: Uuid,
        title: String,
    ) -> Result<bool> {
        // Validate title length
        if title.trim().is_empty() || title.len() > 255 {
            return Err(anyhow::anyhow!(
                "Title must be between 1 and 255 characters"
            ));
        }

        self.dal
            .conversations()
            .update_title(conversation_id, user_id, title.trim().to_string())
            .await
    }

    pub async fn delete_conversation(&self, conversation_id: Uuid, user_id: Uuid) -> Result<bool> {
        // First verify the conversation belongs to the user
        let conversation = self
            .dal
            .conversations()
            .find_with_messages(conversation_id, user_id)
            .await?;

        if conversation.is_some() {
            self.dal
                .repositories
                .conversations
                .delete(conversation_id)
                .await
        } else {
            Ok(false)
        }
    }

    pub async fn get_conversation_stats(
        &self,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<ConversationStats> {
        // Verify conversation belongs to user
        let conversation = self.dal.conversations().find_by_id(conversation_id).await?;

        match conversation {
            Some(conv) if conv.user_id == user_id => {
                let message_count = self
                    .dal
                    .messages()
                    .count_by_conversation(conversation_id)
                    .await?;

                Ok(ConversationStats {
                    conversation_id,
                    message_count,
                    created_at: conv.created_at,
                    updated_at: conv.updated_at,
                })
            }
            Some(_) => Err(anyhow::anyhow!("Conversation not found or access denied")),
            None => Err(anyhow::anyhow!("Conversation not found")),
        }
    }

    fn is_model_supported(&self, model: &str) -> bool {
        // List of supported models - this could be moved to configuration
        matches!(
            model,
            "gpt-4"
                | "gpt-4-turbo"
                | "gpt-3.5-turbo"
                | "claude-3-opus"
                | "claude-3-sonnet"
                | "claude-3-haiku"
        )
    }

    pub async fn generate_title_from_first_message(
        &self,
        conversation_id: Uuid,
    ) -> Result<Option<String>> {
        let messages = self
            .dal
            .messages()
            .find_by_conversation_id(conversation_id)
            .await?;

        if let Some(first_message) = messages.first() {
            // Generate a title from the first 50 characters of the first user message
            let title = first_message.content.chars().take(50).collect::<String>();

            let title = if title.len() == 50 {
                format!("{}...", title)
            } else {
                title
            };

            Ok(Some(title))
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct ConversationStats {
    pub conversation_id: Uuid,
    pub message_count: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
