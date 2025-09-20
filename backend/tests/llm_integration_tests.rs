use std::time::Duration;
use tokio::time::timeout;
use workbench_server::{
    config::AppConfig,
    error::AppError,
    llm::{ChatMessage, ChatRequest, LLMService, LLMServiceFactory, Provider},
};

/// Test OpenAI integration with proper error handling
#[tokio::test]
async fn test_openai_integration() {
    let config = create_test_config();

    // Skip test if no OpenAI API key is available
    if config.openai_api_key.is_empty() {
        println!("Skipping OpenAI test - no API key configured");
        return;
    }

    let service = LLMServiceFactory::create_service(&Provider::OpenAI, &config)
        .expect("Should create OpenAI service");

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Say 'Hello, test!' exactly.".to_string(),
        }],
        model: "gpt-3.5-turbo".to_string(),
        temperature: Some(0.0), // Deterministic response
        max_tokens: Some(10),
        stream: Some(false),
    };

    // Test with timeout to prevent hanging
    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "openai");
            assert_eq!(response.message.role, "assistant");
            assert!(!response.message.content.is_empty());
            if let Some(usage) = response.usage {
                assert!(usage.total_tokens > 0);
            }
            println!("OpenAI test passed: {}", response.message.content);
        }
        Ok(Err(e)) => {
            println!("OpenAI API error (expected in CI): {}", e);
            // In CI, API calls might fail, but error handling should work
            assert!(matches!(e, AppError::OpenAI(_)));
        }
        Err(_) => {
            panic!("OpenAI test timed out - this indicates a serious issue");
        }
    }
}

/// Test Anthropic integration with proper error handling
#[tokio::test]
async fn test_anthropic_integration() {
    let config = create_test_config();

    // Skip test if no Anthropic API key is available
    if config.anthropic_api_key.is_empty() {
        println!("Skipping Anthropic test - no API key configured");
        return;
    }

    let service = LLMServiceFactory::create_service(&Provider::Anthropic, &config)
        .expect("Should create Anthropic service");

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Say 'Hello, test!' exactly.".to_string(),
        }],
        model: "claude-3-haiku-20240307".to_string(),
        temperature: Some(0.0),
        max_tokens: Some(10),
        stream: Some(false),
    };

    // Test with timeout
    let result = timeout(Duration::from_secs(30), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "anthropic");
            assert_eq!(response.message.role, "assistant");
            assert!(!response.message.content.is_empty());
            println!("Anthropic test passed: {}", response.message.content);
        }
        Ok(Err(e)) => {
            println!("Anthropic API error (expected in CI): {}", e);
            // In CI, API calls might fail, but error handling should work
            assert!(matches!(e, AppError::Anthropic(_)));
        }
        Err(_) => {
            panic!("Anthropic test timed out - this indicates a serious issue");
        }
    }
}

/// Test Claude Code integration
#[tokio::test]
async fn test_claude_code_integration() {
    let mut config = create_test_config();
    config.claude_code_enabled = true;

    let service = LLMServiceFactory::create_service(&Provider::ClaudeCode, &config)
        .expect("Should create Claude Code service");

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Say 'Hello from Claude Code!' exactly.".to_string(),
        }],
        model: "claude-code-sonnet".to_string(),
        temperature: Some(0.0),
        max_tokens: Some(20),
        stream: Some(false),
    };

    // Test with timeout
    let result = timeout(Duration::from_secs(120), service.chat_completion(request)).await;

    match result {
        Ok(Ok(response)) => {
            assert_eq!(response.provider, "claude-code");
            assert_eq!(response.message.role, "assistant");
            assert!(!response.message.content.is_empty());
            println!("Claude Code test passed: {}", response.message.content);
        }
        Ok(Err(e)) => {
            println!("Claude Code error (expected if CLI not available): {}", e);
            // Claude Code might not be available in CI
            assert!(
                e.to_string().contains("Claude Code") || e.to_string().contains("not available")
            );
        }
        Err(_) => {
            panic!("Claude Code test timed out - this indicates a serious issue");
        }
    }
}

/// Test provider routing accuracy
#[test]
fn test_provider_routing() {
    // Test OpenAI model detection
    assert_eq!(
        LLMServiceFactory::provider_from_model("gpt-4").unwrap(),
        Provider::OpenAI
    );
    assert_eq!(
        LLMServiceFactory::provider_from_model("gpt-3.5-turbo").unwrap(),
        Provider::OpenAI
    );

    // Test Anthropic model detection
    assert_eq!(
        LLMServiceFactory::provider_from_model("claude-3-sonnet-20240229").unwrap(),
        Provider::Anthropic
    );
    assert_eq!(
        LLMServiceFactory::provider_from_model("claude-3-haiku-20240307").unwrap(),
        Provider::Anthropic
    );

    // Test Claude Code model detection
    assert_eq!(
        LLMServiceFactory::provider_from_model("claude-code-sonnet").unwrap(),
        Provider::ClaudeCode
    );
    assert_eq!(
        LLMServiceFactory::provider_from_model("claude-code-haiku").unwrap(),
        Provider::ClaudeCode
    );

    // Test invalid model
    assert!(LLMServiceFactory::provider_from_model("invalid-model").is_err());
}

