//! JWT Security Integration Tests
//!
//! This module provides comprehensive integration tests for JWT security,
//! ensuring that real JWT tokens are used instead of mock tokens and that
//! all JWT-related security features work correctly.
//!
//! Fixes AUTH-006: Mock JWT Tokens in Integration Tests

#[cfg(test)]
mod jwt_security_integration_tests {
    use crate::tests::jwt_test_utils::{
        create_test_jwt_token, create_test_admin_jwt_token, create_expired_jwt_token,
        create_invalid_jwt_token, validate_test_jwt_token, JwtTestScenario
    };
    use axum::{
        body::Body,
        http::{Request, StatusCode, HeaderMap},
        response::Response,
        routing::get,
        Json, Router,
    };
    use serde_json::json;
    use tower::ServiceExt;

    /// Test that real JWT tokens are generated (not mock tokens)
    #[test]
    fn test_real_jwt_token_generation() {
        let token = create_test_jwt_token().expect("Failed to create JWT token");
        
        // CRITICAL: Ensure we're not using the old mock token
        assert_ne!(token, "mock.jwt.token", "SECURITY VULNERABILITY: Still using mock JWT token!");
        
        // Verify JWT structure (header.payload.signature)
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3, "JWT token should have exactly 3 parts");
        
        // Verify each part is base64-encoded (should not be empty)
        for part in &parts {
            assert!(!part.is_empty(), "JWT part should not be empty");
            assert!(part.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_'), 
                   "JWT part should be base64url encoded");
        }
    }

    /// Test that JWT tokens contain valid claims and can be validated
    #[test]
    fn test_jwt_token_validation() {
        let token = create_test_jwt_token().expect("Failed to create JWT token");
        
        // Validate the token using real JWT validation logic
        let is_valid = validate_test_jwt_token(&token)
            .expect("Failed to validate JWT token");
        
        assert!(is_valid, "Generated JWT token should be valid");
    }

    /// Test admin JWT token generation and validation
    #[test]
    fn test_admin_jwt_token_generation() {
        let admin_token = create_test_admin_jwt_token().expect("Failed to create admin JWT token");
        
        // Ensure admin token is real, not mock
        assert_ne!(admin_token, "mock.jwt.token", "Admin JWT should not be mock token");
        
        // Validate admin token
        let is_valid = validate_test_jwt_token(&admin_token)
            .expect("Failed to validate admin JWT token");
        
        assert!(is_valid, "Generated admin JWT token should be valid");
        
        // Admin and regular tokens should be different
        let regular_token = create_test_jwt_token().expect("Failed to create regular JWT token");
        assert_ne!(admin_token, regular_token, "Admin and regular JWT tokens should be different");
    }

    /// Test expired JWT token generation and validation
    #[test]
    fn test_expired_jwt_token_validation() {
        let expired_token = create_expired_jwt_token().expect("Failed to create expired JWT token");
        
        // Ensure expired token is real, not mock
        assert_ne!(expired_token, "mock.jwt.token", "Expired JWT should not be mock token");
        
        // Expired token should be properly formatted but invalid
        let parts: Vec<&str> = expired_token.split('.').collect();
        assert_eq!(parts.len(), 3, "Expired JWT token should have correct structure");
        
        // Expired token should fail validation
        let is_valid = validate_test_jwt_token(&expired_token)
            .expect("Failed to validate expired JWT token");
        
        assert!(!is_valid, "Expired JWT token should be invalid");
    }

    /// Test invalid JWT token handling
    #[test]
    fn test_invalid_jwt_token_validation() {
        let invalid_token = create_invalid_jwt_token();
        
        // Invalid token should fail validation
        let is_valid = validate_test_jwt_token(&invalid_token)
            .expect("Failed to validate invalid JWT token");
        
        assert!(!is_valid, "Invalid JWT token should be rejected");
    }

    /// Test JWT token scenarios for comprehensive security testing
    #[test]
    fn test_jwt_test_scenarios_comprehensive() {
        // Test all JWT scenarios
        let scenarios = [
            JwtTestScenario::ValidUser,
            JwtTestScenario::ValidAdmin,
            JwtTestScenario::Expired,
            JwtTestScenario::Invalid,
            JwtTestScenario::Malformed,
        ];

        for scenario in &scenarios {
            let token = scenario.generate_token()
                .expect(&format!("Failed to generate token for scenario: {:?}", scenario));
            
            // No scenario should return mock token
            assert_ne!(token, "mock.jwt.token", 
                      "Scenario {:?} should not return mock token", scenario);
            
            // Verify expected status codes
            let expected_status = scenario.expected_status_code();
            assert!(expected_status == 200 || expected_status == 401,
                   "Scenario {:?} should return valid HTTP status", scenario);
        }
    }

    /// Integration test for JWT tokens in HTTP requests
    /// This simulates how JWT tokens would be used in real API calls
    #[tokio::test]
    async fn test_jwt_tokens_in_http_requests() {
        let app = create_test_app().await;

        // Test with valid JWT token
        let valid_token = create_test_jwt_token().expect("Failed to create valid JWT token");
        let request = Request::builder()
            .uri("/api/protected")
            .method("GET")
            .header("authorization", format!("Bearer {}", valid_token))
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        // In a mock environment, we expect 200 for valid tokens
        assert!(response.status().is_success() || response.status() == StatusCode::NOT_FOUND);

        // Test with invalid JWT token
        let invalid_token = create_invalid_jwt_token();
        let request = Request::builder()
            .uri("/api/protected")
            .method("GET")
            .header("authorization", format!("Bearer {}", invalid_token))
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        // Invalid tokens should result in unauthorized or not found
        assert!(response.status() == StatusCode::UNAUTHORIZED || response.status() == StatusCode::NOT_FOUND);

        // Test with expired JWT token
        let expired_token = create_expired_jwt_token().expect("Failed to create expired JWT token");
        let request = Request::builder()
            .uri("/api/protected")
            .method("GET")
            .header("authorization", format!("Bearer {}", expired_token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        // Expired tokens should result in unauthorized or not found
        assert!(response.status() == StatusCode::UNAUTHORIZED || response.status() == StatusCode::NOT_FOUND);
    }

    /// Test that JWT tokens have proper security properties
    #[test]
    fn test_jwt_security_properties() {
        let token = create_test_jwt_token().expect("Failed to create JWT token");
        
        // Token should be sufficiently long (real JWT tokens are typically 100+ characters)
        assert!(token.len() > 50, "JWT token should be sufficiently long for security");
        
        // Token should not contain obvious test strings
        assert!(!token.contains("test"), "JWT token should not contain obvious test strings");
        assert!(!token.contains("mock"), "JWT token should not contain mock indicators");
        assert!(!token.contains("fake"), "JWT token should not contain fake indicators");
        
        // Token should be different each time (contains timestamp)
        let token2 = create_test_jwt_token().expect("Failed to create second JWT token");
        assert_ne!(token, token2, "JWT tokens should be unique due to timestamps");
    }

    /// Test JWT token claims extraction
    #[test]
    fn test_jwt_token_claims_extraction() {
        use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
        use crate::models::JwtClaims;
        use crate::tests::jwt_test_utils::create_test_jwt_config;
        
        let token = create_test_jwt_token().expect("Failed to create JWT token");
        let jwt_config = create_test_jwt_config().expect("Failed to create JWT config");
        
        // Decode token to verify claims
        let validation = Validation::new(Algorithm::HS256);
        let token_data = decode::<JwtClaims>(
            &token,
            &DecodingKey::from_secret(jwt_config.current_secret.as_bytes()),
            &validation,
        ).expect("Failed to decode JWT token");
        
        let claims = token_data.claims;
        
        // Verify claims contain expected test user data
        assert_eq!(claims.email, "test@workbench.com");
        assert_eq!(claims.username, "testuser");
        assert!(!claims.sub.is_empty(), "Subject claim should not be empty");
        assert!(claims.exp > claims.iat, "Expiration should be after issued time");
        assert_eq!(claims.key_version, 1, "Key version should be 1 for test config");
    }

    /// Helper function to create a test app for HTTP testing
    async fn create_test_app() -> Router {
        Router::new()
            .route("/api/protected", get(mock_protected_handler))
    }

    /// Mock handler for protected endpoints
    async fn mock_protected_handler() -> Result<Json<serde_json::Value>, StatusCode> {
        Ok(Json(json!({
            "message": "Protected resource accessed successfully",
            "timestamp": chrono::Utc::now().to_rfc3339()
        })))
    }

    /// Security regression test to ensure mock tokens are never used
    #[test]
    fn test_no_mock_tokens_security_regression() {
        // This test specifically checks for the security vulnerability that was fixed
        let scenarios = [
            JwtTestScenario::ValidUser,
            JwtTestScenario::ValidAdmin,
        ];

        for scenario in &scenarios {
            let token = scenario.generate_token()
                .expect(&format!("Failed to generate token for scenario: {:?}", scenario));
            
            // CRITICAL SECURITY CHECK: Never allow mock tokens
            assert_ne!(token, "mock.jwt.token", 
                      "SECURITY REGRESSION: Mock token detected in scenario {:?}", scenario);
            assert_ne!(token, "test.jwt.token",
                      "SECURITY REGRESSION: Test mock token detected in scenario {:?}", scenario);
            assert_ne!(token, "fake.jwt.token",
                      "SECURITY REGRESSION: Fake mock token detected in scenario {:?}", scenario);
        }
    }

    /// Performance test to ensure JWT generation is reasonably fast
    #[test]
    fn test_jwt_generation_performance() {
        use std::time::Instant;
        
        let start = Instant::now();
        
        // Generate multiple tokens to test performance
        for _ in 0..100 {
            let _token = create_test_jwt_token().expect("Failed to create JWT token");
        }
        
        let duration = start.elapsed();
        
        // JWT generation should be fast (less than 1 second for 100 tokens)
        assert!(duration.as_secs() < 1, "JWT generation should be fast");
    }
}
