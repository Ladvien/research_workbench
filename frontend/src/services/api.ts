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
import { authService } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
   * Refresh session and retry failed requests
   */
  private async refreshSessionAndRetry(): Promise<boolean> {
    if (this.isRefreshing) {
      // If already refreshing, wait for the result
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      const response = await authService.refreshToken();

      if (response.data) {
        this.processQueue(null, 'success');
        return true;
      } else {
        throw new Error('Session refresh failed');
      }
    } catch (error) {
      this.processQueue(error, null);

      // Redirect to login on refresh failure
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }

      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get base headers for requests (no explicit auth headers needed for cookies)
   */
  private getBaseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Main request method with automatic session management and retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<ApiResponse<T>> {
    try {
      const baseHeaders = this.getBaseHeaders();

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...baseHeaders,
          ...options.headers,
        },
        credentials: 'include', // Include cookies for session management
        ...options,
      });

      // Handle 401 Unauthorized responses
      if (response.status === 401 && retryCount === 0) {
        try {
          await this.refreshSessionAndRetry();
          // Retry the request with refreshed session
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
      `/api/v1/conversations?${params.toString()}`
    );
  }

  async createConversation(request: CreateConversationRequest): Promise<ApiResponse<Conversation>> {
    console.log('[ApiClient] Creating conversation with request:', request);
    const response = await this.request<Conversation>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    console.log('[ApiClient] Create conversation response:', response);
    return response;
  }

  async getConversation(id: string): Promise<ApiResponse<ConversationWithMessages>> {
    return this.request<ConversationWithMessages>(`/api/v1/conversations/${id}`);
  }

  async updateConversationTitle(id: string, title: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/conversations/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  // Message endpoints
  async getMessages(conversationId: string): Promise<ApiResponse<{ messages: Message[]; conversation_id: string; total_count: number }>> {
    return this.request<{ messages: Message[]; conversation_id: string; total_count: number }>(
      `/api/v1/conversations/${conversationId}/messages`
    );
  }

  async sendMessage(conversationId: string, content: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/conversations/${conversationId}/messages`, {
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
      const baseHeaders = this.getBaseHeaders();

      const requestBody = { content };
      console.log('[ApiClient] Streaming message request:', {
        conversationId,
        contentLength: content.length,
        requestBody,
        url: `${this.baseUrl}/api/v1/conversations/${conversationId}/stream`
      });

      const response = await fetch(`${this.baseUrl}/api/v1/conversations/${conversationId}/stream`, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
        signal: abortSignal,
      });

      console.log('[ApiClient] Streaming response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        // Handle 401 for streaming requests
        if (response.status === 401) {
          try {
            await this.refreshSessionAndRetry();
            // Retry the streaming request with refreshed session
            return this.streamMessage(conversationId, content, onToken, onError, onComplete, abortSignal);
          } catch (refreshError) {
            onError('Authentication failed. Please log in again.');
            return;
          }
        }

        // Handle 404 - conversation not found
        if (response.status === 404) {
          console.log('[ApiClient] Conversation not found (404), will create new conversation');
          // Return a specific error that the store can handle
          onError('CONVERSATION_NOT_FOUND');
          return;
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
          console.log('[ApiClient] Stream read:', { done, valueLength: value?.length });

          if (done) {
            console.log('[ApiClient] Stream reading complete');
            break;
          }

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          console.log('[ApiClient] Received chunk:', chunk);
          console.log('[ApiClient] Current buffer:', buffer);

          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          console.log('[ApiClient] Processing lines:', lines);

          for (const line of lines) {
            console.log('[ApiClient] Processing line:', line);

            // Skip empty lines and SSE comments
            if (!line.trim() || line.startsWith(':')) {
              continue;
            }

            if (line.startsWith('data: ')) {
              try {
                const dataStr = line.slice(6).trim();

                // Skip the "[DONE]" message if present
                if (dataStr === '[DONE]') {
                  console.log('[ApiClient] Received [DONE] signal');
                  continue;
                }

                const data = JSON.parse(dataStr);
                console.log('[ApiClient] Parsed SSE data:', data);

                if (data.type === 'token' && data.data?.content) {
                  console.log('[ApiClient] Calling onToken with:', data.data.content);
                  onToken(data.data.content);
                } else if (data.type === 'done') {
                  console.log('[ApiClient] Stream complete, messageId:', data.data?.messageId);
                  onComplete(data.data?.messageId);
                  return;
                } else if (data.type === 'error') {
                  console.error('[ApiClient] Stream error:', data.data?.message);
                  onError(data.data?.message || 'Unknown error');
                  return;
                } else {
                  console.log('[ApiClient] Unknown stream event type:', data);
                }
              } catch (parseError) {
                console.warn('[ApiClient] Failed to parse SSE data:', line, parseError);
              }
            } else if (line.trim() && !line.startsWith(':')) {
              console.log('[ApiClient] Non-data SSE line:', line);
            }
          }
        }
      } finally {
        reader.releaseLock();
        console.log('[ApiClient] Stream reader released');
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
      `/api/v1/conversations/${conversationId}/messages/${parentId}/branch`,
      {
        method: 'POST',
        body: JSON.stringify({ content, role }),
      }
    );
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>('/api/v1/health');
  }
}

export const apiClient = new ApiClient();
export default apiClient;