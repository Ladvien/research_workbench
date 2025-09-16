//! Integration tests for concurrent session management and race conditions
//!
//! This module specifically tests:
//! - Race conditions in session limit enforcement
//! - Rapid parallel session creation attempts
//! - Atomic operations for session management
//! - Session eviction under concurrent load
//! - Performance under high concurrency

use std::{
    collections::HashSet,
    sync::{Arc, Barrier},
    time::Duration,
};
use tokio::{sync::Semaphore, time::sleep};
use uuid::Uuid;

use workbench_server::{
    error::AppError,
    services::session::{SessionData, SessionManager},
};

/// Create a session manager for concurrency testing
fn create_concurrent_session_manager() -> SessionManager {
    SessionManager::new(
        None, // No Redis for these tests
        None, // No PostgreSQL for these tests
        3,    // Lower limit for easier testing (3 sessions max)
        24,   // 24 hour timeout
    )
}

#[tokio::test]
async fn test_race_condition_session_limit_enforcement() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let num_concurrent_attempts = 10;

    // Use a barrier to synchronize all tasks
    let barrier = Arc::new(Barrier::new(num_concurrent_attempts));
    let mut handles = Vec::new();

    // Spawn concurrent session creation attempts
    for i in 0..num_concurrent_attempts {
        let session_manager = Arc::clone(&session_manager);
        let barrier = Arc::clone(&barrier);
        let session_id = format!("race_condition_session_{}", i);

        let handle = tokio::spawn(async move {
            let session_data = SessionData {
                user_id,
                created_at: chrono::Utc::now(),
                last_accessed: chrono::Utc::now(),
                ip_address: Some(format!("10.0.0.{}", i + 1).into()),
                user_agent: Some(format!("race-agent-{}", i).into()),
            };

            // Wait for all tasks to be ready
            barrier.wait();

            // Attempt to create session simultaneously
            session_manager
                .store_session(&session_id, session_data)
                .await
        });

        handles.push(handle);
    }

    // Wait for all attempts to complete
    let results: Vec<Result<(), AppError>> =
        futures::future::join_all(handles).await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    // Count successful creations
    let successful_creations = results.iter().filter(|r| r.is_ok()).count();

    // Verify session limit is enforced
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();

    // Should not exceed the limit of 3 sessions
    assert!(final_count <= 3, "Session count {} exceeds limit of 3", final_count);

    // Some sessions should have been created
    assert!(successful_creations > 0, "At least some sessions should be created");

    println!("Race condition test: {} successful creations, {} final sessions",
             successful_creations, final_count);
}

#[tokio::test]
async fn test_rapid_parallel_session_creation() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let batch_size = 5;
    let num_batches = 4;

    // Test rapid session creation in batches
    for batch in 0..num_batches {
        let mut batch_handles = Vec::new();

        for i in 0..batch_size {
            let session_manager = Arc::clone(&session_manager);
            let session_id = format!("rapid_session_{}_{}", batch, i);

            let handle = tokio::spawn(async move {
                let session_data = SessionData {
                    user_id,
                    created_at: chrono::Utc::now(),
                    last_accessed: chrono::Utc::now(),
                    ip_address: Some(format!("192.168.{}.{}", batch + 1, i + 1).into()),
                    user_agent: Some(format!("rapid-agent-{}-{}", batch, i).into()),
                };

                session_manager
                    .store_session(&session_id, session_data)
                    .await
            });

            batch_handles.push(handle);
        }

        // Wait for batch to complete
        let batch_results: Vec<Result<(), AppError>> =
            futures::future::join_all(batch_handles).await
            .into_iter()
            .map(|r| r.unwrap())
            .collect();

        let batch_successful = batch_results.iter().filter(|r| r.is_ok()).count();
        println!("Batch {}: {} successful creations", batch, batch_successful);

        // Check session count after each batch
        let count_after_batch = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();

        assert!(count_after_batch <= 3, "Session limit violated after batch {}", batch);

        // Small delay between batches
        sleep(Duration::from_millis(10)).await;
    }

    // Final verification
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();

    assert!(final_count <= 3, "Final session count {} exceeds limit", final_count);
    assert!(final_count > 0, "Should have at least one session");
}

