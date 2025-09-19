import React, { useEffect, useState } from 'react';
import { BranchVisualizer } from './BranchVisualizer';
import { ChatInput } from './ChatInput';
import { ErrorAlert } from './ErrorAlert';
import { Message } from './Message';
import { LoadingSpinner } from './LoadingSpinner';
import { useConversationStore } from '../hooks/useConversationStore';
import { useBranching } from '../hooks/useBranching';
import { categorizeError, retryOperation, isTemporaryError } from '../utils/errorHandling';
import type { Message as MessageType, TreeNode } from '../types';

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

// Sub-components
const ChatHeader: React.FC<{
  currentConversationId: string | null;
  showBranchView: boolean;
  treeData: any;
  isBranchLoading: boolean;
  onToggleBranchView: () => void;
}> = ({ currentConversationId, showBranchView, treeData, isBranchLoading, onToggleBranchView }) => {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {currentConversationId ? 'Chat Session' : 'New Conversation'}
        </h1>
        {currentConversationId && (
          <button
            onClick={onToggleBranchView}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            disabled={isBranchLoading}
          >
            {showBranchView ? 'Hide' : 'Show'} Branches
            {treeData?.branches && treeData.branches.length > 0 && (
              <span className="bg-blue-600 px-2 py-0.5 rounded-full text-xs">
                {treeData.branches.length}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

const WelcomeScreen: React.FC = () => {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
        Welcome to Workbench Chat
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Start a conversation by typing a message below
      </p>
    </div>
  );
};

const MessageList: React.FC<{
  currentMessages: MessageType[];
  streamingMessage: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  isBranchLoading: boolean;
  branches?: any[];
  showBranchView: boolean;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onBranchSwitch: (branchId: string) => void;
  onStopStreaming: () => void;
}> = ({
  currentMessages,
  streamingMessage,
  isLoading,
  isStreaming,
  isBranchLoading,
  branches,
  showBranchView,
  onEditMessage,
  onDeleteMessage,
  onBranchSwitch,
  onStopStreaming,
}) => {
  return (
    <div className="space-y-4">
      {currentMessages.map((message, index) => (
        <Message
          key={message.id}
          message={message}
          onEdit={(content) => onEditMessage(message.id, content)}
          onDelete={() => onDeleteMessage(message.id)}
          isStreaming={false}
        />
      ))}

      {streamingMessage && (
        <Message
          message={{
            id: 'streaming',
            content: streamingMessage,
            role: 'assistant',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            conversation_id: '',
            user_id: '',
            parent_id: null,
            branch_id: null,
            tokens_used: null,
            model: null
          }}
          isStreaming={true}
          onStopStreaming={onStopStreaming}
        />
      )}

      {(isLoading || isBranchLoading) && !isStreaming && (
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};