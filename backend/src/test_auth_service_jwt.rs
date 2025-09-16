// Standalone test for AuthService JWT functionality
// Tests AUDIT-002 compliance for JWT token generation and validation

#[cfg(test)]
mod tests {
    use crate::config::JwtConfig;
    use crate::models::JwtClaims;
    use chrono::{Duration, Utc};
    use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};

    #[test]
    fn test_jwt_token_generation_with_versioning() {
        let secret = "this-is-a-32-character-secret-key!!";
        let jwt_config = JwtConfig::new(secret.to_string()).unwrap();

        // Create test claims with version
        let now = Utc::now();
        let claims = JwtClaims {
            sub: "test-user-id".to_string(),
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
            exp: (now + Duration::hours(24)).timestamp() as usize,
            iat: now.timestamp() as usize,
            key_version: jwt_config.current_version,
        };

        // Generate token
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        )
        .unwrap();

        // Verify token can be decoded
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let decoded = decode::<JwtClaims>(
            &token,
            &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
            &validation,
        )
        .unwrap();

        assert_eq!(decoded.claims.sub, "test-user-id");
        assert_eq!(decoded.claims.email, "test@example.com");
        assert_eq!(decoded.claims.username, "testuser");
        assert_eq!(decoded.claims.key_version, 1);
    }

    #[test]
    fn test_jwt_token_validation_with_rotation() {
        let initial_secret = "this-is-a-32-character-secret-key!!";
        let mut jwt_config = JwtConfig::new(initial_secret.to_string()).unwrap();

        // Generate token with initial secret
        let now = Utc::now();
        let claims = JwtClaims {
            sub: "test-user-id".to_string(),
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
            exp: (now + Duration::hours(24)).timestamp() as usize,
            iat: now.timestamp() as usize,
            key_version: jwt_config.current_version,
        };

        let old_token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        )
        .unwrap();

        // Rotate secret
        let new_secret = "new-32-character-secret-key-here!!";
        jwt_config.rotate_secret(new_secret.to_string()).unwrap();

        // Generate new token with new secret
        let new_claims = JwtClaims {
            sub: "test-user-id-2".to_string(),
            email: "test2@example.com".to_string(),
            username: "testuser2".to_string(),
            exp: (now + Duration::hours(24)).timestamp() as usize,
            iat: now.timestamp() as usize,
            key_version: jwt_config.current_version,
        };

        let new_token = encode(
            &Header::default(),
            &new_claims,
            &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        )
        .unwrap();

        // Both tokens should be validatable
        let validation = Validation::new(Algorithm::HS256);

        // New token with current secret
        let decoded_new = decode::<JwtClaims>(
            &new_token,
            &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(decoded_new.claims.key_version, 2);

        // Old token with previous secret
        let old_secret = jwt_config.get_secret_for_version(1).unwrap();
        let decoded_old = decode::<JwtClaims>(
            &old_token,
            &DecodingKey::from_secret(old_secret.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(decoded_old.claims.key_version, 1);
    }

    #[test]
    fn test_jwt_token_fails_with_wrong_secret() {
        let secret = "this-is-a-32-character-secret-key!!";
        let jwt_config = JwtConfig::new(secret.to_string()).unwrap();

        let now = Utc::now();
        let claims = JwtClaims {
            sub: "test-user-id".to_string(),
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
            exp: (now + Duration::hours(24)).timestamp() as usize,
            iat: now.timestamp() as usize,
            key_version: jwt_config.current_version,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        )
        .unwrap();

        // Try to validate with wrong secret
        let wrong_secret = "wrong-32-character-secret-key-here!";
        let validation = Validation::new(Algorithm::HS256);

        let result = decode::<JwtClaims>(
            &token,
            &DecodingKey::from_secret(wrong_secret.as_bytes()),
            &validation,
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_expired_token_validation() {
        let secret = "this-is-a-32-character-secret-key!!";
        let jwt_config = JwtConfig::new(secret.to_string()).unwrap();

        // Create expired token (1 hour ago)
        let now = Utc::now();
        let expired_claims = JwtClaims {
            sub: "test-user-id".to_string(),
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
            exp: (now - Duration::hours(1)).timestamp() as usize, // Expired
            iat: (now - Duration::hours(2)).timestamp() as usize,
            key_version: jwt_config.current_version,
        };

        let expired_token = encode(
            &Header::default(),
            &expired_claims,
            &EncodingKey::from_secret(jwt_config.current_secret.as_bytes()),
        )
        .unwrap();

        // Validation should fail for expired token
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let result = decode::<JwtClaims>(
            &expired_token,
            &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
            &validation,
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_jwt_secret_strength_requirements() {
        // Test various secret lengths
        let test_cases = vec![
            ("", false),                                   // Empty
            ("short", false),                              // Too short
            ("12345678901234567890123456789012", true),    // Exactly 32 chars
            ("this-is-a-32-character-secret-key!!", true), // 34 chars
            (
                "this-is-a-much-longer-secret-key-that-exceeds-32-characters",
                true,
            ), // Long
        ];

        for (secret, should_succeed) in test_cases {
            let result = JwtConfig::new(secret.to_string());
            if should_succeed {
                assert!(result.is_ok(), "Secret '{}' should be valid", secret);
            } else {
                assert!(result.is_err(), "Secret '{}' should be invalid", secret);
            }
        }
    }
}
