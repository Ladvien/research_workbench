// SearchBar component for semantic search functionality

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, Clock } from 'lucide-react';
import { useSearchStore } from '../hooks/useSearchStore';
import { SearchResults } from './SearchResults';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  showResults?: boolean;
  onResultClick?: (conversationId: string, messageId: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "Search conversations...",
  className = "",
  showResults = true,
  onResultClick,
}) => {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    isSearching,
    searchResults,
    searchQuery,
    error,
    search,
    clearSearch,
    clearError,
  } = useSearchStore();

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    await search(searchQuery);
    setShowDropdown(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (!value.trim()) {
      setShowDropdown(false);
      clearSearch();
    }
  };

  const handleKeyDown = (e: React.KeyEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(query);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      searchInputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setQuery('');
    clearSearch();
    setShowDropdown(false);
    clearError();
    searchInputRef.current?.focus();
  };

  const handleResultClick = (conversationId: string, messageId: string) => {
    if (onResultClick) {
      onResultClick(conversationId, messageId);
    }
    setShowDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !searchInputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update local query when searchQuery changes (e.g., from persistence)
  useEffect(() => {
    if (searchQuery && !query) {
      setQuery(searchQuery);
    }
  }, [searchQuery, query]);

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (searchResults.length > 0) {
              setShowDropdown(true);
            }
          }}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg
                   focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   bg-white shadow-sm transition-all duration-200
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white
                   dark:placeholder-gray-400"
          disabled={isSearching}
        />

        {/* Loading/Clear Button */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {isSearching ? (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          ) : query ? (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Search Dropdown Results */}
      {showResults && showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800
                   border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg
                   z-50 max-h-96 overflow-hidden"
        >
          {/* Error State */}
          {error && (
            <div className="p-4 text-red-600 dark:text-red-400 text-sm border-b border-gray-200 dark:border-gray-600">
              <div className="font-medium">Search Error</div>
              <div>{error}</div>
              <button
                onClick={clearError}
                className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="p-4 text-gray-500 dark:text-gray-400 text-sm text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Searching conversations...
            </div>
          )}

          {/* No Results */}
          {!isSearching && !error && searchQuery && searchResults.length === 0 && (
            <div className="p-4 text-gray-500 dark:text-gray-400 text-sm text-center">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <div className="font-medium">No results found</div>
              <div className="text-xs">Try different keywords or check spelling</div>
            </div>
          )}

          {/* Search Results */}
          {!isSearching && !error && searchResults.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              <div className="p-3 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                </div>
              </div>
              <SearchResults
                results={searchResults}
                onResultClick={handleResultClick}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;