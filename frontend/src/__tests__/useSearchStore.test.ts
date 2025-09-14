// Tests for useSearchStore hook

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchStore } from '../hooks/useSearchStore';
import { searchApiClient } from '../services/searchApi';

// Mock the search API client
vi.mock('../services/searchApi');

const mockSearchApiClient = vi.mocked(searchApiClient);

describe('useSearchStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useSearchStore());
    act(() => {
      result.current.clearSearch();
      result.current.clearError();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('has correct initial state', () => {
      const { result } = renderHook(() => useSearchStore());

      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.searchQuery).toBe('');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSearchTime).toBeUndefined();
    });
  });

  describe('Search Functionality', () => {
    const mockSearchResults = [
      {
        message_id: '1',
        content: 'Test message content',
        role: 'user' as const,
        created_at: '2023-01-01T00:00:00Z',
        conversation_id: 'conv-1',
        conversation_title: 'Test Conversation',
        similarity: 0.95,
        preview: 'Test message...',
      },
      {
        message_id: '2',
        content: 'Another message',
        role: 'assistant' as const,
        created_at: '2023-01-02T00:00:00Z',
        conversation_id: 'conv-2',
        conversation_title: null,
        similarity: 0.85,
        preview: 'Another message...',
      },
    ];

    it('performs successful search', async () => {
      mockSearchApiClient.searchMessages.mockResolvedValueOnce({
        data: {
          query: 'test query',
          results: mockSearchResults,
          total_found: 2,
        },
        status: 200,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(mockSearchApiClient.searchMessages).toHaveBeenCalledWith('test query', 10, 0.7);
      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchResults).toEqual(mockSearchResults);
      expect(result.current.searchQuery).toBe('test query');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSearchTime).toBeDefined();
    });

    it('performs search with custom parameters', async () => {
      mockSearchApiClient.searchMessages.mockResolvedValueOnce({
        data: {
          query: 'test query',
          results: mockSearchResults,
          total_found: 2,
        },
        status: 200,
      });

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query', 20, 0.8);
      });

      expect(mockSearchApiClient.searchMessages).toHaveBeenCalledWith('test query', 20, 0.8);
    });

    it('sets loading state during search', async () => {
      let resolveSearch: (value: any) => void;
      const searchPromise = new Promise((resolve) => {
        resolveSearch = resolve;
      });
      mockSearchApiClient.searchMessages.mockReturnValueOnce(searchPromise);

      const { result } = renderHook(() => useSearchStore());

      act(() => {
        result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(true);

      await act(async () => {
        resolveSearch({
          data: {
            query: 'test query',
            results: [],
            total_found: 0,
          },
          status: 200,
        });
        await searchPromise;
      });

      expect(result.current.isSearching).toBe(false);
    });

    it('handles empty query', async () => {
      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('');
      });

      expect(mockSearchApiClient.searchMessages).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Search query cannot be empty');
    });

    it('handles whitespace-only query', async () => {
      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('   ');
      });

      expect(mockSearchApiClient.searchMessages).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Search query cannot be empty');
    });

    it('handles API error response', async () => {
      mockSearchApiClient.searchMessages.mockResolvedValueOnce({
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

    it('handles network error', async () => {
      mockSearchApiClient.searchMessages.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.searchResults).toEqual([]);
    });

    it('handles unknown error', async () => {
      mockSearchApiClient.searchMessages.mockRejectedValueOnce('Unknown error');

      const { result } = renderHook(() => useSearchStore());

      await act(async () => {
        await result.current.search('test query');
      });

      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBe('Search failed');
      expect(result.current.searchResults).toEqual([]);
    });
  });

  describe('Clear Functionality', () => {
    it('clears search results and query', () => {
      const { result } = renderHook(() => useSearchStore());

      // Set some initial state
      act(() => {
        result.current.search('test').then(() => {
          // Manually set state to simulate a completed search
          useSearchStore.setState({
            searchResults: [
              {
                message_id: '1',
                content: 'Test message',
                role: 'user',
                created_at: '2023-01-01T00:00:00Z',
                conversation_id: 'conv-1',
                conversation_title: 'Test',
                similarity: 0.9,
                preview: 'Test...',
              },
            ],
            searchQuery: 'test',
            lastSearchTime: new Date().toISOString(),
          });
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

    it('clears error', () => {
      const { result } = renderHook(() => useSearchStore());

      // Set error state
      act(() => {
        useSearchStore.setState({ error: 'Test error' });
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('State Persistence', () => {
    it('persists search query', () => {
      const { result: result1 } = renderHook(() => useSearchStore());

      act(() => {
        useSearchStore.setState({
          searchQuery: 'persistent query',
          searchResults: [],
          lastSearchTime: '2023-01-01T00:00:00Z',
        });
      });

      // Simulate remounting the hook (new render)
      const { result: result2 } = renderHook(() => useSearchStore());

      expect(result2.current.searchQuery).toBe('persistent query');
      expect(result2.current.lastSearchTime).toBe('2023-01-01T00:00:00Z');
    });

    it('does not persist temporary states', () => {
      const { result: result1 } = renderHook(() => useSearchStore());

      act(() => {
        useSearchStore.setState({
          isSearching: true,
          error: 'Temporary error',
        });
      });

      // Simulate remounting the hook (new render)
      const { result: result2 } = renderHook(() => useSearchStore());

      expect(result2.current.isSearching).toBe(false);
      expect(result2.current.error).toBeNull();
    });
  });

  describe('Concurrent Searches', () => {
    it('handles concurrent searches correctly', async () => {
      let resolveFirst: (value: any) => void;
      let resolveSecond: (value: any) => void;

      const firstSearch = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const secondSearch = new Promise((resolve) => {
        resolveSecond = resolve;
      });

      mockSearchApiClient.searchMessages
        .mockReturnValueOnce(firstSearch)
        .mockReturnValueOnce(secondSearch);

      const { result } = renderHook(() => useSearchStore());

      // Start first search
      act(() => {
        result.current.search('first query');
      });

      // Start second search while first is still pending
      act(() => {
        result.current.search('second query');
      });

      expect(result.current.isSearching).toBe(true);

      // Resolve second search first
      await act(async () => {
        resolveSecond({
          data: {
            query: 'second query',
            results: [
              {
                message_id: '2',
                content: 'Second result',
                role: 'user',
                created_at: '2023-01-02T00:00:00Z',
                conversation_id: 'conv-2',
                conversation_title: 'Second',
                similarity: 0.8,
                preview: 'Second...',
              },
            ],
            total_found: 1,
          },
          status: 200,
        });
        await secondSearch;
      });

      expect(result.current.searchQuery).toBe('second query');
      expect(result.current.searchResults).toHaveLength(1);

      // Resolve first search (should be ignored or handled appropriately)
      await act(async () => {
        resolveFirst({
          data: {
            query: 'first query',
            results: [
              {
                message_id: '1',
                content: 'First result',
                role: 'user',
                created_at: '2023-01-01T00:00:00Z',
                conversation_id: 'conv-1',
                conversation_title: 'First',
                similarity: 0.9,
                preview: 'First...',
              },
            ],
            total_found: 1,
          },
          status: 200,
        });
        await firstSearch;
      });

      // Second search results should still be current
      expect(result.current.searchQuery).toBe('second query');
    });
  });
});