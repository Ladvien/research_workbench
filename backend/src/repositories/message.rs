use crate::{
    database::Database,
    models::{
        BranchInfo, BranchOption, CreateMessageRequest, CreateMessageResponse, Message, MessageRole,
    },
    repositories::Repository,
};
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

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

    pub async fn create_branch(
        &self,
        parent_id: Uuid,
        content: String,
        role: MessageRole,
    ) -> Result<Message> {
        let parent = self
            .find_by_id(parent_id)
            .await?
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
        self.find_by_id(response.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Created message not found"))
    }

    pub async fn count_by_conversation(&self, conversation_id: Uuid) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND is_active = true",
        )
        .bind(conversation_id)
        .fetch_one(&self.database.pool)
        .await?;

        Ok(count)
    }

    /// Get all branches for a specific message (children of the message)
    pub async fn find_message_branches(&self, message_id: Uuid) -> Result<Vec<Message>> {
        let branches = sqlx::query_as::<_, Message>(
            r#"
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM messages
            WHERE parent_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(message_id)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(branches)
    }

    /// Get the full tree structure for a conversation with active branch paths
    pub async fn find_conversation_tree(&self, conversation_id: Uuid) -> Result<Vec<Message>> {
        let messages = sqlx::query_as::<_, Message>(
            r#"
            WITH RECURSIVE conversation_tree AS (
                -- Base case: root messages (no parent)
                SELECT m.*, 0 as depth, ARRAY[m.id] as path
                FROM messages m
                WHERE m.conversation_id = $1 AND m.parent_id IS NULL

                UNION ALL

                -- Recursive case: find child messages
                SELECT m.*, ct.depth + 1, ct.path || m.id
                FROM messages m
                INNER JOIN conversation_tree ct ON m.parent_id = ct.id
                WHERE m.conversation_id = $1 AND ct.depth < 100
            )
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM conversation_tree
            ORDER BY depth ASC, created_at ASC
            "#,
        )
        .bind(conversation_id)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(messages)
    }

    /// Get the current active conversation thread (following is_active flags)
    pub async fn find_active_conversation_thread(
        &self,
        conversation_id: Uuid,
    ) -> Result<Vec<Message>> {
        let messages = sqlx::query_as::<_, Message>(
            r#"
            WITH RECURSIVE active_thread AS (
                -- Base case: root message that's active
                SELECT m.*, 0 as depth
                FROM messages m
                WHERE m.conversation_id = $1 AND m.parent_id IS NULL AND m.is_active = true

                UNION ALL

                -- Recursive case: find the active child message
                SELECT m.*, at.depth + 1
                FROM messages m
                INNER JOIN active_thread at ON m.parent_id = at.id
                WHERE m.conversation_id = $1 AND m.is_active = true AND at.depth < 100
            )
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM active_thread
            ORDER BY depth ASC
            "#,
        )
        .bind(conversation_id)
        .fetch_all(&self.database.pool)
        .await?;

        Ok(messages)
    }

    /// Edit a message and create a new branch from that point
    pub async fn edit_message_and_branch(
        &self,
        message_id: Uuid,
        new_content: String,
    ) -> Result<Message> {
        let original_message = self
            .find_by_id(message_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Original message not found"))?;

        // Deactivate all messages from this point forward in the current thread
        sqlx::query(
            r#"
            WITH RECURSIVE downstream_messages AS (
                -- Base case: start with the message being edited
                SELECT id, parent_id
                FROM messages
                WHERE id = $1

                UNION ALL

                -- Recursive case: find all downstream messages
                SELECT m.id, m.parent_id
                FROM messages m
                INNER JOIN downstream_messages dm ON m.parent_id = dm.id
            )
            UPDATE messages
            SET is_active = false
            WHERE id IN (SELECT id FROM downstream_messages)
            "#,
        )
        .bind(message_id)
        .execute(&self.database.pool)
        .await?;

        // Create new message with edited content
        let request = CreateMessageRequest {
            conversation_id: original_message.conversation_id,
            parent_id: original_message.parent_id,
            role: original_message.role,
            content: new_content,
            metadata: Some(original_message.metadata),
        };

        let response = self.create_from_request(request).await?;
        self.find_by_id(response.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Created message not found"))
    }

    /// Switch to a different branch by activating a specific message and its thread
    pub async fn switch_to_branch(&self, message_id: Uuid) -> Result<Vec<Message>> {
        let target_message = self
            .find_by_id(message_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Target message not found"))?;

        // First, deactivate all messages in the conversation
        sqlx::query(
            r#"
            UPDATE messages
            SET is_active = false
            WHERE conversation_id = $1
            "#,
        )
        .bind(target_message.conversation_id)
        .execute(&self.database.pool)
        .await?;

        // Find and activate the complete path from root to target message
        let active_path = sqlx::query_as::<_, Message>(
            r#"
            WITH RECURSIVE path_to_message AS (
                -- Base case: start with target message
                SELECT m.*, 0 as depth
                FROM messages m
                WHERE m.id = $1

                UNION ALL

                -- Recursive case: walk up the parent chain
                SELECT m.*, ptm.depth + 1
                FROM messages m
                INNER JOIN path_to_message ptm ON m.id = ptm.parent_id
                WHERE ptm.depth < 100
            )
            SELECT id, conversation_id, parent_id, role, content, tokens_used, created_at, is_active, metadata
            FROM path_to_message
            ORDER BY depth DESC
            "#,
        )
        .bind(message_id)
        .fetch_all(&self.database.pool)
        .await?;

        // Activate all messages in the path
        for message in &active_path {
            sqlx::query("UPDATE messages SET is_active = true WHERE id = $1")
                .bind(message.id)
                .execute(&self.database.pool)
                .await?;
        }

        Ok(active_path)
    }

    /// Get branch information for a conversation including alternatives at each decision point
    pub async fn get_conversation_branches(
        &self,
        conversation_id: Uuid,
    ) -> Result<Vec<BranchInfo>> {
        // Simplified implementation for branch information
        // This provides basic branch structure without complex SQL queries
        let messages = self.find_conversation_tree(conversation_id).await?;

        // Group by parent_id to find branches
        let mut parent_map: std::collections::HashMap<Uuid, Vec<&Message>> =
            std::collections::HashMap::new();

        for message in &messages {
            if let Some(parent_id) = message.parent_id {
                parent_map.entry(parent_id).or_default().push(message);
            }
        }

        let mut branches = Vec::new();
        for (parent_id, children) in parent_map {
            if children.len() > 1 {
                let branch_options = children
                    .iter()
                    .map(|msg| BranchOption {
                        id: msg.id,
                        preview: msg.content.chars().take(50).collect(),
                        is_active: msg.is_active,
                    })
                    .collect();

                branches.push(BranchInfo {
                    parent_id,
                    branch_count: children.len() as u32,
                    branches: branch_options,
                });
            }
        }

        Ok(branches)
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
        let rows_affected = sqlx::query("UPDATE messages SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(&self.database.pool)
            .await?
            .rows_affected();

        Ok(rows_affected > 0)
    }
}
