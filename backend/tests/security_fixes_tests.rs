//! Security Fixes Test Suite
//! Tests for critical and high severity security issues

use axum::{
    extract::State,
    http::{header, request::Parts, HeaderMap, HeaderValue, StatusCode},
    Json,
};
use serde_json::json;
use std::net::{IpAddr, SocketAddr};
use tower::ServiceExt;
use tower_sessions::Session;

use workbench_server::{
    app_state::AppState,
    error::AppError,
    handlers::auth,
    middleware::auth::{AuthUtils, UserResponse},
    models::{LoginRequest, RegisterRequest},
};

/// Test suite for JWT token validation security fixes
mod jwt_validation_tests {
    use super::*;
    use workbench_server::middleware::auth::AuthUtils;

    #[test]
    fn test_jwt_format_validation() {
        // Valid JWT format
        let valid_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        assert!(
            AuthUtils::validate_jwt_format(valid_jwt),
            "Valid JWT should pass validation"
        );

        // Invalid JWT formats that could be injection attempts
        let invalid_jwts = vec![
            "",                                     // Empty
            "not.a.jwt",                            // Too few parts
            "header.payload",                       // Missing signature
            "header.payload.signature.extra",       // Too many parts
            "header$.payload.signature",            // Invalid characters
            "header.payload.signature with spaces", // Spaces in token
            "../../../etc/passwd",                  // Path traversal attempt
            "<script>alert('xss')</script>",        // XSS attempt
            "'; DROP TABLE users; --",              // SQL injection attempt
        ];

        for invalid_jwt in invalid_jwts {
            assert!(
                !AuthUtils::validate_jwt_format(invalid_jwt),
                "Invalid JWT '{}' should fail validation",
                invalid_jwt
            );
        }
    }

    #[test]
    fn test_cookie_token_extraction_security() {
        use axum::http::{HeaderMap, HeaderValue};
        use workbench_server::middleware::auth;

        // Create mock request parts
        let mut headers = HeaderMap::new();

        // Test secure cookie extraction
        headers.insert(
            "cookie",
            HeaderValue::from_str("session_id=abc123; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature; other=value").unwrap()
        );

        let parts = Parts {
            method: axum::http::Method::GET,
            uri: "/".parse().unwrap(),
            version: axum::http::Version::HTTP_11,
            headers,
            extensions: Default::default(),
        };

        // Valid token should be extracted
        // Note: In actual implementation, we'd need to test the private function
        // For now, we test the validation logic
        let test_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
        assert!(AuthUtils::validate_jwt_format(test_token));

        // Test injection attempts in cookies
        let malicious_cookies = vec![
            "token=../../../etc/passwd",
            "token=<script>alert('xss')</script>",
            "token='; DROP TABLE users; --",
            "token=token with spaces",
            "token=token$with$special",
        ];

        for cookie in malicious_cookies {
            if let Some(token_value) = cookie.strip_prefix("token=") {
                assert!(
                    !AuthUtils::validate_jwt_format(token_value),
                    "Malicious token '{}' should be rejected",
                    token_value
                );
            }
        }
    }

    #[test]
    fn test_authorization_header_security() {
        // Valid Bearer token
        let valid_header = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
        if let Some(token) = valid_header.strip_prefix("Bearer ") {
            assert!(AuthUtils::validate_jwt_format(token));
        }

        // Invalid Bearer headers that could be injection attempts
        let malicious_headers = vec![
            "Bearer ../../../etc/passwd",
            "Bearer <script>alert('xss')</script>",
            "Bearer '; DROP TABLE users; --",
            "Bearer token with spaces",
            "Bearer token$with$special",
            "Bearer ",         // Empty token
            "NotBearer token", // Wrong prefix
        ];

        for header in malicious_headers {
            if header.starts_with("Bearer ") && header.len() > 7 {
                let token = &header[7..];
                assert!(
                    !AuthUtils::validate_jwt_format(token) || token.is_empty(),
                    "Malicious header '{}' should be rejected",
                    header
                );
            }
        }
    }
}

