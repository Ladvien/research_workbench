use crate::{error::AppError, models::MessageEmbedding};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct EmbeddingRepository {
    db: PgPool,
}

impl EmbeddingRepository {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn create(
        &self,
        message_id: Uuid,
        embedding: Vec<f32>,
    ) -> Result<MessageEmbedding, AppError> {
        let record = sqlx::query_as::<_, MessageEmbedding>(
            r#"
            INSERT INTO message_embeddings (message_id, embedding)
            VALUES ($1, $2)
            RETURNING id, message_id, embedding, created_at
            "#
        )
        .bind(message_id)
        .bind(&embedding)
        .fetch_one(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(record)
    }

    pub async fn find_by_message_id(
        &self,
        message_id: Uuid,
    ) -> Result<Option<MessageEmbedding>, AppError> {
        let record = sqlx::query_as::<_, MessageEmbedding>(
            r#"
            SELECT id, message_id, embedding, created_at
            FROM message_embeddings
            WHERE message_id = $1
            "#
        )
        .bind(message_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(record)
    }

    pub async fn update_embedding(
        &self,
        message_id: Uuid,
        embedding: Vec<f32>,
    ) -> Result<MessageEmbedding, AppError> {
        let record = sqlx::query_as::<_, MessageEmbedding>(
            r#"
            UPDATE message_embeddings
            SET embedding = $2, created_at = NOW()
            WHERE message_id = $1
            RETURNING id, message_id, embedding, created_at
            "#
        )
        .bind(message_id)
        .bind(&embedding)
        .fetch_one(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(record)
    }

    pub async fn upsert_embedding(
        &self,
        message_id: Uuid,
        embedding: Vec<f32>,
    ) -> Result<MessageEmbedding, AppError> {
        let record = sqlx::query_as::<_, MessageEmbedding>(
            r#"
            INSERT INTO message_embeddings (message_id, embedding)
            VALUES ($1, $2)
            ON CONFLICT (message_id)
            DO UPDATE SET embedding = EXCLUDED.embedding, created_at = NOW()
            RETURNING id, message_id, embedding, created_at
            "#
        )
        .bind(message_id)
        .bind(&embedding)
        .fetch_one(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(record)
    }

    pub async fn find_messages_without_embeddings(
        &self,
        limit: i64,
    ) -> Result<Vec<Uuid>, AppError> {
        let records = sqlx::query(
            r#"
            SELECT m.id
            FROM messages m
            LEFT JOIN message_embeddings me ON m.id = me.message_id
            WHERE me.id IS NULL AND m.is_active = true
            ORDER BY m.created_at ASC
            LIMIT $1
            "#
        )
        .bind(limit)
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let ids: Result<Vec<Uuid>, _> = records
            .into_iter()
            .map(|r| r.try_get::<Uuid, _>("id"))
            .collect();

        ids.map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn search_similar_messages(
        &self,
        query_embedding: Vec<f32>,
        user_id: Option<Uuid>,
        limit: i64,
        similarity_threshold: Option<f32>,
    ) -> Result<Vec<SearchResult>, AppError> {
        let threshold = similarity_threshold.unwrap_or(0.7);

        let results = if let Some(user_id) = user_id {
            sqlx::query_as::<_, SearchResult>(
                r#"
                SELECT
                    m.id as message_id,
                    m.content,
                    m.role,
                    m.created_at,
                    c.id as conversation_id,
                    c.title as conversation_title,
                    1 - (me.embedding <=> $1::vector) as similarity
                FROM message_embeddings me
                JOIN messages m ON me.message_id = m.id
                JOIN conversations c ON m.conversation_id = c.id
                WHERE c.user_id = $2 AND m.is_active = true
                AND 1 - (me.embedding <=> $1::vector) >= $3
                ORDER BY similarity DESC
                LIMIT $4
                "#
            )
            .bind(&query_embedding)
            .bind(user_id)
            .bind(threshold)
            .bind(limit)
            .fetch_all(&self.db)
            .await
        } else {
            sqlx::query_as::<_, SearchResult>(
                r#"
                SELECT
                    m.id as message_id,
                    m.content,
                    m.role,
                    m.created_at,
                    c.id as conversation_id,
                    c.title as conversation_title,
                    1 - (me.embedding <=> $1::vector) as similarity
                FROM message_embeddings me
                JOIN messages m ON me.message_id = m.id
                JOIN conversations c ON m.conversation_id = c.id
                WHERE m.is_active = true
                AND 1 - (me.embedding <=> $1::vector) >= $2
                ORDER BY similarity DESC
                LIMIT $3
                "#
            )
            .bind(&query_embedding)
            .bind(threshold)
            .bind(limit)
            .fetch_all(&self.db)
            .await
        };

        let results = results.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(results)
    }

    pub async fn delete_by_message_id(&self, message_id: Uuid) -> Result<bool, AppError> {
        let result = sqlx::query(
            "DELETE FROM message_embeddings WHERE message_id = $1"
        )
        .bind(message_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(result.rows_affected() > 0)
    }
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub message_id: Uuid,
    pub content: String,
    pub role: crate::models::MessageRole,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub conversation_id: Uuid,
    pub conversation_title: Option<String>,
    pub similarity: f32,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for SearchResult {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;

        Ok(SearchResult {
            message_id: row.try_get("message_id")?,
            content: row.try_get("content")?,
            role: {
                let role_str: String = row.try_get("role")?;
                role_str.parse().map_err(|e| sqlx::Error::Decode(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))?
            },
            created_at: row.try_get("created_at")?,
            conversation_id: row.try_get("conversation_id")?,
            conversation_title: row.try_get("conversation_title")?,
            similarity: row.try_get("similarity")?,
        })
    }
}
