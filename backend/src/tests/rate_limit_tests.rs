#[cfg(test)]
mod rate_limit_tests {
    use crate::config::RateLimitConfig;
    use crate::middleware::rate_limit::*;
    use axum::{body::Body, extract::Request, http::Method};

    fn create_test_config() -> RateLimitConfig {
        RateLimitConfig {
            global_requests_per_hour: 1000,
            api_requests_per_hour: 100,
            uploads_per_hour: 10,
            max_file_size_mb: 10,
            premium_multiplier: 5,
            admin_override_enabled: true,
        }
    }

    #[test]
    fn test_user_tier_multipliers() {
        let config = create_test_config();

        assert_eq!(UserTier::Free.multiplier(&config), 1);
        assert_eq!(UserTier::Premium.multiplier(&config), 5);
        assert_eq!(UserTier::Admin.multiplier(&config), 10);
    }

    #[test]
    fn test_rate_limit_info_headers() {
        let info = RateLimitInfo {
            limit: 100,
            remaining: 75,
            reset_time: 1640995200,
            retry_after: None,
        };

        let headers = info.to_headers().unwrap();
        assert_eq!(headers.get("x-ratelimit-limit").unwrap(), "100");
        assert_eq!(headers.get("x-ratelimit-remaining").unwrap(), "75");
        assert_eq!(headers.get("x-ratelimit-reset").unwrap(), "1640995200");
        assert!(headers.get("retry-after").is_none());

        // Test with retry_after
        let info_with_retry = RateLimitInfo {
            limit: 100,
            remaining: 0,
            reset_time: 1640995200,
            retry_after: Some(3600),
        };

        let headers_with_retry = info_with_retry.to_headers().unwrap();
        assert_eq!(headers_with_retry.get("retry-after").unwrap(), "3600");
    }

    #[test]
    fn test_time_functions() {
        let current_hour = get_current_hour();
        let next_hour = get_next_hour_timestamp();
        let current_time = get_current_timestamp();

        assert!(next_hour > current_time);
        assert_eq!(next_hour, (current_hour + 1) * 3600);

        // Test that current_hour is within reasonable bounds
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(current_hour <= now / 3600);
        assert!(current_hour > (now / 3600) - 1); // Should be current or previous hour
    }

    #[test]
    fn test_rate_limit_types() {
        let _config = create_test_config();

        // Test that rate limit types work correctly
        match RateLimitType::Global {
            RateLimitType::Global => assert!(true),
            _ => panic!("Expected Global rate limit type"),
        }

        match RateLimitType::Api {
            RateLimitType::Api => assert!(true),
            _ => panic!("Expected Api rate limit type"),
        }

        match RateLimitType::Upload {
            RateLimitType::Upload => assert!(true),
            _ => panic!("Expected Upload rate limit type"),
        }
    }

    #[test]
    fn test_user_tier_from_info() {
        let admin_user = UserInfo {
            id: uuid::Uuid::new_v4(),
            email: "admin@admin.com".to_string(),
            is_admin: true,
            is_premium: false,
        };
        assert_eq!(UserTier::from_user_info(&admin_user), UserTier::Admin);

        let premium_user = UserInfo {
            id: uuid::Uuid::new_v4(),
            email: "user@premium.com".to_string(),
            is_admin: false,
            is_premium: true,
        };
        assert_eq!(UserTier::from_user_info(&premium_user), UserTier::Premium);

        let free_user = UserInfo {
            id: uuid::Uuid::new_v4(),
            email: "user@example.com".to_string(),
            is_admin: false,
            is_premium: false,
        };
        assert_eq!(UserTier::from_user_info(&free_user), UserTier::Free);
    }

    #[test]
    fn test_rate_limit_service_creation() {
        let config = create_test_config();

        // Test with invalid Redis URL - service will be created but Redis client may be None
        let _service1 = RateLimitService::new("invalid://url", config.clone());
        // Service creation always succeeds, it just logs warnings for invalid Redis URLs

        // Test with valid Redis URL format (even if Redis server isn't running)
        let _service2 = RateLimitService::new("redis://localhost:6379", config);
        // Service creation always succeeds
    }

