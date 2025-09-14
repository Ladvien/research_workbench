use workbench_server::llm::{ChatMessage, ChatRequest, LLMServiceFactory, Provider};

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

    assert!(openai_count > 0, "Should have OpenAI models");
    assert!(anthropic_count > 0, "Should have Anthropic models");
}

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

    // Test unknown
    assert!(LLMServiceFactory::provider_from_model("unknown-model").is_err());
}

#[test]
fn test_chat_request_serialization() {
    let request = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Hello, world!".to_string(),
        }],
        model: "gpt-4".to_string(),
        temperature: Some(0.7),
        max_tokens: Some(2048),
        stream: Some(false),
    };

    // Test JSON serialization
    let json = serde_json::to_string(&request).expect("Should serialize");
    assert!(json.contains("Hello, world!"));
    assert!(json.contains("gpt-4"));

    // Test deserialization
    let deserialized: ChatRequest = serde_json::from_str(&json).expect("Should deserialize");
    assert_eq!(deserialized.model, "gpt-4");
    assert_eq!(deserialized.messages.len(), 1);
    assert_eq!(deserialized.messages[0].content, "Hello, world!");
}
