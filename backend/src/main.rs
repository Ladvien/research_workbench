use axum::{
    routing::get,
    Router,
};
use tracing_subscriber;

mod app_state;
mod config;
mod database;
mod error;
mod handlers;
mod middleware;
mod models;
mod openai;
mod repositories;
mod services;

use app_state::AppState;
use config::AppConfig;
use database::Database;
use services::{DataAccessLayer, auth::AuthService};
use tower_sessions::{SessionManagerLayer, Expiry, MemoryStore};
use time::Duration;

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

    // Create memory store for sessions (for development)
    // TODO: Replace with Redis store in production
    tracing::info!("Setting up in-memory sessions...");
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false) // Set to true in production with HTTPS
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::hours(config.session_timeout_hours as i64)));

    // Initialize auth service
    let auth_service = AuthService::new(
        dal.users().clone(),
        config.jwt_secret.clone(),
    );

    // Create services
    let conversation_service = handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = handlers::chat_persistent::create_chat_service(dal.clone());

    // Create shared app state
    let app_state = AppState::new(auth_service, conversation_service, chat_service, dal, config.clone());

    tracing::info!("Starting Workbench Server on {}", config.bind_address);

    // Build the application with all routes
    let app = create_app(app_state, session_layer).await?;

    // Create listener
    let listener = tokio::net::TcpListener::bind(&config.bind_address).await?;

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}

async fn create_app(
    app_state: AppState,
    session_layer: SessionManagerLayer<MemoryStore>,
) -> anyhow::Result<Router> {
    // Build router with authentication endpoints
    let app = Router::new()
        // Health check (no state needed)
        .route("/health", get(handlers::health::health_check))

        // Authentication endpoints (public - no auth needed)
        .route("/api/auth/register", axum::routing::post(handlers::auth::register))
        .route("/api/auth/login", axum::routing::post(handlers::auth::login))
        .route("/api/auth/logout", axum::routing::post(handlers::auth::logout))
        .route("/api/auth/me", axum::routing::get(handlers::auth::me))
        .route("/api/auth/health", get(handlers::auth::auth_health))

        // Legacy chat endpoint (for backward compatibility)
        .route("/api/chat", axum::routing::post(handlers::chat::send_message))

        // Conversation endpoints (protected)
        .route("/api/conversations", axum::routing::get(handlers::conversation::get_user_conversations))
        .route("/api/conversations", axum::routing::post(handlers::conversation::create_conversation))
        .route("/api/conversations/:id", axum::routing::get(handlers::conversation::get_conversation))
        .route("/api/conversations/:id", axum::routing::delete(handlers::conversation::delete_conversation))
        .route("/api/conversations/:id", axum::routing::patch(handlers::conversation::update_conversation_title))
        .route("/api/conversations/:id/stats", axum::routing::get(handlers::conversation::get_conversation_stats))

        // Message branching endpoints (protected)
        .route("/api/messages/:id", axum::routing::patch(handlers::message::edit_message))
        .route("/api/messages/:id", axum::routing::delete(handlers::message::delete_message))
        .route("/api/messages/:id/branches", axum::routing::get(handlers::message::get_message_branches))
        .route("/api/conversations/:id/tree", axum::routing::get(handlers::message::get_conversation_tree))
        .route("/api/conversations/:id/switch-branch", axum::routing::post(handlers::message::switch_branch))

        // File attachment endpoints (temporarily disabled)
        // .route("/api/upload", axum::routing::post(handlers::file::upload_file))
        // .route("/api/files/:id", axum::routing::get(handlers::file::download_file))
        // .route("/api/files/:id", axum::routing::delete(handlers::file::delete_file))
        // .route("/api/messages/:id/attachments", axum::routing::get(handlers::file::get_message_attachments))

        // Model endpoints (temporarily disabled)
        // .route("/api/models", get(handlers::models::get_models))
        // .route("/api/models/health", get(handlers::models::models_health))
        // .route("/api/models/:provider", get(handlers::models::get_models_by_provider))
        // .route("/api/models/config/:model_id", get(handlers::models::get_model_config))

        // Add application state
        .with_state(app_state)

        // Add session middleware
        .layer(session_layer)

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

