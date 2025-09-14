// Public exports for testing and library use
pub mod config;
pub mod database;
pub mod error;
pub mod handlers;
pub mod models;
pub mod openai;
pub mod repositories;
pub mod services;

// Re-export commonly used types
pub use database::Database;
pub use error::AppError;
pub use services::DataAccessLayer;