#[tokio::test]
async fn test_concurrent_session_operations_mixed() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let num_operations = 20;

    // Pre-populate with some sessions
    for i in 0..2 {
        let session_id = format!("initial_session_{}", i);
        let session_data = SessionData {
            user_id,
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            ip_address: Some(format!("172.16.0.{}", i + 1).into()),
            user_agent: Some(format!("initial-agent-{}", i).into()),
        };

        session_manager
            .store_session(&session_id, session_data)
            .await
            .unwrap();
    }

    let initial_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(initial_count, 2);

    // Mix of operations: create, get, delete
    let mut handles = Vec::new();

    for i in 0..num_operations {
        let session_manager = Arc::clone(&session_manager);
        let operation_type = i % 4; // 0: create, 1: get, 2: delete, 3: count

        let handle = tokio::spawn(async move {
            match operation_type {
                0 => {
                    // Create session
                    let session_id = format!("mixed_session_{}", i);
                    let session_data = SessionData {
                        user_id,
                        created_at: chrono::Utc::now(),
                        last_accessed: chrono::Utc::now(),
                        ip_address: Some(format!("10.10.0.{}", (i % 255) + 1).into()),
                        user_agent: Some(format!("mixed-agent-{}", i).into()),
                    };

                    session_manager
                        .store_session(&session_id, session_data)
                        .await
                        .map(|_| "create".to_string())
                        .unwrap_or_else(|_| "create_failed".to_string())
                }
                1 => {
                    // Get session
                    let session_id = if i > 10 {
                        format!("mixed_session_{}", i - 10)
                    } else {
                        format!("initial_session_{}", i % 2)
                    };

                    session_manager
                        .get_session(&session_id)
                        .await
                        .map(|result| if result.is_some() { "get_found" } else { "get_notfound" }.to_string())
                        .unwrap_or_else(|_| "get_failed".to_string())
                }
                2 => {
                    // Delete session (try to delete initial sessions)
                    let session_id = format!("initial_session_{}", i % 2);

                    session_manager
                        .delete_session(&session_id)
                        .await
                        .map(|_| "delete".to_string())
                        .unwrap_or_else(|_| "delete_failed".to_string())
                }
                _ => {
                    // Count sessions
                    session_manager
                        .get_user_session_count(user_id)
                        .await
                        .map(|count| format!("count_{}", count))
                        .unwrap_or_else(|_| "count_failed".to_string())
                }
            }
        });

        handles.push(handle);
    }

    // Wait for all operations to complete
    let results: Vec<String> = futures::future::join_all(handles).await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    // Analyze results
    let creates = results.iter().filter(|r| r.starts_with("create")).count();
    let gets = results.iter().filter(|r| r.starts_with("get")).count();
    let deletes = results.iter().filter(|r| r.starts_with("delete")).count();
    let counts = results.iter().filter(|r| r.starts_with("count")).count();

    println!("Mixed operations: {} creates, {} gets, {} deletes, {} counts",
             creates, gets, deletes, counts);

    // Final verification - session limit should still be enforced
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();

    assert!(final_count <= 3, "Session limit violated: {}", final_count);
}

#[tokio::test]
async fn test_session_eviction_under_load() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let num_waves = 5;
    let sessions_per_wave = 4;

    let mut all_session_ids = HashSet::new();

    // Create waves of sessions to test eviction
    for wave in 0..num_waves {
        println!("Creating wave {} of sessions", wave);

        let mut wave_handles = Vec::new();
        let mut wave_session_ids = Vec::new();

        for i in 0..sessions_per_wave {
            let session_manager = Arc::clone(&session_manager);
            let session_id = format!("eviction_session_{}_{}", wave, i);
            wave_session_ids.push(session_id.clone());
            all_session_ids.insert(session_id.clone());

            let handle = tokio::spawn(async move {
                let session_data = SessionData {
                    user_id,
                    created_at: chrono::Utc::now(),
                    last_accessed: chrono::Utc::now(),
                    ip_address: Some(format!("203.0.113.{}", (wave * sessions_per_wave + i) % 255).into()),
                    user_agent: Some(format!("eviction-agent-{}-{}", wave, i).into()),
                };

                // Add small random delay to simulate real-world timing
                sleep(Duration::from_millis((i * 5) as u64)).await;

                session_manager
                    .store_session(&session_id, session_data)
                    .await
            });

            wave_handles.push(handle);
        }

        // Wait for wave to complete
        let wave_results: Vec<Result<(), AppError>> =
            futures::future::join_all(wave_handles).await
            .into_iter()
            .map(|r| r.unwrap())
            .collect();

        let wave_successful = wave_results.iter().filter(|r| r.is_ok()).count();
        println!("Wave {}: {} successful creations", wave, wave_successful);

        // Check which sessions actually exist
        let mut existing_sessions = 0;
        for session_id in &wave_session_ids {
            if let Ok(Some(_)) = session_manager.get_session(session_id).await {
                existing_sessions += 1;
            }
        }

        let total_count = session_manager
            .get_user_session_count(user_id)
            .await
            .unwrap();

        println!("Wave {}: {} existing from this wave, {} total sessions",
                 wave, existing_sessions, total_count);

        assert!(total_count <= 3, "Session limit violated in wave {}: {}", wave, total_count);

        // Small delay between waves
        sleep(Duration::from_millis(50)).await;
    }

    // Final verification: count total existing sessions
    let mut final_existing = 0;
    for session_id in &all_session_ids {
        if let Ok(Some(_)) = session_manager.get_session(session_id).await {
            final_existing += 1;
        }
    }

    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();

    assert_eq!(final_existing, final_count, "Session count mismatch");
    assert!(final_count <= 3, "Final session count exceeds limit: {}", final_count);
    assert!(final_count > 0, "Should have at least one session remaining");

    println!("Eviction test complete: {} sessions remaining out of {} created",
             final_count, all_session_ids.len());
}

