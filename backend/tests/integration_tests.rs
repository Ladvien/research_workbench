use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use workbench_server::openai::ChatRequest;

// Note: For this test to work, we would need to expose the create_app function
// and structure the main.rs differently. This is a basic structure for integration tests.

#[tokio::test]
async fn test_health_endpoint() {
    // This test would require restructuring the main.rs to expose create_app
    // For now, this is a skeleton showing how integration tests would be structured

    // let app = create_app().await.unwrap();

    // let response = app
    //     .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
    //     .await
    //     .unwrap();

    // assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_chat_endpoint_missing_openai_key() {
    // This test would verify that the endpoint fails gracefully when OpenAI key is missing
    std::env::remove_var("OPENAI_API_KEY");

    // let app = create_app().await.unwrap();

    // let chat_request = json!({
    //     "messages": [
    //         {"role": "user", "content": "Hello, world!"}
    //     ]
    // });

    // let response = app
    //     .oneshot(
    //         Request::builder()
    //             .method(Method::POST)
    //             .uri("/api/chat")
    //             .header("content-type", "application/json")
    //             .body(Body::from(chat_request.to_string()))
    //             .unwrap(),
    //     )
    //     .await
    //     .unwrap();

    // assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_chat_endpoint_empty_messages() {
    // Test that empty messages return bad request
    std::env::set_var("OPENAI_API_KEY", "test-key");

    // let app = create_app().await.unwrap();

    // let chat_request = json!({
    //     "messages": []
    // });

    // let response = app
    //     .oneshot(
    //         Request::builder()
    //             .method(Method::POST)
    //             .uri("/api/chat")
    //             .header("content-type", "application/json")
    //             .body(Body::from(chat_request.to_string()))
    //             .unwrap(),
    //     )
    //     .await
    //     .unwrap();

    // assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}