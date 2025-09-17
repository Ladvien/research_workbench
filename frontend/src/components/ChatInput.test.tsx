import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  it('renders with default props', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByText('Press Enter to send • Shift+Enter or Alt+Enter for new line')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} placeholder="Enter your question..." />);
    
    expect(screen.getByPlaceholderText('Enter your question...')).toBeInTheDocument();
  });

  it('focuses textarea on mount', async () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });

  it('updates message value when typing', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello world');
    
    expect(textarea).toHaveValue('Hello world');
  });

  it('sends message on form submit', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    await user.type(textarea, 'Test message');
    await user.click(sendButton);
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    expect(textarea).toHaveValue(''); // Should clear after sending
  });

  it('sends message on Enter key press', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    expect(textarea).toHaveValue('');
  });

  it('adds new line on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    
    await user.type(textarea, 'First line');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'Second line');
    
    expect(textarea).toHaveValue('First line\nSecond line');
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('adds new line on Alt+Enter', async () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Type some text
    fireEvent.change(textarea, { target: { value: 'First line' } });
    
    // Simulate Alt+Enter
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      altKey: true,
    });
    
    expect(textarea.value).toContain('\n');
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('trims whitespace before sending', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    await user.type(textarea, '  Test message  ');
    await user.click(sendButton);
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    await user.click(sendButton);
    
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('does not send whitespace-only messages', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    await user.type(textarea, '   ');
    await user.click(sendButton);
    
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('disables input when disabled prop is true', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button');
    
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('shows loading spinner when disabled', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);
    
    expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    expect(screen.queryByText('Send')).not.toBeInTheDocument();
  });

  it('disables send button when message is empty', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when message has content', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    
    expect(sendButton).toBeDisabled();
    
    await user.type(textarea, 'Hello');
    
    expect(sendButton).not.toBeDisabled();
  });

  it('does not send message when disabled', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);
    
    const textarea = screen.getByRole('textbox');
    
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');
    
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('has proper accessibility attributes', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const form = textarea.closest('form');
    
    expect(textarea).toHaveAttribute('placeholder');
    expect(form).toBeInTheDocument();
  });

  it('handles cursor position correctly on Alt+Enter', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Set initial value and cursor position
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    
    // Set cursor in the middle
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    
    // Simulate Alt+Enter
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      altKey: true,
    });
    
    expect(textarea.value).toBe('Hello\n world');
  });

  it('has correct styling classes', () => {
    const { container } = render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    const form = container.querySelector('form');
    
    expect(textarea).toHaveClass('w-full', 'px-4', 'py-3', 'border', 'rounded-lg');
    expect(sendButton).toHaveClass('px-6', 'py-3', 'bg-blue-500', 'rounded-lg');
    expect(form).toHaveClass('flex', 'items-end', 'space-x-3');
  });

  it('maintains focus after sending message', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');
    
    // Textarea should still be focused after sending
    expect(textarea).toHaveFocus();
  });

  it('has proper height constraints', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const textarea = screen.getByRole('textbox');
    
    expect(textarea).toHaveStyle({
      minHeight: '44px',
      maxHeight: '120px',
    });
  });
});
