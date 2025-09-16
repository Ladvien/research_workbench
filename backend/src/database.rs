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
            .max_connections(20)
            .min_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1800))
            .connect_with(options)
            .await?;

        // Run migrations
        info!("Running database migrations...");
        sqlx::migrate!("./migrations").run(&pool).await?;
        info!("Database migrations completed successfully");

        Ok(Self { pool })
    }

    pub async fn new(database_url: &str) -> Result<Self> {
        info!("Connecting to database...");

        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1800))
            .connect(database_url)
            .await?;

        // Run migrations
        info!("Running database migrations...");
        sqlx::migrate!("./migrations").run(&pool).await?;
        info!("Database migrations completed successfully");

        Ok(Self { pool })
    }

    pub async fn health_check(&self) -> Result<()> {
        sqlx::query("SELECT 1").fetch_one(&self.pool).await?;
        Ok(())
    }

    pub fn pool(&self) -> Pool<Postgres> {
        self.pool.clone()
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
            max_connections: 20,
            min_connections: 5,
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
            max_connections: 20,
            min_connections: 5,
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
}
