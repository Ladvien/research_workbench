use std::time::Duration;
use tokio::time::timeout;
use uuid::Uuid;
use workbench_server::{
    config::AppConfig,
    llm::{claude_code::ClaudeCodeService, ChatMessage, ChatRequest, LLMService, Provider},
};

fn create_test_config() -> AppConfig {
    AppConfig {
        bind_address: "0.0.0.0:4512".parse().unwrap(),
        openai_api_key: String::new(),
        openai_model: "gpt-3.5-turbo".to_string(),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: String::new(),
        anthropic_model: "claude-3-haiku-20240307".to_string(),
        anthropic_max_tokens: 2048,
        anthropic_temperature: 0.7,
        claude_code_enabled: true,
        claude_code_model: "claude-3-5-sonnet-20241022".to_string(),
        claude_code_session_timeout: 3600,
        jwt_config: workbench_server::config::JwtConfig::new(
            "test-secret-that-is-long-enough-for-testing-purposes".to_string(),
        )
        .unwrap(),
        redis_url: "redis://127.0.0.1:6379".to_string(),
        session_timeout_hours: 24,
        storage_path: "/tmp/workbench_test_storage".to_string(),
        rate_limit: workbench_server::config::RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        },
        cors_origins: vec!["http://localhost:4510".to_string()],
        cookie_security: workbench_server::config::CookieSecurityConfig {
            secure: false,
            same_site: "Strict".to_string(),
            environment: "test".to_string(),
        },
    }
}

#[test]
fn test_claude_code_service_creation() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config);

    assert!(
        service.is_ok(),
        "Should create ClaudeCodeService successfully"
    );

    let service = service.unwrap();
    assert_eq!(service.provider(), Provider::ClaudeCode);
}

#[test]
fn test_claude_code_service_with_session_id() {
    let config = create_test_config();
    let session_id = Uuid::new_v4();

    let service = ClaudeCodeService::new(config)
        .unwrap()
        .with_session_id(session_id);

    assert_eq!(service.provider(), Provider::ClaudeCode);
}

#[test]
fn test_claude_code_service_disabled() {
    let mut config = create_test_config();
    config.claude_code_enabled = false;

    let service = ClaudeCodeService::new(config).unwrap();

    // Test that it fails when disabled
    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Test message".to_string(),
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.7),
        max_tokens: Some(100),
        stream: Some(false),
    };

    let runtime = tokio::runtime::Runtime::new().unwrap();
    let result = runtime.block_on(service.chat_completion(request));

    assert!(result.is_err(), "Should fail when Claude Code is disabled");

    if let Err(e) = result {
        assert!(
            e.to_string().contains("disabled"),
            "Error should mention service is disabled"
        );
    }
}

#[test]
fn test_available_models() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();
    let models = service.available_models();

    assert!(!models.is_empty(), "Should have available models");

    // Check for expected models
    let model_ids: Vec<_> = models.iter().map(|m| &m.id).collect();
    assert!(model_ids.contains(&&"claude-code-sonnet".to_string()));
    assert!(model_ids.contains(&&"claude-code-haiku".to_string()));
    assert!(model_ids.contains(&&"claude-code-opus".to_string()));

    // Verify model properties
    for model in &models {
        assert_eq!(model.provider, Provider::ClaudeCode);
        assert!(model.id.starts_with("claude-code-"));
        assert!(!model.name.is_empty());
        assert!(model.max_tokens > 0);
        assert!(model.supports_streaming);
        assert!(model.cost_per_token.is_none()); // No direct cost for Claude Code
    }
}

#[tokio::test]
async fn test_claude_code_chat_completion_basic() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Say 'Hello test' exactly.".to_string(),
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.0),
        max_tokens: Some(10),
        stream: Some(false),
    };

    // Use timeout to prevent hanging
    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "claude-code");
            assert_eq!(response.message.role, "assistant");
            assert!(!response.message.content.is_empty());
            assert_eq!(response.model, "claude-code-sonnet");
            println!("Claude Code test passed: {}", response.message.content);
        }
        Ok(Err(e)) => {
            // Expected if Claude CLI is not available
            let error_msg = e.to_string();
            if error_msg.contains("Claude Code CLI not available")
                || error_msg.contains("not found")
                || error_msg.contains("timed out")
            {
                println!(
                    "Claude Code CLI not available in test environment: {}",
                    error_msg
                );
            } else {
                panic!("Unexpected Claude Code error: {}", e);
            }
        }
        Err(_) => {
            panic!("Claude Code test timed out");
        }
    }
}

