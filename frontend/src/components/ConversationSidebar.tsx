import React, { useState, useEffect } from 'react';
import { useConversationStore } from '../hooks/useConversationStore';
import { ConversationSkeleton, LoadingSpinner } from './LoadingSpinner';
import { Conversation } from '../types';

interface ConversationSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
  isLoading = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title || 'New Conversation');
  const [showActions, setShowActions] = useState(false);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      onRename(conversation.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setEditTitle(conversation.title || 'New Conversation');
      setIsEditing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div
      className={`group relative p-3 mx-2 mb-2 rounded-lg cursor-pointer transition-all duration-200 ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      onClick={() => !isEditing && !isLoading && onSelect(conversation.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex flex-col space-y-1">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <div className="flex justify-between items-start">
            <h3 className={`text-sm font-medium truncate pr-2 ${
              isActive
                ? 'text-blue-900 dark:text-blue-100'
                : 'text-gray-900 dark:text-white'
            }`}>
              {conversation.title || 'New Conversation'}
            </h3>
            {showActions && !isActive && !isLoading && (
              <div className="flex space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Rename conversation"
                  disabled={isLoading}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conversation.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete conversation"
                  disabled={isLoading}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
            {isLoading && (
              <LoadingSpinner size="xs" variant="secondary" inline data-testid="conversation-item-loading" />
            )}
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
            {conversation.model}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(conversation.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  isOpen,
  onToggle
}) => {
  const {
    conversations,
    currentConversationId,
    isLoading,
    error,
    loadConversations,
    setCurrentConversation,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    clearError
  } = useConversationStore();

  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [operationLoadingId, setOperationLoadingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<'rename' | 'delete' | null>(null);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewConversation = async () => {
    try {
      await createConversation({
        title: 'New Conversation',
        model: 'gpt-4',
      });
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    setOperationLoadingId(id);
    setOperationType('rename');
    try {
      await updateConversationTitle(id, newTitle);
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    } finally {
      setOperationLoadingId(null);
      setOperationType(null);
    }
  };

  const handleDeleteConversation = (id: string) => {
    setShowDeleteDialog(id);
  };

  const confirmDelete = async () => {
    if (!showDeleteDialog) return;

    setOperationLoadingId(showDeleteDialog);
    setOperationType('delete');
    try {
      await deleteConversation(showDeleteDialog);
      setShowDeleteDialog(null);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setShowDeleteDialog(null);
    } finally {
      setOperationLoadingId(null);
      setOperationType(null);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed left-0 top-0 z-40 h-full">
        <button
          onClick={onToggle}
          className="mt-4 ml-4 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg hover:shadow-xl transition-shadow"
          title="Open conversations"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
        onClick={onToggle}
      />

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 z-40 h-full w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Conversations
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleNewConversation}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="New conversation"
              disabled={isLoading}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button
              onClick={onToggle}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors md:hidden"
              title="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex justify-between items-start">
              <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && conversations.length === 0 && (
          <div className="p-4">
            <ConversationSkeleton count={3} data-testid="conversation-skeleton" />
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto pb-4">
          {conversations.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">No conversations yet.</p>
              <p className="text-xs mt-1">Start a new conversation to get started!</p>
            </div>
          ) : (
            <div className="pt-2">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onSelect={setCurrentConversation}
                  onRename={handleRenameConversation}
                  onDelete={handleDeleteConversation}
                  isLoading={operationLoadingId === conversation.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4 max-w-sm w-full">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Delete Conversation
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  disabled={operationType === 'delete'}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed rounded-lg transition-colors min-w-[80px]"
                  disabled={operationType === 'delete'}
                >
                  {operationType === 'delete' ? (
                    <LoadingSpinner size="xs" variant="secondary" inline />
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};