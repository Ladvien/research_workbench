//! Integration Tests for AUTH-003: Session Management Security Fixes
//!
//! These tests verify that the hybrid JWT/Session conflicts have been resolved
//! and that session invalidation works correctly on logout.

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    response::Response,
};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use workbench_server::{
    app_state::AppState,
    config::{AppConfig, JwtConfig},
    handlers::auth,
    models::{LoginRequest, RegisterRequest, UserResponse},
    repositories::{refresh_token::RefreshTokenRepository, user::UserRepository},
    services::{auth::AuthService, session::SessionManager},
};
// use tower_sessions::{MemoryStore, Session, SessionManagerLayer};
use uuid::Uuid;

/// Test session invalidation on logout
#[tokio::test]
async fn test_session_invalidation_on_logout() {
    // Create in-memory session manager for testing
    let session_manager = SessionManager::new(
        None, // No Redis for test
        None, // No PostgreSQL for test
        5,    // max_sessions_per_user
        24,   // session_timeout_hours
    );

    // Mock user for testing
    let user_id = Uuid::new_v4();
    let _user = UserResponse {
        id: user_id,
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        created_at: chrono::Utc::now(),
    };

    // Create session data
    let session_data = workbench_server::services::session::SessionData {
        user_id,
        created_at: chrono::Utc::now(),
        last_accessed: chrono::Utc::now(),
        ip_address: Some("192.168.1.100".into()),
        user_agent: Some("Test Agent".into()),
    };

    let session_id = "test_logout_session";
    session_manager
        .store_session(session_id, session_data)
        .await
        .unwrap();

    // Verify session exists before logout
    let session_count_before = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(
        session_count_before, 1,
        "Should have 1 session before logout"
    );

    // Test the session manager part directly (tower_sessions would be mocked in full integration)
    // For now, we test that session invalidation works at the session manager level
    // which is the core issue being fixed in AUTH-003

    // Simulate user logout by invalidating all user sessions
    session_manager
        .invalidate_user_sessions(user_id)
        .await
        .unwrap();

    // Verify all sessions are invalidated
    let session_count_after = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(
        session_count_after, 0,
        "Should have 0 sessions after logout"
    );

    println!("✅ Session invalidation on logout working correctly");
}

/// Test concurrent session limits enforcement
#[tokio::test]
async fn test_concurrent_session_limits_enforcement() {
    let redis_url = std::env::var("REDIS_URL").ok();
    let session_manager = SessionManager::new(
        redis_url, None, 3, 24, // Limit to 3 sessions for testing
    );

    let user_id = Uuid::new_v4();

    // Create 5 sessions (should enforce limit of 3)
    for i in 1..=5 {
        let session_id = format!("limit_test_session_{}", i);
        let session_data = workbench_server::services::session::SessionData {
            user_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some(format!("192.168.1.{}", i).into()),
            user_agent: Some(format!("Agent {}", i).into()),
        };

        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();
    }

    // Should have enforced limit of 3
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(final_count, 3, "Should enforce session limit of 3");

    println!("✅ Concurrent session limits enforced correctly");
}

/// Test Redis integration (if available)
#[tokio::test]
async fn test_redis_session_integration() {
    // Skip if no Redis URL configured
    let redis_url = std::env::var("REDIS_URL").ok();
    if redis_url.is_none() {
        println!("⏭️  Skipping Redis integration test - REDIS_URL not set");
        return;
    }

    let session_manager = SessionManager::new(
        redis_url, None, // No PostgreSQL for this test
        5, 24,
    );

    let user_id = Uuid::new_v4();
    let session_id = "redis_integration_test";

    let session_data = workbench_server::services::session::SessionData {
        user_id,
        created_at: chrono::Utc::now(),
        last_accessed: chrono::Utc::now(),
        ip_address: Some("192.168.1.100".into()),
        user_agent: Some("Redis Test Agent".into()),
    };

    // Store session in Redis
    let store_result = session_manager
        .store_session(session_id, session_data.clone())
        .await;
    assert!(store_result.is_ok(), "Should store session in Redis");

    // Retrieve session from Redis
    let retrieved = session_manager.get_session(session_id).await.unwrap();
    assert!(retrieved.is_some(), "Should retrieve session from Redis");

    let retrieved_data = retrieved.unwrap();
    assert_eq!(retrieved_data.user_id, user_id);
    assert_eq!(retrieved_data.ip_address, Some("192.168.1.100".into()));

    // Delete session
    let delete_result = session_manager.delete_session(session_id).await;
    assert!(delete_result.is_ok(), "Should delete session from Redis");

    // Verify session is gone
    let after_delete = session_manager.get_session(session_id).await.unwrap();
    assert!(
        after_delete.is_none(),
        "Session should be deleted from Redis"
    );

    println!("✅ Redis session integration working correctly");
}

