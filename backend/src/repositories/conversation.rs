use crate::{
    database::Database,
    models::{Conversation, ConversationWithMessages, CreateConversationRequest, PaginationParams},
    repositories::Repository,
};
use anyhow::Result;
use async_trait::async_trait;
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ConversationRepository {
    database: Database,
}

impl ConversationRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    pub async fn find_by_user_id(
        &self,
        user_id: Uuid,
        pagination: PaginationParams,
    ) -> Result<Vec<Conversation>> {
        let offset = ((pagination.page.unwrap_or(1) - 1) * pagination.limit.unwrap_or(20)) as i64;
        let limit = pagination.limit.unwrap_or(20) as i64;

        let conversations = sqlx::query_as::<_, Conversation>(
            r#"
            SELECT id, user_id, title, model, created_at, updated_at, metadata
            FROM conversations
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(conversations)
    }

    pub async fn find_with_messages(
        &self,
        id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ConversationWithMessages>> {
        // First get the conversation
        let conversation = sqlx::query_as::<_, Conversation>(
            r#"
            SELECT id, user_id, title, model, created_at, updated_at, metadata
            FROM conversations
            WHERE id = $1 AND user_id = $2
            "#,
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(&self.database.pool)
        .await?;

        if let Some(conv) = conversation {
            // Get all messages for this conversation
            let messages = sqlx::query_as(
                r#"
                SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
                FROM messages
                WHERE conversation_id = $1 AND is_active = true
                ORDER BY created_at ASC
                "#,
            )
            .bind(id)
            .fetch_all(&self.database.pool)
            .await?;

            Ok(Some(ConversationWithMessages {
                conversation: conv,
                messages,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn create_from_request(
        &self,
        user_id: Uuid,
        request: CreateConversationRequest,
    ) -> Result<Conversation> {
        let id = Uuid::new_v4();
        let metadata = request.metadata.unwrap_or_else(|| serde_json::json!({}));

        let conversation = sqlx::query_as::<_, Conversation>(
            r#"
            INSERT INTO conversations (id, user_id, title, model, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, title, model, created_at, updated_at, metadata
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(&request.title)
        .bind(&request.model)
        .bind(&metadata)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(conversation)
    }

    pub async fn update_title(&self, id: Uuid, user_id: Uuid, title: String) -> Result<bool> {
        let rows_affected = sqlx::query(
            r#"
            UPDATE conversations
            SET title = $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            "#,
        )
        .bind(&title)
        .bind(id)
        .bind(user_id)
        .execute(&self.database.pool)
        .await?
        .rows_affected();

        Ok(rows_affected > 0)
    }

    pub async fn count_by_user(&self, user_id: Uuid) -> Result<i64> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM conversations WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&self.database.pool)
            .await?;

        Ok(row.get("count"))
    }
}

#[async_trait]
impl Repository<Conversation, Uuid> for ConversationRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<Conversation>> {
        let conversation = sqlx::query_as::<_, Conversation>(
            r#"
            SELECT id, user_id, title, model, created_at, updated_at, metadata
            FROM conversations
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.database.pool)
        .await?;

        Ok(conversation)
    }

    async fn create(&self, conversation: Conversation) -> Result<Conversation> {
        let created = sqlx::query_as::<_, Conversation>(
            r#"
            INSERT INTO conversations (id, user_id, title, model, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, title, model, created_at, updated_at, metadata
            "#,
        )
        .bind(conversation.id)
        .bind(conversation.user_id)
        .bind(&conversation.title)
        .bind(&conversation.model)
        .bind(&conversation.metadata)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(created)
    }

    async fn update(&self, conversation: Conversation) -> Result<Conversation> {
        let updated = sqlx::query_as::<_, Conversation>(
            r#"
            UPDATE conversations
            SET title = $2, model = $3, metadata = $4, updated_at = NOW()
            WHERE id = $1
            RETURNING id, user_id, title, model, created_at, updated_at, metadata
            "#,
        )
        .bind(conversation.id)
        .bind(&conversation.title)
        .bind(&conversation.model)
        .bind(&conversation.metadata)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(updated)
    }

    async fn delete(&self, id: Uuid) -> Result<bool> {
        let rows_affected = sqlx::query("DELETE FROM conversations WHERE id = $1")
            .bind(id)
            .execute(&self.database.pool)
            .await?
            .rows_affected();

        Ok(rows_affected > 0)
    }
}
