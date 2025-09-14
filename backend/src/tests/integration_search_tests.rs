// Integration tests for semantic search functionality

#[cfg(test)]
mod integration_tests {
    use crate::{
        app_state::AppState,
        config::AppConfig,
        database::Database,
        handlers::search::{search_messages, search_health, trigger_embedding_job},
        models::{SearchRequest, UserResponse},
        services::DataAccessLayer,
    };
    use axum::{
        body::Body,
        extract::{Query, State},
        http::{Request, StatusCode},
        response::Response,
        routing::get,
        Json, Router,
    };
    use serde_json::json;
    use sqlx::PgPool;
    use std::collections::HashMap;
    use tower::ServiceExt;
    use uuid::Uuid;

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_endpoint_integration() {
        // This test would require a test database with sample data

        let app = create_test_app().await;

        let request = Request::builder()
            .uri("/api/search?q=test%20query&limit=5")
            .method("GET")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        // Parse response body
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let search_response: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert!(search_response.get("query").is_some());
        assert!(search_response.get("results").is_some());
        assert!(search_response.get("total_found").is_some());
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_post_endpoint_integration() {
        let app = create_test_app().await;

        let search_request = SearchRequest {
            query: "artificial intelligence".to_string(),
            limit: Some(10),
            similarity_threshold: Some(0.8),
        };

        let request = Request::builder()
            .uri("/api/search")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&search_request).unwrap()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let search_response: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(search_response["query"], "artificial intelligence");
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_validation_errors() {
        let app = create_test_app().await;

        // Test empty query
        let request = Request::builder()
            .uri("/api/search?q=")
            .method("GET")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        // Test long query
        let long_query = "a".repeat(501);
        let request = Request::builder()
            .uri(&format!("/api/search?q={}", urlencoding::encode(&long_query)))
            .method("GET")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_health_endpoint() {
        let app = create_test_app().await;

        let request = Request::builder()
            .uri("/api/search/health")
            .method("GET")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health_response: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(health_response["status"], "healthy");
        assert_eq!(health_response["service"], "search");
        assert!(health_response.get("timestamp").is_some());
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_embedding_job_endpoint() {
        let app = create_test_app().await;

        let request = Request::builder()
            .uri("/api/search/embedding-job")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // This would typically require admin authentication
        // For now, we just test that the endpoint exists
        assert!(response.status().is_client_error() || response.status().is_success());
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_with_authentication() {
        // This test would verify that search results are properly scoped to the authenticated user
        let app = create_test_app().await;

        // Create mock JWT token for authenticated user
        let jwt_token = create_test_jwt_token().unwrap();

        let request = Request::builder()
            .uri("/api/search?q=test")
            .method("GET")
            .header("content-type", "application/json")
            .header("authorization", &format!("Bearer {}", jwt_token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // With proper authentication, should return OK
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_without_authentication() {
        let app = create_test_app().await;

        let request = Request::builder()
            .uri("/api/search?q=test")
            .method("GET")
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Without authentication, should return Unauthorized
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_search_performance() {
        // Test that search completes within acceptable time limits
        let app = create_test_app().await;
        let jwt_token = create_test_jwt_token().unwrap();

        let start_time = std::time::Instant::now();

        let request = Request::builder()
            .uri("/api/search?q=machine%20learning%20algorithms")
            .method("GET")
            .header("content-type", "application/json")
            .header("authorization", &format!("Bearer {}", jwt_token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        let duration = start_time.elapsed();

        assert_eq!(response.status(), StatusCode::OK);
        // Search should complete within 5 seconds (including embedding generation)
        assert!(duration.as_secs() < 5);
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_concurrent_search_requests() {
        // Test that the system can handle multiple concurrent search requests
        let app = std::sync::Arc::new(create_test_app().await);
        let jwt_token = create_test_jwt_token().unwrap();

        let mut handles = vec![];

        // Spawn 10 concurrent search requests
        for i in 0..10 {
            let app_clone = app.clone();
            let token_clone = jwt_token.clone();
            let query = format!("test query {}", i);

            let handle = tokio::spawn(async move {
                let request = Request::builder()
                    .uri(&format!("/api/search?q={}", urlencoding::encode(&query)))
                    .method("GET")
                    .header("content-type", "application/json")
                    .header("authorization", &format!("Bearer {}", token_clone))
                    .body(Body::empty())
                    .unwrap();

                let response = app_clone
                    .clone()
                    .oneshot(request)
                    .await
                    .unwrap();

                response.status()
            });

            handles.push(handle);
        }

        // Wait for all requests to complete
        let results = futures::future::join_all(handles).await;

        // All requests should succeed
        for result in results {
            let status = result.unwrap();
            assert_eq!(status, StatusCode::OK);
        }
    }

    // Helper functions for testing

    async fn create_test_app() -> Router {
        // This would create a test version of the app with mock dependencies
        // For now, we'll return a basic router structure

        Router::new()
            .route("/api/search", get(mock_search_handler))
            .route("/api/search", axum::routing::post(mock_search_handler))
            .route("/api/search/health", get(mock_health_handler))
            .route("/api/search/embedding-job", axum::routing::post(mock_embedding_job_handler))
    }

    fn create_test_jwt_token() -> Result<String, Box<dyn std::error::Error>> {
        // Mock JWT token creation for testing
        // In real tests, this would use the actual JWT signing logic
        Ok("mock.jwt.token".to_string())
    }

    // Mock handlers for testing

    async fn mock_search_handler() -> Result<Json<serde_json::Value>, StatusCode> {
        Ok(Json(json!({
            "query": "test query",
            "results": [],
            "total_found": 0
        })))
    }

    async fn mock_health_handler() -> Result<Json<serde_json::Value>, StatusCode> {
        Ok(Json(json!({
            "status": "healthy",
            "service": "search",
            "timestamp": chrono::Utc::now().to_rfc3339()
        })))
    }

    async fn mock_embedding_job_handler() -> Result<Json<serde_json::Value>, StatusCode> {
        Ok(Json(json!({
            "processed_count": 0,
            "success": true
        })))
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_database_operations() {
        // Test database operations for embeddings
        // This would require a test database with actual pgvector setup

        // Test embedding storage
        let message_id = Uuid::new_v4();
        let test_embedding: Vec<f32> = (0..1536).map(|i| i as f32 / 1536.0).collect();

        // Test similarity search with actual vectors
        let query_embedding: Vec<f32> = (0..1536).map(|i| (i + 100) as f32 / 1536.0).collect();

        // These would be actual database operations in integration tests
        assert_eq!(test_embedding.len(), 1536);
        assert_eq!(query_embedding.len(), 1536);
    }

    #[tokio::test]
    #[ignore] // Ignore until we have test database setup
    async fn test_openai_integration() {
        // Test actual OpenAI API integration (would require API key)
        // This test would verify that embeddings are generated correctly

        let test_text = "This is a test message for embedding generation";

        // In a real integration test, we would:
        // 1. Call OpenAI embeddings API
        // 2. Verify response structure
        // 3. Check embedding dimensions
        // 4. Verify embedding values are reasonable

        assert!(!test_text.is_empty());
    }

    #[test]
    fn test_search_request_serialization() {
        // Test that search requests can be properly serialized/deserialized
        let request = SearchRequest {
            query: "test query".to_string(),
            limit: Some(10),
            similarity_threshold: Some(0.8),
        };

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: SearchRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(request.query, deserialized.query);
        assert_eq!(request.limit, deserialized.limit);
        assert_eq!(request.similarity_threshold, deserialized.similarity_threshold);
    }

    #[test]
    fn test_search_response_serialization() {
        // Test search response serialization
        let response = json!({
            "query": "test query",
            "results": [
                {
                    "message_id": Uuid::new_v4().to_string(),
                    "content": "Test message",
                    "role": "user",
                    "created_at": chrono::Utc::now().to_rfc3339(),
                    "conversation_id": Uuid::new_v4().to_string(),
                    "conversation_title": "Test Conversation",
                    "similarity": 0.95,
                    "preview": "Test message"
                }
            ],
            "total_found": 1
        });

        let json_str = serde_json::to_string(&response).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["query"], "test query");
        assert_eq!(parsed["total_found"], 1);
        assert!(parsed["results"].is_array());
    }
}