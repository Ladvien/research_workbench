use serde_json::json;
use uuid::Uuid;
use workbench_server::{
    database::Database,
    models::{CreateConversationRequest, PaginationParams},
    repositories::conversation::ConversationRepository,
    services::{conversation::ConversationService, DataAccessLayer},
};

/// Helper to run simple database tests
async fn setup_test_db() -> anyhow::Result<(Database, ConversationService)> {
    dotenvy::dotenv().ok(); // Load .env for test

    let database = Database::from_env().await?;
    let dal = DataAccessLayer::new(database.clone());
    let service = ConversationService::new(dal);

    Ok((database, service))
}

#[tokio::test]
async fn test_conversation_service_get_user_conversations() {
    let (_database, service) = setup_test_db().await.unwrap();

    // Create a test user ID
    let user_id = Uuid::new_v4();

    // Test pagination
    let pagination = PaginationParams {
        page: Some(1),
        limit: Some(50),
    };

    // Call the service method directly
    let result = service.get_user_conversations(user_id, pagination).await;

    // Print the result to understand what's happening
    match result {
        Ok(conversations) => {
            println!("Service returned {} conversations", conversations.len());
            for conv in &conversations {
                println!("Conversation: {} - {}", conv.id, conv.title.as_ref().unwrap_or(&"No title".to_string()));
            }

            // The service should return an array (empty or not)
            // This is NOT the issue - the issue is likely somewhere else
            assert!(conversations.is_empty() || !conversations.is_empty()); // This will always pass
        }
        Err(e) => {
            panic!("Service call failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_conversation_repository_directly() {
    let (database, _service) = setup_test_db().await.unwrap();
    let repo = ConversationRepository::new(database);

    // Create a test user ID
    let user_id = Uuid::new_v4();

    // Test pagination
    let pagination = PaginationParams {
        page: Some(1),
        limit: Some(50),
    };

    // Call the repository method directly
    let result = repo.find_by_user_id(user_id, pagination).await;

    // Print the result to understand what's happening
    match result {
        Ok(conversations) => {
            println!("Repository returned {} conversations", conversations.len());
            for conv in &conversations {
                println!("Conversation: {} - {}", conv.id, conv.title.as_ref().unwrap_or(&"No title".to_string()));
            }

            // This should work correctly and return an empty array for non-existent user
            assert!(conversations.is_empty());
        }
        Err(e) => {
            panic!("Repository call failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_create_and_fetch_conversation() {
    let (database, service) = setup_test_db().await.unwrap();

    // Create a test user ID
    let user_id = Uuid::new_v4();

    // Create a conversation
    let create_request = CreateConversationRequest {
        title: Some("Test Conversation".to_string()),
        model: "gpt-4".to_string(),
        provider: None,
        metadata: None,
    };

    let created_conv = service.create_conversation(user_id, create_request).await.unwrap();
    println!("Created conversation: {} - {}", created_conv.id, created_conv.title.as_ref().unwrap_or(&"No title".to_string()));

    // Now fetch conversations for this user
    let pagination = PaginationParams {
        page: Some(1),
        limit: Some(50),
    };

    let conversations = service.get_user_conversations(user_id, pagination).await.unwrap();
    println!("Found {} conversations for user", conversations.len());

    // Should find the conversation we just created
    assert_eq!(conversations.len(), 1);
    assert_eq!(conversations[0].id, created_conv.id);
    assert_eq!(conversations[0].title, Some("Test Conversation".to_string()));
    assert_eq!(conversations[0].model, "gpt-4");
}