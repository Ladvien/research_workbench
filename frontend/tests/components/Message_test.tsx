import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from '../../src/components/Message';
import type { Message as MessageType } from '../../src/types/chat';

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

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('inline code')).toBeInTheDocument();
  });

  it('renders code blocks with syntax highlighting', () => {
    const messageWithCodeBlock: MessageType = {
      id: '5',
      role: 'assistant',
      content: '```javascript\nconst greeting = "Hello World";\nconsole.log(greeting);\n```',
      timestamp: mockTimestamp,
    };

    const { container } = render(<Message message={messageWithCodeBlock} />);

    // Check for key parts of the code that should be present (syntax highlighter splits text)
    expect(screen.getByText(/const/)).toBeInTheDocument();
    expect(screen.getAllByText(/greeting/)[0]).toBeInTheDocument(); // Get first occurrence
    expect(screen.getByText(/console/)).toBeInTheDocument();

    // Check that syntax highlighting container is present
    const codeElement = container.querySelector('pre');
    expect(codeElement).toBeInTheDocument();
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