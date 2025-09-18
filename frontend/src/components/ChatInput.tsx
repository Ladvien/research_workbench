import React, { useState, useRef, useEffect, type KeyboardEvent } from 'react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the textarea when component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Alt + Enter: Insert new line
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newMessage = message.substring(0, start) + '\n' + message.substring(end);
      setMessage(newMessage);
      // Set cursor position after the newline
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }, 0);
    }
    // Enter (without Shift): Send message
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Shift + Enter: Default behavior (new line)
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <form onSubmit={handleSubmit} className="flex items-end space-x-4">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="
              w-full px-4 py-3
              border border-gray-300 dark:border-gray-600
              rounded-lg resize-none overflow-hidden
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              dark:bg-gray-700 dark:text-white
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder-gray-500 dark:placeholder-gray-400
              text-sm leading-5
            "
            style={{
              minHeight: '44px',
              maxHeight: '160px',
            }}
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Press Enter to send • Shift+Enter or Alt+Enter for new line
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
            min-w-[80px] flex items-center justify-center
            h-[44px]
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