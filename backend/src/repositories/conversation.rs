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

    pub fn pool(&self) -> &sqlx::PgPool {
        &self.database.pool
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
            SELECT id, user_id, title, model, provider, created_at, updated_at, metadata
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
        // Optimized: Use a single query with JOIN to avoid N+1 pattern
        let rows = sqlx::query(
            r#"
            SELECT
                c.id as conv_id, c.user_id, c.title, c.model, c.provider,
                c.created_at as conv_created_at, c.updated_at as conv_updated_at, c.metadata as conv_metadata,
                m.id as msg_id, m.conversation_id, m.parent_id, m.role, m.content,
                m.tokens_used, m.created_at as msg_created_at, m.is_active, m.metadata as msg_metadata
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id AND m.is_active = true
            WHERE c.id = $1 AND c.user_id = $2
            ORDER BY m.created_at ASC
            "#,
        )
        .bind(id)
        .bind(user_id)
        .fetch_all(&self.database.pool)
        .await?;

        if rows.is_empty() {
            return Ok(None);
        }

        // Process the joined results
        let first_row = &rows[0];
        let conversation = Conversation {
            id: first_row.get("conv_id"),
            user_id: first_row.get("user_id"),
            title: first_row.get("title"),
            model: first_row.get("model"),
            provider: first_row.get("provider"),
            created_at: first_row.get("conv_created_at"),
            updated_at: first_row.get("conv_updated_at"),
            metadata: first_row.get("conv_metadata"),
        };

        let mut messages = Vec::new();
        for row in rows {
            // Skip rows where message is null (LEFT JOIN with no messages)
            if let Some(msg_id) = row.try_get::<Option<Uuid>, _>("msg_id").unwrap_or(None) {
                messages.push(crate::models::Message {
                    id: msg_id,
                    conversation_id: row.get("conversation_id"),
                    parent_id: row.get("parent_id"),
                    role: row.get("role"),
                    content: row.get("content"),
                    tokens_used: row.get("tokens_used"),
                    created_at: row.get("msg_created_at"),
                    is_active: row.get("is_active"),
                    metadata: row.get("msg_metadata"),
                });
            }
        }

        Ok(Some(ConversationWithMessages {
            conversation,
            messages,
        }))
    }

    pub async fn create_from_request(
        &self,
        user_id: Uuid,
        request: CreateConversationRequest,
    ) -> Result<Conversation> {
        let id = Uuid::new_v4();
        let metadata = request.metadata.unwrap_or_else(|| serde_json::json!({}));

        // Determine provider based on model
        let provider = if request.model.starts_with("gpt-") {
            "openai"
        } else if request.model.starts_with("claude-") {
            if request.model.contains("code") {
                "claude_code"
            } else {
                "anthropic"
            }
        } else {
            "openai" // default
        };

        let conversation = sqlx::query_as::<_, Conversation>(
            r#"
            INSERT INTO conversations (id, user_id, title, model, provider, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, user_id, title, model, provider, created_at, updated_at, metadata
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(&request.title)
        .bind(&request.model)
        .bind(provider)
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
            SELECT id, user_id, title, model, provider, created_at, updated_at, metadata
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
            INSERT INTO conversations (id, user_id, title, model, provider, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, user_id, title, model, provider, created_at, updated_at, metadata
            "#,
        )
        .bind(conversation.id)
        .bind(conversation.user_id)
        .bind(&conversation.title)
        .bind(&conversation.model)
        .bind(&conversation.provider)
        .bind(&conversation.metadata)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(created)
    }

    async fn update(&self, conversation: Conversation) -> Result<Conversation> {
        let updated = sqlx::query_as::<_, Conversation>(
            r#"
            UPDATE conversations
            SET title = $2, model = $3, provider = $4, metadata = $5, updated_at = NOW()
            WHERE id = $1
            RETURNING id, user_id, title, model, provider, created_at, updated_at, metadata
            "#,
        )
        .bind(conversation.id)
        .bind(&conversation.title)
        .bind(&conversation.model)
        .bind(&conversation.provider)
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
