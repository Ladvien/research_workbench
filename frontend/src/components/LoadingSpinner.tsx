import React from 'react';

export type LoadingSpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LoadingSpinnerVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';

interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  variant?: LoadingSpinnerVariant;
  className?: string;
  label?: string;
  inline?: boolean;
  'data-testid'?: string;
}

const sizeClasses: Record<LoadingSpinnerSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
};

const variantClasses: Record<LoadingSpinnerVariant, string> = {
  default: 'border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300',
  primary: 'border-blue-200 border-t-blue-600 dark:border-blue-800 dark:border-t-blue-400',
  secondary: 'border-gray-200 border-t-gray-500 dark:border-gray-700 dark:border-t-gray-400',
  success: 'border-green-200 border-t-green-600 dark:border-green-800 dark:border-t-green-400',
  warning: 'border-yellow-200 border-t-yellow-600 dark:border-yellow-800 dark:border-t-yellow-400',
  error: 'border-red-200 border-t-red-600 dark:border-red-800 dark:border-t-red-400'
};

/**
 * A customizable loading spinner component with multiple sizes and variants
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  className = '',
  label,
  inline = false,
  'data-testid': testId
}) => {
  const spinnerClasses = [
    'animate-spin rounded-full border-2',
    sizeClasses[size],
    variantClasses[variant],
    className
  ].filter(Boolean).join(' ');

  const containerClasses = inline
    ? 'inline-flex items-center gap-2'
    : 'flex items-center justify-center gap-2';

  return (
    <div
      className={containerClasses}
      role="status"
      aria-label={label || 'Loading'}
      data-testid={testId}
    >
      <div className={spinnerClasses} />
      {label && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {label}
        </span>
      )}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
};

/**
 * Bouncing dots loading indicator for chat and messaging contexts
 */
interface LoadingDotsProps {
  size?: 'sm' | 'md';
  variant?: LoadingSpinnerVariant;
  className?: string;
  'data-testid'?: string;
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  size = 'md',
  variant = 'default',
  className = '',
  'data-testid': testId
}) => {
  const dotSizeClasses = size === 'sm' ? 'w-1 h-1' : 'w-2 h-2';

  const dotVariantClasses: Record<LoadingSpinnerVariant, string> = {
    default: 'bg-gray-400 dark:bg-gray-500',
    primary: 'bg-blue-500 dark:bg-blue-400',
    secondary: 'bg-gray-500 dark:bg-gray-400',
    success: 'bg-green-500 dark:bg-green-400',
    warning: 'bg-yellow-500 dark:bg-yellow-400',
    error: 'bg-red-500 dark:bg-red-400'
  };

  const dotClasses = [
    'rounded-full animate-bounce',
    dotSizeClasses,
    dotVariantClasses[variant]
  ].join(' ');

  return (
    <div
      className={`flex space-x-1 ${className}`}
      role="status"
      aria-label="Loading"
      data-testid={testId}
    >
      <div className={dotClasses} />
      <div className={dotClasses} style={{ animationDelay: '0.1s' }} />
      <div className={dotClasses} style={{ animationDelay: '0.2s' }} />
      <span className="sr-only">Loading...</span>
    </div>
  );
};

/**
 * Skeleton loader for text content
 */
interface SkeletonProps {
  lines?: number;
  className?: string;
  'data-testid'?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  lines = 1,
  className = '',
  'data-testid': testId
}) => {
  return (
    <div className={`animate-pulse ${className}`} data-testid={testId}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 ${
            index === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
};

/**
 * Skeleton loader for conversation items in sidebar
 */
export const ConversationSkeleton: React.FC<{ count?: number; 'data-testid'?: string }> = ({
  count = 3,
  'data-testid': testId
}) => {
  return (
    <div className="space-y-2 p-2" data-testid={testId}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animate-pulse p-3 mx-2 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
          </div>
          <div className="flex justify-between items-center">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Loading overlay for full-screen loading states
 */
interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  variant?: LoadingSpinnerVariant;
  'data-testid'?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = 'Loading...',
  variant = 'primary',
  'data-testid': testId
}) => {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      data-testid={testId}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="text-center">
          <LoadingSpinner size="lg" variant={variant} />
          <p className="mt-4 text-gray-900 dark:text-white">{message}</p>
        </div>
      </div>
    </div>
  );
};