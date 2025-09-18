use axum::Router;
use workbench_server::{
    app_state::AppState, config::AppConfig, database::Database, models::User as BaseUser,
    services::DataAccessLayer,
};

/// Test user with session cookie for integration tests
#[derive(Debug, Clone)]
pub struct User {
    pub id: uuid::Uuid,
    pub email: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub session_cookie: String, // Session cookie for tests
}

impl From<BaseUser> for User {
    fn from(base_user: BaseUser) -> Self {
        Self {
            id: base_user.id,
            email: base_user.email,
            username: base_user.username,
            password_hash: base_user.password_hash,
            created_at: base_user.created_at,
            updated_at: base_user.updated_at,
            session_cookie: String::new(), // Will be set after login
        }
    }
}

/// Setup a test application for integration tests
pub async fn setup_test_app() -> (Router, User) {
    // Load configuration
    let config = AppConfig::from_env().expect("Failed to load test configuration");

    // Connect to test database using DATABASE_URL from environment
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost/workbench_test".to_string());

    let database = Database::new(&database_url)
        .await
        .expect("Failed to connect to test database");

    // Create app state
    let app_state = AppState::new_with_database(database);

    // Create a test user
    let test_user = create_test_user(&app_state).await;

    // Build router (this would be the actual app router setup)
    let app = Router::new().with_state(app_state);

    (app, test_user)
}

async fn create_test_user(app_state: &AppState) -> User {
    use workbench_server::models::CreateUserRequest;

    let create_user_request = CreateUserRequest {
        email: "test@workbench.com".to_string(),
        username: "testuser".to_string(),
        password: "testpassword123".to_string(),
    };

    let base_user = app_state
        .dal
        .repositories
        .users
        .create_from_request(create_user_request)
        .await
        .expect("Failed to create test user");

    User::from(base_user)
}
