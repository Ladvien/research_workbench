#[cfg(test)]
mod csrf_integration_tests {
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
        middleware,
        response::Response,
        routing::{get, post},
        Router,
    };
    use serde_json::json;
    use tower::{ServiceBuilder, ServiceExt};
    use tower_sessions::{MemoryStore, SessionManagerLayer};

    // Simple test handler
    async fn test_handler() -> &'static str {
        "Success"
    }

    // Create a minimal app for testing CSRF
    fn create_test_app() -> Router {
        let session_layer = SessionManagerLayer::new(MemoryStore::default()).with_secure(false);

        Router::new()
            .route("/test", post(test_handler))
            .route("/safe", get(test_handler))
            .layer(session_layer)
    }

    #[tokio::test]
    async fn test_safe_methods_allowed() {
        let app = create_test_app();

        let request = Request::builder()
            .method(Method::GET)
            .uri("/safe")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_csrf_token_format() {
        use workbench_server::middleware::csrf::CSRFToken;

        let token = CSRFToken::new();
        assert!(!token.value.is_empty());
        assert!(token.value.len() >= 16);
        assert!(token.is_valid_format());
        assert!(!token.is_expired());

        // Test invalid formats
        let short_token = CSRFToken {
            value: "short".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        assert!(!short_token.is_valid_format());

        let empty_token = CSRFToken {
            value: "".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        assert!(!empty_token.is_valid_format());
    }

    #[tokio::test]
    async fn test_csrf_token_expiration() {
        use workbench_server::middleware::csrf::CSRFToken;

        let fresh_token = CSRFToken::new();
        assert!(!fresh_token.is_expired());

        // Token from 25 hours ago should be expired
        let old_token = CSRFToken {
            value: "valid-token-but-old".to_string(),
            timestamp: chrono::Utc::now().timestamp() - (25 * 3600),
        };
        assert!(old_token.is_expired());
    }

    #[tokio::test]
    async fn test_skip_protection_logic() {
        use axum::http::Method;
        use workbench_server::middleware::csrf::should_skip_csrf_protection;

        // Safe methods should be skipped
        assert!(should_skip_csrf_protection(&Method::GET, "/api/test"));
        assert!(should_skip_csrf_protection(&Method::HEAD, "/api/test"));
        assert!(should_skip_csrf_protection(&Method::OPTIONS, "/api/test"));

        // Health endpoints should be skipped
        assert!(should_skip_csrf_protection(&Method::POST, "/api/health"));
        assert!(should_skip_csrf_protection(&Method::POST, "/api/v1/health"));

        // Auth endpoints should be skipped
        assert!(should_skip_csrf_protection(
            &Method::POST,
            "/api/v1/auth/login"
        ));
        assert!(should_skip_csrf_protection(
            &Method::POST,
            "/api/v1/auth/register"
        ));

        // Regular endpoints should not be skipped
        assert!(!should_skip_csrf_protection(&Method::POST, "/api/v1/users"));
        assert!(!should_skip_csrf_protection(
            &Method::PUT,
            "/api/v1/users/1"
        ));
        assert!(!should_skip_csrf_protection(
            &Method::DELETE,
            "/api/v1/users/1"
        ));
        assert!(!should_skip_csrf_protection(
            &Method::PATCH,
            "/api/v1/users/1"
        ));
    }
}
