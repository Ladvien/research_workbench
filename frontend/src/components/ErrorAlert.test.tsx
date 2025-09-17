import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorAlert, type ErrorAlertProps } from './ErrorAlert';

describe('ErrorAlert', () => {
  const defaultProps: ErrorAlertProps = {
    error: 'Something went wrong',
  };

  it('renders with default props', () => {
    render(<ErrorAlert {...defaultProps} />);
    
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(<ErrorAlert {...defaultProps} title="Custom Error Title" />);
    
    expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('applies correct styling for error type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="error" />);
    
    const alertDiv = container.firstChild as HTMLElement;
    expect(alertDiv).toHaveClass('bg-red-50', 'border-red-200');
  });

  it('applies correct styling for warning type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="warning" />);
    
    const alertDiv = container.firstChild as HTMLElement;
    expect(alertDiv).toHaveClass('bg-yellow-50', 'border-yellow-200');
  });

  it('applies correct styling for info type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="info" />);
    
    const alertDiv = container.firstChild as HTMLElement;
    expect(alertDiv).toHaveClass('bg-blue-50', 'border-blue-200');
  });

  it('renders retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert {...defaultProps} onRetry={onRetry} />);
    
    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<ErrorAlert {...defaultProps} onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByText('Dismiss');
    expect(dismissButton).toBeInTheDocument();
    
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders close button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<ErrorAlert {...defaultProps} onDismiss={onDismiss} />);
    
    const closeButton = screen.getByText('Close', { selector: '.sr-only' }).parentElement;
    expect(closeButton).toBeInTheDocument();
    
    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders both retry and dismiss buttons when both callbacks are provided', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<ErrorAlert {...defaultProps} onRetry={onRetry} onDismiss={onDismiss} />);
    
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
    expect(screen.getByText('Close', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('uses custom button labels', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ErrorAlert
        {...defaultProps}
        onRetry={onRetry}
        onDismiss={onDismiss}
        retryLabel="Retry Operation"
        dismissLabel="Close Alert"
      />
    );
    
    expect(screen.getByText('Retry Operation')).toBeInTheDocument();
    expect(screen.getByText('Close Alert')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ErrorAlert {...defaultProps} className="custom-class" />);
    
    const alertDiv = container.firstChild as HTMLElement;
    expect(alertDiv).toHaveClass('custom-class');
  });

  it('does not render action buttons when no callbacks are provided', () => {
    render(<ErrorAlert {...defaultProps} />);
    
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('renders correct icon for error type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="error" />);
    
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('renders correct icon for warning type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="warning" />);
    
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('renders correct icon for info type', () => {
    const { container } = render(<ErrorAlert {...defaultProps} type="info" />);
    
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('has proper accessibility attributes', () => {
    const onDismiss = vi.fn();
    render(<ErrorAlert {...defaultProps} onDismiss={onDismiss} />);
    
    const closeButton = screen.getByText('Close', { selector: '.sr-only' }).parentElement;
    expect(closeButton?.querySelector('.sr-only')).toHaveTextContent('Close');
  });

  it('handles focus states properly', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert {...defaultProps} onRetry={onRetry} />);
    
    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toHaveClass('focus:outline-none', 'focus:underline');
  });

  it('handles long error messages gracefully', () => {
    const longError = 'This is a very long error message that should wrap properly and not break the layout of the error alert component';
    render(<ErrorAlert error={longError} />);
    
    expect(screen.getByText(longError)).toBeInTheDocument();
  });

  it('handles HTML entities in error messages', () => {
    const errorWithEntities = 'Error: &lt;script&gt; tag not allowed';
    render(<ErrorAlert error={errorWithEntities} />);
    
    expect(screen.getByText(errorWithEntities)).toBeInTheDocument();
  });

  it('maintains button functionality after multiple clicks', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert {...defaultProps} onRetry={onRetry} />);
    
    const retryButton = screen.getByText('Try Again');
    
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    
    expect(onRetry).toHaveBeenCalledTimes(3);
  });
});
