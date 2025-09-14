// SearchResults component for displaying semantic search results

import React from 'react';
import { MessageCircle, User, Bot, Calendar, Zap } from 'lucide-react';
import { SearchResult } from '../types';

interface SearchResultsProps {
  results: SearchResult[];
  onResultClick?: (conversationId: string, messageId: string) => void;
  className?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onResultClick,
  className = "",
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="h-3 w-3" />;
      case 'assistant':
        return <Bot className="h-3 w-3" />;
      default:
        return <MessageCircle className="h-3 w-3" />;
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'assistant':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'text-green-600 dark:text-green-400';
    if (similarity >= 0.8) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getSimilarityLabel = (similarity: number) => {
    if (similarity >= 0.9) return 'High match';
    if (similarity >= 0.8) return 'Good match';
    return 'Partial match';
  };

  return (
    <div className={`divide-y divide-gray-200 dark:divide-gray-600 ${className}`}>
      {results.map((result) => (
        <div
          key={result.message_id}
          className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer
                   transition-colors duration-150"
          onClick={() => onResultClick?.(result.conversation_id, result.message_id)}
        >
          {/* Result Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Role Badge */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs
                            ${getRoleBadgeClass(result.role)}`}>
                {getRoleIcon(result.role)}
                <span className="capitalize">{result.role}</span>
              </div>

              {/* Conversation Title */}
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {result.conversation_title || 'Untitled Conversation'}
              </div>
            </div>

            {/* Similarity Score */}
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <Zap className={`h-3 w-3 ${getSimilarityColor(result.similarity)}`} />
              <span className={getSimilarityColor(result.similarity)}>
                {getSimilarityLabel(result.similarity)}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                ({Math.round(result.similarity * 100)}%)
              </span>
            </div>
          </div>

          {/* Message Preview */}
          <div className="mb-2">
            <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">
              {result.preview}
            </p>
          </div>

          {/* Result Footer */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(result.created_at)}</span>
            </div>

            <div className="text-right">
              <span className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Jump to message →
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SearchResults;