import React, { useRef, useEffect } from 'react';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { LoadingDots } from './LoadingSpinner';
import { useConversationStore } from '../hooks/useConversationStore';
import type { Message as MessageType } from '../types';

export const Chat: React.FC = () => {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added or streaming message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, streamingMessage]);

  const handleSendMessage = async (content: string) => {
    try {
      await sendStreamingMessage(content);
    } catch (error) {
      console.error('Failed to send streaming message:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {currentConversationId ? 'Workbench LLM Chat' : 'Start a New Conversation'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {currentConversationId
                ? 'Chat with your AI assistant'
                : 'Send a message to begin chatting'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-start">
              <div className="text-red-800 dark:text-red-400 text-sm">
                {error}
              </div>
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

        {!currentConversationId && currentMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg max-w-md">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Welcome to Workbench
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Start a conversation by typing a message below. Your conversation will be automatically saved.
              </p>
            </div>
          </div>
        )}

        {currentMessages.map((message) => (
          <Message
            key={message.id}
            message={{
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: new Date(message.created_at)
            }}
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

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={isLoading || isStreaming}
        placeholder={isStreaming ? "Response streaming... please wait" : "Type your message... (Shift+Enter for new line)"}
      />
    </div>
  );
};