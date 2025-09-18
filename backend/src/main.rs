use axum::{middleware as axum_middleware, routing::get, Router};

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
mod seed;
mod services;

use app_state::AppState;
use config::AppConfig;
use database::Database;
use middleware::{csrf::csrf_middleware, rate_limit::api_rate_limit_middleware};
use services::{
    auth::AuthService, redis_session_store::PersistentSessionStore, session::SessionManager,
    DataAccessLayer,
};
use time::Duration;
use tower_sessions::{Expiry, SessionManagerLayer};

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
    } else {
        // DATABASE_URL is required - fail if not provided
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL environment variable is required but not set. Please set DATABASE_URL to a valid PostgreSQL connection string."))?;

        // Validate DATABASE_URL format
        if !database_url.starts_with("postgresql://") && !database_url.starts_with("postgres://") {
            return Err(anyhow::anyhow!("DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://"));
        }

        tracing::info!("Connecting to database...");
        Database::new(&database_url).await?
    };

    // Initialize database schema and seed test users
    if let Err(e) = seed::init_database_schema(&database.pool).await {
        tracing::warn!(
            "Failed to initialize database schema: {}. This is expected if tables already exist.",
            e
        );
    }

    // Seed test users (only in development)
    if cfg!(debug_assertions) {
        tracing::info!("Seeding test users for development...");
        seed::seed_test_users(&database.pool).await?;
    }

    // Initialize data access layer
    let dal = DataAccessLayer::new(database.clone());

    // Initialize admin user if configured
    initialize_admin_user(&dal).await?;

    // Create persistent session store with Redis primary and PostgreSQL fallback
    tracing::info!("Setting up persistent session storage...");

    // Create session manager with Redis and PostgreSQL fallback
    let session_manager = SessionManager::new(
        Some(config.redis_url.clone()),
        Some(database.pool.clone()),
        5, // max 5 sessions per user
        config.session_timeout_hours,
    );

    // Sessions table created via migration 20250916000000_add_user_sessions.sql

    let session_store = PersistentSessionStore::new(session_manager.clone());

    // Parse SameSite setting from config
    let same_site = match config.cookie_security.same_site.to_lowercase().as_str() {
        "strict" => tower_sessions::cookie::SameSite::Strict,
        "lax" => tower_sessions::cookie::SameSite::Lax,
        "none" => tower_sessions::cookie::SameSite::None,
        _ => {
            tracing::warn!(
                "Invalid COOKIE_SAME_SITE value '{}', defaulting to Strict",
                config.cookie_security.same_site
            );
            tower_sessions::cookie::SameSite::Strict
        }
    };

    tracing::info!(
        "Configuring session cookies: secure={}, same_site={}, environment={}",
        config.cookie_security.secure,
        config.cookie_security.same_site,
        config.cookie_security.environment
    );

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(config.cookie_security.secure)
        .with_same_site(same_site)
        .with_expiry(Expiry::OnInactivity(Duration::hours(
            config.session_timeout_hours as i64,
        )));

    // Initialize auth service with session manager
    let auth_service = AuthService::new(
        dal.users().clone(),
        dal.refresh_tokens().clone(),
        config.jwt_config.clone(),
    )
    .with_session_manager(session_manager.clone());

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
        Some(session_manager.clone()),
    );

    tracing::info!("Starting Workbench Server on {}", config.bind_address);

    // Start background session cleanup task
    let cleanup_session_manager = session_manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // Every hour
        loop {
            interval.tick().await;
            match cleanup_session_manager.cleanup_expired_sessions().await {
                Ok(count) => {
                    if count > 0 {
                        tracing::info!("Cleaned up {} expired sessions", count);
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to cleanup expired sessions: {}", e);
                }
            }
        }
    });

    // Build the application with all routes
    let app = create_app_internal(app_state, session_layer, &config).await?;

    // Create listener
    let listener = tokio::net::TcpListener::bind(&config.bind_address).await?;

    // Start the server
    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
pub async fn create_app(
    app_state: AppState,
    session_layer: SessionManagerLayer<PersistentSessionStore>,
    config: &AppConfig,
) -> anyhow::Result<Router> {
    create_app_internal(app_state, session_layer, config).await
}

