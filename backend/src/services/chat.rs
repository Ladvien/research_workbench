use crate::{
    models::{CreateMessageRequest, CreateMessageResponse, Message, MessageRole},
    repositories::Repository,
    services::DataAccessLayer,
};
use anyhow::Result;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ChatService {
    dal: DataAccessLayer,
}

impl ChatService {
    pub fn new(dal: DataAccessLayer) -> Self {
        Self { dal }
    }

    pub async fn send_message(
        &self,
        user_id: Uuid,
        conversation_id: Uuid,
        content: String,
    ) -> Result<CreateMessageResponse> {
        // Verify the conversation belongs to the user
        let conversation = self.dal.conversations().find_by_id(conversation_id).await?;

        match conversation {
            Some(conv) if conv.user_id == user_id => {
                // Create the user message
                let request = CreateMessageRequest {
                    conversation_id,
                    parent_id: None, // For now, we'll handle threading later
                    role: MessageRole::User,
                    content,
                    metadata: None,
                };

                self.dal.messages().create_from_request(request).await
            }
            Some(_) => Err(anyhow::anyhow!("Conversation not found or access denied")),
            None => Err(anyhow::anyhow!("Conversation not found")),
        }
    }

    pub async fn get_conversation_messages(
        &self,
        user_id: Uuid,
        conversation_id: Uuid,
    ) -> Result<Vec<Message>> {
        // Verify the conversation belongs to the user
        let conversation = self.dal.conversations().find_by_id(conversation_id).await?;

        match conversation {
            Some(conv) if conv.user_id == user_id => {
                self.dal
                    .messages()
                    .find_by_conversation_id(conversation_id)
                    .await
            }
            Some(_) => Err(anyhow::anyhow!("Conversation not found or access denied")),
            None => Err(anyhow::anyhow!("Conversation not found")),
        }
    }

    pub async fn send_assistant_message(
        &self,
        conversation_id: Uuid,
        content: String,
    ) -> Result<CreateMessageResponse> {
        self.create_assistant_response(conversation_id, content, None, None)
            .await
    }

    pub async fn create_assistant_response(
        &self,
        conversation_id: Uuid,
        content: String,
        tokens_used: Option<i32>,
        parent_id: Option<Uuid>,
    ) -> Result<CreateMessageResponse> {
        let request = CreateMessageRequest {
            conversation_id,
            parent_id,
            role: MessageRole::Assistant,
            content,
            metadata: Some(
                tokens_used
                    .map(|t| serde_json::json!({"tokens_used": t}))
                    .unwrap_or_else(|| serde_json::json!({})),
            ),
        };

        let response = self.dal.messages().create_from_request(request).await?;

        // Update token count if provided
        if let Some(tokens) = tokens_used {
            self.dal
                .messages()
                .update_tokens(response.id, tokens)
                .await?;
        }

        Ok(response)
    }

    pub async fn create_message_branch(
        &self,
        user_id: Uuid,
        parent_id: Uuid,
        content: String,
        role: MessageRole,
    ) -> Result<Message> {
        // Verify the parent message exists and belongs to a conversation owned by the user
        let parent = self
            .dal
            .messages()
            .find_by_id(parent_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Parent message not found"))?;

        let conversation = self
            .dal
            .conversations()
            .find_by_id(parent.conversation_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Conversation not found"))?;

        if conversation.user_id != user_id {
            return Err(anyhow::anyhow!("Access denied"));
        }

        self.dal
            .messages()
            .create_branch(parent_id, content, role)
            .await
    }

    pub async fn get_message_thread(
        &self,
        user_id: Uuid,
        message_id: Uuid,
    ) -> Result<Vec<Message>> {
        // Get the message to verify ownership
        let message = self
            .dal
            .messages()
            .find_by_id(message_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Message not found"))?;

        let conversation = self
            .dal
            .conversations()
            .find_by_id(message.conversation_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Conversation not found"))?;

        if conversation.user_id != user_id {
            return Err(anyhow::anyhow!("Access denied"));
        }

        self.dal
            .messages()
            .find_conversation_thread(message_id)
            .await
    }

    pub async fn update_message_tokens(&self, message_id: Uuid, tokens_used: i32) -> Result<bool> {
        self.dal
            .messages()
            .update_tokens(message_id, tokens_used)
            .await
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, serde::Serialize)]
pub struct ChatResponse {
    pub message: CreateMessageResponse,
    pub conversation_id: Uuid,
}

#[derive(Debug, serde::Serialize)]
pub struct ConversationMessagesResponse {
    pub conversation_id: Uuid,
    pub messages: Vec<Message>,
    pub total_count: i64,
}
