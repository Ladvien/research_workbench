use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

use crate::{
    config::AppConfig,
    app_state::AppState,
    services::{
        auth::AuthService,
        session::SessionManager,
        redis_session_store::PersistentSessionStore,
        DataAccessLayer,
    },
    database::Database,
    create_app,
};
use tower_sessions::{Expiry, SessionManagerLayer};
use time::Duration;

#[tokio::test]
async fn test_auth_endpoints_exist() {
    let config = AppConfig::from_env().unwrap();
    let database = Database::new(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
    let dal = DataAccessLayer::new(database.clone());

    let session_manager = SessionManager::new(None, Some(database.pool.clone()), 5, 24);
    let session_store = PersistentSessionStore::new(session_manager.clone());
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::hours(24)));

    let auth_service = AuthService::new(dal.users().clone(), dal.refresh_tokens().clone(), config.jwt_config.clone())
        .with_session_manager(session_manager);

    let conversation_service = crate::handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = crate::handlers::chat_persistent::create_chat_service(dal.clone());

    let app_state = AppState::new(
        auth_service,
        conversation_service,
        chat_service,
        dal,
        config.clone(),
    );

    let app = create_app(app_state, session_layer, &config).await.unwrap();

    // Test auth health endpoint
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/auth/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Test CSRF token endpoint
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/auth/csrf-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Test password strength endpoint
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/password-strength")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "password": "testpassword123"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_refresh_endpoint_exists() {
    let config = AppConfig::from_env().unwrap();
    let database = Database::new(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
    let dal = DataAccessLayer::new(database.clone());

    let session_manager = SessionManager::new(None, Some(database.pool.clone()), 5, 24);
    let session_store = PersistentSessionStore::new(session_manager.clone());
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::hours(24)));

    let auth_service = AuthService::new(dal.users().clone(), dal.refresh_tokens().clone(), config.jwt_config.clone())
        .with_session_manager(session_manager);

    let conversation_service = crate::handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = crate::handlers::chat_persistent::create_chat_service(dal.clone());

    let app_state = AppState::new(
        auth_service,
        conversation_service,
        chat_service,
        dal,
        config.clone(),
    );

    let app = create_app(app_state, session_layer, &config).await.unwrap();

    // Test refresh endpoint exists (should return unauthorized without session)
    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/refresh")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return 401 or 500 (not 404) since endpoint exists
    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_analytics_endpoints_exist() {
    let config = AppConfig::from_env().unwrap();
    let database = Database::new(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
    let dal = DataAccessLayer::new(database.clone());

    let session_manager = SessionManager::new(None, Some(database.pool.clone()), 5, 24);
    let session_store = PersistentSessionStore::new(session_manager.clone());
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(Duration::hours(24)));

    let auth_service = AuthService::new(dal.users().clone(), dal.refresh_tokens().clone(), config.jwt_config.clone())
        .with_session_manager(session_manager);

    let conversation_service = crate::handlers::conversation::create_conversation_service(dal.clone());
    let chat_service = crate::handlers::chat_persistent::create_chat_service(dal.clone());

    let app_state = AppState::new(
        auth_service,
        conversation_service,
        chat_service,
        dal,
        config.clone(),
    );

    let app = create_app(app_state, session_layer, &config).await.unwrap();

    // Test analytics health endpoint
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/analytics/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Test analytics overview endpoint (should require auth)
    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/analytics/overview")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return 401 (not 404) since endpoint exists but requires auth
    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}