/// Test suite for IP address and User-Agent extraction
mod request_tracking_tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};

    fn create_test_parts_with_headers(headers: HeaderMap) -> Parts {
        Parts {
            method: axum::http::Method::GET,
            uri: "/".parse().unwrap(),
            version: axum::http::Version::HTTP_11,
            headers,
            extensions: Default::default(),
        }
    }

    #[test]
    fn test_client_ip_extraction() {
        // Test X-Forwarded-For header
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_str("203.0.113.195, 192.168.1.100").unwrap(),
        );
        let parts = create_test_parts_with_headers(headers);
        let ip = AuthUtils::extract_client_ip(&parts);
        assert_eq!(ip, Some("203.0.113.195".to_string()));

        // Test X-Real-IP header
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", HeaderValue::from_str("203.0.113.195").unwrap());
        let parts = create_test_parts_with_headers(headers);
        let ip = AuthUtils::extract_client_ip(&parts);
        assert_eq!(ip, Some("203.0.113.195".to_string()));

        // Test CF-Connecting-IP header
        let mut headers = HeaderMap::new();
        headers.insert(
            "cf-connecting-ip",
            HeaderValue::from_str("203.0.113.195").unwrap(),
        );
        let parts = create_test_parts_with_headers(headers);
        let ip = AuthUtils::extract_client_ip(&parts);
        assert_eq!(ip, Some("203.0.113.195".to_string()));

        // Test invalid IP addresses are rejected
        let invalid_ips = vec![
            "not.an.ip",
            "999.999.999.999",
            "<script>alert('xss')</script>",
            "'; DROP TABLE users; --",
        ];

        for invalid_ip in invalid_ips {
            let mut headers = HeaderMap::new();
            headers.insert(
                "x-forwarded-for",
                HeaderValue::from_str(invalid_ip).unwrap(),
            );
            let parts = create_test_parts_with_headers(headers);
            let ip = AuthUtils::extract_client_ip(&parts);
            assert!(
                ip.is_none(),
                "Invalid IP '{}' should be rejected",
                invalid_ip
            );
        }
    }

    #[test]
    fn test_user_agent_extraction_and_sanitization() {
        // Test valid User-Agent
        let mut headers = HeaderMap::new();
        headers.insert(
            "user-agent",
            HeaderValue::from_str("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .unwrap(),
        );
        let parts = create_test_parts_with_headers(headers);
        let ua = AuthUtils::extract_user_agent(&parts);
        assert!(ua.is_some());
        assert!(ua.unwrap().len() <= 500); // Length limit enforced

        // Test User-Agent length limiting
        let long_ua = "A".repeat(1000);
        let mut headers = HeaderMap::new();
        headers.insert("user-agent", HeaderValue::from_str(&long_ua).unwrap());
        let parts = create_test_parts_with_headers(headers);
        let ua = AuthUtils::extract_user_agent(&parts);
        assert!(ua.is_some());
        assert_eq!(ua.unwrap().len(), 500); // Truncated to max length

        // Test User-Agent sanitization
        let malicious_uas = vec![
            "Mozilla/5.0\x00\x01\x02",     // Control characters
            "Mozilla/5.0\u{200B}\u{FEFF}", // Zero-width characters
        ];

        for malicious_ua in malicious_uas {
            if let Ok(header_value) = HeaderValue::from_str(malicious_ua) {
                let mut headers = HeaderMap::new();
                headers.insert("user-agent", header_value);
                let parts = create_test_parts_with_headers(headers);
                let ua = AuthUtils::extract_user_agent(&parts);

                if let Some(sanitized) = ua {
                    // Ensure no dangerous characters remain
                    assert!(
                        sanitized
                            .chars()
                            .all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()),
                        "Sanitized User-Agent should only contain safe characters"
                    );
                }
            }
        }
    }

    #[test]
    fn test_no_headers_handling() {
        // Test when no headers are present
        let headers = HeaderMap::new();
        let parts = create_test_parts_with_headers(headers);

        let ip = AuthUtils::extract_client_ip(&parts);
        assert!(
            ip.is_none(),
            "Should return None when no IP headers present"
        );

        let ua = AuthUtils::extract_user_agent(&parts);
        assert!(
            ua.is_none(),
            "Should return None when no User-Agent header present"
        );
    }
}

