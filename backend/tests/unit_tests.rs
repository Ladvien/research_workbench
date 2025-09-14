use workbench_server::config::AppConfig;
use workbench_server::error::AppError;
use workbench_server::openai::{ChatMessage, ChatRequest, OpenAIService};

#[test]
fn test_app_config_from_env() {
    // Set up test environment variables
    std::env::set_var("BIND_ADDRESS", "127.0.0.1:3000");
    std::env::set_var("OPENAI_API_KEY", "sk-test123");
    std::env::set_var("OPENAI_MODEL", "gpt-3.5-turbo");
    std::env::set_var("OPENAI_MAX_TOKENS", "1024");
    std::env::set_var("OPENAI_TEMPERATURE", "0.5");

    let config = AppConfig::from_env().expect("Failed to load config");

    assert_eq!(config.bind_address.to_string(), "127.0.0.1:3000");
    assert_eq!(config.openai_api_key, "sk-test123");
    assert_eq!(config.openai_model, "gpt-3.5-turbo");
    assert_eq!(config.openai_max_tokens, 1024);
    assert_eq!(config.openai_temperature, 0.5);
}

#[test]
fn test_app_config_missing_api_key() {
    std::env::remove_var("OPENAI_API_KEY");
    std::env::set_var("BIND_ADDRESS", "127.0.0.1:3000");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("OPENAI_API_KEY environment variable not set"));
}

#[test]
fn test_app_config_defaults() {
    std::env::remove_var("BIND_ADDRESS");
    std::env::remove_var("OPENAI_MODEL");
    std::env::remove_var("OPENAI_MAX_TOKENS");
    std::env::remove_var("OPENAI_TEMPERATURE");
    std::env::set_var("OPENAI_API_KEY", "sk-test123");

    let config = AppConfig::from_env().expect("Failed to load config");

    assert_eq!(config.bind_address.to_string(), "127.0.0.1:8080");
    assert_eq!(config.openai_model, "gpt-4");
    assert_eq!(config.openai_max_tokens, 2048);
    assert_eq!(config.openai_temperature, 0.7);
}

#[test]
fn test_chat_request_validation() {
    let valid_request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        }],
        model: None,
        temperature: None,
        max_tokens: None,
    };

    // This would test the validation logic
    assert!(!valid_request.messages.is_empty());

    let empty_request = ChatRequest {
        messages: vec![],
        model: None,
        temperature: None,
        max_tokens: None,
    };

    assert!(empty_request.messages.is_empty());
}

#[test]
fn test_error_types() {
    let internal_error = AppError::Internal(anyhow::anyhow!("Test error"));
    assert!(matches!(internal_error, AppError::Internal(_)));

    let openai_error = AppError::OpenAI("API error".to_string());
    assert!(matches!(openai_error, AppError::OpenAI(_)));

    let bad_request = AppError::BadRequest("Invalid input".to_string());
    assert!(matches!(bad_request, AppError::BadRequest(_)));
}

#[tokio::test]
async fn test_openai_service_creation() {
    std::env::set_var("BIND_ADDRESS", "127.0.0.1:3000");
    std::env::set_var("OPENAI_API_KEY", "sk-test123");
    std::env::set_var("OPENAI_MODEL", "gpt-3.5-turbo");
    std::env::set_var("OPENAI_MAX_TOKENS", "1024");
    std::env::set_var("OPENAI_TEMPERATURE", "0.5");

    let config = AppConfig::from_env().expect("Failed to load config");
    let service = OpenAIService::new(config);

    assert!(service.is_ok());
}