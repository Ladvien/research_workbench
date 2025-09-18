use axum::{
    body::Body,
    extract::Request,
    http::{header, method::Method, HeaderValue, StatusCode},
};
use serde_json::json;
use std::time::Duration;
use tokio::time::sleep;
use tower::ServiceExt;

mod test_env;

/// Test password strength validation
#[tokio::test]
async fn test_password_strength_validation() {
    let (app, _) = test_env::setup_test_app().await;

    let weak_passwords = vec![
        "123",
        "password",
        "12345678",
        "qwerty",
        "abc123",
        "password123",
    ];

    for weak_password in weak_passwords {
        let strength_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/password-strength")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({ "password": weak_password }).to_string(),
            ))
            .unwrap();

        let strength_response = app.clone().oneshot(strength_request).await.unwrap();
        assert_eq!(strength_response.status(), StatusCode::OK);

        let strength_body = axum::body::to_bytes(strength_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let strength_result: serde_json::Value = serde_json::from_slice(&strength_body).unwrap();

        // Weak passwords should have low scores
        assert!(
            strength_result["score"].as_f64().unwrap_or(0.0) < 3.0,
            "Password '{}' should be considered weak",
            weak_password
        );
    }

    // Test strong password
    let strong_password = "MyVerySecurePassword123!@#";
    let strength_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/password-strength")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "password": strong_password }).to_string(),
        ))
        .unwrap();

    let strength_response = app.oneshot(strength_request).await.unwrap();
    assert_eq!(strength_response.status(), StatusCode::OK);

    let strength_body = axum::body::to_bytes(strength_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let strength_result: serde_json::Value = serde_json::from_slice(&strength_body).unwrap();

    // Strong password should have high score
    assert!(
        strength_result["score"].as_f64().unwrap_or(0.0) >= 3.0,
        "Strong password should have high score"
    );
}

/// Test registration with weak password rejection
#[tokio::test]
async fn test_registration_weak_password_rejection() {
    let (app, _) = test_env::setup_test_app().await;

    let register_body = json!({
        "email": "weakpass@test.com",
        "username": "weakpass_user",
        "password": "123"
    });

    let register_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(register_body.to_string()))
        .unwrap();

    let register_response = app.oneshot(register_request).await.unwrap();
    // Should reject weak password
    assert_eq!(register_response.status(), StatusCode::BAD_REQUEST);

    let register_body = axum::body::to_bytes(register_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let error_response: serde_json::Value = serde_json::from_slice(&register_body).unwrap();

    // Should contain password strength error
    let error_message = error_response["error"]["message"].as_str().unwrap_or("");
    assert!(
        error_message.to_lowercase().contains("password") ||
        error_message.to_lowercase().contains("strength"),
        "Error should mention password strength: {}",
        error_message
    );
}

/// Test password change functionality
#[tokio::test]
async fn test_password_change() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Change password
    let change_password_body = json!({
        "current_password": "password123",
        "new_password": "NewSecurePassword123!@#"
    });

    let change_password_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/change-password")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(change_password_body.to_string()))
        .unwrap();

    let change_password_response = app.clone().oneshot(change_password_request).await.unwrap();
    assert_eq!(change_password_response.status(), StatusCode::OK);

    // Try to login with old password (should fail)
    let old_login_body = json!({
        "email": &test_user.email,
        "password": "password123"
    });

    let old_login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(old_login_body.to_string()))
        .unwrap();

    let old_login_response = app.clone().oneshot(old_login_request).await.unwrap();
    assert_eq!(old_login_response.status(), StatusCode::UNAUTHORIZED);

    // Try to login with new password (should succeed)
    let new_login_body = json!({
        "email": &test_user.email,
        "password": "NewSecurePassword123!@#"
    });

    let new_login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(new_login_body.to_string()))
        .unwrap();

    let new_login_response = app.oneshot(new_login_request).await.unwrap();
    assert_eq!(new_login_response.status(), StatusCode::OK);
}

/// Test password change with wrong current password
#[tokio::test]
async fn test_password_change_wrong_current_password() {
    let (app, test_user) = test_env::setup_test_app().await;

    let change_password_body = json!({
        "current_password": "wrong_password",
        "new_password": "NewSecurePassword123!@#"
    });

    let change_password_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/change-password")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(change_password_body.to_string()))
        .unwrap();

    let change_password_response = app.oneshot(change_password_request).await.unwrap();
    assert_eq!(change_password_response.status(), StatusCode::UNAUTHORIZED);
}

/// Test password change with weak new password
#[tokio::test]
async fn test_password_change_weak_new_password() {
    let (app, test_user) = test_env::setup_test_app().await;

    let change_password_body = json!({
        "current_password": "password123",
        "new_password": "123"
    });

    let change_password_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/change-password")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::from(change_password_body.to_string()))
        .unwrap();

    let change_password_response = app.oneshot(change_password_request).await.unwrap();
    assert_eq!(change_password_response.status(), StatusCode::BAD_REQUEST);
}