async fn create_app_internal(
    app_state: AppState,
    session_layer: SessionManagerLayer<PersistentSessionStore>,
    config: &AppConfig,
) -> anyhow::Result<Router> {
    // Build router with authentication endpoints
    let app = Router::new()
        // Health check (no state needed)
        .route("/api/v1/health", get(handlers::health::health_check))
        // Authentication endpoints (public - no auth needed)
        .route(
            "/api/v1/auth/register",
            axum::routing::post(handlers::auth::register),
        )
        .route(
            "/api/v1/auth/login",
            axum::routing::post(handlers::auth::login),
        )
        .route(
            "/api/v1/auth/logout",
            axum::routing::post(handlers::auth::logout),
        )
        .route("/api/v1/auth/me", axum::routing::get(handlers::auth::me))
        .route(
            "/api/v1/auth/refresh",
            axum::routing::post(handlers::auth::refresh_token),
        )
        .route("/api/v1/auth/health", get(handlers::auth::auth_health))
        .route(
            "/api/v1/auth/password-strength",
            axum::routing::post(handlers::auth::check_password_strength),
        )
        .route(
            "/api/v1/auth/csrf-token",
            axum::routing::get(middleware::csrf::get_csrf_token),
        )
        .route(
            "/api/v1/auth/change-password",
            axum::routing::post(handlers::auth::change_password),
        )
        .route(
            "/api/v1/auth/session-info",
            axum::routing::get(handlers::auth::session_info),
        )
        .route(
            "/api/v1/auth/invalidate-sessions",
            axum::routing::post(handlers::auth::invalidate_all_sessions),
        )
        // Legacy chat endpoint (for backward compatibility)
        .route(
            "/api/v1/chat",
            axum::routing::post(handlers::chat::send_message),
        )
        // Conversation endpoints (protected)
        .route(
            "/api/v1/conversations",
            axum::routing::get(handlers::conversation::get_user_conversations),
        )
        .route(
            "/api/v1/conversations",
            axum::routing::post(handlers::conversation::create_conversation),
        )
        .route(
            "/api/v1/conversations/:id",
            axum::routing::get(handlers::conversation::get_conversation),
        )
        .route(
            "/api/v1/conversations/:id",
            axum::routing::delete(handlers::conversation::delete_conversation),
        )
        .route(
            "/api/v1/conversations/:id",
            axum::routing::patch(handlers::conversation::update_conversation_title),
        )
        .route(
            "/api/v1/conversations/:id/stats",
            axum::routing::get(handlers::conversation::get_conversation_stats),
        )
        // Chat message endpoints (protected)
        .route(
            "/api/v1/conversations/:id/messages",
            axum::routing::post(handlers::chat_persistent::send_message),
        )
        .route(
            "/api/v1/conversations/:id/messages",
            axum::routing::get(handlers::chat_persistent::get_messages),
        )
        .route(
            "/api/v1/conversations/:id/stream",
            axum::routing::post(handlers::chat_stream::stream_message),
        )
        // Message branching endpoints (protected)
        .route(
            "/api/v1/messages/:id",
            axum::routing::patch(handlers::message::edit_message),
        )
        .route(
            "/api/v1/messages/:id",
            axum::routing::delete(handlers::message::delete_message),
        )
        .route(
            "/api/v1/messages/:id/branches",
            axum::routing::get(handlers::message::get_message_branches),
        )
        .route(
            "/api/v1/conversations/:id/tree",
            axum::routing::get(handlers::message::get_conversation_tree),
        )
        .route(
            "/api/v1/conversations/:id/switch-branch",
            axum::routing::post(handlers::message::switch_branch),
        )
        // Search endpoints (protected)
        .route(
            "/api/v1/search",
            axum::routing::get(handlers::search::search_messages),
        )
        .route(
            "/api/v1/search",
            axum::routing::post(handlers::search::search_messages_post),
        )
        .route(
            "/api/v1/search/health",
            axum::routing::get(handlers::search::search_health),
        )
        .route(
            "/api/v1/search/stats",
            axum::routing::get(handlers::search::search_stats),
        )
        .route(
            "/api/v1/search/embedding-job",
            axum::routing::post(handlers::search::trigger_embedding_job),
        )
        // File attachment endpoints (temporarily disabled)
        // .route("/api/upload", axum::routing::post(handlers::file::upload_file))
        // .route("/api/files/:id", axum::routing::get(handlers::file::download_file))
        // .route("/api/files/:id", axum::routing::delete(handlers::file::delete_file))
        // .route("/api/messages/:id/attachments", axum::routing::get(handlers::file::get_message_attachments))
        // Model endpoints
        .route("/api/v1/models", get(handlers::models::get_models))
        .route(
            "/api/v1/models/health",
            get(handlers::models::models_health),
        )
        .route(
            "/api/v1/models/:provider",
            get(handlers::models::get_models_by_provider),
        )
        .route(
            "/api/v1/models/config/:model_id",
            get(handlers::models::get_model_config),
        )
        // Analytics endpoints (protected)
        .route(
            "/api/analytics/overview",
            axum::routing::get(handlers::analytics::get_analytics_overview),
        )
        .route(
            "/api/analytics/health",
            axum::routing::get(handlers::analytics::analytics_health),
        )
        // Add application state
        .with_state(app_state.clone())
        // Add session middleware
        .layer(session_layer)
        // Add CSRF protection middleware
        .layer(axum_middleware::from_fn_with_state(
            app_state.clone(),
            csrf_middleware,
        ))
        // Add API rate limiting middleware with Redis and in-memory fallback
        .layer(axum_middleware::from_fn_with_state(
            app_state.clone(),
            api_rate_limit_middleware,
        ))
        // Add CORS middleware
        .layer({
            let origins: Result<Vec<_>, _> = config
                .cors_origins
                .iter()
                .map(|origin| origin.parse())
                .collect();

            tower_http::cors::CorsLayer::new()
                .allow_origin(origins.unwrap_or_else(|_| {
                    vec!["http://localhost:4510".parse().unwrap_or_else(|_| {
                        "http://localhost:4510"
                            .parse()
                            .expect("Default CORS origin should always parse")
                    })]
                }))
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PUT,
                    axum::http::Method::DELETE,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::AUTHORIZATION,
                ])
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
            tracing::warn!(
                "ADMIN_EMAIL configured but no ADMIN_PASSWORD, skipping admin user initialization"
            );
            return Ok(());
        }
    };

    // Extract username from email (part before @)
    let admin_username = admin_email
        .split('@')
        .next()
        .unwrap_or(&admin_email)
        .to_string();

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