/// Test streaming capabilities
#[tokio::test]
async fn test_streaming_capabilities() {
    let config = create_test_config();

    // Test OpenAI streaming if API key available
    if !config.openai_api_key.is_empty() {
        let service = LLMServiceFactory::create_service(&Provider::OpenAI, &config)
            .expect("Should create OpenAI service");

        let request = ChatRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Count from 1 to 3.".to_string(),
            }],
            model: "gpt-3.5-turbo".to_string(),
            temperature: Some(0.0),
            max_tokens: Some(20),
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
                let mut token_count = 0;
                while let Some(event) = stream.next().await {
                    match event {
                        Ok(stream_event) => {
                            token_count += 1;
                            println!("Stream event: {:?}", stream_event);
                            if token_count > 50 {
                                break; // Prevent infinite streams
                            }
                        }
                        Err(e) => {
                            println!("Stream error: {}", e);
                            break;
                        }
                    }
                }
                assert!(token_count > 0, "Should receive at least one token");
            }
            Ok(Err(e)) => {
                println!("Streaming error (expected in CI): {}", e);
            }
            Err(_) => {
                panic!("Streaming test timed out");
            }
        }
    }
}

/// Test error handling for invalid configurations
#[tokio::test]
async fn test_error_handling() {
    let mut config = create_test_config();
    config.openai_api_key = "invalid-key".to_string();

    let service = LLMServiceFactory::create_service(&Provider::OpenAI, &config)
        .expect("Should create service with invalid key");

    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Test".to_string(),
        }],
        model: "gpt-3.5-turbo".to_string(),
        temperature: Some(0.0),
        max_tokens: Some(10),
        stream: Some(false),
    };

    let result = service.chat_completion(request).await;
    assert!(result.is_err(), "Should fail with invalid API key");

    if let Err(e) = result {
        assert!(matches!(e, AppError::OpenAI(_)), "Should be OpenAI error");
    }
}

/// Test model information consistency
#[test]
fn test_model_information() {
    let models = LLMServiceFactory::available_models();

    assert!(!models.is_empty(), "Should have available models");

    // Check that each provider has models
    let openai_models: Vec<_> = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::OpenAI))
        .collect();
    let anthropic_models: Vec<_> = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::Anthropic))
        .collect();
    let claude_code_models: Vec<_> = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::ClaudeCode))
        .collect();

    assert!(!openai_models.is_empty(), "Should have OpenAI models");
    assert!(!anthropic_models.is_empty(), "Should have Anthropic models");
    assert!(
        !claude_code_models.is_empty(),
        "Should have Claude Code models"
    );

    // Verify model properties
    for model in &models {
        assert!(!model.id.is_empty(), "Model ID should not be empty");
        assert!(!model.name.is_empty(), "Model name should not be empty");
        assert!(model.max_tokens > 0, "Max tokens should be positive");

        // Verify provider-specific constraints
        match model.provider {
            Provider::OpenAI => {
                assert!(
                    model.id.starts_with("gpt-"),
                    "OpenAI models should start with 'gpt-'"
                );
                assert!(
                    model.cost_per_token.is_some(),
                    "OpenAI models should have cost info"
                );
            }
            Provider::Anthropic => {
                assert!(
                    model.id.starts_with("claude-"),
                    "Anthropic models should start with 'claude-'"
                );
                assert!(
                    model.cost_per_token.is_some(),
                    "Anthropic models should have cost info"
                );
            }
            Provider::ClaudeCode => {
                assert!(
                    model.id.starts_with("claude-code-"),
                    "Claude Code models should start with 'claude-code-'"
                );
                assert!(
                    model.cost_per_token.is_none(),
                    "Claude Code models should not have direct cost"
                );
            }
        }
    }
}

/// Test service factory creation
#[test]
fn test_service_factory() {
    let config = create_test_config();

    // Test creating each provider
    let openai_service = LLMServiceFactory::create_service(&Provider::OpenAI, &config);
    assert!(openai_service.is_ok(), "Should create OpenAI service");

    let anthropic_service = LLMServiceFactory::create_service(&Provider::Anthropic, &config);
    assert!(anthropic_service.is_ok(), "Should create Anthropic service");

    let claude_code_service = LLMServiceFactory::create_service(&Provider::ClaudeCode, &config);
    assert!(
        claude_code_service.is_ok(),
        "Should create Claude Code service"
    );

    // Verify provider types
    assert_eq!(openai_service.unwrap().provider(), Provider::OpenAI);
    assert_eq!(anthropic_service.unwrap().provider(), Provider::Anthropic);
    assert_eq!(
        claude_code_service.unwrap().provider(),
        Provider::ClaudeCode
    );
}

/// Helper function to create test configuration
fn create_test_config() -> AppConfig {
    // Load configuration from environment variables
    AppConfig {
        bind_address: "0.0.0.0:4512".parse().unwrap(),
        openai_api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        openai_model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".to_string()),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").unwrap_or_default(),
        anthropic_model: std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| "claude-3-haiku-20240307".to_string()),
        anthropic_max_tokens: 2048,
        anthropic_temperature: 0.7,
        claude_code_enabled: std::env::var("CLAUDE_CODE_ENABLED").map(|v| v == "true").unwrap_or(true),
        claude_code_model: "claude-3-5-sonnet-20241022".to_string(),
        claude_code_session_timeout: 3600,
        jwt_config: workbench_server::config::JwtConfig::new(
            std::env::var("JWT_SECRET").unwrap_or_else(|_| "test-secret-that-is-long-enough-for-testing-purposes".to_string()),
        )
        .unwrap(),
        redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
        session_timeout_hours: 24,
        storage_path: std::env::var("NFS_MOUNT").unwrap_or_else(|_| "/tmp/workbench_test_storage".to_string()),
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
