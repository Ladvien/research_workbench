// API Endpoint Verification Tests
// Ensures frontend API calls match backend route expectations
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../services/auth';
import { apiClient } from '../services/api';
import { searchApiClient } from '../services/searchApi';
import { analyticsApi } from '../services/analyticsApi';

// Mock fetch to capture API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Endpoint Path Verification', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Auth Service Endpoints', () => {
    it('should call correct auth login endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: { id: '1' }, access_token: 'token' }),
      });

      await authService.login({ email: 'test@example.com', password: 'password' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
          body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
        })
      );
    });

    it('should call correct auth register endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ user: { id: '1' }, access_token: 'token' }),
      });

      await authService.register({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', username: 'testuser', password: 'password' }),
        })
      );
    });

    it('should call correct auth refresh endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: { id: '1' }, access_token: 'new_token' }),
      });

      await authService.refreshToken();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should call correct auth logout endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        json: vi.fn().mockResolvedValue({}),
      });

      await authService.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should call correct auth me endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
      });

      await authService.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/me',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should call correct auth health endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      });

      await authService.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/health',
        expect.anything()
      );
    });
  });

  describe('Conversation API Endpoints', () => {
    it('should call correct conversations list endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      });

      await apiClient.getConversations();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/conversations?',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should call correct create conversation endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      });

      await apiClient.createConversation({ title: 'Test', model: 'gpt-4', provider: 'openai' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/conversations',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should call correct update conversation title endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      await apiClient.updateConversationTitle('conv-1', 'New Title');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/conversations/conv-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'New Title' }),
        })
      );
    });

    it('should call correct streaming endpoint', async () => {
      // Mock a readable stream
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: vi.fn().mockReturnValue(mockReader),
        },
      });

      await apiClient.streamMessage(
        'conv-1',
        'Hello',
        vi.fn(),
        vi.fn(),
        vi.fn()
      );

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/conversations/conv-1/stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Accept': 'text/event-stream',
          }),
        })
      );
    });
  });

  describe('Search API Endpoints', () => {
    it('should call correct search GET endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ results: [] }),
      });

      await searchApiClient.searchMessages('test query');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/search?q=test+query',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should call correct search POST endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ results: [] }),
      });

      await searchApiClient.searchMessagesPost({ query: 'test', limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/search',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should call correct search health endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      });

      await searchApiClient.getSearchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/search/health',
        expect.anything()
      );
    });
  });

  describe('Analytics API Endpoints', () => {
    it('should call correct analytics overview endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ stats: {} }),
      });

      await analyticsApi.getOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/overview',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should call correct analytics health endpoint', async () => {
      // Analytics health doesn't use credentials in the current implementation
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      });
      global.fetch = mockFetch;

      await analyticsApi.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/health');
    });
  });

  describe('Health Check Endpoints', () => {
    it('should call correct main health endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      });

      await apiClient.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/health',
        expect.anything()
      );
    });
  });

  describe('Path Format Validation', () => {
    it('should not include /title suffix in conversation update paths', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      await apiClient.updateConversationTitle('conv-123', 'New Title');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('/api/v1/conversations/conv-123');
      expect(callArgs[0]).not.toContain('/title');
    });

    it('should use correct versioned auth paths', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: {}, access_token: 'token' }),
      });

      await authService.login({ email: 'test@example.com', password: 'pass' });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toMatch(/^\/api\/v1\/auth\//);
    });

    it('should use non-versioned analytics paths', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ stats: {} }),
      });

      await analyticsApi.getOverview();

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toMatch(/^\/api\/analytics\//);
      expect(callArgs[0]).not.toContain('/v1');
    });
  });
});