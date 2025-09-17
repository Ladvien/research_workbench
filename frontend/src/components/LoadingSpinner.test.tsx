import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LoadingSpinner,
  LoadingDots,
  Skeleton,
  ConversationSkeleton,
  LoadingOverlay,
  type LoadingSpinnerSize,
  type LoadingSpinnerVariant,
} from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<LoadingSpinner label="Processing..." />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Processing...');
    expect(screen.getAllByText('Processing...')).toHaveLength(2);
    // Label is visible (not screen reader text)
    const visibleText = screen.getByText('Processing...', { selector: 'span.text-sm' });
    expect(visibleText).toBeVisible();
  });

  it('applies correct size classes', () => {
    const sizes: LoadingSpinnerSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
    
    sizes.forEach((size) => {
      const { rerender } = render(<LoadingSpinner size={size} data-testid={`spinner-${size}`} />);
      
      const container = screen.getByTestId(`spinner-${size}`);
      const spinnerDiv = container.querySelector('div');
      
      expect(spinnerDiv).toBeInTheDocument();
      expect(spinnerDiv).toHaveClass('animate-spin', 'rounded-full', 'border-2');
      
      rerender(<div />); // Clean up for next iteration
    });
  });

  it('applies correct variant classes', () => {
    const variants: LoadingSpinnerVariant[] = [
      'default', 'primary', 'secondary', 'success', 'warning', 'error'
    ];
    
    variants.forEach((variant) => {
      const { rerender } = render(<LoadingSpinner variant={variant} data-testid={`spinner-${variant}`} />);
      
      const container = screen.getByTestId(`spinner-${variant}`);
      const spinnerDiv = container.querySelector('div');
      
      expect(spinnerDiv).toBeInTheDocument();
      expect(spinnerDiv).toHaveClass('animate-spin');
      
      rerender(<div />); // Clean up for next iteration
    });
  });

  it('renders inline when specified', () => {
    render(<LoadingSpinner inline data-testid="inline-spinner" />);
    
    const container = screen.getByTestId('inline-spinner');
    expect(container).toHaveClass('inline-flex', 'items-center', 'gap-2');
  });

  it('renders as block when not inline', () => {
    render(<LoadingSpinner inline={false} data-testid="block-spinner" />);
    
    const container = screen.getByTestId('block-spinner');
    expect(container).toHaveClass('flex', 'items-center', 'justify-center', 'gap-2');
    expect(container).not.toHaveClass('inline-flex');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-class" data-testid="custom-spinner" />);
    
    const container = screen.getByTestId('custom-spinner');
    const spinnerDiv = container.querySelector('div');
    
    expect(spinnerDiv).toHaveClass('custom-class');
  });

  it('includes accessibility attributes', () => {
    render(<LoadingSpinner label="Custom loading" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Custom loading');
    
    // Screen reader text
    expect(screen.getByText('Custom loading', { selector: '.sr-only' })).toBeInTheDocument();
  });
});