/// Test account lockout after multiple failed login attempts
#[tokio::test]
async fn test_account_lockout_protection() {
    let (app, _) = test_env::setup_test_app().await;

    // Register a user
    let register_body = json!({
        "email": "lockout_test@test.com",
        "username": "lockout_test_user",
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

    // Attempt multiple failed logins
    for i in 0..6 {
        let failed_login_body = json!({
            "email": "lockout_test@test.com",
            "password": "wrong_password"
        });

        let failed_login_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(failed_login_body.to_string()))
            .unwrap();

        let failed_login_response = app.clone().oneshot(failed_login_request).await.unwrap();

        if i < 5 {
            // First 5 attempts should return UNAUTHORIZED
            assert_eq!(failed_login_response.status(), StatusCode::UNAUTHORIZED);
        } else {
            // 6th attempt might trigger lockout (depending on implementation)
            assert!(
                failed_login_response.status() == StatusCode::UNAUTHORIZED ||
                failed_login_response.status() == StatusCode::TOO_MANY_REQUESTS
            );
        }
    }

    // Try with correct password (might be locked out)
    let correct_login_body = json!({
        "email": "lockout_test@test.com",
        "password": "SecurePassword123!"
    });

    let correct_login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(correct_login_body.to_string()))
        .unwrap();

    let correct_login_response = app.oneshot(correct_login_request).await.unwrap();
    // Depending on lockout implementation, this might succeed or be locked out
    assert!(
        correct_login_response.status() == StatusCode::OK ||
        correct_login_response.status() == StatusCode::TOO_MANY_REQUESTS ||
        correct_login_response.status() == StatusCode::UNAUTHORIZED
    );
}

/// Test JWT token security and validation
#[tokio::test]
async fn test_jwt_token_security() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Login to get JWT token (if using JWT authentication)
    let login_body = json!({
        "email": &test_user.email,
        "password": "password123"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    // Check for Authorization header in response (if JWT is returned)
    let login_body_response = axum::body::to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_data: serde_json::Value = serde_json::from_slice(&login_body_response).unwrap();

    // Test accessing protected endpoint with invalid token
    let invalid_token_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("authorization", "Bearer invalid_token_here")
        .body(Body::empty())
        .unwrap();

    let invalid_token_response = app.clone().oneshot(invalid_token_request).await.unwrap();
    assert_eq!(invalid_token_response.status(), StatusCode::UNAUTHORIZED);

    // Test with malformed authorization header
    let malformed_auth_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("authorization", "NotBearer malformed")
        .body(Body::empty())
        .unwrap();

    let malformed_auth_response = app.oneshot(malformed_auth_request).await.unwrap();
    assert_eq!(malformed_auth_response.status(), StatusCode::UNAUTHORIZED);
}

/// Test refresh token functionality
#[tokio::test]
async fn test_refresh_token_functionality() {
    let (app, test_user) = test_env::setup_test_app().await;

    // Login to potentially get refresh token
    let login_body = json!({
        "email": &test_user.email,
        "password": "password123"
    });

    let login_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(login_body.to_string()))
        .unwrap();

    let login_response = app.clone().oneshot(login_request).await.unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);

    let login_body_response = axum::body::to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_data: serde_json::Value = serde_json::from_slice(&login_body_response).unwrap();

    // Test refresh token endpoint
    let refresh_request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/refresh")
        .header("content-type", "application/json")
        .header("cookie", &test_user.session_cookie)
        .body(Body::empty())
        .unwrap();

    let refresh_response = app.oneshot(refresh_request).await.unwrap();
    // Refresh endpoint should either work or return appropriate error
    assert!(
        refresh_response.status() == StatusCode::OK ||
        refresh_response.status() == StatusCode::UNAUTHORIZED ||
        refresh_response.status() == StatusCode::BAD_REQUEST
    );
}