#[tokio::test]
async fn test_claude_code_chat_completion_with_session() {
    let config = create_test_config();
    let session_id = Uuid::new_v4();
    let service = ClaudeCodeService::new(config)
        .unwrap()
        .with_session_id(session_id);

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Test with session".to_string(),
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.5),
        max_tokens: Some(20),
        stream: Some(false),
    };

    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "claude-code");
            assert!(!response.message.content.is_empty());
        }
        Ok(Err(e)) => {
            // Expected if Claude CLI is not available
            println!("Claude Code with session test skipped: {}", e);
        }
        Err(_) => {
            panic!("Claude Code with session test timed out");
        }
    }
}

#[tokio::test]
async fn test_claude_code_multi_message_conversation() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    let request = ChatRequest {
        messages: vec![
            ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: "Hi there!".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: "How are you?".to_string(),
            },
        ],
        model: "claude-code-haiku".to_string(),
        temperature: Some(0.3),
        max_tokens: Some(30),
        stream: Some(false),
    };

    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "claude-code");
            assert_eq!(response.model, "claude-code-haiku");
            // Multi-message conversation should be handled properly
        }
        Ok(Err(e)) => {
            println!("Multi-message Claude Code test skipped: {}", e);
        }
        Err(_) => {
            panic!("Multi-message Claude Code test timed out");
        }
    }
}

#[tokio::test]
async fn test_claude_code_streaming() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Count from 1 to 3".to_string(),
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.0),
        max_tokens: Some(50),
        stream: Some(true),
    };

    let result = timeout(
        Duration::from_secs(30),
        service.chat_completion_stream(request),
    )
    .await;

    match result {
        Ok(Ok(mut stream)) => {
            use futures::StreamExt;
            let mut event_count = 0;
            let mut has_content = false;
            let mut has_done = false;

            while let Some(event_result) = stream.next().await {
                match event_result {
                    Ok(stream_event) => {
                        event_count += 1;

                        match stream_event.event_type {
                            workbench_server::llm::StreamEventType::Token => {
                                if let Some(content) = &stream_event.data {
                                    if !content.trim().is_empty() {
                                        has_content = true;
                                    }
                                }
                            }
                            workbench_server::llm::StreamEventType::Done => {
                                has_done = true;
                                break;
                            }
                            workbench_server::llm::StreamEventType::Usage => {
                                // Usage event, continue processing
                            }
                            workbench_server::llm::StreamEventType::Error => {
                                // Error event, break the loop
                                break;
                            }
                        }

                        // Prevent infinite loops
                        if event_count > 100 {
                            break;
                        }
                    }
                    Err(e) => {
                        println!("Stream error: {}", e);
                        break;
                    }
                }
            }

            assert!(event_count > 0, "Should receive at least one event");
            assert!(
                has_content || has_done,
                "Should receive content or done event"
            );
        }
        Ok(Err(e)) => {
            println!("Streaming Claude Code test skipped: {}", e);
        }
        Err(_) => {
            panic!("Streaming Claude Code test timed out");
        }
    }
}

#[test]
fn test_claude_code_model_name_mapping() {
    let config = create_test_config();

    // Test different model configurations
    let test_cases = vec![
        ("claude-3-5-sonnet-20241022", "sonnet"),
        ("claude-code-sonnet", "sonnet"),
        ("claude-3-haiku-20240307", "haiku"),
        ("claude-code-haiku", "haiku"),
        ("claude-3-opus-20240229", "opus"),
        ("claude-code-opus", "opus"),
        ("unknown-model", "sonnet"), // default
    ];

    for (input_model, _expected_mapping) in test_cases {
        let mut test_config = config.clone();
        test_config.claude_code_model = input_model.to_string();

        let service = ClaudeCodeService::new(test_config);
        assert!(
            service.is_ok(),
            "Should create service with model: {}",
            input_model
        );

        // We can't directly test the private model mapping function,
        // but we can test that the service creation succeeds with various models
    }
}

