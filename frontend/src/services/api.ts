// API service for communicating with the workbench backend

import {
  Conversation,
  ConversationWithMessages,
  CreateConversationRequest,
  CreateMessageRequest,
  Message,
  PaginationParams,
  ApiResponse
} from '../types';
import { TokenStorage } from '../utils/storage';
import { authService } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

class ApiClient {
  private baseUrl: string;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Process the failed queue after token refresh
   */
  private processQueue(error: any, token: string | null = null): void {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token);
      }
    });

    this.failedQueue = [];
  }

  /**
   * Refresh token and retry failed requests
   */
  private async refreshTokenAndRetry(): Promise<string | null> {
    if (this.isRefreshing) {
      // If already refreshing, wait for the result
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      const response = await authService.refreshToken();

      if (response.data?.tokens) {
        TokenStorage.setTokens(response.data.tokens);
        const newToken = response.data.tokens.accessToken;
        this.processQueue(null, newToken);
        return newToken;
      } else {
        throw new Error('No tokens in refresh response');
      }
    } catch (error) {
      this.processQueue(error, null);

      // Clear tokens and redirect to login on refresh failure
      TokenStorage.clearTokens();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }

      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get authorization headers if token is available
   */
  private getAuthHeaders(): Record<string, string> {
    const token = TokenStorage.getAccessToken();
    if (token) {
      return {
        Authorization: `Bearer ${token}`,
      };
    }
    return {};
  }

  /**
   * Main request method with automatic token attachment and retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<ApiResponse<T>> {
    try {
      // Check if token is expiring soon and refresh proactively
      if (TokenStorage.isTokenExpiringSoon() && !this.isRefreshing) {
        try {
          await this.refreshTokenAndRetry();
        } catch (error) {
          // If refresh fails, continue with current token
          console.warn('Proactive token refresh failed:', error);
        }
      }

      const authHeaders = this.getAuthHeaders();

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
        credentials: 'include', // Include cookies for session management
        ...options,
      });

      // Handle 401 Unauthorized responses
      if (response.status === 401 && retryCount === 0) {
        try {
          await this.refreshTokenAndRetry();
          // Retry the request with new token
          return this.request(endpoint, options, retryCount + 1);
        } catch (refreshError) {
          // If refresh fails, return the 401 error
          const errorText = await response.text();
          return {
            error: errorText || 'Unauthorized',
            status: 401,
          };
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  }

  // Conversation endpoints
  async getConversations(pagination?: PaginationParams): Promise<ApiResponse<Conversation[]>> {
    const params = new URLSearchParams();
    if (pagination?.page) params.append('page', pagination.page.toString());
    if (pagination?.limit) params.append('limit', pagination.limit.toString());

    return this.request<Conversation[]>(
      `/api/conversations?${params.toString()}`
    );
  }

  async createConversation(request: CreateConversationRequest): Promise<ApiResponse<Conversation>> {
    return this.request<Conversation>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getConversation(id: string): Promise<ApiResponse<ConversationWithMessages>> {
    return this.request<ConversationWithMessages>(`/api/conversations/${id}`);
  }

  async updateConversationTitle(id: string, title: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/conversations/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  // Message endpoints
  async getMessages(conversationId: string): Promise<ApiResponse<{ messages: Message[]; conversation_id: string; total_count: number }>> {
    return this.request<{ messages: Message[]; conversation_id: string; total_count: number }>(
      `/api/conversations/${conversationId}/messages`
    );
  }

  async sendMessage(conversationId: string, content: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Streaming message endpoint using Server-Sent Events
  async streamMessage(
    conversationId: string,
    content: string,
    onToken: (token: string) => void,
    onError: (error: string) => void,
    onComplete: (messageId?: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    try {
      // Check if token is expiring soon and refresh proactively
      if (TokenStorage.isTokenExpiringSoon() && !this.isRefreshing) {
        try {
          await this.refreshTokenAndRetry();
        } catch (error) {
          console.warn('Proactive token refresh failed:', error);
        }
      }

      const authHeaders = this.getAuthHeaders();

      const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...authHeaders,
        },
        body: JSON.stringify({ content }),
        credentials: 'include',
        signal: abortSignal,
      });

      if (!response.ok) {
        // Handle 401 for streaming requests
        if (response.status === 401) {
          try {
            await this.refreshTokenAndRetry();
            // Retry the streaming request with new token
            return this.streamMessage(conversationId, content, onToken, onError, onComplete, abortSignal);
          } catch (refreshError) {
            onError('Authentication failed. Please log in again.');
            return;
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'token' && data.data?.content) {
                  onToken(data.data.content);
                } else if (data.type === 'done') {
                  onComplete(data.data?.messageId);
                  return;
                } else if (data.type === 'error') {
                  onError(data.data?.message || 'Unknown error');
                  return;
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Stream failed');
    }
  }

  async createMessageBranch(
    conversationId: string,
    parentId: string,
    content: string,
    role: 'user' | 'assistant' | 'system'
  ): Promise<ApiResponse<Message>> {
    return this.request<Message>(
      `/api/conversations/${conversationId}/messages/${parentId}/branch`,
      {
        method: 'POST',
        body: JSON.stringify({ content, role }),
      }
    );
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>('/health');
  }
}

export const apiClient = new ApiClient();
export default apiClient;