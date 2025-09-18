// Unit tests for LLM functionality that don't require database connections
use workbench_server::llm::{LLMServiceFactory, Provider};

#[test]
fn test_provider_detection() {
    // Test OpenAI
    assert!(matches!(
        LLMServiceFactory::provider_from_model("gpt-4"),
        Ok(Provider::OpenAI)
    ));
    assert!(matches!(
        LLMServiceFactory::provider_from_model("gpt-3.5-turbo"),
        Ok(Provider::OpenAI)
    ));

    // Test Anthropic
    assert!(matches!(
        LLMServiceFactory::provider_from_model("claude-3-sonnet-20240229"),
        Ok(Provider::Anthropic)
    ));

    // Test Claude Code
    assert!(matches!(
        LLMServiceFactory::provider_from_model("claude-code-sonnet"),
        Ok(Provider::ClaudeCode)
    ));

    // Test unknown
    assert!(LLMServiceFactory::provider_from_model("unknown-model").is_err());
}

#[test]
fn test_available_models() {
    let models = LLMServiceFactory::available_models();
    assert!(!models.is_empty(), "Should have available models");

    // Check for both providers
    let openai_count = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::OpenAI))
        .count();
    let anthropic_count = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::Anthropic))
        .count();
    let claude_code_count = models
        .iter()
        .filter(|m| matches!(m.provider, Provider::ClaudeCode))
        .count();

    assert!(openai_count > 0, "Should have OpenAI models");
    assert!(anthropic_count > 0, "Should have Anthropic models");
    assert!(claude_code_count > 0, "Should have Claude Code models");
}

#[test]
fn test_model_information() {
    let models = LLMServiceFactory::available_models();

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

#[test]
fn test_service_factory_creation() {
    // Create basic test config
    let config = create_test_config();

    // Test creating each provider
    let openai_service = LLMServiceFactory::create_service(&Provider::OpenAI, &config);
    let anthropic_service = LLMServiceFactory::create_service(&Provider::Anthropic, &config);
    let claude_code_service = LLMServiceFactory::create_service(&Provider::ClaudeCode, &config);

    // With empty API keys, should fail for OpenAI and Anthropic
    assert!(
        openai_service.is_err(),
        "Should fail with empty OpenAI API key"
    );
    assert!(
        anthropic_service.is_err(),
        "Should fail with empty Anthropic API key"
    );

    // Claude Code should succeed even without API key (uses CLI)
    assert!(
        claude_code_service.is_ok(),
        "Should create Claude Code service"
    );
}

#[test]
fn test_service_factory_with_valid_keys() {
    // Create test config with API keys
    let mut config = create_test_config();
    config.openai_api_key = "test-openai-key".to_string();
    config.anthropic_api_key = "test-anthropic-key".to_string();

    // Test creating each provider
    let openai_service = LLMServiceFactory::create_service(&Provider::OpenAI, &config);
    let anthropic_service = LLMServiceFactory::create_service(&Provider::Anthropic, &config);
    let claude_code_service = LLMServiceFactory::create_service(&Provider::ClaudeCode, &config);

    assert!(
        openai_service.is_ok(),
        "Should create OpenAI service with API key"
    );
    assert!(
        anthropic_service.is_ok(),
        "Should create Anthropic service with API key"
    );
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
fn create_test_config() -> workbench_server::config::AppConfig {
    workbench_server::config::AppConfig {
        bind_address: "0.0.0.0:4512".parse().unwrap(),
        openai_api_key: String::new(), // Empty by default for testing
        openai_model: "gpt-3.5-turbo".to_string(),
        openai_max_tokens: 2048,
        openai_temperature: 0.7,
        anthropic_api_key: String::new(), // Empty by default for testing
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
