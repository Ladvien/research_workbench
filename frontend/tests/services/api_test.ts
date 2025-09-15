// Comprehensive tests for API client with authorization headers
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient from '../../src/services/api';
import { TokenStorage } from '../../src/utils/storage';
import { authService } from '../../src/services/auth';
import { AuthTokens } from '../../src/types';

// Mock dependencies
vi.mock('../../src/utils/storage', () => ({
  TokenStorage: {
    getAccessToken: vi.fn(),
    hasValidToken: vi.fn(),
    isTokenExpiringSoon: vi.fn(),
    clearTokens: vi.fn(),
    setTokens: vi.fn(),
    getTokens: vi.fn(),
  }
}));

vi.mock('../../src/services/auth', () => ({
  authService: {
    refreshToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    register: vi.fn(),
    healthCheck: vi.fn(),
  }
}));

const mockTokenStorage = TokenStorage as any;
const mockAuthService = authService as any;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock tokens
const createMockTokens = (expiresInMinutes = 60): AuthTokens => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresAt: Date.now() + (expiresInMinutes * 60 * 1000),
});

describe('ApiClient with Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
      text: () => Promise.resolve(''),
    });

    // Reset TokenStorage mocks
    mockTokenStorage.getAccessToken.mockReturnValue(null);
    mockTokenStorage.hasValidToken.mockReturnValue(false);
    mockTokenStorage.isTokenExpiringSoon.mockReturnValue(false);
    mockTokenStorage.clearTokens.mockImplementation(() => {});
    mockTokenStorage.setTokens.mockImplementation(() => {});

    // Reset AuthService mocks
    mockAuthService.refreshToken.mockResolvedValue({
      data: { tokens: createMockTokens() },
      status: 200,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authorization Headers', () => {
    it('should include Authorization header when token is available', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('test-token');

      await apiClient.getConversations();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should not include Authorization header when no token is available', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue(null);

      await apiClient.getConversations();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations'),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String),
          }),
        })
      );
    });

    it('should include credentials in all requests', async () => {
      await apiClient.getConversations();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });
  });

  describe('Token Refresh Logic', () => {
    it('should refresh token proactively when expiring soon', async () => {
      mockTokenStorage.isTokenExpiringSoon.mockReturnValue(true);
      mockTokenStorage.getAccessToken.mockReturnValue('old-token');

      await apiClient.getConversations();

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(mockTokenStorage.setTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock-access-token',
        })
      );
    });

    it('should not refresh token when not expiring soon', async () => {
      mockTokenStorage.isTokenExpiringSoon.mockReturnValue(false);
      mockTokenStorage.getAccessToken.mockReturnValue('valid-token');

      await apiClient.getConversations();

      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('401 Unauthorized Handling', () => {
    it('should retry request after token refresh on 401', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('expired-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      // Second call (after refresh) returns success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ conversations: [] }),
      });

      const result = await apiClient.getConversations();

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ conversations: [] });
    });

    it('should clear tokens and redirect on refresh failure', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('expired-token');

      // Mock failed refresh
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));

      // Mock window.location
      const mockLocation = { href: '' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await apiClient.getConversations();

      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
      expect(mockLocation.href).toBe('/login');
      expect(result.status).toBe(401);
    });

    it('should handle concurrent 401 requests correctly', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('expired-token');

      // Both requests return 401 initially
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      // Make concurrent requests
      const promise1 = apiClient.getConversations();
      const promise2 = apiClient.getConversation('test-id');

      await Promise.all([promise1, promise2]);

      // Refresh should only be called once despite multiple 401s
      expect(mockAuthService.refreshToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Streaming with Authorization', () => {
    let mockReader: any;
    let mockResponse: any;

    beforeEach(() => {
      mockReader = {
        read: vi.fn(),
        releaseLock: vi.fn(),
      };

      mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      };

      mockFetch.mockResolvedValue(mockResponse);
    });

    it('should include Authorization header in streaming requests', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('stream-token');

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"token","data":{"content":"Hello"}}\n\n') })
        .mockResolvedValueOnce({ done: true });

      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      await apiClient.streamMessage('conv-1', 'Hello', onToken, onError, onComplete);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stream'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer stream-token',
          }),
        })
      );
    });

    it('should retry streaming request on 401', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('expired-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      // Second call (after refresh) returns success
      mockFetch.mockResolvedValueOnce(mockResponse);

      mockReader.read.mockResolvedValue({ done: true });

      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      await apiClient.streamMessage('conv-1', 'Hello', onToken, onError, onComplete);

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should call onError when streaming refresh fails', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('expired-token');
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      await apiClient.streamMessage('conv-1', 'Hello', onToken, onError, onComplete);

      expect(onError).toHaveBeenCalledWith('Authentication failed. Please log in again.');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await apiClient.getConversations();

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });

    it('should handle non-401 HTTP errors without retry', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await apiClient.getConversations();

      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
      expect(result.error).toBe('Internal Server Error');
      expect(result.status).toBe(500);
    });
  });

  describe('Conversation API with Auth', () => {
    beforeEach(() => {
      mockTokenStorage.getAccessToken.mockReturnValue('valid-token');
    });

    it('should create conversation with auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'new-conv', title: 'Test' }),
      });

      await apiClient.createConversation({
        title: 'Test Conversation',
        model: 'gpt-4'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
          }),
        })
      );
    });

    it('should send message with auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'msg-1', content: 'Hello' }),
      });

      await apiClient.sendMessage('conv-1', 'Hello');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-1/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
          }),
        })
      );
    });
  });
});