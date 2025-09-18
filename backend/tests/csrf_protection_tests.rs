//! CSRF Protection Tests
//! 
//! Comprehensive tests for CSRF token generation, validation,
//! and middleware protection according to OWASP guidelines.

use axum::{
    body::Body,
    extract::Request,
    http::{header, Method, StatusCode},
    middleware,
    response::Response,
    routing::{get, post},
    Router,
};
use axum_test::TestServer;
use serde_json::{json, Value};
use std::collections::HashMap;
use tower_sessions::{MemoryStore, SessionManagerLayer};
use workbench_server::{
    app_state::AppState,
    config::AppConfig,
    middleware::csrf::csrf_middleware,
    services::DataAccessLayer,
};

// Test handlers
async fn protected_handler() -> &'static str {
    "Protected content"
}

async fn public_handler() -> &'static str {
    "Public content"
}

// Helper function to create test app with CSRF protection
fn create_test_app() -> Router {
    let config = AppConfig::default();
    let dal = DataAccessLayer::mock(); // You'll need to implement a mock DAL
    let app_state = AppState::mock(config); // You'll need to implement a mock AppState

    let session_layer = SessionManagerLayer::new(MemoryStore::default())
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax);

    Router::new()
        .route("/api/v1/auth/csrf-token", get(workbench_server::middleware::csrf::get_csrf_token))
        .route("/api/public", get(public_handler))
        .route("/api/protected", post(protected_handler))
        .with_state(app_state)
        .layer(session_layer)
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            csrf_middleware,
        ))
}

#[tokio::test]
async fn test_csrf_token_generation() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // Request CSRF token
    let response = server.get("/api/v1/auth/csrf-token").await;
    
    assert_eq!(response.status_code(), StatusCode::OK);
    
    let json: Value = response.json();
    assert!(json["csrf_token"].is_string());
    assert!(json["timestamp"].is_number());
    
    let token = json["csrf_token"].as_str().unwrap();
    assert!(token.len() >= 16); // Minimum token length
    
    // Check that cookie is set
    let cookies = response.cookies();
    assert!(cookies.iter().any(|c| c.name() == "csrf-token"));
}

#[tokio::test]
async fn test_csrf_protection_allows_safe_methods() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // GET requests should be allowed without CSRF token
    let response = server.get("/api/public").await;
    assert_eq!(response.status_code(), StatusCode::OK);
    assert_eq!(response.text(), "Public content");

    // HEAD and OPTIONS should also be allowed
    let response = server
        .request(Method::HEAD, "/api/public")
        .await;
    assert_eq!(response.status_code(), StatusCode::OK);

    let response = server
        .request(Method::OPTIONS, "/api/public")
        .await;
    assert_eq!(response.status_code(), StatusCode::OK);
}

#[tokio::test]
async fn test_csrf_protection_blocks_unsafe_methods_without_token() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // POST without CSRF token should be blocked
    let response = server
        .post("/api/protected")
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::FORBIDDEN);
    
    let error: Value = response.json();
    assert!(error["error"]["code"].as_str().unwrap().contains("CSRF"));
}

#[tokio::test]
async fn test_csrf_protection_allows_valid_token() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // First, get a CSRF token
    let token_response = server.get("/api/v1/auth/csrf-token").await;
    assert_eq!(token_response.status_code(), StatusCode::OK);
    
    let token_json: Value = token_response.json();
    let csrf_token = token_json["csrf_token"].as_str().unwrap();
    
    // Extract session cookie
    let session_cookie = token_response
        .cookies()
        .iter()
        .find(|c| c.name().contains("session") || c.name() == "csrf-token")
        .expect("Should have session/CSRF cookie")
        .clone();

    // Now make a POST request with the CSRF token
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", csrf_token)
        .add_cookie(session_cookie)
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::OK);
    assert_eq!(response.text(), "Protected content");
}

#[tokio::test]
async fn test_csrf_protection_blocks_invalid_token() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // Try with an invalid token
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", "invalid-token")
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::FORBIDDEN);
    
    let error: Value = response.json();
    assert!(error["error"]["code"].as_str().unwrap().contains("CSRF"));
}

