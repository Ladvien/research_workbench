fn main() {
    dotenvy::dotenv().ok();

    let pass = std::env::var("DATABASE_PASSWORD").unwrap_or_else(|_| "NOT SET".to_string());
    println!("Password from env: '{}'", pass);
    println!("Password length: {}", pass.len());
}
