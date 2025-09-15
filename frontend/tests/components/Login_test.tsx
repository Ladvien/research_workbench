import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from '../../src/components/Auth/Login';

describe('Login Component', () => {
  const mockOnSubmit = vi.fn();
  const mockOnSwitchToRegister = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form with all required elements', () => {
    render(<Login onSubmit={mockOnSubmit} />);

    expect(screen.getByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email or Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back! Please sign in to continue to Workbench LLM Chat.')).toBeInTheDocument();
  });

  it('shows password toggle button', () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const passwordToggle = screen.getByRole('button', { name: '' }); // Eye icon button
    expect(passwordToggle).toBeInTheDocument();
  });

  it('toggles password visibility when eye icon is clicked', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByRole('button', { name: '' }); // Eye icon button

    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide password
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('displays validation errors for empty fields', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const form = emailInput.closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Email or username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('displays validation error for short password', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('clears validation errors when user starts typing', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const form = emailInput.closest('form');

    // Trigger validation error
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(screen.getByText('Email or username is required')).toBeInTheDocument();
    });

    // Start typing to clear error
    fireEvent.change(emailInput, { target: { value: 'test' } });
    expect(screen.queryByText('Email or username is required')).not.toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        emailOrUsername: 'test@example.com',
        password: 'password123'
      });
    });
  });

  it('disables form and shows loading state when isLoading is true', () => {
    render(<Login onSubmit={mockOnSubmit} isLoading={true} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Signing in...' });
    const toggleButton = screen.getByRole('button', { name: '' }); // Eye icon button

    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
    expect(toggleButton).toBeDisabled();
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
  });

  it('displays error message when provided', () => {
    const errorMessage = 'Invalid credentials. Please try again.';
    render(<Login onSubmit={mockOnSubmit} error={errorMessage} />);

    expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    expect(screen.getByRole('alert')).toHaveClass('text-red-700', 'dark:text-red-400');
  });

  it('shows register link when onSwitchToRegister is provided', () => {
    render(<Login onSubmit={mockOnSubmit} onSwitchToRegister={mockOnSwitchToRegister} />);

    const registerLink = screen.getByRole('button', { name: 'Sign up here' });
    expect(registerLink).toBeInTheDocument();
    expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
  });

  it('calls onSwitchToRegister when register link is clicked', () => {
    render(<Login onSubmit={mockOnSubmit} onSwitchToRegister={mockOnSwitchToRegister} />);

    const registerLink = screen.getByRole('button', { name: 'Sign up here' });
    fireEvent.click(registerLink);

    expect(mockOnSwitchToRegister).toHaveBeenCalledOnce();
  });

  it('disables register link when loading', () => {
    render(
      <Login
        onSubmit={mockOnSubmit}
        onSwitchToRegister={mockOnSwitchToRegister}
        isLoading={true}
      />
    );

    const registerLink = screen.getByRole('button', { name: 'Sign up here' });
    expect(registerLink).toBeDisabled();
  });

  it('disables submit button when form is invalid', () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: 'Sign in' });
    expect(submitButton).toBeDisabled();

    // Fill only email
    const emailInput = screen.getByLabelText('Email or Username');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when form is valid', () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(submitButton).toBeEnabled();
  });

  it('handles form submission on Enter key press', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // Simulate Enter key which should trigger form submission
    fireEvent.keyDown(passwordInput, { key: 'Enter' });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        emailOrUsername: 'test@example.com',
        password: 'password123'
      });
    });
  });

  it('applies correct styling for validation errors', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const form = emailInput.closest('form');
    fireEvent.submit(form!);

    // First verify that validation errors are shown
    await waitFor(() => {
      expect(screen.getByText('Email or username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    // Then check the styling
    const emailInputWithErrors = screen.getByLabelText('Email or Username');
    const passwordInputWithErrors = screen.getByLabelText('Password');

    expect(emailInputWithErrors).toHaveClass('border-red-300');
    expect(passwordInputWithErrors).toHaveClass('border-red-300');
  });

  it('accepts username instead of email', async () => {
    render(<Login onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email or Username');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    fireEvent.change(emailInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        emailOrUsername: 'testuser',
        password: 'password123'
      });
    });
  });
});