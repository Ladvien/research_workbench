import React, { useEffect, useState } from 'react';
import { BranchVisualizer } from './BranchVisualizer';
import { ChatInput } from './ChatInput';
import { ErrorAlert } from './ErrorAlert';
import { ChatHeader, WelcomeScreen, MessageList } from './BranchingChat';
import { useConversationStore } from '../hooks/useConversationStore';
import { useBranching } from '../hooks/useBranching';
import { categorizeError, retryOperation, isTemporaryError } from '../utils/errorHandling';

export const BranchingChat: React.FC = () => {
  const [showBranchView, setShowBranchView] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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
        <ChatHeader
          currentConversationId={currentConversationId}
          showBranchView={showBranchView}
          treeData={treeData}
          isBranchLoading={isBranchLoading}
          onToggleBranchView={toggleBranchView}
        />

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
            <WelcomeScreen />
          )}

          <MessageList
            currentMessages={currentMessages}
            streamingMessage={streamingMessage}
            isLoading={isLoading}
            isStreaming={isStreaming}
            isBranchLoading={isBranchLoading}
            branches={treeData?.branches}
            showBranchView={showBranchView}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onBranchSwitch={handleBranchSwitch}
            onStopStreaming={stopStreaming}
          />
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