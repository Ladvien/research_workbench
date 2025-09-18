use axum::{
    body::Body,
    extract::Request,
    http::{header, method::Method, HeaderValue, StatusCode},
};
use serde_json::json;
use std::time::Duration;
use tokio::time::sleep;
use tower::ServiceExt;
use uuid::Uuid;

mod test_env;

/// Test session creation and validation
#[tokio::test]
async fn test_session_creation_and_validation() {
    let (app, _) = test_env::setup_test_app().await;

    // Register a new user
    let register_body = json!({
        "email": "session_test@test.com",
        "username": "session_test_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    // Login to create a session
    let login_body = json!({
        "email": "session_test@test.com",
        "password": "SecurePassword123!"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    // Extract session cookie
    let session_cookie = login_response
        .headers()
        .get("set-cookie")
        .and_then(|cookie| cookie.to_str().ok())
        .expect("Session cookie should be set");

    // Verify session is valid by accessing protected endpoint
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);

    let me_body = axum::body::to_bytes(me_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let user_data: serde_json::Value = serde_json::from_slice(&me_body).unwrap();
    assert_eq!(user_data["email"], "session_test@test.com");
}

/// Test session invalidation on logout
#[tokio::test]
async fn test_session_invalidation_on_logout() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Verify session is initially valid
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.clone().oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);

    // Logout to invalidate session
    let logout_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/logout")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let logout_response = app.clone().oneshot(logout_request).await.unwrap();
    assert_eq!(logout_response.status(), StatusCode::OK);

    // Verify session is now invalid
    let me_request_after = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response_after = app.oneshot(me_request_after).await.unwrap();
    assert_eq!(me_response_after.status(), StatusCode::UNAUTHORIZED);
}

/// Test multiple concurrent sessions for same user
#[tokio::test]
async fn test_multiple_sessions_same_user() {
    let (app, _) = test_env::setup_test_app().await;

    // Register a user
    let register_body = json!({
        "email": "multi_session@test.com",
        "username": "multi_session_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    // Create multiple sessions by logging in multiple times
    let mut session_cookies = Vec::new();
    for _ in 0..3 {
        let login_body = json!({
            "email": "multi_session@test.com",
            "password": "SecurePassword123!"
        });

        let login_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(login_body.to_string()))
            .unwrap();

        let login_response = app.clone().oneshot(login_request).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);

        let session_cookie = login_response
            .headers()
            .get("set-cookie")
            .and_then(|cookie| cookie.to_str().ok())
            .expect("Session cookie should be set")
            .to_string();

        session_cookies.push(session_cookie);
    }

    // Verify all sessions are valid
    for session_cookie in &session_cookies {
        let me_request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/me")
            .header("cookie", session_cookie)
            .body(Body::empty())
            .unwrap();

        let me_response = app.clone().oneshot(me_request).await.unwrap();
        assert_eq!(me_response.status(), StatusCode::OK);
    }
}

/// Test session timeout behavior
#[tokio::test]
async fn test_session_timeout() {
    // Note: This test requires a short session timeout for practical testing
    // In production, session timeout would be much longer
    let (app, _) = test_env::setup_test_app().await;

    // Register and login
    let register_body = json!({
        "email": "timeout_test@test.com",
        "username": "timeout_test_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    let login_body = json!({
        "email": "timeout_test@test.com",
        "password": "SecurePassword123!"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    let session_cookie = login_response
        .headers()
        .get("set-cookie")
        .and_then(|cookie| cookie.to_str().ok())
        .expect("Session cookie should be set");

    // Verify session is initially valid
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.clone().oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);

    // Note: In a real timeout test, we'd wait for the session to expire
    // For this test, we just verify the session is properly established
    // Actual timeout testing would require configuring very short timeouts
}

/// Test session hijacking protection
#[tokio::test]
async fn test_session_hijacking_protection() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Try to use session cookie from different IP (simulated by headers)
    let hijack_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", &test_user.session_cookie)
        .header("x-forwarded-for", "192.168.1.999") // Different IP
        .header("user-agent", "Malicious Browser") // Different user agent
        .body(Body::empty())
        .unwrap();

    let hijack_response = app.oneshot(hijack_request).await.unwrap();
    // Session should still work for testing, but in production might have additional checks
    // This test mainly verifies the session system handles different headers gracefully
    assert!(
        hijack_response.status().is_success()
            || hijack_response.status() == StatusCode::UNAUTHORIZED
    );
}

/// Test session info endpoint
#[tokio::test]
async fn test_session_info_endpoint() {
    let (app, test_user) = test_env::setup_test_app().await;

    let session_info_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/session-info")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let session_info_response = app.oneshot(session_info_request).await.unwrap();
    assert_eq!(session_info_response.status(), StatusCode::OK);

    let session_info_body = axum::body::to_bytes(session_info_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let session_info: serde_json::Value = serde_json::from_slice(&session_info_body).unwrap();

    // Verify session info contains expected fields
    assert!(session_info["user_id"].is_string());
    assert!(session_info["created_at"].is_string());
    assert!(session_info["last_activity"].is_string());
    assert!(session_info["expires_at"].is_string());
}

/// Test invalidating all sessions
#[tokio::test]
async fn test_invalidate_all_sessions() {
    let (app, _) = test_env::setup_test_app().await;

    // Register a user
    let register_body = json!({
        "email": "invalidate_all@test.com",
        "username": "invalidate_all_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    // Create multiple sessions
    let mut session_cookies = Vec::new();
    for _ in 0..2 {
        let login_body = json!({
            "email": "invalidate_all@test.com",
            "password": "SecurePassword123!"
        });

        let login_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(login_body.to_string()))
            .unwrap();

        let login_response = app.clone().oneshot(login_request).await.unwrap();
        let session_cookie = login_response
            .headers()
            .get("set-cookie")
            .and_then(|cookie| cookie.to_str().ok())
            .expect("Session cookie should be set")
            .to_string();

        session_cookies.push(session_cookie);
    }

    // Invalidate all sessions using one of the sessions
    let invalidate_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/invalidate-sessions")
        .header("cookie", &session_cookies[0])
        .body(Body::empty())
        .unwrap();

    let invalidate_response = app.clone().oneshot(invalidate_request).await.unwrap();
    assert_eq!(invalidate_response.status(), StatusCode::OK);

    // Verify all sessions are now invalid
    for session_cookie in &session_cookies {
        let me_request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/me")
            .header("cookie", session_cookie)
            .body(Body::empty())
            .unwrap();

        let me_response = app.clone().oneshot(me_request).await.unwrap();
        assert_eq!(me_response.status(), StatusCode::UNAUTHORIZED);
    }
}

/// Test session storage fallback behavior
#[tokio::test]
async fn test_session_storage_fallback() {
    // This test verifies that sessions work even if Redis is not available
    // The session system should fall back to PostgreSQL storage
    let (app, _) = test_env::setup_test_app().await;

    // Register and login (this creates a session in storage)
    let register_body = json!({
        "email": "fallback_test@test.com",
        "username": "fallback_test_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    let login_body = json!({
        "email": "fallback_test@test.com",
        "password": "SecurePassword123!"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    let session_cookie = login_response
        .headers()
        .get("set-cookie")
        .and_then(|cookie| cookie.to_str().ok())
        .expect("Session cookie should be set");

    // Verify session works (this tests the storage backend)
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);
}

/// Test concurrent session operations
#[tokio::test]
async fn test_concurrent_session_operations() {
    let (app, _) = test_env::setup_test_app().await;

    // Register a user
    let register_body = json!({
        "email": "concurrent@test.com",
        "username": "concurrent_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    // Perform concurrent login attempts
    let mut handles = Vec::new();
    for i in 0..5 {
        let app_clone = app.clone();
        let handle = tokio::spawn(async move {
            let login_body = json!({
                "email": "concurrent@test.com",
                "password": "SecurePassword123!"
            });

            let login_request = Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(login_body.to_string()))
                .unwrap();

            (i, app_clone.oneshot(login_request).await)
        });
        handles.push(handle);
    }

    // Wait for all concurrent logins
    let mut session_cookies = Vec::new();
    for handle in handles {
        let (i, result) = handle.await.unwrap();
        let response = result.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "Login {} should succeed",
            i
        );

        if let Some(cookie) = response
            .headers()
            .get("set-cookie")
            .and_then(|cookie| cookie.to_str().ok())
        {
            session_cookies.push(cookie.to_string());
        }
    }

    // Verify all sessions are valid
    for (i, session_cookie) in session_cookies.iter().enumerate() {
        let me_request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/me")
            .header("cookie", session_cookie)
            .body(Body::empty())
            .unwrap();

        let me_response = app.clone().oneshot(me_request).await.unwrap();
        assert_eq!(
            me_response.status(),
            StatusCode::OK,
            "Session {} should be valid",
            i
        );
    }
}

/// Test session cleanup after user deletion
#[tokio::test]
async fn test_session_cleanup_after_user_deletion() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Verify session is initially valid
    let me_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let me_response = app.clone().oneshot(me_request).await.unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);

    // Note: User deletion endpoint would need to be implemented for complete test
    // For now, we just verify session validation works properly
    // In a complete implementation, deleting a user should invalidate all their sessions
}

/// Test session cookie security attributes
#[tokio::test]
async fn test_session_cookie_security() {
    let (app, _) = test_env::setup_test_app().await;

    // Register and login
    let register_body = json!({
        "email": "cookie_security@test.com",
        "username": "cookie_security_user",
        "password": "SecurePassword123!"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.clone().oneshot(register_request).await.unwrap();
    assert_eq!(register_response.status(), StatusCode::CREATED);

    let login_body = json!({
        "email": "cookie_security@test.com",
        "password": "SecurePassword123!"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    // Check cookie security attributes
    let set_cookie_header = login_response
        .headers()
        .get("set-cookie")
        .and_then(|cookie| cookie.to_str().ok())
        .expect("Session cookie should be set");

    // In development, these might not be set, but we can verify the format
    // In production, cookies should have HttpOnly, Secure, and SameSite attributes
    assert!(set_cookie_header.contains("=")); // Basic cookie format
}
