// Search store using Zustand for managing search state

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { SearchState, SearchResult } from '../types';
import { searchApiClient } from '../services/searchApi';

interface SearchStore extends SearchState {}

export const useSearchStore = create<SearchStore>()(
  devtools(
    persist(
      (set, get) => ({
        isSearching: false,
        searchResults: [],
        searchQuery: '',
        error: null,
        lastSearchTime: undefined,

        search: async (query: string, limit?: number, similarity_threshold?: number) => {
          if (!query.trim()) {
            set({ error: 'Search query cannot be empty' });
            return;
          }

          set({ isSearching: true, error: null });

          try {
            const response = await searchApiClient.searchMessages(
              query.trim(),
              limit || 10,
              similarity_threshold || 0.7
            );

            if (response.error) {
              set({
                isSearching: false,
                error: response.error,
                searchResults: [],
              });
              return;
            }

            if (response.data) {
              set({
                isSearching: false,
                searchResults: response.data.results,
                searchQuery: query,
                lastSearchTime: new Date().toISOString(),
                error: null,
              });
            }
          } catch (error) {
            console.error('Search failed:', error);
            set({
              isSearching: false,
              error: error instanceof Error ? error.message : 'Search failed',
              searchResults: [],
            });
          }
        },

        clearSearch: () => {
          set({
            searchResults: [],
            searchQuery: '',
            error: null,
            lastSearchTime: undefined,
          });
        },

        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'search-storage', // localStorage key
        partialize: (state) => ({
          searchQuery: state.searchQuery,
          searchResults: state.searchResults,
          lastSearchTime: state.lastSearchTime,
        }), // Only persist these fields
      }
    ),
    {
      name: 'search-store',
    }
  )
);