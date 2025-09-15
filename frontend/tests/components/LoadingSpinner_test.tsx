import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LoadingSpinner,
  LoadingDots,
  Skeleton,
  ConversationSkeleton,
  LoadingOverlay
} from '../../src/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('renders with custom label', () => {
    render(<LoadingSpinner label="Processing..." />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Processing...');
    expect(screen.getAllByText('Processing...').length).toBeGreaterThan(0);
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<LoadingSpinner size="xs" data-testid="spinner" />);
    let spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('w-3 h-3');

    rerender(<LoadingSpinner size="lg" data-testid="spinner" />);
    spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('w-8 h-8');
  });

  it('renders with different variants', () => {
    const { rerender } = render(<LoadingSpinner variant="primary" data-testid="spinner" />);
    let spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('border-blue-200 border-t-blue-600');

    rerender(<LoadingSpinner variant="error" data-testid="spinner" />);
    spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('border-red-200 border-t-red-600');
  });

  it('renders inline when specified', () => {
    render(<LoadingSpinner inline data-testid="spinner" />);
    const container = screen.getByTestId('spinner');
    expect(container).toHaveClass('inline-flex items-center gap-2');
  });

  it('renders centered when not inline', () => {
    render(<LoadingSpinner data-testid="spinner" />);
    const container = screen.getByTestId('spinner');
    expect(container).toHaveClass('flex items-center justify-center gap-2');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-class" data-testid="spinner" />);
    const spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('custom-class');
  });
});

describe('LoadingDots', () => {
  it('renders three bouncing dots', () => {
    render(<LoadingDots data-testid="dots" />);
    const container = screen.getByTestId('dots');
    const dots = container.querySelectorAll('div');
    expect(dots).toHaveLength(3);

    // Check that dots have bouncing animation
    dots.forEach((dot) => {
      expect(dot).toHaveClass('animate-bounce');
    });
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<LoadingDots size="sm" data-testid="dots" />);
    let dots = screen.getByTestId('dots').querySelectorAll('div');
    dots.forEach((dot) => {
      expect(dot).toHaveClass('w-1 h-1');
    });

    rerender(<LoadingDots size="md" data-testid="dots" />);
    dots = screen.getByTestId('dots').querySelectorAll('div');
    dots.forEach((dot) => {
      expect(dot).toHaveClass('w-2 h-2');
    });
  });

  it('renders with different variants', () => {
    const { rerender } = render(<LoadingDots variant="primary" data-testid="dots" />);
    let dots = screen.getByTestId('dots').querySelectorAll('div');
    dots.forEach((dot) => {
      expect(dot).toHaveClass('bg-blue-500');
    });

    rerender(<LoadingDots variant="error" data-testid="dots" />);
    dots = screen.getByTestId('dots').querySelectorAll('div');
    dots.forEach((dot) => {
      expect(dot).toHaveClass('bg-red-500');
    });
  });

  it('has proper animation delays', () => {
    render(<LoadingDots data-testid="dots" />);
    const dots = screen.getByTestId('dots').querySelectorAll('div');

    expect(dots[0]).not.toHaveStyle('animation-delay: 0.1s');
    expect(dots[1]).toHaveStyle('animation-delay: 0.1s');
    expect(dots[2]).toHaveStyle('animation-delay: 0.2s');
  });
});

describe('Skeleton', () => {
  it('renders single line by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    const container = screen.getByTestId('skeleton');
    const lines = container.querySelectorAll('div');
    expect(lines).toHaveLength(1);
  });

  it('renders multiple lines when specified', () => {
    render(<Skeleton lines={3} data-testid="skeleton" />);
    const container = screen.getByTestId('skeleton');
    const lines = container.querySelectorAll('div');
    expect(lines).toHaveLength(3);
  });

  it('makes last line shorter', () => {
    render(<Skeleton lines={2} data-testid="skeleton" />);
    const container = screen.getByTestId('skeleton');
    const lines = container.querySelectorAll('div');

    expect(lines[0]).toHaveClass('w-full');
    expect(lines[1]).toHaveClass('w-3/4');
  });

  it('has pulse animation', () => {
    render(<Skeleton data-testid="skeleton" />);
    const container = screen.getByTestId('skeleton');
    expect(container).toHaveClass('animate-pulse');
  });
});

