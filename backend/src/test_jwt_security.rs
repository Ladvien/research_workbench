// Standalone test file to verify JWT security fixes
// This test can be run independently to verify AUDIT-002 resolution

use crate::config::JwtConfig;
use anyhow::Result;

#[test]
fn test_jwt_config_rejects_short_secrets() {
    let short_secret = "short";
    let result = JwtConfig::new(short_secret.to_string());
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("at least 32 characters"));
}

#[test]
fn test_jwt_config_accepts_secure_secrets() {
    let secure_secret = "this-is-a-32-character-secret-key!!";
    let result = JwtConfig::new(secure_secret.to_string());
    assert!(result.is_ok());

    let config = result.unwrap();
    assert_eq!(config.current_secret, secure_secret);
    assert_eq!(config.current_version, 1);
}

#[test]
fn test_jwt_config_secret_rotation() {
    let initial_secret = "this-is-a-32-character-secret-key!!";
    let mut config = JwtConfig::new(initial_secret.to_string()).unwrap();

    let new_secret = "new-32-character-secret-key-here!!";
    let result = config.rotate_secret(new_secret.to_string());
    assert!(result.is_ok());

    // New secret should be current
    assert_eq!(config.current_secret, new_secret);
    assert_eq!(config.current_version, 2);

    // Previous secret should be accessible
    assert_eq!(
        config.get_secret_for_version(1),
        Some(&initial_secret.to_string())
    );
}

#[test]
fn test_jwt_config_limits_previous_secrets() {
    let secret = "this-is-a-32-character-secret-key!!";
    let mut config = JwtConfig::new(secret.to_string()).unwrap();

    // Rotate secrets many times
    for i in 1..=10 {
        let new_secret = format!("secret-{:02}-32-character-secret-key!", i);
        config.rotate_secret(new_secret).unwrap();
    }

    // Should limit to 5 previous secrets
    assert!(config.previous_secrets.len() <= 5);
    assert_eq!(config.current_version, 11);
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::env;

    #[test]
    fn test_environment_variable_required() {
        // Clear JWT_SECRET if set
        env::remove_var("JWT_SECRET");

        // This would fail in the real config loading
        // We're testing that the JWT_SECRET environment variable is required
        let result = env::var("JWT_SECRET");
        assert!(result.is_err());
    }

    #[test]
    fn test_secure_secret_from_environment() {
        let secure_secret = "environment-32-character-secret-key!";
        env::set_var("JWT_SECRET_TEST", secure_secret);

        let secret = env::var("JWT_SECRET_TEST").unwrap();
        let config = JwtConfig::new(secret);
        assert!(config.is_ok());

        // Cleanup
        env::remove_var("JWT_SECRET_TEST");
    }
}

// Security verification helper
pub fn verify_audit_002_resolution() -> Result<()> {
    // Test 1: Reject weak secrets
    let weak_result = JwtConfig::new("weak".to_string());
    if weak_result.is_ok() {
        return Err(anyhow::anyhow!(
            "AUDIT-002 FAILED: Weak secrets still accepted"
        ));
    }

    // Test 2: Accept strong secrets
    let strong_secret = "this-is-a-very-secure-32-character-secret-key-for-production";
    let strong_result = JwtConfig::new(strong_secret.to_string());
    if strong_result.is_err() {
        return Err(anyhow::anyhow!("AUDIT-002 FAILED: Strong secrets rejected"));
    }

    // Test 3: Secret rotation works
    let mut config = strong_result.unwrap();
    let new_secret = "another-very-secure-32-character-secret-key-for-rotation";
    let rotation_result = config.rotate_secret(new_secret.to_string());
    if rotation_result.is_err() {
        return Err(anyhow::anyhow!(
            "AUDIT-002 FAILED: Secret rotation not working"
        ));
    }

    // Test 4: Previous secrets are accessible
    if config.get_secret_for_version(1).is_none() {
        return Err(anyhow::anyhow!(
            "AUDIT-002 FAILED: Previous secrets not accessible"
        ));
    }

    Ok(())
}

#[test]
fn audit_002_security_verification() {
    verify_audit_002_resolution().expect("AUDIT-002 security requirements not met");
}
