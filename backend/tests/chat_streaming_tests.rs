use axum::{
    body::Body,
    extract::Request,
    http::{header, method::Method, HeaderValue, StatusCode},
    response::Response,
};
use bytes::Bytes;
use futures::{Stream, StreamExt};
use serde_json::json;
use std::{collections::HashMap, pin::Pin, time::Duration};
use tokio::time::timeout;
use tower::ServiceExt;
use uuid::Uuid;

mod test_env;

/// Test chat streaming endpoint with valid request
#[tokio::test]
async fn test_chat_streaming_valid_request() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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
    assert_eq!(create_response.status(), StatusCode::CREATED);

    let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
    let conversation_id = conversation["id"].as_str().unwrap();

    // Now test streaming
    let stream_body = json!({
        "content": "Hello, this is a test message",
        "model": "gpt-3.5-turbo",
        "temperature": 0.7,
        "max_tokens": 100
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::OK);

    // Verify content-type is text/event-stream
    let content_type = stream_response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(content_type.contains("text/event-stream"));

    // Read and verify stream content
    let stream_body = stream_response.into_body();
    let body_bytes = axum::body::to_bytes(stream_body, usize::MAX).await.unwrap();
    let stream_content = String::from_utf8(body_bytes.to_vec()).unwrap();

    // Verify SSE structure
    assert!(stream_content.contains("data:"));
    assert!(stream_content.contains("type"));
}

/// Test chat streaming with invalid conversation ID
#[tokio::test]
async fn test_chat_streaming_invalid_conversation_id() {
    let (app, test_user) = test_env::setup_test_app().await;

    let invalid_id = Uuid::new_v4();
    let stream_body = json!({
        "content": "Hello, this is a test message",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", invalid_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::NOT_FOUND);
}

/// Test chat streaming without authentication
#[tokio::test]
async fn test_chat_streaming_unauthenticated() {
    let (app, _) = test_env::setup_test_app().await;

    let conversation_id = Uuid::new_v4();
    let stream_body = json!({
        "content": "Hello, this is a test message",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::UNAUTHORIZED);
}

/// Test chat streaming with unauthorized conversation access
#[tokio::test]
async fn test_chat_streaming_unauthorized_conversation() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create another user
    let other_user = test_env::create_test_user("other@test.com", "other_user", "password123")
        .await
        .unwrap();

    // Create a conversation as the other user
    let create_conv_body = json!({
        "title": "Other User's Conversation",
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "metadata": {}
    });

    let create_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/conversations")
        .header("content-type", "application/json")
        .header("cookie", &other_user.session_cookie)
        .body(Body::from(create_conv_body.to_string()))
        .unwrap();

    let create_response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(create_response.status(), StatusCode::CREATED);

    let create_body = axum::body::to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let conversation: serde_json::Value = serde_json::from_slice(&create_body).unwrap();
    let conversation_id = conversation["id"].as_str().unwrap();

    // Try to stream with the first user (should be forbidden)
    let stream_body = json!({
        "content": "Hello, this is a test message",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::FORBIDDEN);
}

/// Test chat streaming with invalid JSON body
#[tokio::test]
async fn test_chat_streaming_invalid_json() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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

    // Send invalid JSON
    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from("{ invalid json }"))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::BAD_REQUEST);
}

/// Test chat streaming with missing required fields
#[tokio::test]
async fn test_chat_streaming_missing_content() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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

    // Send request without content
    let stream_body = json!({
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::BAD_REQUEST);
}

/// Test chat streaming with empty content
#[tokio::test]
async fn test_chat_streaming_empty_content() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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

    // Send request with empty content
    let stream_body = json!({
        "content": "",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::BAD_REQUEST);
}

/// Test chat streaming with unsupported provider
#[tokio::test]
async fn test_chat_streaming_unsupported_provider() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation with unsupported provider
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
        "provider": "unsupported_provider",
        "model": "some-model",
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

    // Try streaming with unsupported provider
    let stream_body = json!({
        "content": "Hello, this is a test message",
        "model": "some-model"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::BAD_REQUEST);
}

