use async_openai::{
    types::{CreateEmbeddingRequest, EmbeddingInput},
    Client as OpenAIClient,
};
use std::time::Duration;
use uuid::Uuid;

use crate::{
    config::AppConfig,
    error::AppError,
    repositories::embedding::{EmbeddingRepository, SearchResult},
};

#[derive(Debug, Clone)]
pub struct EmbeddingService {
    client: OpenAIClient<async_openai::config::OpenAIConfig>,
    repository: EmbeddingRepository,
    config: AppConfig,
}

impl EmbeddingService {
    pub fn new(config: AppConfig, repository: EmbeddingRepository) -> Result<Self, AppError> {
        let openai_config =
            async_openai::config::OpenAIConfig::new().with_api_key(&config.openai_api_key);

        let client = OpenAIClient::with_config(openai_config);

        Ok(Self {
            client,
            repository,
            config,
        })
    }

    /// Generate embeddings for text using OpenAI's text-embedding-3-small model
    pub async fn generate_embedding(&self, text: &str) -> Result<Vec<f32>, AppError> {
        tracing::info!("Generating embedding for text of length: {}", text.len());

        let request = CreateEmbeddingRequest {
            model: "text-embedding-3-small".to_string(),
            input: EmbeddingInput::String(text.to_string()),
            encoding_format: None,
            dimensions: Some(1536),
            user: None,
        };

        let response = self
            .client
            .embeddings()
            .create(request)
            .await
            .map_err(|e| AppError::OpenAI(format!("Failed to generate embedding: {}", e)))?;

        let embedding = response
            .data
            .into_iter()
            .next()
            .ok_or_else(|| AppError::OpenAI("No embedding returned from OpenAI".to_string()))?
            .embedding;

        Ok(embedding)
    }

    /// Store embeddings for a message
    pub async fn store_message_embedding(
        &self,
        message_id: Uuid,
        content: &str,
    ) -> Result<(), AppError> {
        let embedding = self.generate_embedding(content).await?;

        self.repository
            .upsert_embedding(message_id, embedding)
            .await?;

        tracing::info!("Stored embedding for message {}", message_id);
        Ok(())
    }

    /// Find messages similar to the given query text
    pub async fn search_similar_messages(
        &self,
        query: &str,
        user_id: Option<Uuid>,
        limit: Option<i64>,
        similarity_threshold: Option<f32>,
    ) -> Result<Vec<SearchResult>, AppError> {
        tracing::info!(
            "Searching for messages similar to query of length: {}",
            query.len()
        );

        let query_embedding = self.generate_embedding(query).await?;
        let limit = limit.unwrap_or(10);

        let results = self
            .repository
            .search_similar_messages(query_embedding, user_id, limit, similarity_threshold)
            .await?;

        tracing::info!("Found {} similar messages", results.len());
        Ok(results)
    }

    /// Process messages without embeddings in batches
    pub async fn process_pending_embeddings(&self, batch_size: i64) -> Result<usize, AppError> {
        tracing::info!(
            "Processing pending embeddings with batch size: {}",
            batch_size
        );

        let message_ids = self
            .repository
            .find_messages_without_embeddings(batch_size)
            .await?;

        if message_ids.is_empty() {
            tracing::info!("No messages found without embeddings");
            return Ok(0);
        }

        let mut processed_count = 0;

        for message_id in &message_ids {
            match self.generate_embedding_for_message(*message_id).await {
                Ok(_) => {
                    processed_count += 1;
                    tracing::debug!("Generated embedding for message {}", message_id);
                }
                Err(e) => {
                    tracing::error!(
                        "Failed to generate embedding for message {}: {}",
                        message_id,
                        e
                    );
                    // Continue processing other messages even if one fails
                }
            }

            // Add small delay to avoid rate limiting
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        tracing::info!(
            "Processed {} out of {} pending embeddings",
            processed_count,
            message_ids.len()
        );
        Ok(processed_count)
    }

    /// Generate embedding for a specific message by fetching its content
    async fn generate_embedding_for_message(&self, _message_id: Uuid) -> Result<(), AppError> {
        // This would require access to the message repository to fetch content
        // For now, we'll implement this as a placeholder that could be called
        // from a handler that has access to the message content

        // In practice, this would be called from a background job or webhook
        // where the message content is already available
        tracing::warn!("generate_embedding_for_message called with just message_id - content needed from caller");
        Err(AppError::BadRequest(
            "Message content required for embedding generation".to_string(),
        ))
    }

    /// Delete embedding for a message
    pub async fn delete_message_embedding(&self, message_id: Uuid) -> Result<bool, AppError> {
        let deleted = self.repository.delete_by_message_id(message_id).await?;

        if deleted {
            tracing::info!("Deleted embedding for message {}", message_id);
        }

        Ok(deleted)
    }

    /// Check if a message has an embedding
    pub async fn has_embedding(&self, message_id: Uuid) -> Result<bool, AppError> {
        let embedding = self.repository.find_by_message_id(message_id).await?;

        Ok(embedding.is_some())
    }
}

// Background job functions that can be called by external schedulers
impl EmbeddingService {
    /// Background job to process all pending embeddings
    pub async fn background_embedding_job(&self) -> Result<usize, AppError> {
        tracing::info!("Starting background embedding job");

        let mut total_processed = 0;
        let batch_size = 50; // Process in batches of 50

        loop {
            let batch_processed = self.process_pending_embeddings(batch_size).await?;
            total_processed += batch_processed;

            if batch_processed == 0 {
                break; // No more messages to process
            }

            // Add delay between batches to respect rate limits
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        tracing::info!(
            "Background embedding job completed. Processed {} messages",
            total_processed
        );
        Ok(total_processed)
    }
}

#[cfg(test)]
mod tests {

    // Note: These would be integration tests requiring database setup
    // For now, we'll add unit test stubs

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_generate_embedding() {
        // Test would create embedding service with test config
        // and verify embedding generation works
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_similar_messages() {
        // Test would create some test messages with embeddings
        // and verify search returns relevant results
    }
}