#[tokio::test]
async fn test_csrf_double_submit_pattern() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // Get CSRF token and cookie
    let token_response = server.get("/api/v1/auth/csrf-token").await;
    let token_json: Value = token_response.json();
    let csrf_token = token_json["csrf_token"].as_str().unwrap();
    
    let csrf_cookie = token_response
        .cookies()
        .iter()
        .find(|c| c.name() == "csrf-token")
        .expect("Should have CSRF cookie")
        .clone();

    // Test with matching header and cookie (should succeed)
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", csrf_token)
        .add_cookie(csrf_cookie.clone())
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::OK);

    // Test with mismatched header and cookie (should fail)
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", "different-token")
        .add_cookie(csrf_cookie)
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_csrf_token_format_validation() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    // Test with token that's too short
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", "short")
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::FORBIDDEN);

    // Test with empty token
    let response = server
        .post("/api/protected")
        .add_header("X-CSRF-Token", "")
        .json(&json!({"test": "data"}))
        .await;
    
    assert_eq!(response.status_code(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_csrf_skips_auth_endpoints() {
    let app = Router::new()
        .route("/api/v1/auth/login", post(|| async { "Login" }))
        .route("/api/v1/auth/register", post(|| async { "Register" }))
        .route("/api/v1/health", post(|| async { "Health" }))
        .layer(middleware::from_fn(csrf_middleware));
    
    let server = TestServer::new(app).unwrap();

    // These endpoints should work without CSRF tokens
    let response = server
        .post("/api/v1/auth/login")
        .json(&json!({"email": "test@example.com", "password": "password"}))
        .await;
    
    // Note: This might fail due to validation, but should not fail due to CSRF
    assert_ne!(response.status_code(), StatusCode::FORBIDDEN);

    let response = server
        .post("/api/v1/auth/register")
        .json(&json!({
            "email": "test@example.com", 
            "username": "test",
            "password": "password"
        }))
        .await;
    
    assert_ne!(response.status_code(), StatusCode::FORBIDDEN);

    let response = server.post("/api/v1/health").await;
    assert_ne!(response.status_code(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_csrf_token_expiration() {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    // This test would require mocking time or using a test clock
    // For now, we'll test the timestamp is reasonable
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/api/v1/auth/csrf-token").await;
    let token_json: Value = response.json();
    
    let timestamp = token_json["timestamp"].as_i64().unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    // Timestamp should be within 10 seconds of now
    assert!((now - timestamp).abs() < 10);
}

#[tokio::test]
async fn test_csrf_security_headers() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/api/v1/auth/csrf-token").await;
    
    // Check that CSRF cookie has security attributes
    let csrf_cookie = response
        .cookies()
        .iter()
        .find(|c| c.name() == "csrf-token")
        .expect("Should have CSRF cookie");
    
    // In test environment, secure flag might be false
    // but HttpOnly and SameSite should be set
    assert!(csrf_cookie.http_only().unwrap_or(false));
    // Note: axum_test might not preserve all cookie attributes
}

// Unit tests for CSRF token struct
#[cfg(test)]
mod unit_tests {
    use workbench_server::middleware::csrf::CSRFToken;

    #[test]
    fn test_csrf_token_generation() {
        let token = CSRFToken::new();
        assert!(!token.value.is_empty());
        assert!(token.value.len() >= 16);
        assert!(token.is_valid_format());
        assert!(!token.is_expired());
    }

    #[test]
    fn test_csrf_token_validation() {
        let token = CSRFToken::new();
        assert!(token.is_valid_format());
        
        let invalid_token = CSRFToken {
            value: "short".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        assert!(!invalid_token.is_valid_format());

        let empty_token = CSRFToken {
            value: "".to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        assert!(!empty_token.is_valid_format());
    }

    #[test]
    fn test_csrf_token_expiration() {
        // Token created now should not be expired
        let fresh_token = CSRFToken::new();
        assert!(!fresh_token.is_expired());

        // Token from 25 hours ago should be expired
        let old_token = CSRFToken {
            value: "valid-token-123456789".to_string(),
            timestamp: chrono::Utc::now().timestamp() - (25 * 3600), // 25 hours ago
        };
        assert!(old_token.is_expired());
    }
}