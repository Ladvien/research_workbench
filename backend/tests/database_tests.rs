use anyhow::Result;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use uuid::Uuid;
use workbench_server::{
    database::Database,
    models::{CreateConversationRequest, CreateMessageRequest, CreateUserRequest, MessageRole},
    repositories::{Repository, RepositoryManager},
    services::DataAccessLayer,
};

// Helper function to create test database connection
async fn create_test_database() -> Result<Database> {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:$5$@!zjP6dZ222Qc@localhost:5432/workbench_test".to_string());

    Database::new(&database_url).await
}

// Test user repository operations
#[tokio::test]
async fn test_user_repository() -> Result<()> {
    let database = create_test_database().await?;
    let dal = DataAccessLayer::new(database);
    let user_repo = dal.users();

    // Create a test user
    let user_request = CreateUserRequest {
        email: "test@example.com".to_string(),
        username: "testuser".to_string(),
        password: "testpassword123".to_string(),
    };

    let created_user = user_repo.create_from_request(user_request).await?;

    assert_eq!(created_user.email, "test@example.com");
    assert_eq!(created_user.username, "testuser");

    // Test finding by email
    let found_user = user_repo.find_by_email("test@example.com").await?;
    assert!(found_user.is_some());
    assert_eq!(found_user.unwrap().id, created_user.id);

    // Test password verification
    let password_valid = user_repo.verify_password(&created_user, "testpassword123").await?;
    assert!(password_valid);

    let password_invalid = user_repo.verify_password(&created_user, "wrongpassword").await?;
    assert!(!password_invalid);

    // Clean up
    user_repo.delete(created_user.id).await?;

    Ok(())
}

// Test conversation repository operations
#[tokio::test]
async fn test_conversation_repository() -> Result<()> {
    let database = create_test_database().await?;
    let dal = DataAccessLayer::new(database);

    // First create a test user
    let user_request = CreateUserRequest {
        email: "convtest@example.com".to_string(),
        username: "convtestuser".to_string(),
        password: "testpassword123".to_string(),
    };
    let user = dal.users().create_from_request(user_request).await?;

    // Create a conversation
    let conv_request = CreateConversationRequest {
        title: Some("Test Conversation".to_string()),
        model: "gpt-4".to_string(),
        metadata: Some(serde_json::json!({"test": "data"})),
    };

    let conversation = dal.conversations().create_from_request(user.id, conv_request).await?;

    assert_eq!(conversation.title, Some("Test Conversation".to_string()));
    assert_eq!(conversation.model, "gpt-4");
    assert_eq!(conversation.user_id, user.id);

    // Test finding conversations by user
    let pagination = crate::models::PaginationParams::default();
    let user_conversations = dal.conversations().find_by_user_id(user.id, pagination).await?;
    assert!(!user_conversations.is_empty());
    assert_eq!(user_conversations[0].id, conversation.id);

    // Test updating title
    let updated = dal.conversations().update_title(conversation.id, user.id, "Updated Title".to_string()).await?;
    assert!(updated);

    // Clean up
    dal.repositories.conversations.delete(conversation.id).await?;
    dal.users().delete(user.id).await?;

    Ok(())
}

// Test message repository operations
#[tokio::test]
async fn test_message_repository() -> Result<()> {
    let database = create_test_database().await?;
    let dal = DataAccessLayer::new(database);

    // Create test user and conversation
    let user_request = CreateUserRequest {
        email: "msgtest@example.com".to_string(),
        username: "msgtestuser".to_string(),
        password: "testpassword123".to_string(),
    };
    let user = dal.users().create_from_request(user_request).await?;

    let conv_request = CreateConversationRequest {
        title: Some("Test Message Conversation".to_string()),
        model: "gpt-4".to_string(),
        metadata: None,
    };
    let conversation = dal.conversations().create_from_request(user.id, conv_request).await?;

    // Create a message
    let msg_request = CreateMessageRequest {
        conversation_id: conversation.id,
        parent_id: None,
        role: MessageRole::User,
        content: "Hello, this is a test message".to_string(),
        metadata: None,
    };

    let message = dal.messages().create_from_request(msg_request).await?;

    assert_eq!(message.conversation_id, conversation.id);
    assert_eq!(message.content, "Hello, this is a test message");
    assert_eq!(message.role, MessageRole::User);

    // Test finding messages by conversation
    let messages = dal.messages().find_by_conversation_id(conversation.id).await?;
    assert!(!messages.is_empty());
    assert_eq!(messages[0].id, message.id);

    // Test message count
    let count = dal.messages().count_by_conversation(conversation.id).await?;
    assert_eq!(count, 1);

    // Clean up
    dal.messages().delete(message.id).await?;
    dal.repositories.conversations.delete(conversation.id).await?;
    dal.users().delete(user.id).await?;

    Ok(())
}

// Test conversation with messages integration
#[tokio::test]
async fn test_conversation_with_messages() -> Result<()> {
    let database = create_test_database().await?;
    let dal = DataAccessLayer::new(database);

    // Create test user and conversation
    let user_request = CreateUserRequest {
        email: "integration@example.com".to_string(),
        username: "integrationuser".to_string(),
        password: "testpassword123".to_string(),
    };
    let user = dal.users().create_from_request(user_request).await?;

    let conv_request = CreateConversationRequest {
        title: Some("Integration Test Conversation".to_string()),
        model: "gpt-4".to_string(),
        metadata: None,
    };
    let conversation = dal.conversations().create_from_request(user.id, conv_request).await?;

    // Create multiple messages
    let msg1_request = CreateMessageRequest {
        conversation_id: conversation.id,
        parent_id: None,
        role: MessageRole::User,
        content: "First message".to_string(),
        metadata: None,
    };
    let msg1 = dal.messages().create_from_request(msg1_request).await?;

    let msg2_request = CreateMessageRequest {
        conversation_id: conversation.id,
        parent_id: Some(msg1.id),
        role: MessageRole::Assistant,
        content: "Assistant response".to_string(),
        metadata: Some(serde_json::json!({"tokens_used": 25})),
    };
    let msg2 = dal.messages().create_from_request(msg2_request).await?;

    // Test getting conversation with messages
    let conv_with_msgs = dal.conversations().find_with_messages(conversation.id, user.id).await?;
    assert!(conv_with_msgs.is_some());

    let conv_with_msgs = conv_with_msgs.unwrap();
    assert_eq!(conv_with_msgs.conversation.id, conversation.id);
    assert_eq!(conv_with_msgs.messages.len(), 2);

    // Clean up
    dal.messages().delete(msg1.id).await?;
    dal.messages().delete(msg2.id).await?;
    dal.repositories.conversations.delete(conversation.id).await?;
    dal.users().delete(user.id).await?;

    Ok(())
}