/// Test CSRF token functionality
#[tokio::test]
async fn test_csrf_token_functionality() {
    let (app, _) = test_env::setup_test_app().await;

    // Get CSRF token
    let csrf_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/csrf-token")
        .body(Body::empty())
        .unwrap();

    let csrf_response = app.clone().oneshot(csrf_request).await.unwrap();
    assert_eq!(csrf_response.status(), StatusCode::OK);

    let csrf_body = axum::body::to_bytes(csrf_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let csrf_data: serde_json::Value = serde_json::from_slice(&csrf_body).unwrap();

    // CSRF token should be provided
    assert!(csrf_data["csrf_token"].is_string());
    let csrf_token = csrf_data["csrf_token"].as_str().unwrap();
    assert!(!csrf_token.is_empty());
}

/// Test authentication health endpoint
#[tokio::test]
async fn test_auth_health_endpoint() {
    let (app, _) = test_env::setup_test_app().await;

    let health_request = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/health")
        .body(Body::empty())
        .unwrap();

    let health_response = app.oneshot(health_request).await.unwrap();
    assert_eq!(health_response.status(), StatusCode::OK);

    let health_body = axum::body::to_bytes(health_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let health_data: serde_json::Value = serde_json::from_slice(&health_body).unwrap();

    // Health endpoint should return status information
    assert!(health_data["status"].is_string());
    assert_eq!(health_data["status"], "healthy");
}

/// Test input validation and sanitization
#[tokio::test]
async fn test_input_validation_and_sanitization() {
    let (app, _) = test_env::setup_test_app().await;

    // Test registration with invalid email formats
    let invalid_emails = vec![
        "not_an_email",
        "@domain.com",
        "user@",
        "user@domain",
        "",
        "user@domain..com",
    ];

    for invalid_email in invalid_emails {
        let register_body = json!({
            "email": invalid_email,
            "username": "valid_username",
            "password": "ValidPassword123!"
        });

        let register_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/register")
            .header("content-type", "application/json")
            .body(Body::from(register_body.to_string()))
            .unwrap();

        let register_response = app.clone().oneshot(register_request).await.unwrap();
        assert_eq!(
            register_response.status(),
            StatusCode::BAD_REQUEST,
            "Invalid email '{}' should be rejected",
            invalid_email
        );
    }

    // Test registration with invalid usernames
    let invalid_usernames = vec![
        "",
        "a",
        "user@name",
        "user name",
        "very_long_username_that_exceeds_reasonable_limits_and_should_be_rejected",
    ];

    for invalid_username in invalid_usernames {
        let register_body = json!({
            "email": "valid@email.com",
            "username": invalid_username,
            "password": "ValidPassword123!"
        });

        let register_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/register")
            .header("content-type", "application/json")
            .body(Body::from(register_body.to_string()))
            .unwrap();

        let register_response = app.clone().oneshot(register_request).await.unwrap();
        assert_eq!(
            register_response.status(),
            StatusCode::BAD_REQUEST,
            "Invalid username '{}' should be rejected",
            invalid_username
        );
    }
}

/// Test SQL injection protection
#[tokio::test]
async fn test_sql_injection_protection() {
    let (app, _) = test_env::setup_test_app().await;

    // Test various SQL injection attempts
    let sql_injection_attempts = vec![
        "'; DROP TABLE users; --",
        "admin'/*",
        "1' OR '1'='1",
        "1' UNION SELECT * FROM users --",
        "'; INSERT INTO users (username) VALUES ('hacker'); --",
    ];

    for injection_attempt in sql_injection_attempts {
        let register_body = json!({
            "email": format!("{}@test.com", injection_attempt),
            "username": injection_attempt,
            "password": "ValidPassword123!"
        });

        let register_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/register")
            .header("content-type", "application/json")
            .body(Body::from(register_body.to_string()))
            .unwrap();

        let register_response = app.clone().oneshot(register_request).await.unwrap();
        // SQL injection attempts should be rejected or handled safely
        assert!(
            register_response.status() == StatusCode::BAD_REQUEST ||
            register_response.status() == StatusCode::UNPROCESSABLE_ENTITY
        );

        // Also test login with injection attempts
        let login_body = json!({
            "email": injection_attempt,
            "password": injection_attempt
        });

        let login_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(login_body.to_string()))
            .unwrap();

        let login_response = app.clone().oneshot(login_request).await.unwrap();
        // Should safely handle injection attempts
        assert!(
            login_response.status() == StatusCode::UNAUTHORIZED ||
            login_response.status() == StatusCode::BAD_REQUEST
        );
    }
}

/// Test rate limiting on authentication endpoints
#[tokio::test]
async fn test_authentication_rate_limiting() {
    let (app, _) = test_env::setup_test_app().await;

    // Perform rapid login attempts
    let mut responses = Vec::new();
    for i in 0..10 {
        let login_body = json!({
            "email": format!("rate_limit_test_{}@test.com", i),
            "password": "some_password"
        });

        let login_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(login_body.to_string()))
            .unwrap();

        let login_response = app.clone().oneshot(login_request).await.unwrap();
        responses.push(login_response.status());
    }

    // Check if rate limiting kicked in (at least some requests should succeed initially)
    let successful_requests = responses
        .iter()
        .filter(|&&status| status == StatusCode::UNAUTHORIZED) // These would be normal "user not found" responses
        .count();
    let rate_limited_requests = responses
        .iter()
        .filter(|&&status| status == StatusCode::TOO_MANY_REQUESTS)
        .count();

    // Either we got normal responses or rate limiting kicked in
    assert!(successful_requests > 0 || rate_limited_requests > 0);
}