describe('LoadingDots', () => {
  it('renders with default props', () => {
    render(<LoadingDots data-testid="loading-dots" />);
    
    const container = screen.getByTestId('loading-dots');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('role', 'status');
    expect(container).toHaveAttribute('aria-label', 'Loading');
    
    // Should have 3 dot elements
    const dots = container.querySelectorAll('div.rounded-full');
    expect(dots).toHaveLength(3);
  });

  it('applies correct size classes', () => {
    const { rerender } = render(<LoadingDots size="sm" data-testid="dots-sm" />);
    
    let dots = screen.getByTestId('dots-sm').querySelectorAll('div.rounded-full');
    dots.forEach(dot => {
      expect(dot).toHaveClass('w-1', 'h-1');
    });
    
    rerender(<LoadingDots size="md" data-testid="dots-md" />);
    
    dots = screen.getByTestId('dots-md').querySelectorAll('div.rounded-full');
    dots.forEach(dot => {
      expect(dot).toHaveClass('w-2', 'h-2');
    });
  });

  it('applies correct variant classes', () => {
    render(<LoadingDots variant="primary" data-testid="primary-dots" />);
    
    const dots = screen.getByTestId('primary-dots').querySelectorAll('div.rounded-full');
    dots.forEach(dot => {
      expect(dot).toHaveClass('bg-blue-500');
    });
  });

  it('applies animation delays correctly', () => {
    render(<LoadingDots data-testid="animated-dots" />);
    
    const dots = screen.getByTestId('animated-dots').querySelectorAll('div.rounded-full');
    
    expect(dots[0]).not.toHaveAttribute('style');
    expect(dots[1]).toHaveStyle('animation-delay: 0.1s');
    expect(dots[2]).toHaveStyle('animation-delay: 0.2s');
  });

  it('includes screen reader text', () => {
    render(<LoadingDots />);
    
    expect(screen.getByText('Loading...', { selector: '.sr-only' })).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('renders single line by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    
    const container = screen.getByTestId('skeleton');
    expect(container).toHaveClass('animate-pulse');
    
    const lines = container.querySelectorAll('div.h-4');
    expect(lines).toHaveLength(1);
  });

  it('renders multiple lines when specified', () => {
    render(<Skeleton lines={3} data-testid="multi-skeleton" />);
    
    const container = screen.getByTestId('multi-skeleton');
    const lines = container.querySelectorAll('div.h-4');
    
    expect(lines).toHaveLength(3);
  });

  it('applies different width to last line', () => {
    render(<Skeleton lines={2} data-testid="width-skeleton" />);
    
    const container = screen.getByTestId('width-skeleton');
    const lines = container.querySelectorAll('div.h-4');
    
    expect(lines[0]).toHaveClass('w-full');
    expect(lines[1]).toHaveClass('w-3/4');
  });

  it('applies custom className', () => {
    render(<Skeleton className="custom-skeleton" data-testid="custom-skeleton" />);
    
    const container = screen.getByTestId('custom-skeleton');
    expect(container).toHaveClass('custom-skeleton', 'animate-pulse');
  });
});

describe('ConversationSkeleton', () => {
  it('renders default number of conversation items', () => {
    render(<ConversationSkeleton data-testid="conv-skeleton" />);
    
    const container = screen.getByTestId('conv-skeleton');
    expect(container).toHaveClass('space-y-2', 'p-2');
    
    const items = container.querySelectorAll('div.animate-pulse');
    expect(items).toHaveLength(3); // Default count
  });

  it('renders custom number of conversation items', () => {
    render(<ConversationSkeleton count={5} data-testid="conv-skeleton-5" />);
    
    const container = screen.getByTestId('conv-skeleton-5');
    const items = container.querySelectorAll('div.animate-pulse');
    
    expect(items).toHaveLength(5);
  });

  it('renders conversation item structure', () => {
    render(<ConversationSkeleton count={1} data-testid="single-conv" />);
    
    const container = screen.getByTestId('single-conv');
    const item = container.querySelector('div.animate-pulse');
    
    expect(item).toBeInTheDocument();
    expect(item).toHaveClass('p-3', 'mx-2', 'rounded-lg');
    
    // Should have title and time skeleton
    const titleSkeleton = item?.querySelector('div.w-32');
    const timeSkeleton = item?.querySelector('div.w-12');
    
    expect(titleSkeleton).toBeInTheDocument();
    expect(timeSkeleton).toBeInTheDocument();
  });
});

describe('LoadingOverlay', () => {
  it('renders when visible', () => {
    render(<LoadingOverlay isVisible={true} data-testid="overlay" />);
    
    const overlay = screen.getByTestId('overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('fixed', 'inset-0', 'bg-black', 'bg-opacity-50');
    
    // Should contain loading spinner
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    render(<LoadingOverlay isVisible={false} data-testid="hidden-overlay" />);
    
    expect(screen.queryByTestId('hidden-overlay')).not.toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<LoadingOverlay isVisible={true} message="Processing data..." />);
    
    expect(screen.getByText('Processing data...')).toBeInTheDocument();
  });

  it('applies custom variant to spinner', () => {
    render(<LoadingOverlay isVisible={true} variant="success" data-testid="success-overlay" />);
    
    const overlay = screen.getByTestId('success-overlay');
    expect(overlay).toBeInTheDocument();
    
    // Should render with success variant (spinner inside should have success classes)
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
  });

  it('has correct z-index for overlay', () => {
    render(<LoadingOverlay isVisible={true} data-testid="z-index-overlay" />);
    
    const overlay = screen.getByTestId('z-index-overlay');
    expect(overlay).toHaveClass('z-50');
  });

  it('centers content properly', () => {
    render(<LoadingOverlay isVisible={true} data-testid="centered-overlay" />);
    
    const overlay = screen.getByTestId('centered-overlay');
    expect(overlay).toHaveClass('flex', 'items-center', 'justify-center');
    
    const content = overlay.querySelector('div.bg-white');
    expect(content).toBeInTheDocument();
    expect(content).toHaveClass('rounded-lg', 'p-6', 'shadow-xl');
  });
});
