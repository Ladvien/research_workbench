use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::Deserialize;
use validator::Validate;

use crate::{
    app_state::AppState,
    error::AppError,
    models::UserResponse,
    models::{EmbeddingJobResponse, SearchRequest, SearchResponse, SearchResultResponse},
    services::embedding::EmbeddingService,
};

#[derive(Debug, Deserialize)]
pub struct SearchQueryParams {
    pub q: String,
    pub limit: Option<i64>,
    pub similarity_threshold: Option<f32>,
}

/// Search messages using semantic similarity
pub async fn search_messages(
    user: UserResponse,
    State(state): State<AppState>,
    Query(params): Query<SearchQueryParams>,
) -> Result<Json<SearchResponse>, AppError> {
    tracing::info!("Search request from user {}: '{}'", user.id, params.q);

    // Validate query length
    if params.q.trim().is_empty() {
        return Err(AppError::BadRequest("Query cannot be empty".to_string()));
    }

    if params.q.len() > 500 {
        return Err(AppError::BadRequest(
            "Query too long (max 500 characters)".to_string(),
        ));
    }

    // Create embedding service
    let embedding_repository = state.dal.embeddings().clone();
    let embedding_service = EmbeddingService::new(state.config.clone(), embedding_repository)?;

    // Perform search
    let results = embedding_service
        .search_similar_messages(
            &params.q,
            Some(user.id),
            params.limit,
            params.similarity_threshold,
        )
        .await?;

    let search_results: Vec<SearchResultResponse> = results
        .into_iter()
        .map(SearchResultResponse::from_search_result)
        .collect();

    let response = SearchResponse {
        query: params.q,
        total_found: search_results.len(),
        results: search_results,
    };

    Ok(Json(response))
}

/// Search messages using POST request with JSON body
pub async fn search_messages_post(
    user: UserResponse,
    State(state): State<AppState>,
    Json(request): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, AppError> {
    // Validate request
    request
        .validate()
        .map_err(|e| AppError::BadRequest(format!("Validation error: {e}")))?;

    tracing::info!(
        "POST search request from user {}: '{}'",
        user.id,
        request.query
    );

    // Create embedding service
    let embedding_repository = state.dal.embeddings().clone();
    let embedding_service = EmbeddingService::new(state.config.clone(), embedding_repository)?;

    // Perform search
    let results = embedding_service
        .search_similar_messages(
            &request.query,
            Some(user.id),
            request.limit,
            request.similarity_threshold,
        )
        .await?;

    let search_results: Vec<SearchResultResponse> = results
        .into_iter()
        .map(SearchResultResponse::from_search_result)
        .collect();

    let response = SearchResponse {
        query: request.query,
        total_found: search_results.len(),
        results: search_results,
    };

    Ok(Json(response))
}

/// Admin endpoint to trigger background embedding job
pub async fn trigger_embedding_job(
    user: UserResponse,
    State(state): State<AppState>,
) -> Result<Json<EmbeddingJobResponse>, AppError> {
    // Admin role check - for now just log the user
    tracing::info!("Triggering background embedding job for user: {}", user.id);

    // Create embedding service
    let embedding_repository = state.dal.embeddings().clone();
    let embedding_service = EmbeddingService::new(state.config.clone(), embedding_repository)?;

    // Run background job
    match embedding_service.background_embedding_job().await {
        Ok(processed_count) => {
            let response = EmbeddingJobResponse {
                processed_count,
                success: true,
            };
            Ok(Json(response))
        }
        Err(e) => {
            tracing::error!("Background embedding job failed: {}", e);
            let response = EmbeddingJobResponse {
                processed_count: 0,
                success: false,
            };
            Ok(Json(response))
        }
    }
}

/// Health check endpoint for search service
pub async fn search_health(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Check database connectivity
    state
        .dal
        .repositories
        .embeddings
        .find_messages_without_embeddings(1)
        .await?;

    Ok(Json(serde_json::json!({
        "status": "healthy",
        "service": "search",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// Get search statistics (for debugging/monitoring)
pub async fn search_stats(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Count messages without embeddings
    let pending_embeddings = state
        .dal
        .repositories
        .embeddings
        .find_messages_without_embeddings(1000)
        .await?
        .len();

    Ok(Json(serde_json::json!({
        "pending_embeddings": pending_embeddings,
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

#[cfg(test)]
mod tests {

    // Note: These would be integration tests requiring database setup
    // For now, we'll add test stubs

    #[tokio::test]
    #[ignore] // Ignore until we have test setup
    async fn test_search_messages_validation() {
        // Test would verify that empty queries are rejected
        // and long queries are rejected
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test setup
    async fn test_search_results_formatting() {
        // Test would verify search results are properly formatted
        // with previews and similarity scores
    }
}
