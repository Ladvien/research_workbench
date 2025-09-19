#[cfg(test)]
mod performance_benchmarks {
    use std::time::{Duration, Instant};
    use uuid::Uuid;
    use workbench_server::{
        app_state::AppState, config::AppConfig, database::Database, models::*, repositories::Repository, services::*,
    };

    async fn setup_test_app() -> AppState {
        let config = AppConfig::from_env().expect("Failed to load config");
        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgresql://postgres:postgres@localhost/workbench_test".to_string()
        });
        let database = Database::new(&database_url)
            .await
            .expect("Failed to connect to database");
        let dal = DataAccessLayer::new(database.clone());

        let auth_service = AuthService::new(dal.clone());
        let conversation_service = ConversationService::new(dal.clone());
        let chat_service = ChatService::new(dal.clone());

        AppState::new(
            auth_service,
            conversation_service,
            chat_service,
            dal,
            config,
            None,
        )
    }

    #[tokio::test]
    async fn benchmark_database_conversation_query() {
        let app_state = setup_test_app().await;
        let conversation_id = Uuid::new_v4();

        // Create test data
        let create_user_request = workbench_server::models::CreateUserRequest {
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
            password: "testpassword123".to_string(),
        };

        let test_user = app_state
            .dal
            .users()
            .create_from_request(create_user_request)
            .await
            .unwrap();

        let user_id = test_user.id;

        let test_conversation = Conversation {
            id: conversation_id,
            user_id,
            title: Some("Test Conversation".to_string()),
            model: "gpt-4".to_string(),
            provider: "openai".to_string(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            metadata: serde_json::json!({}),
        };

        app_state
            .dal
            .conversations()
            .create(test_conversation)
            .await
            .unwrap();

        // Create multiple messages for the conversation
        for i in 0..100 {
            let message = Message {
                id: Uuid::new_v4(),
                conversation_id,
                parent_id: None,
                role: if i % 2 == 0 {
                    MessageRole::User
                } else {
                    MessageRole::Assistant
                },
                content: format!("Test message {}", i),
                tokens_used: Some(10),
                created_at: chrono::Utc::now(),
                is_active: true,
                metadata: serde_json::json!({}),
            };
            app_state.dal.messages().create(message).await.unwrap();
        }

        // Benchmark the optimized query
        let start = Instant::now();
        let iterations = 50;

        for _ in 0..iterations {
            let _ = app_state
                .dal
                .conversations()
                .find_with_messages(conversation_id, user_id)
                .await
                .unwrap();
        }

        let duration = start.elapsed();
        let avg_duration = duration / iterations;

        println!(
            "Average conversation query time: {:?} ({} messages)",
            avg_duration, 100
        );

        // Performance assertion: Should be under 50ms on average
        assert!(
            avg_duration < Duration::from_millis(50),
            "Conversation query took too long: {:?}",
            avg_duration
        );
    }

    #[tokio::test]
    async fn benchmark_title_generation() {
        use std::collections::HashMap;

        let test_contents = vec![
            "What is the capital of France?",
            "How do I implement a binary search algorithm in Rust?",
            "Explain the differences between HashMap and BTreeMap in Rust, including their performance characteristics and when to use each one.",
            "Write a comprehensive guide to async programming in Rust, covering futures, async/await, tokio, and common patterns.",
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        ];

        // Benchmark without cache
        let start = Instant::now();
        for _ in 0..1000 {
            for content in &test_contents {
                let _ = generate_title_uncached(content);
            }
        }
        let uncached_duration = start.elapsed();

        // Benchmark with cache
        let mut cache = HashMap::new();
        let start = Instant::now();
        for _ in 0..1000 {
            for content in &test_contents {
                let _ = generate_title_cached(content, &mut cache);
            }
        }
        let cached_duration = start.elapsed();

        println!(
            "Title generation - Uncached: {:?}, Cached: {:?}, Speedup: {:.2}x",
            uncached_duration,
            cached_duration,
            uncached_duration.as_nanos() as f64 / cached_duration.as_nanos() as f64
        );

        // Cache should provide significant speedup for repeated content
        assert!(cached_duration < uncached_duration / 2);
    }

    #[tokio::test]
    async fn benchmark_streaming_chunks() {
        let test_content = "This is a test message that will be split into chunks for streaming. It contains multiple sentences and should demonstrate the performance characteristics of different chunking strategies. The goal is to find the optimal balance between chunk size and streaming responsiveness.".repeat(10);

        // Benchmark word-by-word streaming
        let start = Instant::now();
        let word_chunks: Vec<String> = test_content
            .split_whitespace()
            .map(|w| format!("{} ", w))
            .collect();
        let word_duration = start.elapsed();

        // Benchmark optimized chunking
        let start = Instant::now();
        let optimized_chunks = create_optimized_streaming_chunks(&test_content, 15);
        let optimized_duration = start.elapsed();

        println!(
            "Streaming chunks - Word: {} chunks in {:?}, Optimized: {} chunks in {:?}",
            word_chunks.len(),
            word_duration,
            optimized_chunks.len(),
            optimized_duration
        );

        // Optimized chunking should produce fewer chunks and be faster
        assert!(optimized_chunks.len() < word_chunks.len());
        assert!(optimized_duration <= word_duration * 2); // Allow some overhead
    }

    #[tokio::test]
    async fn benchmark_concurrent_database_queries() {
        let app_state = setup_test_app().await;

        // Create test user
        let create_user_request = workbench_server::models::CreateUserRequest {
            email: "concurrent_test@example.com".to_string(),
            username: "concurrentuser".to_string(),
            password: "testpassword123".to_string(),
        };

        let test_user = app_state
            .dal
            .users()
            .create_from_request(create_user_request)
            .await
            .unwrap();

        let user_id = test_user.id;

        // Create multiple conversations
        let mut conversation_ids = Vec::new();
        for i in 0..10 {
            let conversation = Conversation {
                id: Uuid::new_v4(),
                user_id,
                title: Some(format!("Concurrent Test {}", i)),
                model: "gpt-4".to_string(),
                provider: "openai".to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                metadata: serde_json::json!({}),
            };

            app_state
                .dal
                .conversations()
                .create(conversation.clone())
                .await
                .unwrap();
            conversation_ids.push(conversation.id);
        }

        // Benchmark sequential queries
        let start = Instant::now();
        for conversation_id in &conversation_ids {
            let _ = app_state
                .dal
                .conversations()
                .find_with_messages(*conversation_id, user_id)
                .await
                .unwrap();
        }
        let sequential_duration = start.elapsed();

        // Benchmark concurrent queries
        let start = Instant::now();
        let tasks: Vec<_> = conversation_ids
            .iter()
            .map(|&conversation_id| {
                let dal = app_state.dal.clone();
                tokio::spawn(async move {
                    dal.conversations()
                        .find_with_messages(conversation_id, user_id)
                        .await
                        .unwrap()
                })
            })
            .collect();

        for task in tasks {
            let _ = task.await.unwrap();
        }
        let concurrent_duration = start.elapsed();

        println!(
            "Database queries - Sequential: {:?}, Concurrent: {:?}, Speedup: {:.2}x",
            sequential_duration,
            concurrent_duration,
            sequential_duration.as_nanos() as f64 / concurrent_duration.as_nanos() as f64
        );

        // Concurrent should be significantly faster
        assert!(concurrent_duration < sequential_duration);
    }

    // Helper functions for benchmarking
    fn generate_title_uncached(content: &str) -> String {
        let clean_content = content.trim().to_string();
        if clean_content.len() <= 30 {
            return clean_content;
        }

        let first_sentence = clean_content
            .split(&['.', '!', '?'][..])
            .next()
            .unwrap_or("");
        if !first_sentence.is_empty() && first_sentence.len() <= 50 {
            return first_sentence.trim().to_string();
        }

        let words: Vec<&str> = clean_content.split_whitespace().collect();
        let mut title = String::new();

        for word in words {
            let test_title = if title.is_empty() {
                word.to_string()
            } else {
                format!("{} {}", title, word)
            };

            if test_title.len() > 40 {
                break;
            }
            title = test_title;
        }

        if title.is_empty() {
            format!("{}...", &clean_content[..40.min(clean_content.len())])
        } else {
            title
        }
    }

    fn generate_title_cached(
        content: &str,
        cache: &mut std::collections::HashMap<String, String>,
    ) -> String {
        let cache_key = content.chars().take(200).collect::<String>();

        if let Some(cached_title) = cache.get(&cache_key) {
            return cached_title.clone();
        }

        let title = generate_title_uncached(content);

        // Limit cache size
        if cache.len() > 1000 {
            cache.clear();
        }

        cache.insert(cache_key, title.clone());
        title
    }

    fn create_optimized_streaming_chunks(content: &str, avg_chunk_size: usize) -> Vec<String> {
        let mut chunks = Vec::new();
        let mut current_chunk = String::with_capacity(avg_chunk_size * 2);
        let words: Vec<&str> = content.split_whitespace().collect();

        for word in words {
            if !current_chunk.is_empty() {
                current_chunk.push(' ');
            }
            current_chunk.push_str(word);

            if current_chunk.len() >= avg_chunk_size {
                if word.ends_with(['.', '!', '?', ':', ';', ',']) {
                    chunks.push(current_chunk.clone());
                    current_chunk.clear();
                } else if current_chunk.len() >= avg_chunk_size * 2 {
                    chunks.push(current_chunk.clone());
                    current_chunk.clear();
                }
            }
        }

        if !current_chunk.is_empty() {
            chunks.push(current_chunk);
        }

        if chunks.is_empty() {
            chunks.push(content.to_string());
        }

        chunks
    }
}
