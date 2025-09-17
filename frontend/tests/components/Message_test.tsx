import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from '../../src/components/Message';
import type { Message as MessageType } from '../../src/types/chat';

// Mock the MarkdownRenderer component
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

describe('Message', () => {
  const mockTimestamp = new Date('2023-01-01T12:00:00Z');
  const expectedTimeString = mockTimestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  it('renders user message correctly', () => {
    const userMessage: MessageType = {
      id: '1',
      role: 'user',
      content: 'Hello, how are you?',
      timestamp: mockTimestamp,
    };

    render(<Message message={userMessage} />);

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    expect(screen.getByText(expectedTimeString)).toBeInTheDocument();
    expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
  });

  it('renders assistant message correctly', () => {
    const assistantMessage: MessageType = {
      id: '2',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      timestamp: mockTimestamp,
    };

    render(<Message message={assistantMessage} />);

    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByText(expectedTimeString)).toBeInTheDocument();
  });

  it('renders system message correctly', () => {
    const systemMessage: MessageType = {
      id: '3',
      role: 'system',
      content: 'Welcome to the chat!',
      timestamp: mockTimestamp,
    };

    render(<Message message={systemMessage} />);

    expect(screen.getByText('Welcome to the chat!')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText(expectedTimeString)).toBeInTheDocument();
  });

  it('renders markdown content correctly', () => {
    const messageWithMarkdown: MessageType = {
      id: '4',
      role: 'assistant',
      content: '# Hello\n\nThis is **bold** text with `inline code`.',
      timestamp: mockTimestamp,
    };

    render(<Message message={messageWithMarkdown} />);

    // Since we're mocking MarkdownRenderer, we just check the content is passed through
    const markdownContainer = screen.getByTestId('markdown-content');
    expect(markdownContainer).toBeInTheDocument();
    expect(markdownContainer).toHaveTextContent('# Hello\n\nThis is **bold** text with `inline code`.');
  });

  it('renders code blocks correctly', () => {
    const messageWithCodeBlock: MessageType = {
      id: '5',
      role: 'assistant',
      content: '```javascript\nconst greeting = "Hello World";\nconsole.log(greeting);\n```',
      timestamp: mockTimestamp,
    };

    render(<Message message={messageWithCodeBlock} />);

    // Check that the content is passed to MarkdownRenderer
    const markdownContainer = screen.getByTestId('markdown-content');
    expect(markdownContainer).toBeInTheDocument();
    expect(markdownContainer).toHaveTextContent('const greeting = "Hello World"');
    expect(markdownContainer).toHaveTextContent('console.log(greeting)');
  });

  it('applies correct styling for user messages', () => {
    const userMessage: MessageType = {
      id: '6',
      role: 'user',
      content: 'Test message',
      timestamp: mockTimestamp,
    };

    const { container } = render(<Message message={userMessage} />);

    // Check if the message container has the correct classes for user messages
    const messageDiv = container.querySelector('.justify-end');
    expect(messageDiv).toBeInTheDocument();

    const messageContent = container.querySelector('.bg-blue-500');
    expect(messageContent).toBeInTheDocument();
  });

  it('applies correct styling for assistant messages', () => {
    const assistantMessage: MessageType = {
      id: '7',
      role: 'assistant',
      content: 'Test response',
      timestamp: mockTimestamp,
    };

    const { container } = render(<Message message={assistantMessage} />);

    // Check if the message container has the correct classes for assistant messages
    const messageDiv = container.querySelector('.justify-start');
    expect(messageDiv).toBeInTheDocument();

    const messageContent = container.querySelector('.bg-white');
    expect(messageContent).toBeInTheDocument();
  });
});