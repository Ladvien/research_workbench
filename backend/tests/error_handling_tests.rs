use axum::{
    body::Body,
    extract::Request,
    http::{method::Method, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod test_env;

/// Test graceful error handling for database connection failures
#[tokio::test]
async fn test_database_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test accessing an endpoint that requires database
    let conversations_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/conversations")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let conversations_response = app.oneshot(conversations_request).await.unwrap();
    // Should handle database operations gracefully
    assert!(
        conversations_response.status().is_success()
            || conversations_response.status().is_server_error()
    );

    if conversations_response.status().is_server_error() {
        let error_body = axum::body::to_bytes(conversations_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

        // Should return properly formatted error
        assert!(error_response["error"].is_object());
        assert!(error_response["error"]["message"].is_string());
        assert!(error_response["error"]["code"].is_string());
        assert!(error_response["error"]["timestamp"].is_string());
        assert!(error_response["error"]["request_id"].is_string());
    }
}

/// Test JSON parsing error handling
#[tokio::test]
async fn test_json_parsing_errors() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Send malformed JSON
    let malformed_json_cases = vec![
        "{ invalid json",
        "{ \"key\": }",
        "{ \"key\": \"value\", }",
        "not json at all",
        "",
        "null",
        "[]",
        "{ \"key\": \"value\" extra text",
    ];

    for malformed_json in malformed_json_cases {
        let request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/conversations")
            .header("content-type", "application/json")
            .header("cookie", &test_user.session_cookie)
            .body(Body::from(malformed_json.to_string()))
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Malformed JSON should return 400: '{}'",
            malformed_json
        );

        let error_body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

        // Should return properly formatted error response
        assert!(error_response["error"].is_object());
        assert!(error_response["error"]["code"]
            .as_str()
            .unwrap()
            .contains("BAD_REQUEST"));
    }
}

/// Test validation error handling
#[tokio::test]
async fn test_validation_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test missing required fields
    let invalid_requests = vec![
        json!({}),                                                          // Empty object
        json!({"title": ""}),                                               // Empty title
        json!({"title": "Valid Title"}), // Missing provider and model
        json!({"title": "Valid Title", "provider": ""}), // Empty provider
        json!({"title": "Valid Title", "provider": "openai"}), // Missing model
        json!({"title": "Valid Title", "provider": "openai", "model": ""}), // Empty model
    ];

    for invalid_request in invalid_requests {
        let request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/conversations")
            .header("content-type", "application/json")
            .header("cookie", &test_user.session_cookie)
            .body(Body::from(invalid_request.to_string()))
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Invalid request should return 400: {}",
            invalid_request
        );

        let error_body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

        // Should return validation error
        assert!(error_response["error"].is_object());
        assert!(
            error_response["error"]["code"]
                .as_str()
                .unwrap()
                .contains("BAD_REQUEST")
                || error_response["error"]["code"]
                    .as_str()
                    .unwrap()
                    .contains("VALIDATION")
        );
    }
}

/// Test authentication error handling
#[tokio::test]
async fn test_authentication_error_handling() {
    let (app, _) = test_env::setup_test_app().await;

    // Test accessing protected endpoint without authentication
    let protected_endpoints = vec![
        ("/api/v1/conversations", Method::GET),
        ("/api/v1/conversations", Method::POST),
        ("/api/v1/auth/me", Method::GET),
        ("/api/v1/auth/logout", Method::POST),
        ("/api/v1/auth/session-info", Method::GET),
    ];

    for (endpoint, method) in protected_endpoints {
        let request = Request::builder()
            .method(method.clone())
            .uri(endpoint)
            .header("content-type", "application/json")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "Protected endpoint {} {} should require authentication",
            method,
            endpoint
        );

        let error_body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

        // Should return authentication error
        assert!(error_response["error"].is_object());
        assert_eq!(error_response["error"]["code"], "UNAUTHORIZED");
    }
}

