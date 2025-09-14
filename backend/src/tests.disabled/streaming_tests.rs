use axum::response::sse::Event;
use uuid::Uuid;

use crate::handlers::chat_stream::stream_message;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Path;
    use futures::StreamExt;

    #[tokio::test]
    async fn test_streaming_endpoint_returns_events() {
        let conversation_id = Uuid::new_v4();
        let path = Path(conversation_id);

        let response = stream_message(path).await;

        // Collect the first few events from the stream
        let mut stream = response.stream;
        let mut events = Vec::new();

        for _ in 0..3 {
            if let Some(event_result) = stream.next().await {
                if let Ok(event) = event_result {
                    events.push(event);
                }
            }
        }

        // Should have at least one event (start event)
        assert!(!events.is_empty());

        // First event should be a start event
        let first_event = &events[0];
        assert!(first_event.event().is_some());
    }

    #[tokio::test]
    async fn test_streaming_generates_tokens() {
        let conversation_id = Uuid::new_v4();
        let path = Path(conversation_id);

        let response = stream_message(path).await;

        // Collect all events from the stream
        let mut stream = response.stream;
        let mut token_events = 0;

        while let Some(event_result) = stream.next().await {
            if let Ok(event) = event_result {
                if let Some(event_type) = event.event() {
                    if event_type == "token" {
                        token_events += 1;
                    }
                }
            }
        }

        // Should have multiple token events (the mock returns 12 words)
        assert!(token_events >= 10);
    }

    #[tokio::test]
    async fn test_streaming_includes_conversation_id() {
        let conversation_id = Uuid::new_v4();
        let path = Path(conversation_id);

        let response = stream_message(path).await;

        // Get the first event (start event)
        let mut stream = response.stream;
        if let Some(Ok(first_event)) = stream.next().await {
            let data = first_event.data();

            // Should contain the conversation ID
            assert!(data.contains(&conversation_id.to_string()));
        } else {
            panic!("Expected at least one event from stream");
        }
    }
}