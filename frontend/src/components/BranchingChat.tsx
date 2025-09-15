import React, { useRef, useEffect, useState } from 'react';
import { EditableMessage } from './EditableMessage';
import { BranchVisualizer } from './BranchVisualizer';
import { ChatInput } from './ChatInput';
import { LoadingSpinner, LoadingDots } from './LoadingSpinner';
import { ErrorAlert } from './ErrorAlert';
import { useConversationStore } from '../hooks/useConversationStore';
import { useBranching } from '../hooks/useBranching';
import { categorizeError, retryOperation, isTemporaryError } from '../utils/errorHandling';
import type { Message as MessageType } from '../types';

export const BranchingChat: React.FC = () => {
  const [showBranchView, setShowBranchView] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    currentMessages,
    streamingMessage,
    currentConversationId,
    isLoading,
    isStreaming,
    error,
    sendStreamingMessage,
    stopStreaming,
    clearError
  } = useConversationStore();

  const {
    treeData,
    isLoading: isBranchLoading,
    error: branchError,
    loadTree,
    editMessage,
    switchBranch,
    deleteMessage,
    clearError: clearBranchError,
  } = useBranching({
    conversationId: currentConversationId || '',
    onTreeUpdate: (tree) => {
      // Tree updated - the active thread information is now available in tree.activeThread
    },
    onError: (error) => {
      console.error('Branching error:', error);
    }
  });

  // Load tree data when conversation changes
  useEffect(() => {
    if (currentConversationId && showBranchView) {
      loadTree();
    }
  }, [currentConversationId, showBranchView, loadTree]);

  // Auto-scroll to bottom when new messages are added or streaming message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, streamingMessage]);

  const handleSendMessage = async (content: string) => {
    const attemptSend = async () => {
      await sendStreamingMessage(content);
      // Reload tree if in branch view to show new message
      if (showBranchView && currentConversationId) {
        setTimeout(() => loadTree(), 500); // Small delay to ensure message is saved
      }
    };

    try {
      // Retry for temporary errors
      await retryOperation(attemptSend, {
        maxRetries: error && isTemporaryError(error) ? 2 : 0,
        retryDelay: 1000,
      });
      setRetryCount(0); // Reset retry count on success
    } catch (error) {
      console.error('Failed to send streaming message:', error);
      // Error is already handled by the store, no need to set additional error state
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      await editMessage(messageId, newContent);
      // The tree will be reloaded automatically by useBranching
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      // The tree will be reloaded automatically by useBranching
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleBranchSwitch = async (targetMessageId: string) => {
    try {
      await switchBranch(targetMessageId);
      // The conversation will be refreshed automatically by onTreeUpdate
    } catch (error) {
      console.error('Failed to switch branch:', error);
    }
  };

  const toggleBranchView = () => {
    setShowBranchView(!showBranchView);
    if (!showBranchView && currentConversationId) {
      loadTree();
    }
  };

  const hasError = error || branchError;
  const errorContext = hasError ? categorizeError(hasError) : null;

  const handleRetryError = async () => {
    if (!hasError) return;

    clearError();
    clearBranchError();

    // Determine what to retry based on error context
    if (currentConversationId && errorContext?.category === 'network') {
      try {
        await loadTree();
      } catch (error) {
        console.error('Retry failed:', error);
      }
    }

    setRetryCount(prev => prev + 1);
  };

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Branch Visualizer Sidebar */}
      <BranchVisualizer
        conversationId={currentConversationId || ''}
        treeData={treeData}
        onBranchSwitch={handleBranchSwitch}
        isVisible={showBranchView}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {currentConversationId ? 'Workbench LLM Chat' : 'Start a New Conversation'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {currentConversationId
                  ? 'Chat with your AI assistant - Edit messages to explore different paths'
                  : 'Send a message to begin chatting'
                }
              </p>
            </div>

            {/* Branch Controls */}
            {currentConversationId && (
              <div className="flex items-center gap-2">
                {showBranchView && treeData && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {treeData.messages.length} messages, {treeData.branches.length} branches
                  </div>
                )}
                <button
                  onClick={toggleBranchView}
                  className={`
                    px-3 py-2 text-sm rounded-lg transition-colors
                    ${showBranchView
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }
                    ${isBranchLoading ? 'opacity-75 cursor-not-allowed' : ''}
                  `}
                  disabled={isBranchLoading}
                >
                  <div className="flex items-center gap-2">
                    {isBranchLoading ? (
                      <LoadingSpinner size="xs" variant={showBranchView ? 'secondary' : 'primary'} inline />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                      </svg>
                    )}
                    {isBranchLoading
                      ? 'Loading...'
                      : showBranchView
                      ? 'Hide Tree'
                      : 'Show Tree'
                    }
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {hasError && errorContext && (
            <ErrorAlert
              error={errorContext.userMessage}
              title={errorContext.category === 'authentication' ? 'Authentication Required' : 'Error'}
              type={errorContext.category === 'authentication' ? 'warning' : 'error'}
              onRetry={errorContext.isRetryable ? handleRetryError : undefined}
              onDismiss={() => {
                clearError();
                clearBranchError();
              }}
              className="mb-4"
            />
          )}

          {!currentConversationId && currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg max-w-md">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Welcome to Workbench with Branching
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Start a conversation by typing a message below. You can edit messages to explore different conversation paths and create branches.
                </p>
              </div>
            </div>
          )}

          {/* Render messages with editing capabilities */}
          {currentMessages.map((message) => (
            <EditableMessage
              key={message.id}
              message={{
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: new Date(message.created_at),
                parentId: message.parent_id,
                isActive: message.is_active
              }}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
              onBranchSwitch={handleBranchSwitch}
              branches={treeData?.branches}
              isEditable={!isLoading && !isStreaming}
              showBranches={showBranchView}
            />
          ))}

          {/* Display streaming message */}
          {streamingMessage && (
            <div className="flex justify-start mb-4">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm max-w-[80%]">
                <div className="text-xs font-medium mb-2 text-gray-500 dark:text-gray-400 flex items-center">
                  <span>Assistant</span>
                  {isStreaming && (
                    <>
                      <LoadingDots size="sm" variant="primary" className="ml-2" />
                      <span className="ml-2 text-xs text-blue-500">Streaming...</span>
                    </>
                  )}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {streamingMessage.content || <span className="text-gray-400">Waiting for response...</span>}
                  {isStreaming && <span className="animate-pulse bg-blue-500 text-blue-500 ml-1">|</span>}
                </div>
              </div>
              {isStreaming && (
                <button
                  onClick={stopStreaming}
                  className="ml-2 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Stop generation"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h12v12H6z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm max-w-[80%]">
                <div className="text-xs font-medium mb-2 text-gray-500 dark:text-gray-400">
                  Assistant
                </div>
                <div className="flex items-center space-x-2">
                  <LoadingDots size="md" variant="default" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator for branching operations */}
          {isBranchLoading && (
            <div className="flex justify-center mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <LoadingSpinner
                  size="sm"
                  variant="primary"
                  label="Processing branch operation..."
                  data-testid="branch-loading-indicator"
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading || isStreaming || isBranchLoading}
          placeholder={
            isStreaming
              ? "Response streaming... please wait"
              : isBranchLoading
              ? "Processing branch operation... please wait"
              : "Type your message... (Shift+Enter for new line)"
          }
        />
      </div>
    </div>
  );
};