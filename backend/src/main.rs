use axum::{
    routing::get,
    Router,
};
use tracing_subscriber;

mod config;
mod database;
mod error;
mod handlers;
mod models;
mod openai;
mod repositories;
mod services;

use config::AppConfig;
use database::Database;
use services::DataAccessLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Load configuration
    let config = AppConfig::from_env()?;

    // Initialize database connection
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://workbench:password@localhost:5432/workbench".to_string());

    tracing::info!("Connecting to database...");
    let database = Database::new(&database_url).await?;

    // Initialize data access layer
    let dal = DataAccessLayer::new(database);

    tracing::info!("Starting Workbench Server on {}", config.bind_address);

    // Build the application with all routes
    let app = create_app(dal).await?;

    // Create listener
    let listener = tokio::net::TcpListener::bind(&config.bind_address).await?;

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}

async fn create_app(dal: DataAccessLayer) -> anyhow::Result<Router> {
    // Create services
    let conversation_service = handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = handlers::chat_persistent::create_chat_service(dal.clone());

    let app = Router::new()
        // Health check
        .route("/health", get(handlers::health::health_check))

        // Conversation management endpoints
        .route("/api/conversations",
            axum::routing::get(handlers::conversation::get_user_conversations)
                .post(handlers::conversation::create_conversation))
        .route("/api/conversations/:id",
            axum::routing::get(handlers::conversation::get_conversation)
                .delete(handlers::conversation::delete_conversation))
        .route("/api/conversations/:id/title",
            axum::routing::patch(handlers::conversation::update_conversation_title))
        .route("/api/conversations/:id/stats",
            axum::routing::get(handlers::conversation::get_conversation_stats))

        // Message endpoints
        .route("/api/conversations/:id/messages",
            axum::routing::get(handlers::chat_persistent::get_messages)
                .post(handlers::chat_persistent::send_message))
        .route("/api/conversations/:conversation_id/messages/:parent_id/branch",
            axum::routing::post(handlers::chat_persistent::create_message_branch))
        .route("/api/messages/:id/thread",
            axum::routing::get(handlers::chat_persistent::get_message_thread))

        // Legacy chat endpoint (for backward compatibility)
        .route("/api/chat", axum::routing::post(handlers::chat::send_message))

        // Add application state
        .with_state(conversation_service)
        .with_state(chat_service)

        // Add CORS middleware
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
        )
        // Add tracing middleware
        .layer(tower_http::trace::TraceLayer::new_for_http());

    Ok(app)
}