describe('ConversationSkeleton', () => {
  it('renders default number of conversation items', () => {
    render(<ConversationSkeleton data-testid="conversation-skeleton" />);
    const container = screen.getByTestId('conversation-skeleton');
    const items = container.querySelectorAll('div[class*="animate-pulse"]:not(.space-y-2)');
    expect(items).toHaveLength(3);
  });

  it('renders custom number of conversation items', () => {
    render(<ConversationSkeleton count={5} data-testid="conversation-skeleton" />);
    const container = screen.getByTestId('conversation-skeleton');
    const items = container.querySelectorAll('div[class*="animate-pulse"]:not(.space-y-2)');
    expect(items).toHaveLength(5);
  });

  it('has proper spacing and structure', () => {
    render(<ConversationSkeleton data-testid="conversation-skeleton" />);
    const container = screen.getByTestId('conversation-skeleton');
    expect(container).toHaveClass('space-y-2 p-2');
  });
});

describe('LoadingOverlay', () => {
  it('renders when visible', () => {
    render(<LoadingOverlay isVisible={true} data-testid="overlay" />);
    const overlay = screen.getByTestId('overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('fixed inset-0 bg-black bg-opacity-50');
  });

  it('does not render when not visible', () => {
    render(<LoadingOverlay isVisible={false} data-testid="overlay" />);
    const overlay = screen.queryByTestId('overlay');
    expect(overlay).not.toBeInTheDocument();
  });

  it('displays custom message', () => {
    render(<LoadingOverlay isVisible={true} message="Processing request..." />);
    expect(screen.getByText('Processing request...')).toBeInTheDocument();
  });

  it('displays default message', () => {
    render(<LoadingOverlay isVisible={true} />);
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
  });

  it('renders with different variants', () => {
    render(<LoadingOverlay isVisible={true} variant="error" />);
    const spinner = screen.getByRole('status').querySelector('div');
    expect(spinner).toHaveClass('border-red-200 border-t-red-600');
  });

  it('has proper z-index for overlay', () => {
    render(<LoadingOverlay isVisible={true} data-testid="overlay" />);
    const overlay = screen.getByTestId('overlay');
    expect(overlay).toHaveClass('z-50');
  });
});

describe('Accessibility', () => {
  it('LoadingSpinner has proper ARIA attributes', () => {
    render(<LoadingSpinner label="Custom loading message" />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Custom loading message');
    expect(screen.getByText('Custom loading message', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('LoadingDots has proper ARIA attributes', () => {
    render(<LoadingDots />);
    const dots = screen.getByRole('status');
    expect(dots).toHaveAttribute('aria-label', 'Loading');
    expect(screen.getByText('Loading...', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('provides screen reader text for all components', () => {
    render(
      <div>
        <LoadingSpinner />
        <LoadingDots />
        <LoadingOverlay isVisible={true} />
      </div>
    );

    const srTexts = screen.getAllByText(/Loading/);
    expect(srTexts.length).toBeGreaterThan(0);
  });
});

describe('Responsive behavior', () => {
  it('applies responsive classes correctly', () => {
    render(<LoadingSpinner size="lg" className="md:w-16 md:h-16" data-testid="spinner" />);
    const spinnerDiv = screen.getByTestId('spinner').querySelector('div');
    expect(spinnerDiv).toHaveClass('w-8 h-8 md:w-16 md:h-16');
  });
});

describe('Edge cases', () => {
  it('handles zero lines in Skeleton', () => {
    render(<Skeleton lines={0} data-testid="skeleton" />);
    const container = screen.getByTestId('skeleton');
    const lines = container.querySelectorAll('div');
    expect(lines).toHaveLength(0);
  });

  it('handles zero count in ConversationSkeleton', () => {
    render(<ConversationSkeleton count={0} data-testid="conversation-skeleton" />);
    const container = screen.getByTestId('conversation-skeleton');
    const items = container.querySelectorAll('div[class*="animate-pulse"]:not(.space-y-2)');
    expect(items).toHaveLength(0);
  });
});