import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchApiClient } from './searchApi';
import type { SearchRequest, SearchResponse, ApiResponse } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SearchApiClient', () => {
  const mockSearchResponse: SearchResponse = {
    query: 'test query',
    results: [
      {
        message_id: 'msg1',
        content: 'This is a test message',
        role: 'user',
        created_at: '2023-01-01T00:00:00Z',
        conversation_id: 'conv1',
        conversation_title: 'Test Conversation',
        similarity: 0.95,
        preview: 'This is a test...',
      },
      {
        message_id: 'msg2',
        content: 'Another test message',
        role: 'assistant',
        created_at: '2023-01-02T00:00:00Z',
        conversation_id: 'conv2',
        similarity: 0.87,
        preview: 'Another test...',
      },
    ],
    total_found: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('searchMessages (GET)', () => {
    it('should search messages successfully with all parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.searchMessages('test query', 20, 0.8);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search?q=test+query&limit=20&similarity_threshold=0.8',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(mockSearchResponse);
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it('should search messages with minimal parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.searchMessages('simple query');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search?q=simple+query',
        expect.any(Object)
      );

      expect(result.data).toEqual(mockSearchResponse);
    });

    it('should handle URL encoding of query parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const complexQuery = 'query with spaces & special chars!';
      await searchApiClient.searchMessages(complexQuery, 10, 0.9);

      const expectedUrl = 'http://localhost:8080/api/v1/search?q=query+with+spaces+%26+special+chars%21&limit=10&similarity_threshold=0.9';
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.any(Object)
      );
    });

    it('should handle search HTTP error', async () => {
      const errorMessage = 'Search service unavailable';
      const mockResponse = {
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.searchMessages('test query');

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(503);
      expect(result.data).toBeUndefined();
    });

    it('should handle network error', async () => {
      const networkError = new Error('Network connection failed');
      mockFetch.mockRejectedValue(networkError);

      const result = await searchApiClient.searchMessages('test query');

      expect(result.error).toBe('Network connection failed');
      expect(result.status).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const result = await searchApiClient.searchMessages('test query');

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });
  });

  describe('searchMessagesPost (POST)', () => {
    it('should search messages with POST request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const searchRequest: SearchRequest = {
        query: 'complex search query',
        limit: 25,
        similarity_threshold: 0.85,
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(searchRequest),
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(mockSearchResponse);
      expect(result.status).toBe(200);
    });

    it('should handle POST search with minimal request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const searchRequest: SearchRequest = {
        query: 'minimal query',
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(searchRequest),
        })
      );

      expect(result.data).toEqual(mockSearchResponse);
    });

    it('should handle POST search HTTP error', async () => {
      const errorMessage = 'Invalid search parameters';
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const searchRequest: SearchRequest = {
        query: '',
      };

      const result = await searchApiClient.searchMessagesPost(searchRequest);

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(400);
    });
  });

  describe('triggerEmbeddingJob', () => {
    it('should trigger embedding job successfully', async () => {
      const jobResponse = {
        processed_count: 150,
        success: true,
      };
      const mockResponse = {
        ok: true,
        status: 202,
        json: vi.fn().mockResolvedValue(jobResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.triggerEmbeddingJob();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search/embedding-job',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(jobResponse);
      expect(result.status).toBe(202);
    });

    it('should handle embedding job failure', async () => {
      const errorMessage = 'Unauthorized - Admin access required';
      const mockResponse = {
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.triggerEmbeddingJob();

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(403);
    });

    it('should handle embedding job network error', async () => {
      const networkError = new Error('Service timeout');
      mockFetch.mockRejectedValue(networkError);

      const result = await searchApiClient.triggerEmbeddingJob();

      expect(result.error).toBe('Service timeout');
      expect(result.status).toBe(0);
    });
  });

  describe('getSearchHealth', () => {
    it('should get search health successfully', async () => {
      const healthResponse = {
        status: 'healthy',
        service: 'search-api',
        timestamp: '2023-01-01T00:00:00Z',
      };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(healthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.getSearchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search/health',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(healthResponse);
      expect(result.status).toBe(200);
    });

    it('should handle search health check failure', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service degraded'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.getSearchHealth();

      expect(result.error).toBe('Service degraded');
      expect(result.status).toBe(503);
    });
  });

  describe('getSearchStats', () => {
    it('should get search statistics successfully', async () => {
      const statsResponse = {
        pending_embeddings: 42,
        timestamp: '2023-01-01T00:00:00Z',
      };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(statsResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.getSearchStats();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search/stats',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(statsResponse);
      expect(result.status).toBe(200);
    });

    it('should handle search stats failure', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal server error'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.getSearchStats();

      expect(result.error).toBe('Internal server error');
      expect(result.status).toBe(500);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.searchMessages('test');

      expect(result.error).toBe('Invalid JSON');
      expect(result.status).toBe(0);
    });

    it('should handle empty response text gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchApiClient.searchMessages('test');

      expect(result.error).toBe('HTTP 404');
      expect(result.status).toBe(404);
    });

    it('should handle very long search queries', async () => {
      const longQuery = 'a'.repeat(10000);
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.searchMessages(longQuery);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(longQuery)),
        expect.any(Object)
      );
    });

    it('should handle special characters in search query', async () => {
      const specialQuery = '"quoted" & <tag> [bracket] (paren) 测试';
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.searchMessages(specialQuery);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(specialQuery)),
        expect.any(Object)
      );
    });

    it('should handle zero similarity threshold', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.searchMessages('test', 10, 0);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search?q=test&limit=10&similarity_threshold=0',
        expect.any(Object)
      );
    });

    it('should handle high similarity threshold', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.searchMessages('test', 5, 1.0);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search?q=test&limit=5&similarity_threshold=1',
        expect.any(Object)
      );
    });

    it('should handle large limit values', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockSearchResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.searchMessages('test', 10000);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/search?q=test&limit=10000',
        expect.any(Object)
      );
    });
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

    it('should use environment base URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await searchApiClient.getSearchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/search/health'),
        expect.any(Object)
      );
    });
  });
});
