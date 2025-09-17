import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  variant?: 'default' | 'user' | 'assistant' | 'system';
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  variant = 'default',
}) => {
  const getProseClass = () => {
    const baseClasses = 'prose prose-sm max-w-none';

    switch (variant) {
      case 'user':
        return `${baseClasses} prose-invert`;
      case 'assistant':
        return `${baseClasses} dark:prose-invert`;
      case 'system':
        return `${baseClasses} prose-yellow dark:prose-invert`;
      default:
        return `${baseClasses} dark:prose-invert`;
    }
  };

  return (
    <div className={`${getProseClass()} ${className}`} data-testid="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (!inline && language) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  className="rounded-md !bg-gray-800"
                  showLineNumbers={false}
                  customStyle={{
                    margin: '0.5rem 0',
                    padding: '1rem',
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                  }}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={`${className || ''} bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm`} {...props}>
                {children}
              </code>
            );
          },

          // Custom link renderer to add security attributes
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },

          // Custom blockquote styling
          blockquote({ children, ...props }) {
            return (
              <blockquote
                className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // Custom table styling for better responsive design
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" {...props}>
                  {children}
                </table>
              </div>
            );
          },

          // Custom styling for table headers
          th({ children, ...props }) {
            return (
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800"
                {...props}
              >
                {children}
              </th>
            );
          },

          // Custom styling for table cells
          td({ children, ...props }) {
            return (
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100" {...props}>
                {children}
              </td>
            );
          },

          // Custom checkbox for task lists
          input({ type, checked, ...props }) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  className="mr-2 rounded border-gray-300 dark:border-gray-600"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },

          // Custom horizontal rule
          hr({ ...props }) {
            return (
              <hr className="my-4 border-gray-200 dark:border-gray-700" {...props} />
            );
          },

          // Custom image rendering with max width
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="max-w-full h-auto rounded-lg my-4"
                loading="lazy"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;