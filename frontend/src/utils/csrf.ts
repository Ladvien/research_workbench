/**
 * CSRF Protection Utility
 * Provides CSRF token management for API requests
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class CSRFManager {
  private static instance: CSRFManager;
  private token: string | null = null;
  private tokenPromise: Promise<string | null> | null = null;

  private constructor() {}

  static getInstance(): CSRFManager {
    if (!CSRFManager.instance) {
      CSRFManager.instance = new CSRFManager();
    }
    return CSRFManager.instance;
  }

  /**
   * Get CSRF token from server
   */
  async getToken(): Promise<string | null> {
    // If we already have a valid token, return it
    if (this.token) {
      return this.token;
    }

    // If a request is already in progress, wait for it
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Make the request
    this.tokenPromise = this.fetchToken();
    const token = await this.tokenPromise;
    this.tokenPromise = null;
    return token;
  }

  private async fetchToken(): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/csrf-token`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.token = data.csrf_token;
        
        // Clear token after 23 hours (tokens expire in 24 hours)
        setTimeout(() => {
          this.clearToken();
        }, 23 * 60 * 60 * 1000);
        
        return this.token;
      } else {
        console.warn('Failed to fetch CSRF token:', response.status);
        return null;
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);
      return null;
    }
  }

  /**
   * Clear the cached token (forces a refresh on next request)
   */
  clearToken(): void {
    this.token = null;
    this.tokenPromise = null;
  }

  /**
   * Add CSRF token to request headers if needed
   */
  async addCSRFHeaders(
    headers: Record<string, string> = {},
    method: string = 'GET'
  ): Promise<Record<string, string>> {
    // Only add CSRF token for unsafe methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
      const token = await this.getToken();
      if (token) {
        headers['X-CSRF-Token'] = token;
      }
    }
    return headers;
  }

  /**
   * Enhanced fetch with automatic CSRF protection
   */
  async protectedFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const method = options.method || 'GET';
    const headers = { ...options.headers } as Record<string, string>;

    // Add CSRF token if needed
    const protectedHeaders = await this.addCSRFHeaders(headers, method);

    // Make the request
    let response = await fetch(url, {
      ...options,
      headers: protectedHeaders,
      credentials: 'include', // Always include cookies
    });

    // If CSRF validation failed, try once more with fresh token
    if (
      response.status === 403 &&
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())
    ) {
      const errorText = await response.text();
      if (errorText.includes('CSRF') || errorText.includes('csrf')) {
        console.log('CSRF token invalid, refreshing and retrying...');
        this.clearToken();
        
        // Retry with fresh token
        const freshHeaders = await this.addCSRFHeaders(headers, method);
        response = await fetch(url, {
          ...options,
          headers: freshHeaders,
          credentials: 'include',
        });
      }
    }

    return response;
  }
}

// Export singleton instance
export const csrfManager = CSRFManager.getInstance();

/**
 * Helper function for making CSRF-protected API requests
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{
  data?: T;
  error?: string;
  status: number;
}> {
  try {
    const fullUrl = `${API_BASE_URL}${endpoint}`;
    const response = await csrfManager.protectedFetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: errorText || `HTTP ${response.status}`,
        status: response.status,
      };
    }

    // Handle non-JSON responses
    if (!contentType?.includes('application/json')) {
      return {
        data: {} as T,
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
 * Hook for using CSRF protection in React components
 */
export function useCSRF() {
  return {
    getToken: () => csrfManager.getToken(),
    clearToken: () => csrfManager.clearToken(),
    protectedFetch: (url: string, options?: RequestInit) =>
      csrfManager.protectedFetch(url, options),
    apiRequest: <T>(endpoint: string, options?: RequestInit) =>
      apiRequest<T>(endpoint, options),
  };
}