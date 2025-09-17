import React, { useState, useRef, useEffect } from 'react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import type { Message as MessageType, BranchInfo } from '../types/chat';
import { BranchingAPI } from '../utils/branchingApi';

interface EditableMessageProps {
  message: MessageType;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  onBranchSwitch?: (targetMessageId: string) => Promise<void>;
  branches?: BranchInfo[];
  isEditable?: boolean;
  showBranches?: boolean;
}

export const EditableMessage: React.FC<EditableMessageProps> = ({
  message,
  onEdit,
  onDelete,
  onBranchSwitch,
  branches,
  isEditable = true,
  showBranches = true,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { role, content, timestamp } = message;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  // Find branches for this message
  const messageBranches = branches?.find(b => b.parentId === message.id);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleEdit = async () => {
    if (editContent.trim() === content.trim()) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (onEdit) {
        await onEdit(message.id, editContent.trim());
      } else {
        // Fallback to direct API call
        await BranchingAPI.editMessage(message.id, { content: editContent.trim() });
      }
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEditContent(content);
    setIsEditing(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this message?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (onDelete) {
        await onDelete(message.id);
      } else {
        await BranchingAPI.deleteMessage(message.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBranchSwitch = async (branchId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (onBranchSwitch) {
        await onBranchSwitch(branchId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch branch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };


  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className="relative max-w-[80%] group">
        <div
          className={`
            px-4 py-3 rounded-lg shadow-sm relative
            ${isUser
              ? 'bg-blue-500 text-white ml-auto'
              : isAssistant
              ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700'
            }
            ${isLoading ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          {/* Role indicator for assistant and system messages */}
          {(isAssistant || isSystem) && (
            <div className={`text-xs font-medium mb-2 ${
              isAssistant ? 'text-gray-500 dark:text-gray-400' : 'text-yellow-600 dark:text-yellow-400'
            }`}>
              {isAssistant ? 'Assistant' : 'System'}
            </div>
          )}

          {/* Message content or edit form */}
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`
                  w-full min-h-[100px] p-2 rounded border resize-vertical
                  ${isUser
                    ? 'bg-blue-400 text-white border-blue-300 placeholder-blue-100'
                    : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600'
                  }
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
                placeholder="Edit your message..."
                disabled={isLoading}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className={`
                    px-3 py-1 text-sm rounded border
                    ${isUser
                      ? 'border-blue-300 text-blue-100 hover:bg-blue-400'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                    }
                    transition-colors disabled:opacity-50
                  `}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  className={`
                    px-3 py-1 text-sm rounded font-medium
                    ${isUser
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                    }
                    transition-colors disabled:opacity-50
                  `}
                  disabled={isLoading || !editContent.trim()}
                >
                  {isLoading ? 'Saving...' : 'Save (⌘↵)'}
                </button>
              </div>
            </div>
          ) : (
            <div className={`prose prose-sm max-w-none ${
              isUser ? 'prose-invert' : 'dark:prose-invert'
            }`}>
              <MarkdownTextPrimitive
                text={content}
                className={isUser ? 'text-white' : ''}
              />
            </div>
          )}

          {/* Timestamp */}
          {!isEditing && (
            <div className={`text-xs mt-2 opacity-70 ${
              isUser ? 'text-right' : 'text-left'
            }`}>
              {timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}

          {/* Action buttons */}
          {!isEditing && isEditable && isUser && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex gap-1">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded text-blue-100 hover:bg-blue-400 transition-colors"
                  title="Edit message"
                  disabled={isLoading}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1 rounded text-blue-100 hover:bg-red-500 transition-colors"
                  title="Delete message"
                  disabled={isLoading}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Branch selector */}
        {showBranches && messageBranches && messageBranches.branches.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              {messageBranches.branchCount} branches:
            </span>
            {messageBranches.branches.map((branch, index) => (
              <button
                key={branch.id}
                onClick={() => handleBranchSwitch(branch.id)}
                className={`
                  px-2 py-1 text-xs rounded border transition-colors
                  ${branch.isActive
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                  }
                  disabled:opacity-50
                `}
                disabled={isLoading}
                title={branch.preview}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};