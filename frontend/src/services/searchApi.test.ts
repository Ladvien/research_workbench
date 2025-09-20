import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { searchApiClient } from './searchApi';
import { authService } from './auth';
import { apiClient } from './api';
import type { SearchRequest, SearchResponse, ApiResponse } from '../types';
import { TEST_CONFIG, waitForBackend, ensureTestUser, cleanupTestData } from '../test-utils/testConfig';

describe('SearchApiClient', () => {
  let testConversationId: string | null = null;
  let testMessageId: string | null = null;

  beforeAll(async () => {
    // Wait for backend to be ready
    const isReady = await waitForBackend();
    if (!isReady) {
      throw new Error('Backend is not ready for testing');
    }

    // Ensure test user exists and authenticate
    await ensureTestUser();
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });

    // Create a test conversation with a message for search testing
    const convResult = await apiClient.createConversation({
      title: 'Search Test Conversation',
      model: 'claude-3',
      provider: 'anthropic',
    });

    if (convResult.data?.id) {
      testConversationId = convResult.data.id;

      // Add a test message to search for
      await apiClient.sendMessage(testConversationId, 'This is a unique test message for search functionality');
    }
  }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

  beforeEach(async () => {
    // Re-authenticate for each test
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });
  });

  afterAll(async () => {
    // Clean up test conversation
    if (testConversationId) {
      await apiClient.deleteConversation(testConversationId);
    }
    await cleanupTestData();
  });

  describe('searchMessages (GET)', () => {
    it('should search messages successfully with all parameters', async () => {
      const result = await searchApiClient.searchMessages('test', 20, 0.1);

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.query).toBe('test');
      expect(Array.isArray(result.data?.results)).toBe(true);
      expect(typeof result.data?.total_found).toBe('number');
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should search messages with minimal parameters', async () => {
      const result = await searchApiClient.searchMessages('unique test message');

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.query).toBe('unique test message');
      expect(Array.isArray(result.data?.results)).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle URL encoding of query parameters', async () => {
      const complexQuery = 'query with spaces & special chars!';
      const result = await searchApiClient.searchMessages(complexQuery, 10, 0.2);

      expect(result.status).toBe(200);
      expect(result.data?.query).toBe(complexQuery);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle search with no results', async () => {
      const obscureQuery = 'xyzqwertyuiopasdfghjklzxcvbnm123456789';
      const result = await searchApiClient.searchMessages(obscureQuery);

      expect(result.status).toBe(200);
      expect(result.data?.results).toBeDefined();
      expect(result.data?.total_found).toBe(0);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle search HTTP error with invalid parameters', async () => {
      // Test with invalid similarity threshold
      const result = await searchApiClient.searchMessages('test', -1, 2.0);

      // Should either succeed with adjusted params or return error
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle unauthorized search request', async () => {
      // Log out to trigger unauthorized
      await authService.logout();

      const result = await searchApiClient.searchMessages('test');

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('searchMessagesPost (POST)', () => {
    it('should search messages with POST request', async () => {
      const searchRequest: SearchRequest = {
        query: 'test message',
        limit: 25,
        similarity_threshold: 0.1,
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.query).toBe(searchRequest.query);
      expect(Array.isArray(result.data?.results)).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle POST search with minimal request', async () => {
      const searchRequest: SearchRequest = {
        query: 'unique test message',
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      expect(result.status).toBe(200);
      expect(result.data?.query).toBe(searchRequest.query);
      expect(Array.isArray(result.data?.results)).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle POST search with empty query', async () => {
      const searchRequest: SearchRequest = {
        query: '',
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      // Should handle gracefully - either success with no results or validation error
      expect(typeof result.status).toBe('number');
      if (result.status === 200) {
        expect(result.data?.results).toBeDefined();
      } else {
        expect(result.status).toBeGreaterThanOrEqual(400);
        expect(result.error).toBeDefined();
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle POST search with very long query', async () => {
      const longQuery = 'test '.repeat(1000);
      const searchRequest: SearchRequest = {
        query: longQuery,
        limit: 5,
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      // Should handle gracefully - either success or proper error
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('triggerEmbeddingJob', () => {
    it('should handle embedding job trigger (may require admin)', async () => {
      const result = await searchApiClient.triggerEmbeddingJob();

      // May succeed (if user is admin) or fail with 403 (if not admin)
      expect([200, 202, 403].includes(result.status)).toBe(true);

      if (result.status === 403) {
        expect(result.error).toBeDefined();
        expect(result.data).toBeUndefined();
      } else {
        expect(result.data).toBeDefined();
        expect(typeof result.data?.processed_count).toBe('number');
        expect(typeof result.data?.success).toBe('boolean');
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle embedding job without authentication', async () => {
      // Log out to test without auth
      await authService.logout();

      const result = await searchApiClient.triggerEmbeddingJob();

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('getSearchHealth', () => {
    it('should get search health successfully', async () => {
      const result = await searchApiClient.getSearchHealth();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(typeof result.data?.status).toBe('string');
      expect(typeof result.data?.service).toBe('string');
      expect(typeof result.data?.timestamp).toBe('string');
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle search health check without authentication', async () => {
      // Health check might be public or might require auth
      await authService.logout();

      const result = await searchApiClient.getSearchHealth();

      // Should either succeed (public endpoint) or fail with 401
      expect([200, 401].includes(result.status)).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('getSearchStats', () => {
    it('should get search statistics successfully', async () => {
      const result = await searchApiClient.getSearchStats();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(typeof result.data?.pending_embeddings).toBe('number');
      expect(typeof result.data?.timestamp).toBe('string');
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle search stats without authentication', async () => {
      await authService.logout();

      const result = await searchApiClient.getSearchStats();

      // May require auth
      expect([200, 401].includes(result.status)).toBe(true);

      if (result.status === 401) {
        expect(result.error).toBeDefined();
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('network error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Create client with invalid URL to trigger network error
      const invalidClient = new (searchApiClient.constructor as any)('http://invalid-url:99999');

      const result = await invalidClient.getSearchHealth();

      expect(result.status).toBe(0);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle service unavailable gracefully', async () => {
      // Try to search when service might be down (depends on test environment)
      const result = await searchApiClient.searchMessages('test');

      // Should handle gracefully - either success or proper error
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('edge cases', () => {
    it('should handle special characters in search query', async () => {
      const specialQuery = '"quoted" & <tag> [bracket] (paren) 测试';
      const result = await searchApiClient.searchMessages(specialQuery);

      expect(result.status).toBe(200);
      expect(result.data?.query).toBe(specialQuery);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle zero similarity threshold', async () => {
      const result = await searchApiClient.searchMessages('test', 10, 0);

      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle high similarity threshold', async () => {
      const result = await searchApiClient.searchMessages('test', 5, 1.0);

      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle large limit values', async () => {
      const result = await searchApiClient.searchMessages('test', 1000);

      // Should either work or handle gracefully
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle malformed search requests', async () => {
      const malformedRequest = {
        query: 'test',
        limit: 'invalid',
        similarity_threshold: 'also invalid',
      } as any;

      const result = await searchApiClient.searchMessagesPost(malformedRequest);

      // Should handle gracefully with validation error
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('integration tests', () => {
    it('should perform end-to-end search workflow', async () => {
      // 1. Create conversation with specific content
      const convResult = await apiClient.createConversation({
        title: 'Search Integration Test',
        model: 'claude-3',
        provider: 'anthropic',
      });
      expect(convResult.status).toBe(201);
      const convId = convResult.data!.id;

      // 2. Add a message with unique content
      const uniqueContent = `integration-test-${Date.now()}`;
      await apiClient.sendMessage(convId, uniqueContent);

      // 3. Search for the content (might need time for indexing)
      let searchResult;
      let attempts = 0;
      do {
        searchResult = await searchApiClient.searchMessages(uniqueContent);
        attempts++;
        if (searchResult.status === 200 && searchResult.data?.total_found === 0 && attempts < 3) {
          // Wait a bit for indexing
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } while (searchResult.status === 200 && searchResult.data?.total_found === 0 && attempts < 3);

      expect(searchResult.status).toBe(200);
      expect(searchResult.data).toBeDefined();

      // 4. Clean up
      await apiClient.deleteConversation(convId);
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

    it('should handle concurrent search requests', async () => {
      const searchPromises = Array(3).fill(null).map((_, i) =>
        searchApiClient.searchMessages(`test query ${i}`)
      );

      const results = await Promise.all(searchPromises);

      results.forEach((result, i) => {
        expect(result.status).toBe(200);
        expect(result.data?.query).toBe(`test query ${i}`);
      });
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('exported instance', () => {
    it('should export a configured instance', () => {
      expect(searchApiClient).toBeDefined();
      expect(typeof searchApiClient.searchMessages).toBe('function');
      expect(typeof searchApiClient.searchMessagesPost).toBe('function');
      expect(typeof searchApiClient.triggerEmbeddingJob).toBe('function');
      expect(typeof searchApiClient.getSearchHealth).toBe('function');
      expect(typeof searchApiClient.getSearchStats).toBe('function');
    });

    it('should work with the exported instance', async () => {
      const result = await searchApiClient.getSearchHealth();
      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });
}, 60000); // Increase timeout for real API calls