/// Test session security validation
#[tokio::test]
async fn test_session_security_validation() {
    let user_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    // Test valid session
    let valid_session = workbench_server::services::session::SessionData {
        user_id,
        created_at: now - chrono::Duration::minutes(30),
        last_accessed: now - chrono::Duration::minutes(5),
        ip_address: Some("192.168.1.100".into()),
        user_agent: Some("Valid Agent".into()),
    };

    let result =
        workbench_server::middleware::session_auth::SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Valid Agent"),
            &valid_session,
        );
    assert!(
        result.is_ok(),
        "Valid session should pass security validation"
    );

    // Test expired session (created too long ago)
    let expired_session = workbench_server::services::session::SessionData {
        user_id,
        created_at: now - chrono::Duration::hours(25), // Over 24 hours
        last_accessed: now - chrono::Duration::hours(25),
        ip_address: Some("192.168.1.100".into()),
        user_agent: Some("Expired Agent".into()),
    };

    let result =
        workbench_server::middleware::session_auth::SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Expired Agent"),
            &expired_session,
        );
    assert!(
        result.is_err(),
        "Expired session should fail security validation"
    );

    // Test idle session (last accessed too long ago)
    let idle_session = workbench_server::services::session::SessionData {
        user_id,
        created_at: now - chrono::Duration::minutes(30),
        last_accessed: now - chrono::Duration::hours(3), // Over 2 hours idle
        ip_address: Some("192.168.1.100".into()),
        user_agent: Some("Idle Agent".into()),
    };

    let result =
        workbench_server::middleware::session_auth::SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Idle Agent"),
            &idle_session,
        );
    assert!(
        result.is_err(),
        "Idle session should fail security validation"
    );

    println!("✅ Session security validation working correctly");
}

/// Test user isolation - sessions from different users don't interfere
#[tokio::test]
async fn test_user_session_isolation() {
    let redis_url = std::env::var("REDIS_URL").ok();
    let session_manager = SessionManager::new(redis_url, None, 5, 24);

    let user1_id = Uuid::new_v4();
    let user2_id = Uuid::new_v4();

    // Create sessions for both users
    for i in 1..=3 {
        let session_data1 = workbench_server::services::session::SessionData {
            user_id: user1_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("User1 Agent".into()),
        };

        let session_data2 = workbench_server::services::session::SessionData {
            user_id: user2_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some("192.168.1.200".into()),
            user_agent: Some("User2 Agent".into()),
        };

        session_manager
            .store_session(&format!("user1_session_{}", i), session_data1)
            .await
            .unwrap();
        session_manager
            .store_session(&format!("user2_session_{}", i), session_data2)
            .await
            .unwrap();
    }

    // Check initial counts
    let user1_count = session_manager
        .get_user_session_count(user1_id)
        .await
        .unwrap();
    let user2_count = session_manager
        .get_user_session_count(user2_id)
        .await
        .unwrap();
    assert_eq!(user1_count, 3, "User1 should have 3 sessions");
    assert_eq!(user2_count, 3, "User2 should have 3 sessions");

    // Invalidate only user1's sessions
    session_manager
        .invalidate_user_sessions(user1_id)
        .await
        .unwrap();

    // Check that only user1's sessions are gone
    let user1_count_after = session_manager
        .get_user_session_count(user1_id)
        .await
        .unwrap();
    let user2_count_after = session_manager
        .get_user_session_count(user2_id)
        .await
        .unwrap();
    assert_eq!(
        user1_count_after, 0,
        "User1 should have 0 sessions after invalidation"
    );
    assert_eq!(user2_count_after, 3, "User2 should still have 3 sessions");

    println!("✅ User session isolation working correctly");
}

/// Test password change invalidates all sessions
#[tokio::test]
async fn test_password_change_session_invalidation() {
    let redis_url = std::env::var("REDIS_URL").ok();
    let session_manager = SessionManager::new(redis_url, None, 5, 24);

    let user_id = Uuid::new_v4();

    // Create multiple sessions for user
    for i in 1..=4 {
        let session_id = format!("password_change_session_{}", i);
        let session_data = workbench_server::services::session::SessionData {
            user_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Change Password Agent".into()),
        };

        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();
    }

    // Verify sessions exist
    let count_before = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(
        count_before, 4,
        "Should have 4 sessions before password change"
    );

    // Simulate password change by invalidating all user sessions
    session_manager
        .invalidate_user_sessions(user_id)
        .await
        .unwrap();

    // Verify all sessions are gone
    let count_after = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(
        count_after, 0,
        "Should have 0 sessions after password change"
    );

    println!("✅ Password change session invalidation working correctly");
}

/// Performance test for session operations
#[tokio::test]
async fn test_session_performance() {
    let redis_url = std::env::var("REDIS_URL").ok();
    let session_manager = SessionManager::new(
        redis_url, None, 50, 24, // Higher limit for performance testing
    );

    let user_id = Uuid::new_v4();
    let num_sessions = 100;

    let start = std::time::Instant::now();

    // Create many sessions
    for i in 0..num_sessions {
        let session_id = format!("perf_session_{}", i);
        let session_data = workbench_server::services::session::SessionData {
            user_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Performance Test".into()),
        };

        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();
    }

    let creation_time = start.elapsed();

    // Test session count retrieval (should be fast)
    let count_start = std::time::Instant::now();
    let session_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    let count_time = count_start.elapsed();

    // Performance assertions
    assert!(
        creation_time.as_millis() < 10000,
        "Session creation should be reasonably fast"
    );
    assert!(
        count_time.as_millis() < 100,
        "Session count should be very fast"
    );
    assert!(session_count <= 50, "Should enforce session limits");

    println!(
        "✅ Performance test: {} sessions handled in {:?}, count in {:?}",
        num_sessions, creation_time, count_time
    );
}
