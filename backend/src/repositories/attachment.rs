use crate::database::Database;
use crate::models::Attachment;
use anyhow::Result;
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AttachmentRepository {
    db: Database,
}

impl AttachmentRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, attachment: CreateAttachment) -> Result<Attachment> {
        let query = r#"
            INSERT INTO attachments (message_id, filename, content_type, size_bytes, storage_path)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, message_id, filename, content_type, size_bytes, storage_path, created_at
        "#;

        let row = sqlx::query(query)
            .bind(attachment.message_id)
            .bind(&attachment.filename)
            .bind(attachment.content_type.as_ref())
            .bind(attachment.size_bytes)
            .bind(&attachment.storage_path)
            .fetch_one(&self.db.pool)
            .await?;

        Ok(Attachment {
            id: row.get("id"),
            message_id: row.get("message_id"),
            filename: row.get("filename"),
            content_type: row.get("content_type"),
            size_bytes: row.get("size_bytes"),
            storage_path: row.get("storage_path"),
            created_at: row.get("created_at"),
        })
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<Attachment>> {
        let query = r#"
            SELECT id, message_id, filename, content_type, size_bytes, storage_path, created_at
            FROM attachments
            WHERE id = $1
        "#;

        let result = sqlx::query_as::<_, Attachment>(query)
            .bind(id)
            .fetch_optional(&self.db.pool)
            .await?;

        Ok(result)
    }

    pub async fn find_by_message_id(&self, message_id: Uuid) -> Result<Vec<Attachment>> {
        let query = r#"
            SELECT id, message_id, filename, content_type, size_bytes, storage_path, created_at
            FROM attachments
            WHERE message_id = $1
            ORDER BY created_at ASC
        "#;

        let attachments = sqlx::query_as::<_, Attachment>(query)
            .bind(message_id)
            .fetch_all(&self.db.pool)
            .await?;

        Ok(attachments)
    }

    pub async fn delete(&self, id: Uuid) -> Result<bool> {
        let query = "DELETE FROM attachments WHERE id = $1";

        let result = sqlx::query(query)
            .bind(id)
            .execute(&self.db.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn get_total_user_storage_size(&self, user_id: Uuid) -> Result<i64> {
        let query = r#"
            SELECT COALESCE(SUM(a.size_bytes), 0) as total_size
            FROM attachments a
            JOIN messages m ON a.message_id = m.id
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.user_id = $1
        "#;

        let row = sqlx::query(query)
            .bind(user_id)
            .fetch_one(&self.db.pool)
            .await?;

        Ok(row.get("total_size"))
    }
}

#[derive(Debug)]
pub struct CreateAttachment {
    pub message_id: Uuid,
    pub filename: String,
    pub content_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub storage_path: String,
}