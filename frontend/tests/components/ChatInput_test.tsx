import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../../src/components/ChatInput';

describe('ChatInput', () => {
  it('renders input field and send button', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByText('Press Enter to send • Shift+Enter or Alt+Enter for new line')).toBeInTheDocument();
  });

  it('auto-focuses the textarea on mount', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    expect(document.activeElement).toBe(textarea);
  });

  it('renders with custom placeholder', () => {
    const mockOnSendMessage = vi.fn();
    const customPlaceholder = 'Enter your custom message...';

    render(<ChatInput onSendMessage={mockOnSendMessage} placeholder={customPlaceholder} />);

    expect(screen.getByPlaceholderText(customPlaceholder)).toBeInTheDocument();
  });

  it('calls onSendMessage when form is submitted with valid text', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Hello, world!' } });
    fireEvent.submit(form!);

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello, world!');
    expect(input).toHaveValue('');
  });

  it('calls onSendMessage when Enter key is pressed', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');

    fireEvent.change(input, { target: { value: 'Hello, world!' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello, world!');
    expect(input).toHaveValue('');
  });

  it('does not submit when Shift+Enter is pressed', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');

    fireEvent.change(input, { target: { value: 'Hello, world!' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(mockOnSendMessage).not.toHaveBeenCalled();
    // Note: DOM won't automatically add newline, but the handler prevents submission
    expect(input).toHaveValue('Hello, world!');
  });

  it('inserts newline when Alt+Enter is pressed', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const textarea = screen.getByPlaceholderText('Type your message...');

    // Set initial value and cursor position
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    // Simulate Alt+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });

    expect(mockOnSendMessage).not.toHaveBeenCalled();
    // The component should have added a newline
    expect(textarea).toHaveValue('Hello\n');
  });

  it('does not call onSendMessage with empty or whitespace-only text', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    // Test empty string
    fireEvent.click(sendButton);
    expect(mockOnSendMessage).not.toHaveBeenCalled();

    // Test whitespace only
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('disables input and button when disabled prop is true', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button');

    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('shows loading spinner when disabled', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('trims whitespace from messages before sending', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: '  Hello, world!  ' } });
    fireEvent.click(sendButton);

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello, world!');
  });

  it('button is disabled when input is empty', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
  });

  it('button is enabled when input has content', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'H' } });
    expect(sendButton).toBeEnabled();
  });
});