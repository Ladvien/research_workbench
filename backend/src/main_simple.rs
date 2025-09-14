use axum::{
    routing::get,
    Router,
};
use tracing_subscriber;

mod config;
mod error;
mod handlers;
mod openai;

use config::AppConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load configuration
    let config = AppConfig::from_env()?;

    tracing::info!("Starting Workbench Server on {}", config.bind_address);

    // Build the application with all routes
    let app = create_app().await?;

    // Create listener
    let listener = tokio::net::TcpListener::bind(&config.bind_address).await?;

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}

async fn create_app() -> anyhow::Result<Router> {
    let app = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/api/chat", axum::routing::post(handlers::chat::send_message))
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