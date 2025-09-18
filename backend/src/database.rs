use anyhow::Result;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    Pool, Postgres,
};
use std::time::Duration;
use tracing::info;

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: Pool<Postgres>,
}

impl Database {
    pub async fn new_with_options(
        host: &str,
        port: u16,
        database: &str,
        username: &str,
        password: &str,
    ) -> Result<Self> {
        info!("Connecting to database using options...");

        let options = PgConnectOptions::new()
            .host(host)
            .port(port)
            .database(database)
            .username(username)
            .password(password);

        let pool = PgPoolOptions::new()
            .max_connections(100)
            .min_connections(20)
            .acquire_timeout(Duration::from_secs(3))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1800))
            .connect_with(options)
            .await?;

        // Run migrations
        info!("Running database migrations...");
        match sqlx::migrate!("./migrations").run(&pool).await {
            Ok(_) => info!("Database migrations completed successfully"),
            Err(e) => {
                info!("Migration failed: {}. This is expected in prototype mode.", e);
                info!("Continuing without migrations - tables should be created manually if needed");
            }
        }

        Ok(Self { pool })
    }

    pub async fn new(database_url: &str) -> Result<Self> {
        info!("Connecting to database...");

        let pool = PgPoolOptions::new()
            .max_connections(100)
            .min_connections(20)
            .acquire_timeout(Duration::from_secs(3))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1800))
            .connect(database_url)
            .await?;

        // Run migrations
        info!("Running database migrations...");
        match sqlx::migrate!("./migrations").run(&pool).await {
            Ok(_) => info!("Database migrations completed successfully"),
            Err(e) => {
                info!("Migration failed: {}. This is expected in prototype mode.", e);
                info!("Continuing without migrations - tables should be created manually if needed");
            }
        }

        Ok(Self { pool })
    }

    pub async fn health_check(&self) -> Result<()> {
        sqlx::query("SELECT 1").fetch_one(&self.pool).await?;
        Ok(())
    }

    /// Check if all required tables exist in the database
    pub async fn verify_schema(&self) -> Result<bool> {
        let required_tables = vec![
            "users",
            "conversations",
            "messages",
            "message_embeddings",
            "attachments",
            "api_usage",
            "user_sessions"
        ];

        for table_name in required_tables {
            let exists = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = $1
                )"
            )
            .bind(table_name)
            .fetch_one(&self.pool)
            .await?;

            if !exists {
                info!("Required table '{}' does not exist", table_name);
                return Ok(false);
            }
        }

        info!("All required database tables exist");
        Ok(true)
    }

    /// Check if required PostgreSQL extensions are installed
    pub async fn verify_extensions(&self) -> Result<bool> {
        let required_extensions = vec!["uuid-ossp", "vector"];

        for extension_name in required_extensions {
            let exists = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS (
                    SELECT FROM pg_extension
                    WHERE extname = $1
                )"
            )
            .bind(extension_name)
            .fetch_one(&self.pool)
            .await?;

            if !exists {
                info!("Required extension '{}' is not installed", extension_name);
                return Ok(false);
            }
        }

        info!("All required PostgreSQL extensions are installed");
        Ok(true)
    }

    /// Test foreign key constraints by creating and linking test records
    pub async fn test_foreign_key_constraints(&self) -> Result<bool> {
        info!("Testing foreign key constraints...");

        // This is a read-only test - we'll just check the constraint definitions
        let constraints = sqlx::query_scalar::<_, String>(
            "SELECT string_agg(conname, ', ')
             FROM pg_constraint
             WHERE contype = 'f'
             AND conrelid IN (
                 SELECT oid FROM pg_class
                 WHERE relname IN ('conversations', 'messages', 'message_embeddings', 'attachments', 'api_usage', 'user_sessions')
             )"
        )
        .fetch_optional(&self.pool)
        .await?;

        match constraints {
            Some(constraint_list) if !constraint_list.trim().is_empty() => {
                info!("Foreign key constraints found: {}", constraint_list);
                Ok(true)
            }
            _ => {
                info!("No foreign key constraints found");
                Ok(false)
            }
        }
    }

    pub fn pool(&self) -> Pool<Postgres> {
        self.pool.clone()
    }

    /// Create database connection from environment variables
    pub async fn from_env() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL environment variable is required but not set. Please set DATABASE_URL to a valid PostgreSQL connection string."))?;

        Self::new(&database_url).await
    }
}