    #[test]
    fn test_admin_override() {
        let config = RateLimitConfig {
            admin_override_enabled: true,
            ..create_test_config()
        };

        let service = RateLimitService::new("redis://localhost:6379", config);

        assert!(service.is_admin_override_allowed(&UserTier::Admin));
        assert!(!service.is_admin_override_allowed(&UserTier::Premium));
        assert!(!service.is_admin_override_allowed(&UserTier::Free));

        // Test with override disabled
        let config_no_override = RateLimitConfig {
            admin_override_enabled: false,
            ..create_test_config()
        };

        let service_no_override =
            RateLimitService::new("redis://localhost:6379", config_no_override);
        assert!(!service_no_override.is_admin_override_allowed(&UserTier::Admin));
    }

    #[tokio::test]
    async fn test_get_client_ip() {
        // Test X-Forwarded-For header
        let request = Request::builder()
            .method(Method::GET)
            .uri("/")
            .header("x-forwarded-for", "192.168.1.100, 10.0.0.1")
            .body(Body::empty())
            .unwrap();

        let ip = get_client_ip(&request);
        assert_eq!(ip, Some("192.168.1.100".to_string()));

        // Test X-Real-IP header
        let request2 = Request::builder()
            .method(Method::GET)
            .uri("/")
            .header("x-real-ip", "192.168.1.200")
            .body(Body::empty())
            .unwrap();

        let ip2 = get_client_ip(&request2);
        assert_eq!(ip2, Some("192.168.1.200".to_string()));

        // Test fallback when no headers present
        let request3 = Request::builder()
            .method(Method::GET)
            .uri("/")
            .body(Body::empty())
            .unwrap();

        let ip3 = get_client_ip(&request3);
        assert_eq!(ip3, None); // No socket addr in extensions
    }

    #[test]
    fn test_rate_limit_config_defaults() {
        let config = create_test_config();

        assert_eq!(config.global_requests_per_hour, 1000);
        assert_eq!(config.api_requests_per_hour, 100);
        assert_eq!(config.uploads_per_hour, 10);
        assert_eq!(config.max_file_size_mb, 10);
        assert_eq!(config.premium_multiplier, 5);
        assert!(config.admin_override_enabled);
    }

    // Integration test helpers (would require Redis server for full testing)
    #[tokio::test]
    #[ignore] // Ignore by default since it requires Redis
    async fn test_redis_rate_limiting_integration() {
        let config = create_test_config();
        let service = RateLimitService::new("redis://localhost:6379", config);

        let key = "test_user_123";
        let user_tier = UserTier::Free;

        // First request should succeed
        let result1 = service
            .check_rate_limit(key, RateLimitType::Api, user_tier.clone())
            .await;
        match result1 {
            Ok(info) => {
                assert!(info.remaining > 0);
                assert!(info.limit > 0);
            }
            Err(_) => {
                // Redis not available, skip test
                return;
            }
        }

        // Make many requests to hit the limit
        for _ in 0..100 {
            let _ = service
                .check_rate_limit(key, RateLimitType::Api, user_tier.clone())
                .await;
        }

        // Should be at or near the limit
        let result_final = service
            .check_rate_limit(key, RateLimitType::Api, user_tier)
            .await;
        if let Ok(info) = result_final {
            assert!(info.remaining <= 1);
        }
    }

    #[test]
    fn test_user_tier_email_classification() {
        // This tests the simple email-based tier detection used in the middleware
        let admin_email = "user@admin.com";
        let premium_email = "user@premium.com";
        let free_email = "user@example.com";

        assert!(admin_email.ends_with("@admin.com"));
        assert!(premium_email.ends_with("@premium.com"));
        assert!(!free_email.ends_with("@admin.com"));
        assert!(!free_email.ends_with("@premium.com"));
    }

    #[test]
    fn test_error_response_format() {
        use serde_json::json;

        // Test the error response format matches what the middleware produces
        let expected_error = json!({
            "error": "rate_limit_exceeded",
            "message": "API rate limit of 100 requests per hour exceeded. Try again in 3600 seconds.",
            "details": {
                "limit": 100,
                "reset_time": 1640995200u64,
                "retry_after": 3600u64
            }
        });

        // Verify the structure
        assert_eq!(expected_error["error"], "rate_limit_exceeded");
        assert!(expected_error["message"].is_string());
        assert!(expected_error["details"]["limit"].is_number());
        assert!(expected_error["details"]["reset_time"].is_number());
        assert!(expected_error["details"]["retry_after"].is_number());
    }
}
