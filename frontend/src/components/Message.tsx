import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message as MessageType } from '../types/chat';

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const { role, content, timestamp } = message;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  // Custom components for markdown rendering
  const components = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (!inline && language) {
        return (
          <SyntaxHighlighter
            style={tomorrow}
            language={language}
            PreTag="div"
            className="rounded-md text-sm"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }

      return (
        <code
          className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`
          max-w-[80%] px-4 py-3 rounded-lg shadow-sm
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

        {/* Message content */}
        <div className={`prose prose-sm max-w-none ${
          isUser ? 'prose-invert' : 'dark:prose-invert'
        }`}>
          <ReactMarkdown components={components}>
            {content}
          </ReactMarkdown>
        </div>

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
  );
};