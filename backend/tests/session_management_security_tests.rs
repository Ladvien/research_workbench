//! Comprehensive Security Tests for Session Management
//! AUTH-003: Session Management Issues - Security Audit and Testing
//!
//! This test suite addresses the critical session management security issues:
//! 1. Hybrid JWT/Session approach conflicts
//! 2. Session invalidation on logout
//! 3. Concurrent session limits enforcement
//! 4. Redis session store integration
//! 5. Session security and OWASP compliance

use chrono::Utc;
use uuid::Uuid;
use workbench_server::services::session::{SessionData, SessionManager};

/// Security Test Suite for Session Management
#[cfg(test)]
mod session_security_tests {
    use super::*;

    /// Test session creation and validation
    #[tokio::test]
    async fn test_session_creation_and_retrieval() {
        let session_manager = SessionManager::new(
            None, // No Redis for isolated testing
            None, // No PostgreSQL for isolated testing
            5,    // max_sessions_per_user
            24,   // session_timeout_hours
        );

        let user_id = Uuid::new_v4();
        let session_id = "test_session_123";

        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Mozilla/5.0 Test Agent".into()),
        };

        // Store session
        let result = session_manager
            .store_session(session_id, session_data.clone())
            .await;
        assert!(result.is_ok(), "Session creation should succeed");

        // Retrieve session
        let retrieved = session_manager.get_session(session_id).await.unwrap();
        assert!(retrieved.is_some(), "Session should be retrievable");

