import React, { useState, useRef, useEffect } from 'react';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import type { Message as MessageType, ChatState } from '../types/chat';

export const Chat: React.FC = () => {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [
      {
        id: '1',
        role: 'system',
        content: 'Welcome to the Workbench LLM Chat Application! I\'m your AI assistant. How can I help you today?',
        timestamp: new Date()
      }
    ],
    isLoading: false,
    error: null
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatState.messages]);

  const handleSendMessage = async (content: string) => {
    const userMessage: MessageType = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    // Add user message immediately
    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null
    }));

    try {
      // Simulate API call - this would be replaced with actual API integration
      await new Promise(resolve => setTimeout(resolve, 1000));

      const assistantMessage: MessageType = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Thank you for your message: "${content}". This is a placeholder response. The actual LLM integration will be implemented by Agent-2.`,
        timestamp: new Date()
      };

      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false
      }));

    } catch (error) {
      setChatState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to send message. Please try again.'
      }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Workbench LLM Chat
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chat with your AI assistant
        </p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatState.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <div className="flex">
              <div className="text-red-800 dark:text-red-400 text-sm">
                {chatState.error}
              </div>
            </div>
          </div>
        )}

        {chatState.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {chatState.isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm max-w-[80%]">
              <div className="text-xs font-medium mb-2 text-gray-500 dark:text-gray-400">
                Assistant
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
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
        disabled={chatState.isLoading}
        placeholder="Type your message... (Shift+Enter for new line)"
      />
    </div>
  );
};