import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from './Message';
import type { Message as MessageType } from '../types/chat';

// Mock the MarkdownTextPrimitive component
vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: ({ text, className }: { text: string; className?: string }) => (
    <div data-testid="markdown-content" className={className}>
      {text}
    </div>
  ),
}));

describe('Message Component', () => {
  const mockDate = new Date('2024-01-01T12:00:00');

  const createMockMessage = (overrides?: Partial<MessageType>): MessageType => ({
    id: 'test-id',
    conversation_id: 'conv-id',
    role: 'user',
    content: 'Test message content',
    created_at: mockDate.toISOString(),
    is_active: true,
    metadata: {},
    timestamp: mockDate,
    ...overrides,
  });

  describe('Rendering', () => {
    it('renders user message with correct styling', () => {
      const message = createMockMessage({ role: 'user', content: 'Hello from user' });
      const { container } = render(<Message message={message} />);

      // Check alignment
      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toHaveClass('justify-end');

      // Check styling
      const messageBox = container.querySelector('.bg-blue-500');
      expect(messageBox).toBeInTheDocument();
      expect(messageBox).toHaveClass('text-white');

      // Check content
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from user');
    });

    it('renders assistant message with correct styling', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Hello from assistant' });
      const { container } = render(<Message message={message} />);

      // Check alignment
      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toHaveClass('justify-start');

      // Check styling
      const messageBox = container.querySelector('.bg-white');
      expect(messageBox).toBeInTheDocument();

      // Check role indicator
      expect(screen.getByText('Assistant')).toBeInTheDocument();

      // Check content
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from assistant');
    });

    it('renders system message with correct styling', () => {
      const message = createMockMessage({ role: 'system', content: 'System notification' });
      const { container } = render(<Message message={message} />);

      // Check styling
      const messageBox = container.querySelector('.bg-yellow-50');
      expect(messageBox).toBeInTheDocument();

      // Check role indicator
      expect(screen.getByText('System')).toBeInTheDocument();

      // Check content
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('System notification');
    });
  });

  describe('Markdown Rendering', () => {
    it('passes markdown content to MarkdownTextPrimitive', () => {
      const markdownContent = '# Heading\n**Bold text**\n- List item';
      const message = createMockMessage({ content: markdownContent });

      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent(markdownContent);
    });

    it('applies correct class to MarkdownTextPrimitive for user messages', () => {
      const message = createMockMessage({ role: 'user', content: 'User content' });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveClass('text-white');
    });

    it('does not apply text-white class for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Assistant content' });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).not.toHaveClass('text-white');
    });
  });

  describe('Timestamp Display', () => {
    it('displays formatted timestamp', () => {
      const message = createMockMessage();
      render(<Message message={message} />);

      // The timestamp should be formatted as HH:MM
      const timestampElement = screen.getByText(/\d{1,2}:\d{2}/);
      expect(timestampElement).toBeInTheDocument();
    });

    it('aligns timestamp right for user messages', () => {
      const message = createMockMessage({ role: 'user' });
      const { container } = render(<Message message={message} />);

      const timestampDiv = container.querySelector('.text-xs.mt-2.opacity-70');
      expect(timestampDiv).toHaveClass('text-right');
    });

    it('aligns timestamp left for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant' });
      const { container } = render(<Message message={message} />);

      const timestampDiv = container.querySelector('.text-xs.mt-2.opacity-70');
      expect(timestampDiv).toHaveClass('text-left');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty content gracefully', () => {
      const message = createMockMessage({ content: '' });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toBeInTheDocument();
      expect(markdownElement).toHaveTextContent('');
    });

    it('handles very long content', () => {
      const longContent = 'Lorem ipsum '.repeat(100);
      const message = createMockMessage({ content: longContent });
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('.max-w-\\[80\\%\\]');
      expect(messageBox).toBeInTheDocument();

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent(longContent);
    });

    it('handles special characters in markdown', () => {
      const specialContent = '< > & " \' ` $ { }';
      const message = createMockMessage({ content: specialContent });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent(specialContent);
    });
  });

  describe('Accessibility', () => {
    it('maintains semantic HTML structure', () => {
      const message = createMockMessage({ role: 'assistant' });
      const { container } = render(<Message message={message} />);

      // Check for proper nesting
      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toBeInTheDocument();

      const messageContainer = wrapper?.querySelector('div');
      expect(messageContainer).toBeInTheDocument();

      // Check prose class for proper typography
      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).toBeInTheDocument();
    });

    it('provides visual hierarchy with role indicators', () => {
      const assistantMessage = createMockMessage({ role: 'assistant' });
      render(<Message message={assistantMessage} />);

      const roleIndicator = screen.getByText('Assistant');
      expect(roleIndicator).toHaveClass('text-xs', 'font-medium');
    });
  });
});