#[tokio::test]
async fn test_concurrent_user_session_invalidation() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user1_id = Uuid::new_v4();
    let user2_id = Uuid::new_v4();

    // Create sessions for both users
    for user_id in [user1_id, user2_id] {
        for i in 0..3 {
            let session_id = format!("invalidation_user_{}_session_{}",
                                   if user_id == user1_id { 1 } else { 2 }, i);
            let session_data = SessionData {
                user_id,
                created_at: chrono::Utc::now(),
                last_accessed: chrono::Utc::now(),
                ip_address: Some(format!("172.20.0.{}", i + 1).into()),
                user_agent: Some(format!("invalidation-agent-{}", i).into()),
            };

            session_manager
                .store_session(&session_id, session_data)
                .await
                .unwrap();
        }
    }

    // Verify initial state
    let user1_count = session_manager
        .get_user_session_count(user1_id)
        .await
        .unwrap();
    let user2_count = session_manager
        .get_user_session_count(user2_id)
        .await
        .unwrap();

    assert_eq!(user1_count, 3);
    assert_eq!(user2_count, 3);

    // Concurrently invalidate sessions and create new ones
    let mut handles = Vec::new();

    // Invalidate user1 sessions
    let session_manager_clone = Arc::clone(&session_manager);
    handles.push(tokio::spawn(async move {
        session_manager_clone
            .invalidate_user_sessions(user1_id)
            .await
    }));

    // Create new sessions for user1 while invalidating
    for i in 3..6 {
        let session_manager_clone = Arc::clone(&session_manager);
        let session_id = format!("invalidation_user_1_session_{}", i);

        handles.push(tokio::spawn(async move {
            let session_data = SessionData {
                user_id: user1_id,
                created_at: chrono::Utc::now(),
                last_accessed: chrono::Utc::now(),
                ip_address: Some(format!("172.21.0.{}", i - 2).into()),
                user_agent: Some(format!("new-agent-{}", i).into()),
            };

            sleep(Duration::from_millis(5)).await; // Small delay

            session_manager_clone
                .store_session(&session_id, session_data)
                .await
        }));
    }

    // Concurrently operate on user2 sessions
    let session_manager_clone = Arc::clone(&session_manager);
    handles.push(tokio::spawn(async move {
        let _count = session_manager_clone
            .get_user_session_count(user2_id)
            .await;
        Ok(()) // Return same type as other handles
    }));

    // Wait for all operations
    let results = futures::future::join_all(handles).await;

    // Check final state
    let user1_final_count = session_manager
        .get_user_session_count(user1_id)
        .await
        .unwrap();
    let user2_final_count = session_manager
        .get_user_session_count(user2_id)
        .await
        .unwrap();

    // User2 should be unaffected
    assert_eq!(user2_final_count, 3, "User2 sessions should be unaffected");

    // User1 should have some sessions (the new ones created after/during invalidation)
    assert!(user1_final_count <= 3, "User1 session limit should be enforced");

    println!("Concurrent invalidation: User1 final count: {}, User2 final count: {}",
             user1_final_count, user2_final_count);
}

