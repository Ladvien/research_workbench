import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './api';
import { authService } from './auth';
import type {
  Conversation,
  ConversationWithMessages,
  CreateConversationRequest,
  Message,
  PaginationParams,
} from '../types';

// Mock the authService
vi.mock('./auth', () => ({
  authService: {
    refreshToken: vi.fn(),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location for redirect tests
const mockLocation = {
  href: '',
  pathname: '/',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

const mockAuthService = vi.mocked(authService);

describe('ApiClient', () => {
  const mockConversation: Conversation = {
    id: 'conv-123',
    user_id: 'user-456',
    title: 'Test Conversation',
    model: 'claude-3',
    provider: 'anthropic',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    metadata: {},
  };

  const mockMessage: Message = {
    id: 'msg-789',
    conversation_id: 'conv-123',
    role: 'user',
    content: 'Hello, world!',
    created_at: '2023-01-01T00:00:00Z',
    is_active: true,
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    mockLocation.href = '';
    mockLocation.pathname = '/';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('request method', () => {
    it('should make successful request with correct headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/health',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );
      expect(result.data).toEqual({ data: 'test' });
      expect(result.status).toBe(200);
    });

    it('should handle 401 errors with token refresh', async () => {
      const unauthorizedResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      };

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        .mockResolvedValueOnce(successResponse);
      
      mockAuthService.refreshToken.mockResolvedValue({ data: 'refreshed' });

      const result = await apiClient.healthCheck();

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ status: 'ok' });
    });

    it('should handle 401 errors when refresh fails', async () => {
      const unauthorizedResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };

      mockFetch.mockResolvedValue(unauthorizedResponse);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));

      const result = await apiClient.healthCheck();

      expect(result.error).toBe('Unauthorized');
      expect(result.status).toBe(401);
    });

    it('should redirect to login on refresh failure', async () => {
      const unauthorizedResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };

      mockFetch.mockResolvedValue(unauthorizedResponse);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));
      mockLocation.pathname = '/dashboard';

      await expect(apiClient.healthCheck()).rejects.toThrow();

      expect(mockLocation.href).toBe('/login');
    });

    it('should not redirect when already on login page', async () => {
      const unauthorizedResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };

      mockFetch.mockResolvedValue(unauthorizedResponse);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));
      mockLocation.pathname = '/login';

      await expect(apiClient.healthCheck()).rejects.toThrow();

      expect(mockLocation.href).toBe('');
    });

    it('should handle HTTP errors', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };
      mockFetch.mockResolvedValue(errorResponse);

      const result = await apiClient.healthCheck();

      expect(result.error).toBe('Internal Server Error');
      expect(result.status).toBe(500);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const result = await apiClient.healthCheck();

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const result = await apiClient.healthCheck();

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });
  });

  describe('conversation endpoints', () => {
    describe('getConversations', () => {
      it('should fetch conversations without pagination', async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue([mockConversation]),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.getConversations();

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations?',
          expect.any(Object)
        );
        expect(result.data).toEqual([mockConversation]);
      });

      it('should fetch conversations with pagination', async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue([mockConversation]),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const pagination: PaginationParams = { page: 2, limit: 10 };
        const result = await apiClient.getConversations(pagination);

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations?page=2&limit=10',
          expect.any(Object)
        );
        expect(result.data).toEqual([mockConversation]);
      });
    });

    describe('createConversation', () => {
      it('should create conversation successfully', async () => {
        const mockResponse = {
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue(mockConversation),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const request: CreateConversationRequest = {
          title: 'New Conversation',
          model: 'claude-3',
          provider: 'anthropic',
          metadata: { key: 'value' },
        };

        const result = await apiClient.createConversation(request);

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            credentials: 'include',
          }
        );
        expect(result.data).toEqual(mockConversation);
      });
    });

    describe('getConversation', () => {
      it('should fetch conversation with messages', async () => {
        const mockConversationWithMessages: ConversationWithMessages = {
          conversation: mockConversation,
          messages: [mockMessage],
        };
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockConversationWithMessages),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.getConversation('conv-123');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123',
          expect.any(Object)
        );
        expect(result.data).toEqual(mockConversationWithMessages);
      });
    });

    describe('updateConversationTitle', () => {
      it('should update conversation title', async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({}),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.updateConversationTitle('conv-123', 'New Title');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123/title',
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: 'New Title' }),
            credentials: 'include',
          }
        );
        expect(result.status).toBe(200);
      });
    });

    describe('deleteConversation', () => {
      it('should delete conversation', async () => {
        const mockResponse = {
          ok: true,
          status: 204,
          json: vi.fn().mockResolvedValue({}),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.deleteConversation('conv-123');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123',
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          }
        );
        expect(result.status).toBe(204);
      });
    });
  });

  describe('message endpoints', () => {
    describe('getMessages', () => {
      it('should fetch messages for conversation', async () => {
        const mockMessagesResponse = {
          messages: [mockMessage],
          conversation_id: 'conv-123',
          total_count: 1,
        };
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockMessagesResponse),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.getMessages('conv-123');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123/messages',
          expect.any(Object)
        );
        expect(result.data).toEqual(mockMessagesResponse);
      });
    });

    describe('sendMessage', () => {
      it('should send message to conversation', async () => {
        const mockResponse = {
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue({ success: true }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.sendMessage('conv-123', 'Hello!');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: 'Hello!' }),
            credentials: 'include',
          }
        );
        expect(result.data).toEqual({ success: true });
      });
    });

    describe('createMessageBranch', () => {
      it('should create message branch', async () => {
        const mockResponse = {
          ok: true,
          status: 201,
          json: vi.fn().mockResolvedValue(mockMessage),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await apiClient.createMessageBranch(
          'conv-123',
          'parent-456',
          'Branch content',
          'user'
        );

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/conversations/conv-123/messages/parent-456/branch',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: 'Branch content', role: 'user' }),
            credentials: 'include',
          }
        );
        expect(result.data).toEqual(mockMessage);
      });
    });
  });

  describe('streamMessage', () => {
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
        headers: new Map([['content-type', 'text/event-stream']]),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader),
        },
      };
    });

    it('should handle streaming messages successfully', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const chunks = [
        'data: {"type":"token","data":{"content":"Hello"}}\n\n',
        'data: {"type":"token","data":{"content":" world"}}\n\n',
        'data: {"type":"done","data":{"messageId":"msg-123"}}\n\n',
      ];

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[2]) })
        .mockResolvedValueOnce({ done: true });

      mockFetch.mockResolvedValue(mockResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onToken).toHaveBeenCalledWith('Hello');
      expect(onToken).toHaveBeenCalledWith(' world');
      expect(onComplete).toHaveBeenCalledWith('msg-123');
      expect(onError).not.toHaveBeenCalled();
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle conversation not found error', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const notFoundResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      mockFetch.mockResolvedValue(notFoundResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onError).toHaveBeenCalledWith('CONVERSATION_NOT_FOUND');
      expect(onToken).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should handle 401 errors with token refresh in streaming', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const unauthorizedResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        .mockResolvedValueOnce(mockResponse);

      mockAuthService.refreshToken.mockResolvedValue({ data: 'refreshed' });

      mockReader.read.mockResolvedValue({ done: true });

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle authentication failure in streaming', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const unauthorizedResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };
      mockFetch.mockResolvedValue(unauthorizedResponse);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Refresh failed'));

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onError).toHaveBeenCalledWith('Authentication failed. Please log in again.');
    });

    it('should handle stream errors', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const errorChunk = 'data: {"type":"error","data":{"message":"Stream error"}}\n\n';
      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(errorChunk) })
        .mockResolvedValueOnce({ done: true });

      mockFetch.mockResolvedValue(mockResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onError).toHaveBeenCalledWith('Stream error');
    });

    it('should handle malformed JSON in stream', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const malformedChunk = 'data: {invalid json}\n\n';
      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(malformedChunk) })
        .mockResolvedValueOnce({ done: true });

      mockFetch.mockResolvedValue(mockResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      // Should not call onError for malformed JSON, just skip the chunk
      expect(onToken).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(); // Called with no messageId
    });

    it('should handle [DONE] signal', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const doneChunk = 'data: [DONE]\n\n';
      mockReader.read
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(doneChunk) })
        .mockResolvedValueOnce({ done: true });

      mockFetch.mockResolvedValue(mockResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onComplete).toHaveBeenCalledWith();
    });

    it('should handle abort signal', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();
      const abortController = new AbortController();

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete,
        abortController.signal
      );

      expect(onError).toHaveBeenCalledWith('Aborted');
    });

    it('should handle null response body', async () => {
      const onToken = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const nullBodyResponse = {
        ok: true,
        status: 200,
        body: null,
      };
      mockFetch.mockResolvedValue(nullBodyResponse);

      await apiClient.streamMessage(
        'conv-123',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(onError).toHaveBeenCalledWith('Response body is null');
    });
  });

  describe('healthCheck', () => {
    it('should perform health check', async () => {
      const mockHealthResponse = { status: 'ok' };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockHealthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/health',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockHealthResponse);
    });
  });

  describe('edge cases', () => {
    it('should handle empty response text gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient.healthCheck();

      expect(result.error).toBe('HTTP 500');
      expect(result.status).toBe(500);
    });

    it('should handle request with custom headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Test internal request method behavior by calling sendMessage with headers
      await apiClient.sendMessage('conv-123', 'test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});