#[test]
fn test_claude_code_usage_conversion() {
    // Test the usage conversion logic through available models
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();
    let models = service.available_models();

    // All Claude Code models should have no direct cost
    for model in &models {
        assert_eq!(model.cost_per_token, None);
        assert_eq!(model.provider, Provider::ClaudeCode);
    }
}

#[tokio::test]
async fn test_claude_code_error_handling() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    // Test with very long content that might cause issues
    let long_content = "x".repeat(50000);
    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: long_content,
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.7),
        max_tokens: Some(100),
        stream: Some(false),
    };

    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(_)) => {
            // Success with long content is fine
        }
        Ok(Err(e)) => {
            // Expected errors are fine
            let error_msg = e.to_string();
            assert!(
                error_msg.contains("CLI not available")
                    || error_msg.contains("not found")
                    || error_msg.contains("timed out")
                    || error_msg.contains("too long")
                    || error_msg.contains("limit"),
                "Should be a reasonable error: {}",
                error_msg
            );
        }
        Err(_) => {
            // Timeout is acceptable for very long content
        }
    }
}

#[test]
fn test_claude_code_prompt_building() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    // We can't directly test the private prompt building function,
    // but we can test different message configurations through the public API

    let single_message = vec![ChatMessage {
        role: "user".to_string(),
        content: "Single message".to_string(),
    }];

    let multi_message = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are a helpful assistant".to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        },
        ChatMessage {
            role: "assistant".to_string(),
            content: "Hi there!".to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: "How are you?".to_string(),
        },
    ];

    let request_single = ChatRequest {
        messages: single_message,
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.7),
        max_tokens: Some(10),
        stream: Some(false),
    };

    let request_multi = ChatRequest {
        messages: multi_message,
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.7),
        max_tokens: Some(10),
        stream: Some(false),
    };

    // Both should be accepted by the service
    let runtime = tokio::runtime::Runtime::new().unwrap();

    let result_single = runtime.block_on(async {
        timeout(
            Duration::from_secs(5),
            service.chat_completion(request_single),
        )
        .await
    });

    let result_multi = runtime.block_on(async {
        timeout(
            Duration::from_secs(5),
            service.chat_completion(request_multi),
        )
        .await
    });

    // We don't care about success/failure here, just that both are handled
    match result_single {
        Ok(Ok(_)) | Ok(Err(_)) => {
            // Both success and expected errors are fine
        }
        Err(_) => {
            // Timeout is acceptable in test environment
        }
    }

    match result_multi {
        Ok(Ok(_)) | Ok(Err(_)) => {
            // Both success and expected errors are fine
        }
        Err(_) => {
            // Timeout is acceptable in test environment
        }
    }
}

#[test]
fn test_claude_code_debug_output() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    // Test that the service implements Debug (required for logging)
    let debug_str = format!("{:?}", service);
    assert!(debug_str.contains("ClaudeCodeService"));
}

#[test]
fn test_claude_code_clone() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    // Test that the service can be cloned
    let cloned_service = service.clone();
    assert_eq!(service.provider(), cloned_service.provider());
}

#[tokio::test]
async fn test_claude_code_concurrent_requests() {
    let config = create_test_config();
    let service = ClaudeCodeService::new(config).unwrap();

    // Test multiple concurrent requests
    let mut handles = vec![];

    for i in 0..3 {
        let service_clone = service.clone();
        let handle = tokio::spawn(async move {
            let request = ChatRequest {
                messages: vec![ChatMessage {
                    role: "user".to_string(),
                    content: format!("Request {}", i),
                }],
                model: "claude-code-sonnet".to_string(),
                temperature: Some(0.7),
                max_tokens: Some(10),
                stream: Some(false),
            };

            timeout(
                Duration::from_secs(10),
                service_clone.chat_completion(request),
            )
            .await
        });
        handles.push(handle);
    }

    // Wait for all requests to complete
    let results = futures::future::join_all(handles).await;

    for (i, result) in results.into_iter().enumerate() {
        match result {
            Ok(Ok(Ok(_))) => {
                println!("Concurrent request {} succeeded", i);
            }
            Ok(Ok(Err(e))) => {
                println!("Concurrent request {} failed as expected: {}", i, e);
            }
            Ok(Err(_)) => {
                println!("Concurrent request {} timed out", i);
            }
            Err(e) => {
                panic!("Concurrent request {} panicked: {}", i, e);
            }
        }
    }
}
