import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSearchStore } from './useSearchStore';
import { searchApiClient } from '../services/searchApi';
import type { SearchResponse } from '../types';

// Mock the search API client
vi.mock('../services/searchApi', () => ({
  searchApiClient: {
    searchMessages: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const mockSearchApiClient = vi.mocked(searchApiClient);

describe('useSearchStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    // Reset store state
    useSearchStore.getState().clearSearch();
    useSearchStore.getState().clearError();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useSearchStore());

      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.searchQuery).toBe('');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSearchTime).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should perform successful search', async () => {
      const mockResults = [
        {
          message_id: 'msg1',
          content: 'Test message 1',
          role: 'user' as const,
          created_at: '2023-01-01T00:00:00Z',
          conversation_id: 'conv1',
          conversation_title: 'Test Conversation',
          similarity: 0.95,
          preview: 'Test message...',
        },
      ];

      const mockResponse: SearchResponse = {
        query: 'test query',
        results: mockResults,
        total_found: 1,
      };

      mockSearchApiClient.searchMessages.mockResolvedValue({
        data: mockResponse,
        status: 200,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query', 10, 0.7);
      });

      expect(mockSearchApiClient.searchMessages).toHaveBeenCalledWith('test query', 10, 0.7);
      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchResults).toEqual(mockResults);
      expect(result.current.searchQuery).toBe('test query');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSearchTime).toBeDefined();
    });

    it('should use default values for limit and similarity_threshold', async () => {
      const mockResponse: SearchResponse = {
        query: 'test',
        results: [],
        total_found: 0,
      };

      mockSearchApiClient.searchMessages.mockResolvedValue({
        data: mockResponse,
        status: 200,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test');
      });

      expect(mockSearchApiClient.searchMessages).toHaveBeenCalledWith('test', 10, 0.7);
    });

    it('should trim whitespace from query', async () => {
      const mockResponse: SearchResponse = {
        query: 'test query',
        results: [],
        total_found: 0,
      };

      mockSearchApiClient.searchMessages.mockResolvedValue({
        data: mockResponse,
        status: 200,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('  test query  ');
      });

      expect(mockSearchApiClient.searchMessages).toHaveBeenCalledWith('test query', 10, 0.7);
    });

    it('should handle empty query', async () => {
      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('');
      });

      expect(mockSearchApiClient.searchMessages).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Search query cannot be empty');
      expect(result.current.isSearching).toBe(false);
    });

    it('should handle whitespace-only query', async () => {
      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('   ');
      });

      expect(mockSearchApiClient.searchMessages).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Search query cannot be empty');
      expect(result.current.isSearching).toBe(false);
    });

    it('should handle API response error', async () => {
      mockSearchApiClient.searchMessages.mockResolvedValue({
        error: 'Search service unavailable',
        status: 503,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBe('Search service unavailable');
      expect(result.current.searchResults).toEqual([]);
    });

    it('should handle network/fetch errors', async () => {
      const networkError = new Error('Network error');
      mockSearchApiClient.searchMessages.mockRejectedValue(networkError);

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.searchResults).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      mockSearchApiClient.searchMessages.mockRejectedValue('String error');

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBe('Search failed');
      expect(result.current.searchResults).toEqual([]);
    });

    it('should set loading state correctly during search', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      mockSearchApiClient.searchMessages.mockReturnValue(promise);

      const { result } = renderHook(() => useSearchStore());

      act(() => {
        result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(true);
      expect(result.current.error).toBeNull();

      await act(async () => {
        resolvePromise({
          data: { query: 'test query', results: [], total_found: 0 },
          status: 200,
        });
        await promise;
      });

      expect(result.current.isSearching).toBe(false);
    });

    it('should clear previous results on new search', async () => {
      const { result } = renderHook(() => useSearchStore());

      // Set some initial state
      act(() => {
        useSearchStore.setState({
          searchResults: [{
            message_id: 'old-msg',
            content: 'Old result',
            role: 'user',
            created_at: '2023-01-01T00:00:00Z',
            conversation_id: 'old-conv',
            similarity: 0.8,
            preview: 'Old...',
          }],
          error: 'Old error',
        });
      });

      mockSearchApiClient.searchMessages.mockResolvedValue({
        data: { query: 'new query', results: [], total_found: 0 },
        status: 200,
      });

      await act(async () => {
        await result.current.search('new query');
      });

      expect(result.current.searchResults).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('clearSearch', () => {
    it('should clear all search-related state', () => {
      const { result } = renderHook(() => useSearchStore());

      // Set some initial state
      act(() => {
        useSearchStore.setState({
          searchResults: [{
            message_id: 'msg1',
            content: 'Test',
            role: 'user',
            created_at: '2023-01-01T00:00:00Z',
            conversation_id: 'conv1',
            similarity: 0.9,
            preview: 'Test...',
          }],
          searchQuery: 'test query',
          error: 'Some error',
          lastSearchTime: '2023-01-01T00:00:00Z',
        });
      });

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.searchResults).toEqual([]);
      expect(result.current.searchQuery).toBe('');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSearchTime).toBeUndefined();
    });

    it('should not affect isSearching state', () => {
      const { result } = renderHook(() => useSearchStore());

      // Set isSearching to true
      act(() => {
        useSearchStore.setState({ isSearching: true });
      });

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.isSearching).toBe(true);
    });
  });

  describe('clearError', () => {
    it('should clear only error state', () => {
      const { result } = renderHook(() => useSearchStore());

      // Set some initial state
      act(() => {
        useSearchStore.setState({
          searchResults: [{
            message_id: 'msg1',
            content: 'Test',
            role: 'user',
            created_at: '2023-01-01T00:00:00Z',
            conversation_id: 'conv1',
            similarity: 0.9,
            preview: 'Test...',
          }],
          searchQuery: 'test query',
          error: 'Some error',
          lastSearchTime: '2023-01-01T00:00:00Z',
          isSearching: false,
        });
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      // Other state should remain unchanged
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchQuery).toBe('test query');
      expect(result.current.lastSearchTime).toBe('2023-01-01T00:00:00Z');
      expect(result.current.isSearching).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist specific fields to localStorage', () => {
      const { result } = renderHook(() => useSearchStore());

      act(() => {
        useSearchStore.setState({
          searchQuery: 'persistent query',
          searchResults: [{
            message_id: 'msg1',
            content: 'Persistent result',
            role: 'user',
            created_at: '2023-01-01T00:00:00Z',
            conversation_id: 'conv1',
            similarity: 0.9,
            preview: 'Persistent...',
          }],
          lastSearchTime: '2023-01-01T00:00:00Z',
          isSearching: true, // Should not be persisted
          error: 'Some error', // Should not be persisted
        });
      });

      // The persist middleware should have been called
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should restore state from localStorage', () => {
      const persistedState = {
        searchQuery: 'restored query',
        searchResults: [{
          message_id: 'msg1',
          content: 'Restored result',
          role: 'user',
          created_at: '2023-01-01T00:00:00Z',
          conversation_id: 'conv1',
          similarity: 0.9,
          preview: 'Restored...',
        }],
        lastSearchTime: '2023-01-01T00:00:00Z',
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        state: persistedState,
        version: 0,
      }));

      // Create a new hook instance to trigger persistence restoration
      const { result } = renderHook(() => useSearchStore());

      expect(result.current.searchQuery).toBe('restored query');
      expect(result.current.searchResults).toEqual(persistedState.searchResults);
      expect(result.current.lastSearchTime).toBe('2023-01-01T00:00:00Z');
      // Non-persisted fields should have default values
      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle API response without data field', async () => {
      mockSearchApiClient.searchMessages.mockResolvedValue({
        status: 200,
      } as any);

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchResults).toEqual([]);
    });

    it('should handle concurrent searches correctly', async () => {
      let resolveFirst: (value: any) => void;
      let resolveSecond: (value: any) => void;
      
      const firstPromise = new Promise(resolve => {
        resolveFirst = resolve;
      });
      const secondPromise = new Promise(resolve => {
        resolveSecond = resolve;
      });

      mockSearchApiClient.searchMessages
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(secondPromise);

      const { result } = renderHook(() => useSearchStore());

      // Start first search
      act(() => {
        result.current.search('first query');
      });

      // Start second search before first completes
      act(() => {
        result.current.search('second query');
      });

      // Complete searches in reverse order
      await act(async () => {
        resolveSecond({
          data: { query: 'second query', results: [{ message_id: 'msg2' }], total_found: 1 },
          status: 200,
        });
        await secondPromise;
      });

      await act(async () => {
        resolveFirst({
          data: { query: 'first query', results: [{ message_id: 'msg1' }], total_found: 1 },
          status: 200,
        });
        await firstPromise;
      });

      // The last completed search should win
      expect(result.current.searchQuery).toBe('first query');
    });

    it('should handle malformed localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      // Should not throw error
      const { result } = renderHook(() => useSearchStore());

      expect(result.current.searchQuery).toBe('');
      expect(result.current.searchResults).toEqual([]);
    });
  });
});