/// Test SSE event structure and format
#[tokio::test]
async fn test_sse_event_structure() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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

    // Stream a short message
    let stream_body = json!({
        "content": "Short test",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    let stream_response = app.oneshot(stream_request).await.unwrap();
    assert_eq!(stream_response.status(), StatusCode::OK);

    let stream_body = stream_response.into_body();
    let body_bytes = axum::body::to_bytes(stream_body, usize::MAX).await.unwrap();
    let stream_content = String::from_utf8(body_bytes.to_vec()).unwrap();

    // Verify SSE format
    let lines: Vec<&str> = stream_content.lines().collect();
    let mut found_start = false;
    let mut found_token = false;
    let mut found_done = false;

    for line in lines {
        if line.starts_with("data:") {
            let data = &line[5..]; // Remove "data:"
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                match event["type"].as_str() {
                    Some("start") => {
                        found_start = true;
                        assert!(event["data"]["conversationId"].is_string());
                        assert!(event["data"]["messageId"].is_string());
                    }
                    Some("token") => {
                        found_token = true;
                        assert!(event["data"]["content"].is_string());
                    }
                    Some("done") => {
                        found_done = true;
                        assert!(event["data"]["messageId"].is_string());
                    }
                    _ => {}
                }
            }
        }
    }

    assert!(found_start, "Should have found 'start' event");
    assert!(found_token, "Should have found 'token' event");
    assert!(found_done, "Should have found 'done' event");
}

/// Test streaming connection cleanup and error handling
#[tokio::test]
async fn test_streaming_connection_cleanup() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create a conversation first
    let create_conv_body = json!({
        "title": "Test Stream Conversation",
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

    // Test that streaming completes within reasonable time
    let stream_body = json!({
        "content": "Test message for cleanup",
        "model": "gpt-3.5-turbo"
    });

    let stream_request = Request::builder()
        .method(Method::POST)
        .uri(&format!("/api/v1/conversations/{}/stream", conversation_id))
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(stream_body.to_string()))
        .unwrap();

    // Use timeout to ensure streaming doesn't hang
    let stream_result = timeout(Duration::from_secs(10), app.oneshot(stream_request)).await;
    assert!(
        stream_result.is_ok(),
        "Streaming should complete within 10 seconds"
    );

    let stream_response = stream_result.unwrap().unwrap();
    assert_eq!(stream_response.status(), StatusCode::OK);
}

/// Test concurrent streaming requests
#[tokio::test]
async fn test_concurrent_streaming_requests() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Create multiple conversations
    let mut conversation_ids = Vec::new();
    for i in 0..3 {
        let create_conv_body = json!({
            "title": format!("Test Stream Conversation {}", i),
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
        conversation_ids.push(conversation["id"].as_str().unwrap().to_string());
    }

    // Start concurrent streaming requests
    let mut handles = Vec::new();
    for (i, conv_id) in conversation_ids.iter().enumerate() {
        let app_clone = app.clone();
        let conv_id_clone = conv_id.clone();
        let session_cookie = test_user.session_cookie.clone();

        let handle = tokio::spawn(async move {
            let stream_body = json!({
                "content": format!("Concurrent message {}", i),
                "model": "gpt-3.5-turbo"
            });

            let stream_request = Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/conversations/{}/stream", conv_id_clone))
                .header("content-type", "application/json")
                .header("cookie", &session_cookie)
                .body(Body::from(stream_body.to_string()))
                .unwrap();

            app_clone.oneshot(stream_request).await
        });
        handles.push(handle);
    }

    // Wait for all requests to complete
    for handle in handles {
        let result = handle.await.unwrap().unwrap();
        assert_eq!(result.status(), StatusCode::OK);
    }
}
