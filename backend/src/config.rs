use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;

#[derive(Debug, Clone, Deserialize)]
pub struct JwtConfig {
    pub current_secret: String,
    pub current_version: u32,
    pub previous_secrets: HashMap<u32, String>, // For validating older tokens during rotation
}

impl JwtConfig {
    pub fn new(primary_secret: String) -> Result<Self> {
        // Validate secret strength (minimum 256 bits / 32 bytes)
        if primary_secret.len() < 32 {
            return Err(anyhow::anyhow!(
                "JWT_SECRET must be at least 32 characters (256 bits) for production security"
            ));
        }

        Ok(Self {
            current_secret: primary_secret,
            current_version: 1,
            previous_secrets: HashMap::new(),
        })
    }

    pub fn add_previous_secret(&mut self, version: u32, secret: String) -> Result<()> {
        if secret.len() < 32 {
            return Err(anyhow::anyhow!(
                "Previous JWT secret must be at least 32 characters (256 bits)"
            ));
        }
        self.previous_secrets.insert(version, secret);
        Ok(())
    }

    pub fn get_secret_for_version(&self, version: u32) -> Option<&String> {
        if version == self.current_version {
            Some(&self.current_secret)
        } else {
            self.previous_secrets.get(&version)
        }
    }

    pub fn rotate_secret(&mut self, new_secret: String) -> Result<()> {
        if new_secret.len() < 32 {
            return Err(anyhow::anyhow!(
                "New JWT secret must be at least 32 characters (256 bits)"
            ));
        }

        // Move current secret to previous secrets
        self.previous_secrets
            .insert(self.current_version, self.current_secret.clone());

        // Update to new secret and increment version
        self.current_secret = new_secret;
        self.current_version += 1;

        // Limit the number of previous secrets to prevent memory bloat
        if self.previous_secrets.len() > 5 {
            if let Some(oldest_version) = self.previous_secrets.keys().min().copied() {
                self.previous_secrets.remove(&oldest_version);
            }
        }

        Ok(())
    }
}

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
    pub claude_code_enabled: bool,
    pub claude_code_model: String,
    pub claude_code_session_timeout: u64,
    pub jwt_config: JwtConfig,
    pub redis_url: String,
    pub session_timeout_hours: u64,
    pub storage_path: String,
    pub rate_limit: RateLimitConfig,
    pub cors_origins: Vec<String>,
    pub cookie_security: CookieSecurityConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CookieSecurityConfig {
    pub secure: bool,
    pub same_site: String,
    pub environment: String,
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

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0:4512".parse().unwrap(),
            openai_api_key: String::new(),
            openai_model: "gpt-4".to_string(),
            openai_max_tokens: 2048,
            openai_temperature: 0.7,
            anthropic_api_key: String::new(),
            anthropic_model: "claude-3-sonnet-20240229".to_string(),
            anthropic_max_tokens: 2048,
            anthropic_temperature: 0.7,
            claude_code_enabled: false,
            claude_code_model: "claude-3-5-sonnet-20241022".to_string(),
            claude_code_session_timeout: 3600,
            jwt_config: JwtConfig {
                current_secret: String::new(), // REMOVED: Never use hardcoded secrets in production
                current_version: 1,
                previous_secrets: HashMap::new(),
            },
            redis_url: "redis://127.0.0.1:6379".to_string(),
            session_timeout_hours: 24,
            storage_path: "/tmp/workbench_storage".to_string(),
            rate_limit: RateLimitConfig {
                global_requests_per_hour: 1000,
                api_requests_per_hour: 100,
                uploads_per_hour: 10,
                max_file_size_mb: 10,
                premium_multiplier: 5,
                admin_override_enabled: true,
            },
            cors_origins: vec![
                "http://localhost:4510".to_string(),
                "https://workbench.lolzlab.com".to_string(),
            ],
            cookie_security: CookieSecurityConfig {
                secure: false,
                same_site: "Strict".to_string(),
                environment: "development".to_string(),
            },
        }
    }
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let bind_address = std::env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| "0.0.0.0:4512".to_string())
            .parse()?;

        let openai_api_key = std::env::var("OPENAI_API_KEY").unwrap_or_else(|_| String::new()); // Allow empty if not using OpenAI

        let openai_model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4".to_string());

        let openai_max_tokens = std::env::var("OPENAI_MAX_TOKENS")
            .unwrap_or_else(|_| "2048".to_string())
            .parse()
            .unwrap_or(2048);

        let openai_temperature = std::env::var("OPENAI_TEMPERATURE")
            .unwrap_or_else(|_| "0.7".to_string())
            .parse()
            .unwrap_or(0.7);

        let anthropic_api_key =
            std::env::var("ANTHROPIC_API_KEY").unwrap_or_else(|_| String::new()); // Allow empty if not using Anthropic

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

        let claude_code_enabled = std::env::var("CLAUDE_CODE_ENABLED")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .unwrap_or(false);

        let claude_code_model = std::env::var("CLAUDE_CODE_MODEL")
            .unwrap_or_else(|_| "claude-3-5-sonnet-20241022".to_string());

        let claude_code_session_timeout = std::env::var("CLAUDE_CODE_SESSION_TIMEOUT")
            .unwrap_or_else(|_| "3600".to_string()) // 1 hour default
            .parse()
            .unwrap_or(3600);

        let jwt_secret = std::env::var("JWT_SECRET").map_err(|_| {
            anyhow::anyhow!("JWT_SECRET environment variable not set - required for production")
        })?;

        // Create JWT config with validation
        let mut jwt_config = JwtConfig::new(jwt_secret)?;

        // Support for secret rotation via additional environment variables
        // JWT_SECRET_V1, JWT_SECRET_V2, etc. for previous secrets
        for version in 1..=5 {
            if let Ok(old_secret) = std::env::var(&format!("JWT_SECRET_V{}", version)) {
                jwt_config.add_previous_secret(version, old_secret)?;
            }
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

        // Cookie security configuration
        let environment = std::env::var("ENVIRONMENT")
            .unwrap_or_else(|_| "development".to_string())
            .to_lowercase();

        // Determine secure flag based on environment
        // Can be overridden with COOKIE_SECURE environment variable
        let secure = if let Ok(cookie_secure) = std::env::var("COOKIE_SECURE") {
            cookie_secure.to_lowercase() == "true"
        } else {
            // Default: secure=true for production, secure=false for development
            environment == "production"
        };

        let same_site = std::env::var("COOKIE_SAME_SITE").unwrap_or_else(|_| "Strict".to_string());

        let cookie_security = CookieSecurityConfig {
            secure,
            same_site,
            environment,
        };

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
            claude_code_enabled,
            claude_code_model,
            claude_code_session_timeout,
            jwt_config,
            redis_url,
            session_timeout_hours,
            storage_path,
            rate_limit,
            cors_origins,
            cookie_security,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_config_new_valid_secret() {
        let secret = "this-is-a-32-character-secret-key!!";
        let config = JwtConfig::new(secret.to_string()).unwrap();
        assert_eq!(config.current_secret, secret);
        assert_eq!(config.current_version, 1);
        assert!(config.previous_secrets.is_empty());
    }

    #[test]
    fn test_jwt_config_new_invalid_secret_too_short() {
        let secret = "short"; // Only 5 characters
        let result = JwtConfig::new(secret.to_string());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("at least 32 characters"));
    }

    #[test]
    fn test_jwt_config_add_previous_secret() {
        let secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(secret.to_string()).unwrap();

        let old_secret = "another-32-character-secret-key-!!";
        config
            .add_previous_secret(0, old_secret.to_string())
            .unwrap();

        assert_eq!(
            config.previous_secrets.get(&0),
            Some(&old_secret.to_string())
        );
    }

    #[test]
    fn test_jwt_config_add_previous_secret_too_short() {
        let secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(secret.to_string()).unwrap();

        let short_secret = "short";
        let result = config.add_previous_secret(0, short_secret.to_string());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("at least 32 characters"));
    }

    #[test]
    fn test_jwt_config_get_secret_for_version() {
        let secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(secret.to_string()).unwrap();

        let old_secret = "another-32-character-secret-key-!!";
        config
            .add_previous_secret(0, old_secret.to_string())
            .unwrap();

        // Current version should return current secret
        assert_eq!(config.get_secret_for_version(1), Some(&secret.to_string()));

        // Previous version should return previous secret
        assert_eq!(
            config.get_secret_for_version(0),
            Some(&old_secret.to_string())
        );

        // Non-existent version should return None
        assert_eq!(config.get_secret_for_version(999), None);
    }

    #[test]
    fn test_jwt_config_rotate_secret() {
        let initial_secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(initial_secret.to_string()).unwrap();

        let new_secret = "new-32-character-secret-key-here!!";
        config.rotate_secret(new_secret.to_string()).unwrap();

        // Current secret should be updated
        assert_eq!(config.current_secret, new_secret);
        assert_eq!(config.current_version, 2);

        // Previous secret should be available
        assert_eq!(
            config.get_secret_for_version(1),
            Some(&initial_secret.to_string())
        );
    }

    #[test]
    fn test_jwt_config_rotate_secret_too_short() {
        let secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(secret.to_string()).unwrap();

        let short_secret = "short";
        let result = config.rotate_secret(short_secret.to_string());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("at least 32 characters"));

        // Original secret should remain unchanged
        assert_eq!(config.current_secret, secret);
        assert_eq!(config.current_version, 1);
    }

    #[test]
    fn test_jwt_config_rotate_secret_limits_previous_secrets() {
        let secret = "this-is-a-32-character-secret-key!!";
        let mut config = JwtConfig::new(secret.to_string()).unwrap();

        // Add maximum number of previous secrets
        for i in 1..=6 {
            let new_secret = format!("secret-{:02}-32-character-secret-key!", i);
            config.rotate_secret(new_secret).unwrap();
        }

        // Should have at most 5 previous secrets
        assert!(config.previous_secrets.len() <= 5);
        assert_eq!(config.current_version, 7);
    }

    #[test]
    fn test_app_config_from_env_missing_jwt_secret() {
        // Clear JWT_SECRET environment variable if set
        std::env::remove_var("JWT_SECRET");

        let result = AppConfig::from_env();
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("JWT_SECRET environment variable not set"));
    }

    #[test]
    fn test_app_config_from_env_valid_jwt_secret() {
        let secret = "this-is-a-32-character-secret-key!!";
        std::env::set_var("JWT_SECRET", secret);

        // Set required DATABASE_URL for test
        std::env::set_var("DATABASE_URL", "postgresql://test:test@localhost/test");

        let result = AppConfig::from_env();

        // Clean up
        std::env::remove_var("JWT_SECRET");
        std::env::remove_var("DATABASE_URL");

        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.jwt_config.current_secret, secret);
        assert_eq!(config.jwt_config.current_version, 1);
    }

    #[test]
    fn test_app_config_from_env_jwt_secret_too_short() {
        let short_secret = "short";
        std::env::set_var("JWT_SECRET", short_secret);

        let result = AppConfig::from_env();

        // Clean up
        std::env::remove_var("JWT_SECRET");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("at least 32 characters"));
    }

    #[test]
    fn test_app_config_from_env_with_previous_secrets() {
        let secret = "this-is-a-32-character-secret-key!!";
        let old_secret = "another-32-character-secret-key-!!";

        std::env::set_var("JWT_SECRET", secret);
        std::env::set_var("JWT_SECRET_V1", old_secret);
        std::env::set_var("DATABASE_URL", "postgresql://test:test@localhost/test");

        let result = AppConfig::from_env();

        // Clean up
        std::env::remove_var("JWT_SECRET");
        std::env::remove_var("JWT_SECRET_V1");
        std::env::remove_var("DATABASE_URL");

        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.jwt_config.current_secret, secret);
        assert_eq!(
            config.jwt_config.get_secret_for_version(1),
            Some(&old_secret.to_string())
        );
    }

    // Cookie security configuration tests
    #[test]
    fn test_cookie_security_config_development_default() {
        // Set minimal required environment variables
        std::env::set_var(
            "JWT_SECRET",
            "test-secret-that-is-long-enough-for-validation",
        );
        std::env::remove_var("ENVIRONMENT");
        std::env::remove_var("COOKIE_SECURE");
        std::env::remove_var("COOKIE_SAME_SITE");

        let config = AppConfig::from_env().unwrap();

        // In development, secure should be false by default
        assert!(!config.cookie_security.secure);
        assert_eq!(config.cookie_security.same_site, "Strict");
        assert_eq!(config.cookie_security.environment, "development");
    }

    #[test]
    fn test_cookie_security_config_production_default() {
        // Set environment to production
        std::env::set_var(
            "JWT_SECRET",
            "test-secret-that-is-long-enough-for-validation",
        );
        std::env::set_var("ENVIRONMENT", "production");
        std::env::remove_var("COOKIE_SECURE");
        std::env::remove_var("COOKIE_SAME_SITE");

        let config = AppConfig::from_env().unwrap();

        // In production, secure should be true by default
        assert!(config.cookie_security.secure);
        assert_eq!(config.cookie_security.same_site, "Strict");
        assert_eq!(config.cookie_security.environment, "production");

        // Clean up
        std::env::remove_var("ENVIRONMENT");
    }

    #[test]
    fn test_cookie_security_config_explicit_override() {
        // Set explicit cookie security overrides
        std::env::set_var(
            "JWT_SECRET",
            "test-secret-that-is-long-enough-for-validation",
        );
        std::env::set_var("ENVIRONMENT", "development");
        std::env::set_var("COOKIE_SECURE", "true");
        std::env::set_var("COOKIE_SAME_SITE", "Lax");

        let config = AppConfig::from_env().unwrap();

        // Should use explicit overrides regardless of environment
        assert!(config.cookie_security.secure);
        assert_eq!(config.cookie_security.same_site, "Lax");
        assert_eq!(config.cookie_security.environment, "development");

        // Clean up
        std::env::remove_var("ENVIRONMENT");
        std::env::remove_var("COOKIE_SECURE");
        std::env::remove_var("COOKIE_SAME_SITE");
    }

    #[test]
    fn test_environment_variations() {
        let test_cases = vec![
            ("production", true),
            ("prod", false), // Only "production" should trigger secure=true
            ("staging", false),
            ("test", false),
            ("development", false),
            ("dev", false),
        ];

        for (env_val, expected_secure) in test_cases {
            std::env::set_var(
                "JWT_SECRET",
                "test-secret-that-is-long-enough-for-validation",
            );
            std::env::set_var("ENVIRONMENT", env_val);
            std::env::remove_var("COOKIE_SECURE");

            let config = AppConfig::from_env().unwrap();

            assert_eq!(
                config.cookie_security.secure, expected_secure,
                "Environment '{}' should result in secure={}",
                env_val, expected_secure
            );
            assert_eq!(config.cookie_security.environment, env_val.to_lowercase());

            std::env::remove_var("ENVIRONMENT");
        }
    }
}
