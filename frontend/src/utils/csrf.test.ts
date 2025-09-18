/**
 * CSRF Protection Tests
 * 
 * Tests for CSRF token management and API protection
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { csrfManager, apiRequest } from './csrf';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CSRF Protection', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    csrfManager.clearToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CSRFManager', () => {
    test('should fetch CSRF token from server', async () => {
      const mockToken = 'test-csrf-token-123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken, timestamp: Date.now() }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const token = await csrfManager.getToken();
      expect(token).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/csrf-token',
        expect.objectContaining({
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    test('should cache CSRF token', async () => {
      const mockToken = 'test-csrf-token-123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken }),
      });

      const token1 = await csrfManager.getToken();
      const token2 = await csrfManager.getToken();
      
      expect(token1).toBe(mockToken);
      expect(token2).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once due to caching
    });

    test('should handle CSRF token fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const token = await csrfManager.getToken();
      expect(token).toBeNull();
    });

    test('should add CSRF headers for unsafe methods', async () => {
      const mockToken = 'test-csrf-token-123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken }),
      });

      const headers = await csrfManager.addCSRFHeaders({}, 'POST');
      expect(headers['X-CSRF-Token']).toBe(mockToken);
    });

    test('should not add CSRF headers for safe methods', async () => {
      const headers = await csrfManager.addCSRFHeaders({}, 'GET');
      expect(headers['X-CSRF-Token']).toBeUndefined();
    });

    test('should clear token on demand', async () => {
      const mockToken = 'test-csrf-token-123456789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken }),
      });

      await csrfManager.getToken();
      csrfManager.clearToken();
      
      // Should fetch again after clearing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: 'new-token' }),
      });
      
      const newToken = await csrfManager.getToken();
      expect(newToken).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Protected Fetch', () => {
    test('should make successful protected request', async () => {
      const mockToken = 'test-csrf-token-123456789';
      
      // Mock CSRF token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken }),
      });
      
      // Mock actual API request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const response = await csrfManager.protectedFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Token fetch + actual request
      
      // Check that CSRF token was included in request
      const actualRequestCall = mockFetch.mock.calls[1];
      expect(actualRequestCall[1].headers['X-CSRF-Token']).toBe(mockToken);
    });

    test('should retry on CSRF validation failure', async () => {
      const mockToken1 = 'old-csrf-token';
      const mockToken2 = 'new-csrf-token';
      
      // Mock initial CSRF token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken1 }),
      });
      
      // Mock CSRF validation failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'CSRF validation failed',
      });
      
      // Mock new CSRF token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken2 }),
      });
      
      // Mock successful retry
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const response = await csrfManager.protectedFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4); // Token + failed request + new token + retry
    });

    test('should not add CSRF token for GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      await csrfManager.protectedFetch('/api/test', { method: 'GET' });
      
      const requestCall = mockFetch.mock.calls[0];
      expect(requestCall[1].headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  describe('API Request Helper', () => {
    test('should make successful API request with CSRF protection', async () => {
      const mockToken = 'test-csrf-token-123456789';
      const mockData = { id: 1, name: 'Test' };
      
      // Mock CSRF token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrf_token: mockToken }),
      });
      
      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      expect(result.data).toEqual(mockData);
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    test('should handle API request errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const result = await apiRequest('/api/users', { method: 'GET' });

      expect(result.data).toBeUndefined();
      expect(result.status).toBe(400);
      expect(result.error).toBe('Bad Request');
    });

    test('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await apiRequest('/api/users', { method: 'GET' });

      expect(result.data).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.error).toBe('Network error');
    });

    test('should handle non-JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const result = await apiRequest('/api/users/1', { method: 'DELETE' });

      expect(result.data).toEqual({});
      expect(result.status).toBe(204);
      expect(result.error).toBeUndefined();
    });
  });

  describe('useCSRF Hook', () => {
    test('should provide CSRF utilities', () => {
      const { useCSRF } = require('./csrf');
      const csrf = useCSRF();
      
      expect(typeof csrf.getToken).toBe('function');
      expect(typeof csrf.clearToken).toBe('function');
      expect(typeof csrf.protectedFetch).toBe('function');
      expect(typeof csrf.apiRequest).toBe('function');
    });
  });
});