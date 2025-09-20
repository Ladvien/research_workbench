use axum::Router;
use workbench_server::{
    app_state::AppState, config::AppConfig, database::Database, models::User as BaseUser,
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

/// Setup a test application for integration tests using real environment configuration
pub async fn setup_test_app() -> (Router, User) {
    // Load configuration from environment
    let _config = AppConfig::from_env().expect("Failed to load test configuration");

    // Connect to database using DATABASE_URL from environment (required)
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for integration tests");

    let database = Database::new(&database_url)
        .await
        .expect("Failed to connect to test database");

    // Create app state
    let app_state = AppState::new_with_database(database);

    // Create a test user using environment credentials
    let test_email = std::env::var("TEST_USER_EMAIL")
        .unwrap_or_else(|_| "test@workbench.com".to_string());
    let test_password = std::env::var("TEST_USER_PASSWORD")
        .unwrap_or_else(|_| "testpassword123".to_string());

    let create_user_request = workbench_server::models::CreateUserRequest {
        email: test_email,
        username: "testuser".to_string(),
        password: test_password,
    };

    let base_user = app_state
        .dal
        .repositories
        .users
        .create_from_request(create_user_request)
        .await
        .expect("Failed to create test user");

    let test_user = User::from(base_user);

    // Build router (this would be the actual app router setup)
    let app = Router::new().with_state(app_state);

    (app, test_user)
}

pub async fn create_test_user(email: &str, username: &str, password: &str) -> anyhow::Result<User> {
    use workbench_server::models::CreateUserRequest;

    // Create app state for user creation
    let _config = AppConfig::from_env().expect("Failed to load test configuration");
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for integration tests");
    let database = workbench_server::database::Database::new(&database_url)
        .await
        .expect("Failed to connect to test database");
    let app_state = workbench_server::app_state::AppState::new_with_database(database);

    let create_user_request = CreateUserRequest {
        email: email.to_string(),
        username: username.to_string(),
        password: password.to_string(),
    };

    let base_user = app_state
        .dal
        .repositories
        .users
        .create_from_request(create_user_request)
        .await?;

    Ok(User::from(base_user))
}
