// Search API service for semantic search functionality

import {
  SearchRequest,
  SearchResponse,
  ApiResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

class SearchApiClient {
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
        credentials: 'include', // Include cookies for authentication
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

  // Search messages using GET request with query parameters
  async searchMessages(
    query: string,
    limit?: number,
    similarityThreshold?: number
  ): Promise<ApiResponse<SearchResponse>> {
    const params = new URLSearchParams();
    params.append('q', query);
    if (limit) params.append('limit', limit.toString());
    if (similarityThreshold) params.append('similarity_threshold', similarityThreshold.toString());

    return this.request<SearchResponse>(
      `/api/v1/search?${params.toString()}`
    );
  }

  // Search messages using POST request with JSON body
  async searchMessagesPost(request: SearchRequest): Promise<ApiResponse<SearchResponse>> {
    return this.request<SearchResponse>('/api/v1/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Trigger background embedding generation job (admin only)
  async triggerEmbeddingJob(): Promise<ApiResponse<{ processed_count: number; success: boolean }>> {
    return this.request<{ processed_count: number; success: boolean }>('/api/v1/search/embedding-job', {
      method: 'POST',
    });
  }

  // Get search service health
  async getSearchHealth(): Promise<ApiResponse<{ status: string; service: string; timestamp: string }>> {
    return this.request<{ status: string; service: string; timestamp: string }>('/api/v1/search/health');
  }

  // Get search statistics
  async getSearchStats(): Promise<ApiResponse<{ pending_embeddings: number; timestamp: string }>> {
    return this.request<{ pending_embeddings: number; timestamp: string }>('/api/v1/search/stats');
  }
}

export const searchApiClient = new SearchApiClient();
export default searchApiClient;