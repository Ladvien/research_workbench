use axum::{
    extract::Path,
    response::{sse::Event, Sse},
};
use futures::{stream, Stream, StreamExt};
use serde_json;
use std::{convert::Infallible, time::Duration};
use uuid::Uuid;

// Simple streaming endpoint for testing
pub async fn stream_message(
    Path(conversation_id): Path<Uuid>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    tracing::info!("Starting streaming for conversation {}", conversation_id);

    // Create a simple test stream that sends some mock data
    let stream = stream::iter(
        [
            "Hello",
            " ",
            "world",
            "!",
            " This",
            " is",
            " a",
            " streaming",
            " response",
            " for",
            " testing",
            ".",
        ]
        .into_iter()
        .enumerate(),
    )
    .map(move |(i, word)| {
        let event = if i == 0 {
            Event::default().event("start").data(
                serde_json::json!({
                    "conversationId": conversation_id,
                    "messageId": Uuid::new_v4()
                })
                .to_string(),
            )
        } else {
            Event::default().event("token").data(
                serde_json::json!({
                    "content": word
                })
                .to_string(),
            )
        };

        Ok::<Event, Infallible>(event)
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("keep-alive"),
    )
}

#[derive(serde::Deserialize, Debug)]
pub struct StreamChatRequest {
    pub content: String,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}