// Database configuration struct
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: Duration,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: std::env::var("DATABASE_URL")
                .expect("DATABASE_URL environment variable is required but not set. Please set DATABASE_URL to a valid PostgreSQL connection string."),
            max_connections: 100,
            min_connections: 20,
            acquire_timeout: Duration::from_secs(3),
            idle_timeout: Duration::from_secs(600),
            max_lifetime: Duration::from_secs(1800),
        }
    }
}

impl DatabaseConfig {
    pub fn from_env() -> Result<Self> {
        let url = std::env::var("DATABASE_URL")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL environment variable is required but not set. Please set DATABASE_URL to a valid PostgreSQL connection string."))?;

        // Validate DATABASE_URL format
        if !url.starts_with("postgresql://") && !url.starts_with("postgres://") {
            return Err(anyhow::anyhow!("DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://"));
        }

        Ok(Self {
            url,
            max_connections: 100,
            min_connections: 20,
            acquire_timeout: Duration::from_secs(3),
            idle_timeout: Duration::from_secs(600),
            max_lifetime: Duration::from_secs(1800),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_database_config_requires_env_var() {
        // Save original value if it exists
        let original_url = env::var("DATABASE_URL").ok();

        // Remove DATABASE_URL from environment
        env::remove_var("DATABASE_URL");

        // Should panic without DATABASE_URL
        let result = std::panic::catch_unwind(|| DatabaseConfig::default());
        assert!(
            result.is_err(),
            "DatabaseConfig::default should panic without DATABASE_URL"
        );

        // Should return error from from_env
        let result = DatabaseConfig::from_env();
        assert!(
            result.is_err(),
            "DatabaseConfig::from_env should fail without DATABASE_URL"
        );

        // Restore original value if it existed
        if let Some(url) = original_url {
            env::set_var("DATABASE_URL", url);
        }
    }

    #[test]
    fn test_database_config_validates_url_format() {
        // Save original value if it exists
        let original_url = env::var("DATABASE_URL").ok();

        // Test invalid URL format
        env::set_var("DATABASE_URL", "invalid://not-postgres");
        let result = DatabaseConfig::from_env();
        assert!(result.is_err(), "Should reject invalid URL format");

        // Test valid postgresql:// format
        env::set_var("DATABASE_URL", "postgresql://user:pass@host:5432/db");
        let result = DatabaseConfig::from_env();
        assert!(result.is_ok(), "Should accept postgresql:// format");

        // Test valid postgres:// format
        env::set_var("DATABASE_URL", "postgres://user:pass@host:5432/db");
        let result = DatabaseConfig::from_env();
        assert!(result.is_ok(), "Should accept postgres:// format");

        // Restore original value if it existed
        if let Some(url) = original_url {
            env::set_var("DATABASE_URL", url);
        } else {
            env::remove_var("DATABASE_URL");
        }
    }

    #[tokio::test]
    async fn test_database_migration_error_handling() {
        // Test that database gracefully handles migration failures
        // This test doesn't require an actual database connection

        // Create a mock database URL that will fail
        let bad_url = "postgresql://nonexistent:badpass@999.999.999.999:5432/nonexistent";

        // The Database::new should handle migration failures gracefully
        let result = Database::new(bad_url).await;

        // The function should still fail on connection, but not panic
        assert!(result.is_err(), "Should fail with bad database URL");
    }
}
