use anyhow::Result;
use serde::Deserialize;
use std::net::SocketAddr;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub bind_address: SocketAddr,
    pub openai_api_key: String,
    pub openai_model: String,
    pub openai_max_tokens: u32,
    pub openai_temperature: f32,
    pub anthropic_api_key: String,
    pub anthropic_model: String,
    pub anthropic_max_tokens: u32,
    pub anthropic_temperature: f32,
    pub jwt_secret: String,
    pub redis_url: String,
    pub session_timeout_hours: u64,
    pub storage_path: String,
    pub rate_limit: RateLimitConfig,
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RateLimitConfig {
    pub global_requests_per_hour: u32,
    pub api_requests_per_hour: u32,
    pub uploads_per_hour: u32,
    pub max_file_size_mb: u64,
    pub premium_multiplier: u32,
    pub admin_override_enabled: bool,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let bind_address = std::env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
            .parse()?;

        let openai_api_key = std::env::var("OPENAI_API_KEY")
            .map_err(|_| anyhow::anyhow!("OPENAI_API_KEY environment variable not set"))?;

        let openai_model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4".to_string());

        let openai_max_tokens = std::env::var("OPENAI_MAX_TOKENS")
            .unwrap_or_else(|_| "2048".to_string())
            .parse()
            .unwrap_or(2048);

        let openai_temperature = std::env::var("OPENAI_TEMPERATURE")
            .unwrap_or_else(|_| "0.7".to_string())
            .parse()
            .unwrap_or(0.7);

        let anthropic_api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| anyhow::anyhow!("ANTHROPIC_API_KEY environment variable not set"))?;

        let anthropic_model = std::env::var("ANTHROPIC_MODEL")
            .unwrap_or_else(|_| "claude-3-sonnet-20240229".to_string());

        let anthropic_max_tokens = std::env::var("ANTHROPIC_MAX_TOKENS")
            .unwrap_or_else(|_| "2048".to_string())
            .parse()
            .unwrap_or(2048);

        let anthropic_temperature = std::env::var("ANTHROPIC_TEMPERATURE")
            .unwrap_or_else(|_| "0.7".to_string())
            .parse()
            .unwrap_or(0.7);

        let jwt_secret = std::env::var("JWT_SECRET")
            .map_err(|_| anyhow::anyhow!("JWT_SECRET environment variable not set - required for production"))?;

        // Validate JWT secret strength (minimum 256 bits / 32 bytes)
        if jwt_secret.len() < 32 {
            return Err(anyhow::anyhow!(
                "JWT_SECRET must be at least 32 characters (256 bits) for production security"
            ));
        }

        let redis_url =
            std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

        let session_timeout_hours = std::env::var("SESSION_TIMEOUT_HOURS")
            .unwrap_or_else(|_| "24".to_string())
            .parse()
            .unwrap_or(24);

        let storage_path =
            std::env::var("STORAGE_PATH").unwrap_or_else(|_| "/tmp/workbench_storage".to_string());

        // Rate limiting configuration
        let rate_limit = RateLimitConfig {
            global_requests_per_hour: std::env::var("RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR")
                .unwrap_or_else(|_| "1000".to_string())
                .parse()
                .unwrap_or(1000),
            api_requests_per_hour: std::env::var("RATE_LIMIT_API_REQUESTS_PER_HOUR")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .unwrap_or(100),
            uploads_per_hour: std::env::var("RATE_LIMIT_UPLOADS_PER_HOUR")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .unwrap_or(10),
            max_file_size_mb: std::env::var("RATE_LIMIT_MAX_FILE_SIZE_MB")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .unwrap_or(10),
            premium_multiplier: std::env::var("RATE_LIMIT_PREMIUM_MULTIPLIER")
                .unwrap_or_else(|_| "5".to_string())
                .parse()
                .unwrap_or(5),
            admin_override_enabled: std::env::var("RATE_LIMIT_ADMIN_OVERRIDE")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
        };

        // CORS origins configuration
        let cors_origins = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:4510,https://workbench.lolzlab.com".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(Self {
            bind_address,
            openai_api_key,
            openai_model,
            openai_max_tokens,
            openai_temperature,
            anthropic_api_key,
            anthropic_model,
            anthropic_max_tokens,
            anthropic_temperature,
            jwt_secret,
            redis_url,
            session_timeout_hours,
            storage_path,
            rate_limit,
            cors_origins,
        })
    }
}
