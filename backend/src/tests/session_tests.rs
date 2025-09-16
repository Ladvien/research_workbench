//! Session management tests
//! Tests for persistent session storage, invalidation, and limits

use crate::{
    error::AppError,
    services::session::{SessionData, SessionManager},
};
use chrono::Utc;
use uuid::Uuid;

#[tokio::test]
async fn test_session_storage_and_retrieval() {
    let session_manager = SessionManager::new(
        None, // No Redis for testing
        None, // No PostgreSQL for testing
        5,    // max 5 sessions per user
        24,   // 24 hour timeout
    );

    let session_id = "test_session_123";
    let user_id = Uuid::new_v4();
    let session_data = SessionData {
        user_id,
        created_at: Utc::now(),
        last_accessed: Utc::now(),
        ip_address: Some("127.0.0.1".to_string()),
        user_agent: Some("test-agent".to_string()),
    };

    // Store session
    let result = session_manager
        .store_session(session_id, session_data.clone())
        .await;
    assert!(result.is_ok(), "Failed to store session: {:?}", result);

    // Retrieve session
    let retrieved = session_manager.get_session(session_id).await;
    assert!(
        retrieved.is_ok(),
        "Failed to retrieve session: {:?}",
        retrieved
    );

    let retrieved_data = retrieved.unwrap();
    assert!(retrieved_data.is_some(), "Session data should exist");

    let retrieved_data = retrieved_data.unwrap();
    assert_eq!(retrieved_data.user_id, user_id);
    assert_eq!(retrieved_data.ip_address, Some("127.0.0.1".to_string()));
}

#[tokio::test]
async fn test_session_deletion() {
    let session_manager = SessionManager::new(None, None, 5, 24);

    let session_id = "test_session_delete";
    let user_id = Uuid::new_v4();
    let session_data = SessionData {
        user_id,
        created_at: Utc::now(),
        last_accessed: Utc::now(),
        ip_address: None,
        user_agent: None,
    };

    // Store session
    session_manager
        .store_session(session_id, session_data)
        .await
        .unwrap();

    // Verify it exists
    let retrieved = session_manager.get_session(session_id).await.unwrap();
    assert!(retrieved.is_some());

    // Delete session
    let result = session_manager.delete_session(session_id).await;
    assert!(result.is_ok(), "Failed to delete session: {:?}", result);

    // Verify it's gone
    let retrieved = session_manager.get_session(session_id).await.unwrap();
    assert!(retrieved.is_none());
}

#[tokio::test]
async fn test_user_session_invalidation() {
    let session_manager = SessionManager::new(None, None, 5, 24);
    let user_id = Uuid::new_v4();
    let other_user_id = Uuid::new_v4();

    // Create multiple sessions for the same user
    for i in 0..3 {
        let session_id = format!("user_session_{}", i);
        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some(format!("127.0.0.{}", i + 1)),
            user_agent: Some(format!("agent-{}", i)),
        };
        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();
    }

    // Create session for another user
    let other_session_data = SessionData {
        user_id: other_user_id,
        created_at: Utc::now(),
        last_accessed: Utc::now(),
        ip_address: Some("192.168.1.1".to_string()),
        user_agent: Some("other-agent".to_string()),
    };
    session_manager
        .store_session("other_user_session", other_session_data)
        .await
        .unwrap();

    // Verify sessions exist
    let count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(count, 3);

    let other_count = session_manager
        .get_user_session_count(other_user_id)
        .await
        .unwrap();
    assert_eq!(other_count, 1);

    // Invalidate sessions for the first user
    let result = session_manager.invalidate_user_sessions(user_id).await;
    assert!(
        result.is_ok(),
        "Failed to invalidate user sessions: {:?}",
        result
    );

    // Verify the user's sessions are gone
    let count_after = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(count_after, 0);

    // Verify other user's session is still there
    let other_count_after = session_manager
        .get_user_session_count(other_user_id)
        .await
        .unwrap();
    assert_eq!(other_count_after, 1);

    // Verify specific sessions are gone
    for i in 0..3 {
        let session_id = format!("user_session_{}", i);
        let retrieved = session_manager.get_session(&session_id).await.unwrap();
        assert!(
            retrieved.is_none(),
            "Session {} should be deleted",
            session_id
        );
    }

    // Verify other user's session still exists
    let other_retrieved = session_manager
        .get_session("other_user_session")
        .await
        .unwrap();
    assert!(other_retrieved.is_some());
}

#[tokio::test]
async fn test_session_cleanup() {
    let session_manager = SessionManager::new(None, None, 5, 1); // 1 hour timeout
    let user_id = Uuid::new_v4();

    // Create an "old" session by manipulating the last_accessed time
    let old_session_data = SessionData {
        user_id,
        created_at: Utc::now() - chrono::Duration::hours(2),
        last_accessed: Utc::now() - chrono::Duration::hours(2),
        ip_address: Some("127.0.0.1".to_string()),
        user_agent: Some("test-agent".to_string()),
    };

    // Create a "fresh" session
    let fresh_session_data = SessionData {
        user_id,
        created_at: Utc::now(),
        last_accessed: Utc::now(),
        ip_address: Some("127.0.0.2".to_string()),
        user_agent: Some("test-agent".to_string()),
    };

    // Store both sessions
    session_manager
        .store_session("old_session", old_session_data)
        .await
        .unwrap();
    session_manager
        .store_session("fresh_session", fresh_session_data)
        .await
        .unwrap();

    // Verify both exist
    assert!(session_manager
        .get_session("old_session")
        .await
        .unwrap()
        .is_some());
    assert!(session_manager
        .get_session("fresh_session")
        .await
        .unwrap()
        .is_some());

    // Run cleanup
    let cleaned_count = session_manager.cleanup_expired_sessions().await.unwrap();

    // In memory store, the old session should be cleaned up
    assert!(cleaned_count >= 1, "Should have cleaned at least 1 session");

    // Verify fresh session still exists
    assert!(session_manager
        .get_session("fresh_session")
        .await
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn test_session_count_tracking() {
    let session_manager = SessionManager::new(None, None, 5, 24);
    let user_id = Uuid::new_v4();

    // Start with zero sessions
    let initial_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(initial_count, 0);

    // Add sessions one by one and verify count
    for i in 1..=3 {
        let session_id = format!("count_test_session_{}", i);
        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some(format!("127.0.0.{}", i)),
            user_agent: Some(format!("agent-{}", i)),
        };
        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();

        let count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();
        assert_eq!(count, i as usize);
    }

    // Remove one session and verify count decreases
    session_manager
        .delete_session("count_test_session_2")
        .await
        .unwrap();
    let count_after_delete = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(count_after_delete, 2);
}

#[tokio::test]
async fn test_nonexistent_session_operations() {
    let session_manager = SessionManager::new(None, None, 5, 24);

    // Try to get a session that doesn't exist
    let result = session_manager.get_session("nonexistent_session").await;
    assert!(result.is_ok());
    assert!(result.unwrap().is_none());

    // Try to delete a session that doesn't exist
    let delete_result = session_manager.delete_session("nonexistent_session").await;
    assert!(delete_result.is_err());
    if let Err(AppError::NotFound(_)) = delete_result {
        // This is expected
    } else {
        panic!("Expected NotFound error, got {:?}", delete_result);
    }

    // Try to get session count for user with no sessions
    let user_id = Uuid::new_v4();
    let count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(count, 0);

    // Try to invalidate sessions for user with no sessions (should succeed)
    let invalidate_result = session_manager.invalidate_user_sessions(user_id).await;
    assert!(invalidate_result.is_ok());
}