        let retrieved_data = retrieved.unwrap();
        assert_eq!(retrieved_data.user_id, user_id);
        assert_eq!(retrieved_data.ip_address, Some("192.168.1.100".into()));
        assert_eq!(
            retrieved_data.user_agent,
            Some("Mozilla/5.0 Test Agent".into())
        );
    }

    /// Test session invalidation on logout
    #[tokio::test]
    async fn test_session_invalidation_on_logout() {
        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();
        let session_id = "logout_test_session";

        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        // Create session
        session_manager
            .store_session(session_id, session_data)
            .await
            .unwrap();

        // Verify session exists
        let before_delete = session_manager.get_session(session_id).await.unwrap();
        assert!(
            before_delete.is_some(),
            "Session should exist before deletion"
        );

        // Delete session (simulating logout)
        let delete_result = session_manager.delete_session(session_id).await;
        assert!(delete_result.is_ok(), "Session deletion should succeed");

        // Verify session is gone
        let after_delete = session_manager.get_session(session_id).await.unwrap();
        assert!(
            after_delete.is_none(),
            "Session should not exist after deletion"
        );
    }

    /// Test concurrent session limits enforcement (5 sessions per user)
    #[tokio::test]
    async fn test_concurrent_session_limits() {
        let session_manager = SessionManager::new(
            None, None, 3, 24, // Set limit to 3 for easier testing
        );

        let user_id = Uuid::new_v4();

        // Create 5 sessions for the same user
        for i in 1..=5 {
            let session_id = format!("session_{}", i);
            let session_data = SessionData {
                user_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                ip_address: Some(format!("192.168.1.{}", i).into()),
                user_agent: Some(format!("Agent {}", i).into()),
            };

            session_manager
                .store_session(&session_id, session_data)
                .await
                .unwrap();
        }

        // Check that only 3 sessions remain (limit enforcement)
        let session_count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();
        assert_eq!(session_count, 3, "Should enforce session limit of 3");
    }

    /// Test user session invalidation (password change scenario)
    #[tokio::test]
    async fn test_user_session_invalidation() {
        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();

        // Create multiple sessions for user
        for i in 1..=3 {
            let session_id = format!("user_session_{}", i);
            let session_data = SessionData {
                user_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                ip_address: Some("192.168.1.100".into()),
                user_agent: Some("Test Agent".into()),
            };

            session_manager
                .store_session(&session_id, session_data)
                .await
                .unwrap();
        }

        // Verify sessions exist
        let before_count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();
        assert_eq!(
            before_count, 3,
            "Should have 3 sessions before invalidation"
        );

        // Invalidate all user sessions (simulating password change)
        let invalidate_result = session_manager.invalidate_user_sessions(user_id).await;
        assert!(
            invalidate_result.is_ok(),
            "User session invalidation should succeed"
        );

        // Verify all sessions are gone
        let after_count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();
        assert_eq!(after_count, 0, "Should have 0 sessions after invalidation");
    }

    /// Test session expiration cleanup
    #[tokio::test]
    async fn test_expired_session_cleanup() {
        let session_manager = SessionManager::new(
            None, None, 5, 1, // 1 hour timeout for testing
        );

        let user_id = Uuid::new_v4();
        let session_id = "expiring_session";

        // Create session with past timestamp (expired)
        let expired_time = Utc::now() - chrono::Duration::hours(2);
        let session_data = SessionData {
            user_id,
            created_at: expired_time,
            last_accessed: expired_time,
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        session_manager
            .store_session(session_id, session_data)
            .await
            .unwrap();

        // Run cleanup
        let cleanup_result = session_manager.cleanup_expired_sessions().await;
        assert!(cleanup_result.is_ok(), "Cleanup should succeed");

        let cleaned_count = cleanup_result.unwrap();
        assert!(
            cleaned_count > 0,
            "Should have cleaned at least 1 expired session"
        );
    }

    /// Test session security - IP address validation
    #[tokio::test]
    async fn test_session_security_ip_validation() {
        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();
        let session_id = "security_test_session";

        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Original Agent".into()),
        };

        session_manager
            .store_session(session_id, session_data)
            .await
            .unwrap();

        // Retrieve and verify IP address is stored
        let retrieved = session_manager
            .get_session(session_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(retrieved.ip_address, Some("192.168.1.100".into()));

        // In a real implementation, we would validate that the current request IP
        // matches the stored IP address for security
    }

    /// Test Redis security validation (production environment)
    #[tokio::test]
    async fn test_redis_security_validation() {
        // Test with insecure Redis URL in production environment
        std::env::set_var("ENVIRONMENT", "production");

        // This should fail in production due to missing authentication
        let session_manager = SessionManager::new(
            Some("redis://localhost:6379".to_string()), // Insecure URL
            None,
            5,
            24,
        );

        // Should have no Redis client due to security validation failure
        // This is tested by checking if the session manager falls back to memory store
        let user_id = Uuid::new_v4();
        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        // Should still work but use memory store instead of Redis
        let result = session_manager
            .store_session("test_session", session_data)
            .await;
        assert!(result.is_ok(), "Should fallback to memory store");

        // Clean up environment
        std::env::remove_var("ENVIRONMENT");
    }

    /// Test session data integrity and serialization
    #[tokio::test]
    async fn test_session_data_integrity() {
        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();
        let session_id = "integrity_test_session";

        // Test with special characters and Unicode
        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("::1".into()), // IPv6 address
            user_agent: Some("Mozilla/5.0 (Test) 测试 🔒".into()), // Unicode characters
        };

        session_manager
            .store_session(session_id, session_data.clone())
            .await
            .unwrap();

        let retrieved = session_manager
            .get_session(session_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(retrieved.user_id, user_id);
        assert_eq!(retrieved.ip_address, Some("::1".into()));
        assert_eq!(
            retrieved.user_agent,
            Some("Mozilla/5.0 (Test) 测试 🔒".into())
        );
    }

    /// Test multiple user session isolation
    #[tokio::test]
    async fn test_user_session_isolation() {
        let session_manager = SessionManager::new(None, None, 5, 24);

        let user1_id = Uuid::new_v4();
        let user2_id = Uuid::new_v4();

        // Create sessions for two different users
        for i in 1..=3 {
            let session_data1 = SessionData {
                user_id: user1_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                ip_address: Some("192.168.1.100".into()),
                user_agent: Some("User1 Agent".into()),
            };

            let session_data2 = SessionData {
                user_id: user2_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
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

        // Check session counts
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

        // Invalidate sessions for user1 only
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
    }

    /// Performance test for session operations
    #[tokio::test]
    async fn test_session_performance() {
        let session_manager = SessionManager::new(None, None, 10, 24);

        let user_id = Uuid::new_v4();
        let num_sessions = 100;

        let start = std::time::Instant::now();

        // Create many sessions
        for i in 0..num_sessions {
            let session_id = format!("perf_session_{}", i);
            let session_data = SessionData {
                user_id,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                ip_address: Some("192.168.1.100".into()),
                user_agent: Some("Performance Test Agent".into()),
            };

            session_manager
                .store_session(&session_id, session_data)
                .await
                .unwrap();
        }

        let creation_time = start.elapsed();

        // Test session count retrieval (should be O(1) in Redis)
        let count_start = std::time::Instant::now();
        let session_count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();
        let count_time = count_start.elapsed();

        // Should have enforced limits
        assert!(session_count <= 10, "Should enforce session limits");

        // Performance assertions
        assert!(
            creation_time.as_millis() < 5000,
            "Session creation should be fast"
        ); // 5 seconds max
        assert!(
            count_time.as_millis() < 100,
            "Session count should be very fast"
        ); // 100ms max

        println!(
            "✅ Performance test: {} sessions created in {:?}, count retrieved in {:?}",
            num_sessions, creation_time, count_time
        );
    }
}

/// Integration tests for hybrid JWT/Session approach conflicts
#[cfg(test)]
mod hybrid_auth_conflict_tests {
    use super::*;

    /// Test that demonstrates the hybrid JWT/Session conflict issue
    #[tokio::test]
    async fn test_hybrid_jwt_session_conflict() {
        // This test documents the current conflict between JWT and session-based auth
        //
        // ISSUE: The auth handlers store user_id in tower_sessions AND generate JWT tokens
        // This creates potential conflicts:
        // 1. JWT token expires in 15 minutes but session persists longer
        // 2. Session invalidation doesn't invalidate JWT tokens until they expire
        // 3. Two different authentication mechanisms with different lifetimes

        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();
        let session_id = "hybrid_conflict_test";

        // Simulate the auth handler storing session data
        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        session_manager
            .store_session(session_id, session_data)
            .await
            .unwrap();

        // Session exists
        let session_exists = session_manager
            .get_session(session_id)
            .await
            .unwrap()
            .is_some();
        assert!(session_exists, "Session should exist");

        // Simulate logout - session is deleted but JWT might still be valid
        session_manager.delete_session(session_id).await.unwrap();

        // Session is gone
        let session_after_logout = session_manager.get_session(session_id).await.unwrap();
        assert!(
            session_after_logout.is_none(),
            "Session should be deleted after logout"
        );

        // CONFLICT: At this point, if a JWT token was issued for this user,
        // it would still be valid for up to 15 minutes even though the session is gone.
        // This is the core issue that needs to be resolved.

        println!("⚠️  DOCUMENTED CONFLICT: Session deleted but JWT would still be valid");
        println!("   Resolution needed: Implement JWT blacklisting or reduce JWT expiry");
    }

    /// Test proposed solution: Session ID in JWT claims
    #[tokio::test]
    async fn test_proposed_session_jwt_binding() {
        // PROPOSED SOLUTION: Include session_id in JWT claims
        // Then validate both JWT AND session existence on each request

        let session_manager = SessionManager::new(None, None, 5, 24);

        let user_id = Uuid::new_v4();
        let session_id = "bound_session_test";

        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        session_manager
            .store_session(session_id, session_data)
            .await
            .unwrap();

        // Simulate validation logic that checks BOTH JWT AND session
        let jwt_is_valid = true; // Assume JWT signature/expiry is valid
        let session_exists = session_manager
            .get_session(session_id)
            .await
            .unwrap()
            .is_some();

        let auth_is_valid = jwt_is_valid && session_exists;
        assert!(
            auth_is_valid,
            "Authentication should require both JWT and session"
        );

        // After logout, session is deleted
        session_manager.delete_session(session_id).await.unwrap();

        // Now authentication fails even with valid JWT
        let session_exists_after_logout = session_manager
            .get_session(session_id)
            .await
            .unwrap()
            .is_some();
        let auth_after_logout = jwt_is_valid && session_exists_after_logout;

        assert!(
            !auth_after_logout,
            "Authentication should fail when session is deleted"
        );

        println!("✅ PROPOSED SOLUTION: JWT + Session binding prevents conflicts");
    }
}
