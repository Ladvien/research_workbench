import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from './Message';
import type { Message as MessageType } from '../types/chat';

// Mock the MarkdownRenderer component
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content, variant }: { content: string; variant: string }) => (
    <div data-testid="markdown-content" data-variant={variant}>
      {content}
    </div>
  )
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

  describe('Message Rendering', () => {
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

      // Check content is passed to MarkdownRenderer
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from user');
      expect(screen.getByTestId('markdown-content')).toHaveAttribute('data-variant', 'user');
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

      // Check content is passed to MarkdownRenderer
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from assistant');
      expect(screen.getByTestId('markdown-content')).toHaveAttribute('data-variant', 'assistant');
    });

    it('renders system message with correct styling', () => {
      const message = createMockMessage({ role: 'system', content: 'System notification' });
      const { container } = render(<Message message={message} />);

      // Check styling
      const messageBox = container.querySelector('.bg-yellow-50');
      expect(messageBox).toBeInTheDocument();

      // Check role indicator
      expect(screen.getByText('System')).toBeInTheDocument();

      // Check content is passed to MarkdownRenderer
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('System notification');
      expect(screen.getByTestId('markdown-content')).toHaveAttribute('data-variant', 'system');
    });

    it('does not show role indicator for user messages', () => {
      const message = createMockMessage({ role: 'user', content: 'User message' });
      render(<Message message={message} />);

      expect(screen.queryByText('User')).not.toBeInTheDocument();
      expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
      expect(screen.queryByText('System')).not.toBeInTheDocument();
    });

    it('shows role indicator for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Assistant message' });
      render(<Message message={message} />);

      const roleIndicator = screen.getByText('Assistant');
      expect(roleIndicator).toBeInTheDocument();
      expect(roleIndicator).toHaveClass('text-gray-500', 'dark:text-gray-400');
    });

    it('shows role indicator for system messages', () => {
      const message = createMockMessage({ role: 'system', content: 'System message' });
      render(<Message message={message} />);

      const roleIndicator = screen.getByText('System');
      expect(roleIndicator).toBeInTheDocument();
      expect(roleIndicator).toHaveClass('text-yellow-600', 'dark:text-yellow-400');
    });
  });

  describe('Content Handling', () => {
    it('passes markdown content to MarkdownRenderer', () => {
      const markdownContent = '# Heading\n**Bold text**\n- List item';
      const message = createMockMessage({ content: markdownContent });

      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      // Text content normalizes whitespace, so check without newlines
      expect(markdownElement).toHaveTextContent('# Heading **Bold text** - List item');
    });

    it('handles empty content gracefully', () => {
      const message = createMockMessage({ content: '' });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent('');
    });

    it('handles very long content', () => {
      const longContent = 'Lorem ipsum '.repeat(100);
      const message = createMockMessage({ content: longContent });
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('.max-w-\\[80\\%\\]');
      expect(messageBox).toBeInTheDocument();

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent(longContent.trim());
    });

    it('handles special characters correctly', () => {
      const specialContent = '< > & " \' ` $ { }';
      const message = createMockMessage({ content: specialContent });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent(specialContent);
    });

    it('handles code blocks and markdown syntax', () => {
      const codeContent = '```javascript\nconsole.log("Hello World");\n```';
      const message = createMockMessage({ content: codeContent });
      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      // Text content normalizes whitespace
      expect(markdownElement).toHaveTextContent('```javascript console.log("Hello World"); ```');
    });
  });

  describe('Timestamp Display', () => {
    it('displays formatted timestamp correctly', () => {
      const testDate = new Date('2024-01-01T15:30:45');
      const message = createMockMessage({ timestamp: testDate });
      render(<Message message={message} />);

      // Should display as 3:30 PM or 15:30 depending on locale
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

    it('aligns timestamp left for system messages', () => {
      const message = createMockMessage({ role: 'system' });
      const { container } = render(<Message message={message} />);

      const timestampDiv = container.querySelector('.text-xs.mt-2.opacity-70');
      expect(timestampDiv).toHaveClass('text-left');
    });

    it('handles different date formats', () => {
      const dates = [
        new Date('2024-01-01T00:00:00'),
        new Date('2024-12-31T23:59:59'),
        new Date('2024-06-15T12:30:45')
      ];

      dates.forEach(date => {
        const message = createMockMessage({ timestamp: date });
        const { container } = render(<Message message={message} />);

        const timestampElement = container.querySelector('.text-xs.mt-2.opacity-70');
        expect(timestampElement).toBeInTheDocument();
        expect(timestampElement?.textContent).toMatch(/\d{1,2}:\d{2}/);
      });
    });
  });

  describe('Layout and Responsive Design', () => {
    it('applies max-width constraint', () => {
      const message = createMockMessage();
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('div[class*="max-w-"]');
      expect(messageBox).toHaveClass('max-w-[80%]');
    });

    it('applies proper spacing', () => {
      const message = createMockMessage();
      const { container } = render(<Message message={message} />);

      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toHaveClass('mb-4');

      const messageBox = wrapper?.querySelector('div');
      expect(messageBox).toHaveClass('px-4', 'py-3');
    });

    it('applies shadow and border radius', () => {
      const message = createMockMessage();
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('div[class*="rounded-lg"]');
      expect(messageBox).toHaveClass('rounded-lg', 'shadow-sm');
    });
  });

  describe('Dark Mode Support', () => {
    it('applies dark mode classes for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant' });
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('.bg-white');
      expect(messageBox).toHaveClass('dark:bg-gray-800', 'dark:border-gray-700');
    });

    it('applies dark mode classes for system messages', () => {
      const message = createMockMessage({ role: 'system' });
      const { container } = render(<Message message={message} />);

      const messageBox = container.querySelector('.bg-yellow-50');
      expect(messageBox).toHaveClass('dark:bg-yellow-900/20', 'dark:border-yellow-700');
    });

    it('applies dark mode classes for role indicators', () => {
      const assistantMessage = createMockMessage({ role: 'assistant' });
      render(<Message message={assistantMessage} />);

      const roleIndicator = screen.getByText('Assistant');
      expect(roleIndicator).toHaveClass('dark:text-gray-400');
    });
  });

  describe('Accessibility', () => {
    it('maintains semantic HTML structure', () => {
      const message = createMockMessage({ role: 'assistant' });
      const { container } = render(<Message message={message} />);

      // Check for proper flex layout
      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toBeInTheDocument();

      // Check for message container
      const messageContainer = wrapper?.querySelector('div');
      expect(messageContainer).toBeInTheDocument();
    });

    it('provides visual hierarchy with role indicators', () => {
      const assistantMessage = createMockMessage({ role: 'assistant' });
      render(<Message message={assistantMessage} />);

      const roleIndicator = screen.getByText('Assistant');
      expect(roleIndicator).toHaveClass('text-xs', 'font-medium');
    });

    it('has proper text contrast', () => {
      const userMessage = createMockMessage({ role: 'user' });
      const { container } = render(<Message message={userMessage} />);

      const messageBox = container.querySelector('.bg-blue-500');
      expect(messageBox).toHaveClass('text-white');
    });

    it('provides readable timestamps', () => {
      const message = createMockMessage();
      const { container } = render(<Message message={message} />);

      const timestamp = container.querySelector('.text-xs.mt-2.opacity-70');
      expect(timestamp).toBeInTheDocument();
      expect(timestamp).toHaveClass('opacity-70'); // Ensures it's visible but not distracting
    });
  });

  describe('Props Validation', () => {
    it('correctly destructures message props', () => {
      const message = createMockMessage({
        id: 'test-123',
        role: 'assistant',
        content: 'Test content',
        timestamp: new Date('2024-01-01T12:00:00')
      });

      render(<Message message={message} />);

      expect(screen.getByText('Assistant')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Test content');
    });

    it('handles all role types correctly', () => {
      const roles = ['user', 'assistant', 'system'] as const;

      roles.forEach((role, index) => {
        const message = createMockMessage({
          role,
          content: `${role} content`,
          id: `test-${role}-${index}` // Unique ID to avoid conflicts
        });
        const { container, unmount } = render(<Message message={message} />);

        // User messages don't show role indicator
        if (role === 'user') {
          expect(container.querySelector('.bg-blue-500')).toBeInTheDocument();
        } else {
          expect(screen.getByText(role === 'assistant' ? 'Assistant' : 'System')).toBeInTheDocument();
        }

        expect(screen.getByTestId('markdown-content')).toHaveAttribute('data-variant', role);

        // Clean up to prevent multiple elements in subsequent iterations
        unmount();
      });
    });
  });

  describe('Component Integration', () => {
    it('passes correct props to MarkdownRenderer', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: '**Bold** and *italic* text'
      });

      render(<Message message={message} />);

      const markdownElement = screen.getByTestId('markdown-content');
      expect(markdownElement).toHaveTextContent('**Bold** and *italic* text');
      expect(markdownElement).toHaveAttribute('data-variant', 'assistant');
    });

    it('maintains consistent styling across re-renders', () => {
      const message = createMockMessage({ role: 'user' });
      const { container, rerender } = render(<Message message={message} />);

      const initialClasses = container.querySelector('.bg-blue-500')?.className;

      // Re-render with same props
      rerender(<Message message={message} />);

      const rerenderedClasses = container.querySelector('.bg-blue-500')?.className;
      expect(rerenderedClasses).toBe(initialClasses);
    });
  });
});