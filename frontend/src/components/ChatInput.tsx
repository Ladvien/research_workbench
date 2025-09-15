import React, { useState, type KeyboardEvent } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message..."
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="
              w-full px-4 py-3
              border border-gray-300 dark:border-gray-600
              rounded-lg resize-none
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              dark:bg-gray-700 dark:text-white
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder-gray-500 dark:placeholder-gray-400
              text-sm leading-5
            "
            style={{
              minHeight: '44px',
              maxHeight: '120px',
            }}
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="
            px-6 py-3
            bg-blue-500 hover:bg-blue-600
            disabled:bg-gray-300 disabled:cursor-not-allowed
            text-white font-medium
            rounded-lg transition-colors
            focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            dark:focus:ring-offset-gray-800
            min-w-[80px]
          "
        >
          {disabled ? (
            <LoadingSpinner size="sm" variant="secondary" inline />
          ) : (
            'Send'
          )}
        </button>
      </form>
    </div>
  );
};