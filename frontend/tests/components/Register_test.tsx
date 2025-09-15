import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Register } from '../../src/components/Auth/Register';

describe('Register Component', () => {
  const mockOnSubmit = vi.fn();
  const mockOnSwitchToLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration form with all required elements', () => {
    render(<Register onSubmit={mockOnSubmit} />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByText('Join Workbench LLM Chat and start your AI-powered conversations.')).toBeInTheDocument();
  });

  it('shows password toggle buttons for both password fields', () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordToggles = screen.getAllByRole('button', { name: '' }); // Eye icon buttons
    expect(passwordToggles).toHaveLength(2); // One for password, one for confirm password
  });

  it('toggles password visibility for password field', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');
    const passwordToggles = screen.getAllByRole('button', { name: '' });
    const passwordToggle = passwordToggles[0]; // First toggle is for password field

    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(passwordToggle);
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(passwordToggle);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('toggles password visibility for confirm password field', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const passwordToggles = screen.getAllByRole('button', { name: '' });
    const confirmPasswordToggle = passwordToggles[1]; // Second toggle is for confirm password field

    expect(confirmPasswordInput).toHaveAttribute('type', 'password');

    fireEvent.click(confirmPasswordToggle);
    expect(confirmPasswordInput).toHaveAttribute('type', 'text');

    fireEvent.click(confirmPasswordToggle);
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');
  });

  it('displays validation errors for empty fields', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const form = emailInput.closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
      expect(screen.getByText('Please confirm your password')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('validates username format and length', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const usernameInput = screen.getByLabelText('Username');
    const form = usernameInput.closest('form');

    // Test short username
    fireEvent.change(usernameInput, { target: { value: 'ab' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument();
    });

    // Test invalid characters
    fireEvent.change(usernameInput, { target: { value: 'test@user!' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Username can only contain letters, numbers, underscores, and hyphens')).toBeInTheDocument();
    });
  });

  it('validates password strength requirements', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');
    const form = passwordInput.closest('form');

    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText(/Password must have:/)).toBeInTheDocument();
    });
  });

  it('validates password confirmation match', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const form = passwordInput.closest('form');

    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('shows password strength indicator', () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');

    // Test weak password
    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    expect(screen.getByText('Weak')).toBeInTheDocument();

    // Test medium password
    fireEvent.change(passwordInput, { target: { value: 'Medium123' } });
    expect(screen.getByText('Medium')).toBeInTheDocument();

    // Test strong password
    fireEvent.change(passwordInput, { target: { value: 'Strong123!' } });
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('clears validation errors when user starts typing', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const form = emailInput.closest('form');

    // Trigger validation error
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    // Start typing to clear error
    fireEvent.change(emailInput, { target: { value: 'test' } });
    expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
  });

  it('revalidates confirm password when password changes', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');

    // Set matching passwords
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });

    // Change password to create mismatch
    fireEvent.change(passwordInput, { target: { value: 'NewPassword123' } });

    // Confirm password field should now show error
    fireEvent.blur(confirmPasswordInput);
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('submits form with valid data', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123'
      });
    });
  });

  it('disables form and shows loading state when isLoading is true', () => {
    render(<Register onSubmit={mockOnSubmit} isLoading={true} />);

    const emailInput = screen.getByLabelText('Email Address');
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const submitButton = screen.getByRole('button', { name: 'Creating account...' });
    const passwordToggles = screen.getAllByRole('button', { name: '' });

    expect(emailInput).toBeDisabled();
    expect(usernameInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(confirmPasswordInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
    passwordToggles.forEach(toggle => expect(toggle).toBeDisabled());
    expect(screen.getByText('Creating account...')).toBeInTheDocument();
  });

  it('displays error message when provided', () => {
    const errorMessage = 'Registration failed. Email already exists.';
    render(<Register onSubmit={mockOnSubmit} error={errorMessage} />);

    expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    expect(screen.getByRole('alert')).toHaveClass('text-red-700', 'dark:text-red-400');
  });

  it('shows login link when onSwitchToLogin is provided', () => {
    render(<Register onSubmit={mockOnSubmit} onSwitchToLogin={mockOnSwitchToLogin} />);

    const loginLink = screen.getByRole('button', { name: 'Sign in here' });
    expect(loginLink).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
  });

  it('calls onSwitchToLogin when login link is clicked', () => {
    render(<Register onSubmit={mockOnSubmit} onSwitchToLogin={mockOnSwitchToLogin} />);

    const loginLink = screen.getByRole('button', { name: 'Sign in here' });
    fireEvent.click(loginLink);

    expect(mockOnSwitchToLogin).toHaveBeenCalledOnce();
  });

  it('disables login link when loading', () => {
    render(
      <Register
        onSubmit={mockOnSubmit}
        onSwitchToLogin={mockOnSwitchToLogin}
        isLoading={true}
      />
    );

    const loginLink = screen.getByRole('button', { name: 'Sign in here' });
    expect(loginLink).toBeDisabled();
  });

  it('disables submit button when form is invalid', () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: 'Create account' });
    expect(submitButton).toBeDisabled();

    // Fill only email
    const emailInput = screen.getByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when all fields are valid', () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const submitButton = screen.getByRole('button', { name: 'Create account' });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });

    expect(submitButton).toBeEnabled();
  });

  it('applies correct styling for validation errors', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const form = emailInput.closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email Address');
      const usernameInput = screen.getByLabelText('Username');
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');

      expect(emailInput).toHaveClass('border-red-300', 'dark:border-red-600');
      expect(usernameInput).toHaveClass('border-red-300', 'dark:border-red-600');
      expect(passwordInput).toHaveClass('border-red-300', 'dark:border-red-600');
      expect(confirmPasswordInput).toHaveClass('border-red-300', 'dark:border-red-600');
    });
  });

  it('validates password with all requirements', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByLabelText('Password');

    // Test password that meets all requirements
    fireEvent.change(passwordInput, { target: { value: 'StrongPass123!' } });

    expect(screen.getByText('Strong')).toBeInTheDocument();

    // Password should not have validation errors
    const form = passwordInput.closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.queryByText(/Password must have:/)).not.toBeInTheDocument();
    });
  });

  it('excludes confirmPassword from submission data', async () => {
    render(<Register onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText('Email Address');
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123'
        // Note: confirmPassword should not be included
      });
    });

    const callArgs = mockOnSubmit.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('confirmPassword');
  });
});