#[tokio::test]
async fn test_high_concurrency_stress() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let num_concurrent_ops = 50;
    let semaphore = Arc::new(Semaphore::new(10)); // Limit concurrency to 10

    let mut handles = Vec::new();

    for i in 0..num_concurrent_ops {
        let session_manager = Arc::clone(&session_manager);
        let semaphore = Arc::clone(&semaphore);
        let session_id = format!("stress_session_{}", i);

        let handle = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            let session_data = SessionData {
                user_id,
                created_at: chrono::Utc::now(),
                last_accessed: chrono::Utc::now(),
                ip_address: Some(format!("198.51.100.{}", (i % 255) + 1).into()),
                user_agent: Some(format!("stress-agent-{}", i).into()),
            };

            // Perform multiple operations per task
            let store_result = session_manager
                .store_session(&session_id, session_data)
                .await;

            let get_result = session_manager.get_session(&session_id).await;

            let count_result = session_manager
                .get_user_session_count(user_id)
                .await;

            (store_result.is_ok(), get_result.is_ok(), count_result.is_ok())
        });

        handles.push(handle);
    }

    // Wait for all operations to complete
    let results: Vec<(bool, bool, bool)> = futures::future::join_all(handles).await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    // Analyze results
    let successful_stores = results.iter().filter(|(store, _, _)| *store).count();
    let successful_gets = results.iter().filter(|(_, get, _)| *get).count();
    let successful_counts = results.iter().filter(|(_, _, count)| *count).count();

    println!("Stress test: {}/{} stores, {}/{} gets, {}/{} counts successful",
             successful_stores, num_concurrent_ops,
             successful_gets, num_concurrent_ops,
             successful_counts, num_concurrent_ops);

    // All count operations should succeed
    assert_eq!(successful_counts, num_concurrent_ops, "All count operations should succeed");

    // Most get operations should succeed
    assert!(successful_gets > num_concurrent_ops / 2, "Most get operations should succeed");

    // Session limit should be enforced
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();

    assert!(final_count <= 3, "Session limit violated under stress: {}", final_count);
}

#[tokio::test]
async fn test_atomic_session_replacement() {
    let session_manager = Arc::new(create_concurrent_session_manager());
    let user_id = Uuid::new_v4();
    let session_id = "atomic_replacement_session";

    // Create initial session
    let initial_session = SessionData {
        user_id,
        created_at: chrono::Utc::now(),
        last_accessed: chrono::Utc::now(),
        ip_address: Some("192.0.2.1".into()),
        user_agent: Some("initial-agent".into()),
    };

    session_manager
        .store_session(session_id, initial_session)
        .await
        .unwrap();

    // Verify initial session
    let initial_retrieved = session_manager.get_session(session_id).await.unwrap().unwrap();
    assert_eq!(initial_retrieved.ip_address, Some("192.0.2.1".into()));

    // Concurrently update the same session
    let num_updates = 20;
    let mut handles = Vec::new();

    for i in 0..num_updates {
        let session_manager = Arc::clone(&session_manager);

        let handle = tokio::spawn(async move {
            let updated_session = SessionData {
                user_id,
                created_at: chrono::Utc::now(),
                last_accessed: chrono::Utc::now(),
                ip_address: Some(format!("203.0.113.{}", i + 1).into()),
                user_agent: Some(format!("updated-agent-{}", i).into()),
            };

            session_manager
                .store_session(session_id, updated_session)
                .await
        });

        handles.push(handle);
    }

    // Wait for all updates
    let update_results: Vec<Result<(), AppError>> =
        futures::future::join_all(handles).await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    let successful_updates = update_results.iter().filter(|r| r.is_ok()).count();
    println!("Atomic replacement: {} successful updates", successful_updates);

    // Verify final state
    let final_session = session_manager.get_session(session_id).await.unwrap().unwrap();

    // Should have one of the updated IP addresses
    let ip_str = final_session.ip_address.as_ref().unwrap().as_ref();
    assert!(ip_str.starts_with("203.0.113."), "Final IP should be from updates: {}", ip_str);

    // Session count should still be 1
    let final_count = session_manager
        .get_user_session_count(user_id)
        .await
        .unwrap();
    assert_eq!(final_count, 1, "Should still have exactly one session");
}