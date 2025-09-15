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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        credentials: 'include', // Include cookies for JWT authentication
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Handle authentication errors
        if (response.status === 401) {
          // Token expired or invalid - let auth context handle this
          return {
            error: 'Authentication required',
            status: response.status,
          };
        }

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
      const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}/stream`, {
        method: 'POST',
        credentials: 'include', // Include auth cookies
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ content }),
        signal: abortSignal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          onError('Authentication required');
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