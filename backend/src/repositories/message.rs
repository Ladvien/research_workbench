use crate::{
    database::Database,
    models::{Message, MessageRole, CreateMessageRequest, CreateMessageResponse},
    repositories::Repository,
};
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct MessageRepository {
    database: Database,
}

impl MessageRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    pub async fn find_by_conversation_id(&self, conversation_id: Uuid) -> Result<Vec<Message>> {
        let messages = sqlx::query_as::<_, Message>(
            r#"
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM messages
            WHERE conversation_id = $1 AND is_active = true
            ORDER BY created_at ASC
            "#,
        )
        .bind(conversation_id)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(messages)
    }

    pub async fn create_from_request(
        &self,
        request: CreateMessageRequest,
    ) -> Result<CreateMessageResponse> {
        let id = Uuid::new_v4();
        let metadata = request.metadata.unwrap_or_else(|| serde_json::json!({}));
        let now = Utc::now();

        let message = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (id, conversation_id, parent_id, role, content, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            "#,
        )
        .bind(id)
        .bind(request.conversation_id)
        .bind(request.parent_id)
        .bind(request.role.to_string())
        .bind(&request.content)
        .bind(&metadata)
        .bind(now)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(CreateMessageResponse {
            id: message.id,
            conversation_id: message.conversation_id,
            role: message.role,
            content: message.content,
            created_at: message.created_at,
        })
    }

    pub async fn update_tokens(&self, id: Uuid, tokens_used: i32) -> Result<bool> {
        let rows_affected = sqlx::query(
            r#"
            UPDATE messages
            SET tokens_used = $1
            WHERE id = $2
            "#,
        )
        .bind(tokens_used)
        .bind(id)
        .execute(&self.database.pool)
        .await?
        .rows_affected();

        Ok(rows_affected > 0)
    }

    pub async fn find_conversation_thread(&self, message_id: Uuid) -> Result<Vec<Message>> {
        // This function returns all messages in the conversation thread leading up to and including the specified message
        let messages = sqlx::query_as::<_, Message>(
            r#"
            WITH RECURSIVE message_thread AS (
                -- Base case: start with the target message
                SELECT m.*, 0 as depth
                FROM messages m
                WHERE m.id = $1

                UNION ALL

                -- Recursive case: find parent messages
                SELECT m.*, mt.depth + 1
                FROM messages m
                INNER JOIN message_thread mt ON m.id = mt.parent_id
                WHERE mt.depth < 100  -- Prevent infinite recursion
            )
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM message_thread
            WHERE is_active = true
            ORDER BY depth DESC, created_at ASC
            "#,
        )
        .bind(message_id)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(messages)
    }

    pub async fn create_branch(&self, parent_id: Uuid, content: String, role: MessageRole) -> Result<Message> {
        let parent = self.find_by_id(parent_id).await?
            .ok_or_else(|| anyhow::anyhow!("Parent message not found"))?;

        // Deactivate sibling messages (other messages with the same parent)
        sqlx::query(
            r#"
            UPDATE messages
            SET is_active = false
            WHERE parent_id = $1 AND is_active = true
            "#,
        )
        .bind(parent_id)
        .execute(&self.database.pool)
        .await?;

        // Create new message
        let request = CreateMessageRequest {
            conversation_id: parent.conversation_id,
            parent_id: Some(parent_id),
            role,
            content,
            metadata: None,
        };

        let response = self.create_from_request(request).await?;
        self.find_by_id(response.id).await?.ok_or_else(|| anyhow::anyhow!("Created message not found"))
    }

    pub async fn count_by_conversation(&self, conversation_id: Uuid) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND is_active = true"
        )
        .bind(conversation_id)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(count)
    }
}

#[async_trait]
impl Repository<Message, Uuid> for MessageRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<Message>> {
        let message = sqlx::query_as::<_, Message>(
            r#"
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM messages
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.database.pool)
        .await?;

        Ok(message)
    }

    async fn create(&self, message: Message) -> Result<Message> {
        let created = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (id, conversation_id, parent_id, role, content, tokens_used, metadata, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            "#,
        )
        .bind(message.id)
        .bind(message.conversation_id)
        .bind(message.parent_id)
        .bind(message.role.to_string())
        .bind(&message.content)
        .bind(message.tokens_used)
        .bind(&message.metadata)
        .bind(message.is_active)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(created)
    }

    async fn update(&self, message: Message) -> Result<Message> {
        let updated = sqlx::query_as::<_, Message>(
            r#"
            UPDATE messages
            SET content = $2, tokens_used = $3, metadata = $4, is_active = $5
            WHERE id = $1
            RETURNING id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            "#,
        )
        .bind(message.id)
        .bind(&message.content)
        .bind(message.tokens_used)
        .bind(&message.metadata)
        .bind(message.is_active)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(updated)
    }

    async fn delete(&self, id: Uuid) -> Result<bool> {
        // Soft delete by setting is_active to false
        let rows_affected = sqlx::query(
            "UPDATE messages SET is_active = false WHERE id = $1"
        )
        .bind(id)
        .execute(&self.database.pool)
        .await?
        .rows_affected();

        Ok(rows_affected > 0)
    }
}