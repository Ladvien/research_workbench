use axum::{middleware as axum_middleware, routing::get, Router};
use tracing_subscriber;

mod app_state;
mod config;
mod database;
mod error;
mod handlers;
mod llm;
mod middleware;
mod models;
mod openai;
mod repositories;
mod services;

use app_state::AppState;
use config::AppConfig;
use database::Database;
// Temporarily disabled while Redis is not available
// use middleware::rate_limit::{api_rate_limit_middleware, upload_rate_limit_middleware};
use services::{auth::AuthService, DataAccessLayer};
use time::Duration;
use tower_sessions::{Expiry, MemoryStore, SessionManagerLayer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Load configuration
    let config = AppConfig::from_env()?;

    // Initialize database connection
    // Use direct options to handle password with special chars
    let database = if let (Ok(host), Ok(user), Ok(_pass), Ok(name)) = (
        std::env::var("DATABASE_HOST"),
        std::env::var("DATABASE_USER"),
        std::env::var("DATABASE_PASSWORD"),
        std::env::var("DATABASE_NAME"),
    ) {
        let port = std::env::var("DATABASE_PORT")
            .unwrap_or_else(|_| "5432".to_string())
            .parse::<u16>()
            .unwrap_or(5432);
        let pass = std::env::var("DATABASE_PASSWORD")
            .map_err(|_| anyhow::anyhow!("DATABASE_PASSWORD environment variable not set"))?;

        tracing::info!("Connecting to database at {}:{}", host, port);
        Database::new_with_options(&host, port, &name, &user, &pass).await?
    } else if let Ok(database_url) = std::env::var("DATABASE_URL") {
        tracing::info!("Connecting to database...");
        Database::new(&database_url).await?
    } else {
        tracing::info!("Connecting to database...");
        Database::new("postgresql://workbench:password@localhost:5432/workbench").await?
    };

    // Initialize data access layer
    let dal = DataAccessLayer::new(database);

    // Initialize admin user if configured
    initialize_admin_user(&dal).await?;

    // Create memory store for sessions (for development)
    // TODO: Replace with Redis store in production
    tracing::info!("Setting up in-memory sessions...");
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false) // Disabled for development (enable for production)
        .with_same_site(tower_sessions::cookie::SameSite::Strict)
        .with_expiry(Expiry::OnInactivity(Duration::hours(
            config.session_timeout_hours as i64,
        )));

    // Initialize auth service
    let auth_service = AuthService::new(dal.users().clone(), config.jwt_secret.clone());

    // Create services
    let conversation_service = handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = handlers::chat_persistent::create_chat_service(dal.clone());

    // Create shared app state
    let app_state = AppState::new(
        auth_service,
        conversation_service,
        chat_service,
        dal,
        config.clone(),
    );

    tracing::info!("Starting Workbench Server on {}", config.bind_address);

    // Build the application with all routes
    let app = create_app(app_state, session_layer, &config).await?;

    // Create listener
    let listener = tokio::net::TcpListener::bind(&config.bind_address).await?;

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}

