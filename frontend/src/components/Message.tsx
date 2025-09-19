import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { Message as MessageType } from '../types/chat';

interface MessageProps {
  message: MessageType;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const { role, content, timestamp } = message;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  return (
    <div className={`flex w-full justify-center`}>
      <div className="w-full max-w-5xl px-12">
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`
              max-w-[70%] px-5 py-4 rounded-lg shadow-sm
              ${isUser
                ? 'bg-blue-500 text-white ml-auto'
                : isAssistant
                ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700'
              }
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

            {/* Message content with markdown */}
            <MarkdownRenderer
              content={content}
              variant={role}
            />

            {/* Timestamp */}
            <div className={`text-xs mt-2 opacity-70 ${
              isUser ? 'text-right' : 'text-left'
            }`}>
              {timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};