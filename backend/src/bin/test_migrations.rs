//! Test database migrations

use anyhow::Result;
use workbench_server::database::Database;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://ladvien:postgres@192.168.1.104:5432/workbench".to_string());
    
    println!("Testing database connection and migrations...");
    println!("Database URL: {}", database_url);
    
    match Database::new(&database_url).await {
        Ok(db) => {
            println!("✅ Successfully connected to database and ran migrations!");

            // Test health check
            match db.health_check().await {
                Ok(_) => println!("✅ Health check passed!"),
                Err(e) => println!("❌ Health check failed: {}", e),
            }

            // Verify database schema
            match db.verify_schema().await {
                Ok(true) => println!("✅ All required database tables exist!"),
                Ok(false) => println!("⚠️ Some required database tables are missing"),
                Err(e) => println!("❌ Schema verification failed: {}", e),
            }

            // Verify PostgreSQL extensions
            match db.verify_extensions().await {
                Ok(true) => println!("✅ All required PostgreSQL extensions are installed!"),
                Ok(false) => println!("⚠️ Some required PostgreSQL extensions are missing"),
                Err(e) => println!("❌ Extension verification failed: {}", e),
            }

            // Test foreign key constraints
            match db.test_foreign_key_constraints().await {
                Ok(true) => println!("✅ Foreign key constraints are properly configured!"),
                Ok(false) => println!("⚠️ Foreign key constraints are missing or incomplete"),
                Err(e) => println!("❌ Foreign key constraint test failed: {}", e),
            }
        }
        Err(e) => {
            println!("❌ Failed to connect to database or run migrations: {}", e);
            return Err(e);
        }
    }
    
    Ok(())
}