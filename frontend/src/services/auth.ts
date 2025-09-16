// Authentication service for handling login/register/token management
import { AuthResponse, LoginRequest, RegisterRequest, User, ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export class AuthService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic request method for auth endpoints (no token required)
   */
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
        credentials: 'include', // Include cookies for session management
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

  /**
   * User login
   */
  async login(request: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * User registration
   */
  async register(request: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * User logout
   */
  async logout(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/auth/logout', {
      method: 'POST',
    });
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/api/v1/auth/me');
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>('/api/v1/auth/refresh', {
      method: 'POST',
    });
  }

  /**
   * Health check for auth service
   */
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>('/api/v1/auth/health');
  }
}

export const authService = new AuthService();
export default authService;