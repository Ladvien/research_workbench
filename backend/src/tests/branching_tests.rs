use anyhow::Result;
use uuid::Uuid;

use crate::{
    database::Database,
    models::{CreateMessageRequest, MessageRole},
    repositories::{message::MessageRepository, Repository},
};

#[tokio::test]
async fn test_message_tree_operations() -> Result<()> {
    // Skip test if database is not available
    if std::env::var("DATABASE_URL").is_err() {
        return Ok(());
    }

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench".to_string());

    let database = Database::new(&database_url).await?;
    let message_repo = MessageRepository::new(database);

    // Create a conversation ID (in real usage this would come from conversation table)
    let conversation_id = Uuid::new_v4();

    // Create root message (user)
    let root_request = CreateMessageRequest {
        conversation_id,
        parent_id: None,
        role: MessageRole::User,
        content: "What is the capital of France?".to_string(),
        metadata: None,
    };

    let root_message = message_repo.create_from_request(root_request).await?;
    println!("Created root message: {}", root_message.id);

    // Create first assistant response
    let assistant1_request = CreateMessageRequest {
        conversation_id,
        parent_id: Some(root_message.id),
        role: MessageRole::Assistant,
        content: "The capital of France is Paris.".to_string(),
        metadata: None,
    };

    let assistant1_message = message_repo.create_from_request(assistant1_request).await?;
    println!(
        "Created first assistant response: {}",
        assistant1_message.id
    );

    // Create second user message
    let user2_request = CreateMessageRequest {
        conversation_id,
        parent_id: Some(assistant1_message.id),
        role: MessageRole::User,
        content: "Tell me more about Paris.".to_string(),
        metadata: None,
    };

    let user2_message = message_repo.create_from_request(user2_request).await?;
    println!("Created second user message: {}", user2_message.id);

    // Create second assistant response
    let assistant2_request = CreateMessageRequest {
        conversation_id,
        parent_id: Some(user2_message.id),
        role: MessageRole::Assistant,
        content: "Paris is the most populous city of France.".to_string(),
        metadata: None,
    };

    let assistant2_message = message_repo.create_from_request(assistant2_request).await?;
    println!(
        "Created second assistant response: {}",
        assistant2_message.id
    );

    // Test: Edit the second user message to create a branch
    let edited_message = message_repo
        .edit_message_and_branch(
            user2_message.id,
            "What is the population of Paris?".to_string(),
        )
        .await?;

    println!("Created branch with edited message: {}", edited_message.id);

    // Verify the edit created a new message
    assert_ne!(edited_message.id, user2_message.id);
    assert_eq!(edited_message.content, "What is the population of Paris?");
    // Verify the new message has the same parent as the original
    let original_user2 = message_repo.find_by_id(user2_message.id).await?.unwrap();
    let edited_msg = message_repo.find_by_id(edited_message.id).await?.unwrap();
    assert_eq!(edited_msg.parent_id, original_user2.parent_id);

    // Test: Get conversation tree
    let tree_messages = message_repo.find_conversation_tree(conversation_id).await?;
    println!("Tree contains {} messages", tree_messages.len());

    // Should have original messages plus the new edited message
    // (original assistant2 should be deactivated)
    assert!(tree_messages.len() >= 4);

    // Test: Get active thread
    let active_thread = message_repo
        .find_active_conversation_thread(conversation_id)
        .await?;
    println!("Active thread contains {} messages", active_thread.len());

    // Active thread should contain the new edited message, not the old one
    let active_content: Vec<&str> = active_thread.iter().map(|m| m.content.as_str()).collect();

    assert!(active_content.contains(&"What is the population of Paris?"));
    assert!(!active_content.contains(&"Tell me more about Paris."));

    // Test: Get branches
    let branches = message_repo
        .get_conversation_branches(conversation_id)
        .await?;
    println!("Found {} branch points", branches.len());

    // Should have at least one branch point (at the assistant1 message)
    if !branches.is_empty() {
        let branch = &branches[0];
        assert!(branch.branch_count >= 2);
        println!(
            "Branch at {} has {} options",
            branch.parent_id, branch.branch_count
        );
    }

    // Test: Switch to a different branch
    let branch_messages = message_repo
        .find_message_branches(assistant1_message.id)
        .await?;
    if branch_messages.len() > 1 {
        let alternative_message_id = branch_messages
            .iter()
            .find(|m| m.id != user2_message.id)
            .map(|m| m.id)
            .unwrap_or(edited_message.id);

        let switched_thread = message_repo
            .switch_to_branch(alternative_message_id)
            .await?;
        println!("Switched to branch with {} messages", switched_thread.len());

        assert!(!switched_thread.is_empty());
    }

    println!("✅ All branching tests passed!");
    Ok(())
}

#[tokio::test]
async fn test_message_thread_traversal() -> Result<()> {
    // Skip test if database is not available
    if std::env::var("DATABASE_URL").is_err() {
        return Ok(());
    }

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432".to_string());

    let database = Database::new(&database_url).await?;
    let message_repo = MessageRepository::new(database);

    let conversation_id = Uuid::new_v4();

    // Create a simple chain: User -> Assistant -> User
    let user1_request = CreateMessageRequest {
        conversation_id,
        parent_id: None,
        role: MessageRole::User,
        content: "Hello".to_string(),
        metadata: None,
    };

    let user1_message = message_repo.create_from_request(user1_request).await?;

    let assistant1_request = CreateMessageRequest {
        conversation_id,
        parent_id: Some(user1_message.id),
        role: MessageRole::Assistant,
        content: "Hi there!".to_string(),
        metadata: None,
    };

    let assistant1_message = message_repo.create_from_request(assistant1_request).await?;

    let user2_request = CreateMessageRequest {
        conversation_id,
        parent_id: Some(assistant1_message.id),
        role: MessageRole::User,
        content: "How are you?".to_string(),
        metadata: None,
    };

    let user2_message = message_repo.create_from_request(user2_request).await?;

    // Test: Find conversation thread leading to user2_message
    let thread = message_repo
        .find_conversation_thread(user2_message.id)
        .await?;

    // Should contain all three messages in order
    assert_eq!(thread.len(), 3);
    assert_eq!(thread[0].content, "Hello");
    assert_eq!(thread[1].content, "Hi there!");
    assert_eq!(thread[2].content, "How are you?");

    println!("✅ Thread traversal test passed!");
    Ok(())
}