/// Test authorization error handling
#[tokio::test]
async fn test_authorization_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Authorization",
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "metadata": {}
    });

    let create_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(create_conv_body.to_string()))
        .unwrap();

    let create_response = app.clone().oneshot(create_request).await.unwrap();
    let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
    let conversation_id = conversation["id"].as_str().unwrap();

    // Create another user (reusing the test app setup which creates a test user)
    // Note: For this test, we can simulate unauthorized access by using a different session cookie
    let mut other_user = test_user.clone();
    other_user.session_cookie = "invalid_session_cookie".to_string();

    // Try to access the conversation with the other user
    let unauthorized_request = Request::builder()
        .method(Method::GET)
        .uri(&format!("/api/v1/conversations/{}", conversation_id))
        .header("cookie", &other_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let unauthorized_response = app.oneshot(unauthorized_request).await.unwrap();
    assert_eq!(
        unauthorized_response.status(),
        StatusCode::FORBIDDEN,
        "Should deny access to other user's conversation"
    );

    let error_body = axum::body::to_bytes(unauthorized_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

    // Should return authorization error
    assert!(error_response["error"].is_object());
    assert_eq!(error_response["error"]["code"], "FORBIDDEN");
}

/// Test not found error handling
#[tokio::test]
async fn test_not_found_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test accessing non-existent conversation
    let non_existent_id = "00000000-0000-0000-0000-000000000000";
    let not_found_request = Request::builder()
        .method(Method::GET)
        .uri(&format!("/api/v1/conversations/{}", non_existent_id))
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let not_found_response = app.clone().oneshot(not_found_request).await.unwrap();
    assert_eq!(not_found_response.status(), StatusCode::NOT_FOUND);

    let error_body = axum::body::to_bytes(not_found_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

    // Should return not found error
    assert!(error_response["error"].is_object());
    assert_eq!(error_response["error"]["code"], "NOT_FOUND");

    // Test accessing non-existent endpoint
    let invalid_endpoint_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/nonexistent-endpoint")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let invalid_endpoint_response = app.oneshot(invalid_endpoint_request).await.unwrap();
    assert_eq!(invalid_endpoint_response.status(), StatusCode::NOT_FOUND);
}

/// Test method not allowed error handling
#[tokio::test]
async fn test_method_not_allowed_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test using wrong HTTP method
    let wrong_method_cases = vec![
        ("/api/v1/conversations", Method::PUT), // Should be GET or POST
        ("/api/v1/auth/me", Method::POST),      // Should be GET
        ("/api/v1/auth/login", Method::GET),    // Should be POST
    ];

    for (endpoint, wrong_method) in wrong_method_cases {
        let request = Request::builder()
            .method(wrong_method.clone())
            .uri(endpoint)
            .header("cookie", &test_user.session_cookie)
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::METHOD_NOT_ALLOWED,
            "Wrong method {} for {} should return 405",
            wrong_method,
            endpoint
        );
    }
}

/// Test content type error handling
#[tokio::test]
async fn test_content_type_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test sending JSON data without content-type header
    let no_content_type_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(
            json!({
                "title": "Test",
                "provider": "openai",
                "model": "gpt-3.5-turbo"
            })
            .to_string(),
        ))
        .unwrap();

    let no_content_type_response = app.clone().oneshot(no_content_type_request).await.unwrap();
    // Should handle missing content-type gracefully
    assert!(
        no_content_type_response.status().is_success()
            || no_content_type_response.status().is_client_error()
    );

    // Test sending with wrong content-type
    let wrong_content_type_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "text/plain")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from("not json data"))
        .unwrap();

    let wrong_content_type_response = app.oneshot(wrong_content_type_request).await.unwrap();
    assert_eq!(
        wrong_content_type_response.status(),
        StatusCode::BAD_REQUEST
    );
}

/// Test large payload error handling
#[tokio::test]
async fn test_large_payload_error_handling() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Test sending extremely large JSON payload
    let large_string = "A".repeat(10_000_000); // 10MB string
    let large_payload = json!({
        "title": large_string,
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "metadata": {}
    });

    let large_payload_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(large_payload.to_string()))
        .unwrap();

    let large_payload_response = app.oneshot(large_payload_request).await.unwrap();
    // Should either accept or reject large payloads gracefully
    assert!(
        large_payload_response.status().is_success()
            || large_payload_response.status().is_client_error()
            || large_payload_response.status().is_server_error()
    );

    // If rejected, should have proper error format
    if !large_payload_response.status().is_success() {
        let error_body = axum::body::to_bytes(large_payload_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();
        assert!(error_response["error"].is_object());
    }
}