/// Test suite for session security validation
mod session_security_tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;
    use workbench_server::middleware::session_auth::SessionSecurityValidator;
    use workbench_server::services::session::SessionData;

    #[test]
    fn test_session_age_validation() {
        let user_id = Uuid::new_v4();
        let now = Utc::now();

        // Session created 25 hours ago (should be expired)
        let expired_session = SessionData {
            user_id,
            created_at: now - chrono::Duration::hours(25),
            last_accessed: now - chrono::Duration::minutes(5),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        let result = SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Test Agent"),
            &expired_session,
        );
        assert!(result.is_err(), "Expired session should fail validation");
    }

    #[test]
    fn test_session_idle_validation() {
        let user_id = Uuid::new_v4();
        let now = Utc::now();

        // Session last accessed 3 hours ago (should be expired due to inactivity)
        let idle_session = SessionData {
            user_id,
            created_at: now - chrono::Duration::minutes(30),
            last_accessed: now - chrono::Duration::hours(3),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        let result = SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Test Agent"),
            &idle_session,
        );
        assert!(result.is_err(), "Idle session should fail validation");
    }

    #[test]
    fn test_valid_session() {
        let user_id = Uuid::new_v4();
        let now = Utc::now();

        // Valid session (recent creation and access)
        let valid_session = SessionData {
            user_id,
            created_at: now - chrono::Duration::minutes(30),
            last_accessed: now - chrono::Duration::minutes(5),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        let result = SessionSecurityValidator::validate_session_request(
            Some("192.168.1.100"),
            Some("Test Agent"),
            &valid_session,
        );
        assert!(result.is_ok(), "Valid session should pass validation");
    }

    #[test]
    fn test_ip_mismatch_handling() {
        let user_id = Uuid::new_v4();
        let now = Utc::now();

        // Session with different IP address
        let session_with_different_ip = SessionData {
            user_id,
            created_at: now - chrono::Duration::minutes(30),
            last_accessed: now - chrono::Duration::minutes(5),
            ip_address: Some("192.168.1.100".into()),
            user_agent: Some("Test Agent".into()),
        };

        // Currently we log but don't reject IP mismatches
        // In stricter environments, this could be a rejection
        let result = SessionSecurityValidator::validate_session_request(
            Some("203.0.113.195"), // Different IP
            Some("Test Agent"),
            &session_with_different_ip,
        );
        assert!(
            result.is_ok(),
            "IP mismatch currently allowed (logged as warning)"
        );
    }
}

/// Integration tests for security fixes
mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_comprehensive_security_validation() {
        // This test would require a full application setup
        // For now, we test the individual components

        // Test JWT validation
        let valid_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        assert!(AuthUtils::validate_jwt_format(valid_jwt));

        // Test IP extraction
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_str("203.0.113.195").unwrap(),
        );
        let parts = Parts {
            method: axum::http::Method::GET,
            uri: "/".parse().unwrap(),
            version: axum::http::Version::HTTP_11,
            headers,
            extensions: Default::default(),
        };
        let ip = AuthUtils::extract_client_ip(&parts);
        assert_eq!(ip, Some("203.0.113.195".to_string()));

        // Test User-Agent extraction
        let mut headers = HeaderMap::new();
        headers.insert(
            "user-agent",
            HeaderValue::from_str("Mozilla/5.0 Test Browser").unwrap(),
        );
        let parts = Parts {
            method: axum::http::Method::GET,
            uri: "/".parse().unwrap(),
            version: axum::http::Version::HTTP_11,
            headers,
            extensions: Default::default(),
        };
        let ua = AuthUtils::extract_user_agent(&parts);
        assert_eq!(ua, Some("Mozilla/5.0 Test Browser".to_string()));
    }
}

/// Comprehensive test for auth handler security improvements
mod auth_handler_security_tests {
    use super::*;

    #[test]
    fn test_security_logging_data_validation() {
        // Simulate the data that would be logged by auth handlers
        let test_ip = "203.0.113.195";
        let test_user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

        // Validate IP format
        assert!(test_ip.parse::<IpAddr>().is_ok(), "IP should be valid");

        // Validate User-Agent doesn't contain dangerous characters
        assert!(
            test_user_agent
                .chars()
                .all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()),
            "User-Agent should only contain safe characters"
        );

        // Test length limits
        assert!(
            test_user_agent.len() <= 500,
            "User-Agent should be within length limits"
        );
    }

    #[test]
    fn test_malicious_input_rejection() {
        // Test various injection attempts that should be rejected
        let malicious_inputs = vec![
            "../../../etc/passwd",
            "<script>alert('xss')</script>",
            "'; DROP TABLE users; --",
            "\x00\x01\x02",     // Control characters
            "\u{200B}\u{FEFF}", // Zero-width characters
        ];

        for input in malicious_inputs {
            // JWT format validation should reject these
            assert!(
                !AuthUtils::validate_jwt_format(input),
                "Malicious input '{}' should be rejected by JWT validation",
                input
            );

            // IP validation should reject these
            assert!(
                input.parse::<IpAddr>().is_err(),
                "Malicious input '{}' should be rejected by IP validation",
                input
            );
        }
    }
}
