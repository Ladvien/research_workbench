import React from 'react';
import { ChatInput } from './ChatInput';

// Simple test component to verify our UI improvements
export const ChatTest: React.FC = () => {
  const handleSendMessage = (message: string) => {
    console.log('Message sent:', message);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Test message container with improved padding */}
      <div className="flex-1 overflow-y-auto px-8 py-16 space-y-8">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-5xl px-12">
            <div className="flex justify-end">
              <div className="max-w-[70%] px-5 py-4 rounded-lg shadow-sm bg-blue-500 text-white">
                <div className="text-sm">
                  This is a test user message to verify the improved spacing and centering.
                  Notice how the message container has more padding around it.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full justify-center">
          <div className="w-full max-w-5xl px-12">
            <div className="flex justify-start">
              <div className="max-w-[70%] px-5 py-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium mb-2 text-gray-500 dark:text-gray-400">
                  Assistant
                </div>
                <div className="text-sm">
                  This is a test assistant message. The improved spacing provides better
                  visual balance and prevents messages from hugging the edges of the screen.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test improved chat input with better button alignment */}
      <ChatInput
        onSendMessage={handleSendMessage}
        placeholder="Test the auto-growing textarea and improved button alignment..."
      />
    </div>
  );
};