/// Test concurrent error scenarios
#[tokio::test]
async fn test_concurrent_error_scenarios() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Perform concurrent operations that might fail
    let mut handles = Vec::new();
    for i in 0..10 {
        let app_clone = app.clone();
        let session_cookie = test_user.session_cookie.clone();

        let handle = tokio::spawn(async move {
            // Mix of valid and invalid requests
            let request = if i % 2 == 0 {
                // Valid request
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/conversations")
                    .header("content-type", "application/json")
                    .header("cookie", &session_cookie)
                    .body(Body::from(
                        json!({
                            "title": format!("Concurrent Test {}", i),
                            "provider": "openai",
                            "model": "gpt-3.5-turbo",
                            "metadata": {}
                        })
                        .to_string(),
                    ))
                    .unwrap()
            } else {
                // Invalid request
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/conversations")
                    .header("content-type", "application/json")
                    .header("cookie", &session_cookie)
                    .body(Body::from("{ invalid json"))
                    .unwrap()
            };

            (i, app_clone.oneshot(request).await)
        });
        handles.push(handle);
    }

    // Verify all requests are handled properly
    for handle in handles {
        let (i, result) = handle.await.unwrap();
        let response = result.unwrap();

        if i % 2 == 0 {
            // Valid requests should succeed
            assert_eq!(
                response.status(),
                StatusCode::CREATED,
                "Valid concurrent request {} should succeed",
                i
            );
        } else {
            // Invalid requests should return proper error
            assert_eq!(
                response.status(),
                StatusCode::BAD_REQUEST,
                "Invalid concurrent request {} should return 400",
                i
            );
        }
    }
}

/// Test error response consistency
#[tokio::test]
async fn test_error_response_consistency() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Generate various types of errors
    let error_scenarios = vec![
        // Validation error
        (
            Method::POST,
            "/api/v1/conversations",
            "{ \"title\": \"\" }",
            StatusCode::BAD_REQUEST,
        ),
        // JSON parsing error
        (
            Method::POST,
            "/api/v1/conversations",
            "{ invalid",
            StatusCode::BAD_REQUEST,
        ),
        // Not found error
        (
            Method::GET,
            "/api/v1/conversations/00000000-0000-0000-0000-000000000000",
            "",
            StatusCode::NOT_FOUND,
        ),
        // Method not allowed
        (
            Method::PUT,
            "/api/v1/conversations",
            "",
            StatusCode::METHOD_NOT_ALLOWED,
        ),
    ];

    for (method, endpoint, body, expected_status) in error_scenarios {
        let request = Request::builder()
            .method(method.clone())
            .uri(endpoint)
            .header("content-type", "application/json")
            .header("cookie", &test_user.session_cookie)
            .body(Body::from(body.to_string()))
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            expected_status,
            "Error scenario {} {} should return {}",
            method,
            endpoint,
            expected_status
        );

        if response.status().is_client_error() || response.status().is_server_error() {
            let error_body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            let error_response: serde_json::Value = serde_json::from_slice(&error_body).unwrap();

            // All error responses should have consistent structure
            assert!(
                error_response["error"].is_object(),
                "Error response should have 'error' object"
            );
            assert!(
                error_response["error"]["code"].is_string(),
                "Error should have 'code' field"
            );
            assert!(
                error_response["error"]["message"].is_string(),
                "Error should have 'message' field"
            );
            assert!(
                error_response["error"]["timestamp"].is_string(),
                "Error should have 'timestamp' field"
            );
            assert!(
                error_response["error"]["request_id"].is_string(),
                "Error should have 'request_id' field"
            );

            // Verify timestamp is valid ISO 8601
            let timestamp = error_response["error"]["timestamp"].as_str().unwrap();
            assert!(
                chrono::DateTime::parse_from_rfc3339(timestamp).is_ok(),
                "Timestamp should be valid RFC3339"
            );

            // Verify request_id format
            let request_id = error_response["error"]["request_id"].as_str().unwrap();
            assert!(
                request_id.starts_with("req_"),
                "Request ID should start with 'req_'"
            );
        }
    }
}
