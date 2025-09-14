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
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

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