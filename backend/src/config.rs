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
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let bind_address = std::env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
            .parse()?;

        let openai_api_key = std::env::var("OPENAI_API_KEY")
            .map_err(|_| anyhow::anyhow!("OPENAI_API_KEY environment variable not set"))?;

        let openai_model = std::env::var("OPENAI_MODEL")
            .unwrap_or_else(|_| "gpt-4".to_string());

        let openai_max_tokens = std::env::var("OPENAI_MAX_TOKENS")
            .unwrap_or_else(|_| "2048".to_string())
            .parse()
            .unwrap_or(2048);

        let openai_temperature = std::env::var("OPENAI_TEMPERATURE")
            .unwrap_or_else(|_| "0.7".to_string())
            .parse()
            .unwrap_or(0.7);

        Ok(Self {
            bind_address,
            openai_api_key,
            openai_model,
            openai_max_tokens,
            openai_temperature,
        })
    }
}