async fn create_app(
    app_state: AppState,
    session_layer: SessionManagerLayer<MemoryStore>,
    config: &AppConfig,
) -> anyhow::Result<Router> {
    // Build router with authentication endpoints
    let app = Router::new()
        // Health check (no state needed)
        .route("/api/health", get(handlers::health::health_check))
        // Authentication endpoints (public - no auth needed)
        .route(
            "/api/auth/register",
            axum::routing::post(handlers::auth::register),
        )
        .route(
            "/api/auth/login",
            axum::routing::post(handlers::auth::login),
        )
        .route(
            "/api/auth/logout",
            axum::routing::post(handlers::auth::logout),
        )
        .route("/api/auth/me", axum::routing::get(handlers::auth::me))
        .route("/api/auth/health", get(handlers::auth::auth_health))
        // Legacy chat endpoint (for backward compatibility)
        .route(
            "/api/chat",
            axum::routing::post(handlers::chat::send_message),
        )
        // Conversation endpoints (protected)
        .route(
            "/api/conversations",
            axum::routing::get(handlers::conversation::get_user_conversations),
        )
        .route(
            "/api/conversations",
            axum::routing::post(handlers::conversation::create_conversation),
        )
        .route(
            "/api/conversations/:id",
            axum::routing::get(handlers::conversation::get_conversation),
        )
        .route(
            "/api/conversations/:id",
            axum::routing::delete(handlers::conversation::delete_conversation),
        )
        .route(
            "/api/conversations/:id",
            axum::routing::patch(handlers::conversation::update_conversation_title),
        )
        .route(
            "/api/conversations/:id/stats",
            axum::routing::get(handlers::conversation::get_conversation_stats),
        )
        // Message branching endpoints (protected)
        .route(
            "/api/messages/:id",
            axum::routing::patch(handlers::message::edit_message),
        )
        .route(
            "/api/messages/:id",
            axum::routing::delete(handlers::message::delete_message),
        )
        .route(
            "/api/messages/:id/branches",
            axum::routing::get(handlers::message::get_message_branches),
        )
        .route(
            "/api/conversations/:id/tree",
            axum::routing::get(handlers::message::get_conversation_tree),
        )
        .route(
            "/api/conversations/:id/switch-branch",
            axum::routing::post(handlers::message::switch_branch),
        )
        // Search endpoints (protected)
        .route(
            "/api/search",
            axum::routing::get(handlers::search::search_messages),
        )
        .route(
            "/api/search",
            axum::routing::post(handlers::search::search_messages_post),
        )
        .route(
            "/api/search/health",
            axum::routing::get(handlers::search::search_health),
        )
        .route(
            "/api/search/stats",
            axum::routing::get(handlers::search::search_stats),
        )
        .route(
            "/api/search/embedding-job",
            axum::routing::post(handlers::search::trigger_embedding_job),
        )
        // File attachment endpoints (temporarily disabled)
        // .route("/api/upload", axum::routing::post(handlers::file::upload_file))
        // .route("/api/files/:id", axum::routing::get(handlers::file::download_file))
        // .route("/api/files/:id", axum::routing::delete(handlers::file::delete_file))
        // .route("/api/messages/:id/attachments", axum::routing::get(handlers::file::get_message_attachments))
        // Model endpoints
        .route("/api/models", get(handlers::models::get_models))
        .route("/api/models/health", get(handlers::models::models_health))
        .route("/api/models/:provider", get(handlers::models::get_models_by_provider))
        .route("/api/models/config/:model_id", get(handlers::models::get_model_config))
        // Add application state
        .with_state(app_state.clone())
        // Add session middleware
        .layer(session_layer)
        // Add API rate limiting middleware only if Redis is available
        // Comment out for now as Redis is not running
        // .layer(axum_middleware::from_fn_with_state(
        //     app_state.clone(),
        //     api_rate_limit_middleware,
        // ))
        // Add CORS middleware
        .layer({
            let origins: Result<Vec<_>, _> = config.cors_origins
                .iter()
                .map(|origin| origin.parse())
                .collect();

            tower_http::cors::CorsLayer::new()
                .allow_origin(origins.unwrap_or_else(|_| vec!["http://localhost:4510".parse().unwrap()]))
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::PUT, axum::http::Method::DELETE, axum::http::Method::OPTIONS])
                .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION])
                .allow_credentials(true)
        })
        // Add tracing middleware
        .layer(tower_http::trace::TraceLayer::new_for_http());

    Ok(app)
}

/// Initialize admin user from environment variables if not exists
async fn initialize_admin_user(dal: &DataAccessLayer) -> anyhow::Result<()> {
    // Check if admin credentials are provided in environment
    let admin_email = match std::env::var("ADMIN_EMAIL") {
        Ok(email) if !email.is_empty() => email,
        _ => {
            tracing::info!("No ADMIN_EMAIL configured, skipping admin user initialization");
            return Ok(());
        }
    };

    let admin_password = match std::env::var("ADMIN_PASSWORD") {
        Ok(password) if !password.is_empty() => password,
        _ => {
            tracing::warn!("ADMIN_EMAIL configured but no ADMIN_PASSWORD, skipping admin user initialization");
            return Ok(());
        }
    };

    // Extract username from email (part before @)
    let admin_username = admin_email.split('@').next().unwrap_or(&admin_email).to_string();

    // Check if admin user already exists by email
    let existing_user_by_email = dal.users().find_by_email(&admin_email).await?;

    if existing_user_by_email.is_some() {
        tracing::info!("Admin user with email '{}' already exists", admin_email);
        return Ok(());
    }

    // Also check by username
    let existing_user = dal.users().find_by_username(&admin_username).await?;

    if existing_user.is_some() {
        tracing::info!("Admin user '{}' already exists", admin_username);
        return Ok(());
    }

    // Create admin user
    tracing::info!("Creating admin user with email '{}'", admin_email);

    let create_request = crate::models::CreateUserRequest {
        email: admin_email.clone(),
        username: admin_username.clone(),
        password: admin_password,
    };

    match dal.users().create_from_request(create_request).await {
        Ok(user) => {
            tracing::info!(
                "Successfully created admin user '{}' with email '{}' and ID: {}",
                admin_username,
                admin_email,
                user.id
            );
            Ok(())
        }
        Err(e) => {
            tracing::error!("Failed to create admin user: {}", e);
            // Don't fail the application startup if admin user creation fails
            // This allows the app to start even if there's an issue with the admin account
            Ok(())
        }
    }
}
