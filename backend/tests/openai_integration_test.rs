//! Integration tests specifically for OpenAI functionality (Story 1.2)
//! These tests focus on the OpenAI integration without dependencies on database layer

use workbench_server::config::AppConfig;
use workbench_server::error::AppError;
use workbench_server::openai::{ChatMessage, ChatRequest, OpenAIService};

#[test]
fn test_config_loading() {
    // Test that configuration loads properly
    std::env::set_var("BIND_ADDRESS", "127.0.0.1:3000");
    std::env::set_var("OPENAI_API_KEY", "sk-test123");
    std::env::set_var("OPENAI_MODEL", "gpt-3.5-turbo");

    let config = AppConfig::from_env().expect("Failed to load config");
    assert_eq!(config.openai_api_key, "sk-test123");
    assert_eq!(config.openai_model, "gpt-3.5-turbo");
}

#[test]
fn test_chat_request_creation() {
    let request = ChatRequest {
        messages: vec![
            ChatMessage {
                role: "user".to_string(),
                content: "Hello, world!".to_string(),
            }
        ],
        model: Some("gpt-4".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(1024),
    };

    assert_eq!(request.messages.len(), 1);
    assert_eq!(request.messages[0].role, "user");
    assert_eq!(request.messages[0].content, "Hello, world!");
    assert_eq!(request.model, Some("gpt-4".to_string()));
}

#[test]
fn test_error_types() {
    let bad_request = AppError::BadRequest("Invalid input".to_string());
    assert!(matches!(bad_request, AppError::BadRequest(_)));

    let openai_error = AppError::OpenAI("API error".to_string());
    assert!(matches!(openai_error, AppError::OpenAI(_)));
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