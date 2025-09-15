// Error handling utilities for better user experience

export interface ErrorContext {
  userMessage: string;
  technicalMessage?: string;
  isRetryable: boolean;
  category: 'network' | 'authentication' | 'validation' | 'server' | 'client' | 'unknown';
  suggestions?: string[];
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoff?: 'fixed' | 'exponential';
}

/**
 * Categorizes and provides user-friendly error messages based on error type
 */
export function categorizeError(error: string | Error, context?: string): ErrorContext {
  const errorMessage = error instanceof Error ? error.message : error;
  const lowerError = errorMessage.toLowerCase();

  // Network errors
  if (lowerError.includes('fetch') || lowerError.includes('network') || lowerError.includes('connection')) {
    return {
      userMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'network',
      suggestions: ['Check your internet connection', 'Try refreshing the page', 'Contact support if the issue persists'],
    };
  }

  // Authentication errors
  if (lowerError.includes('401') || lowerError.includes('unauthorized') || lowerError.includes('authentication')) {
    return {
      userMessage: 'Your session has expired. Please log in again.',
      technicalMessage: errorMessage,
      isRetryable: false,
      category: 'authentication',
      suggestions: ['Log in again', 'Clear your browser cache if the problem persists'],
    };
  }

  // Validation errors
  if (lowerError.includes('400') || lowerError.includes('validation') || lowerError.includes('invalid')) {
    return {
      userMessage: 'There was an issue with the information provided. Please check your input and try again.',
      technicalMessage: errorMessage,
      isRetryable: false,
      category: 'validation',
      suggestions: ['Check that all required fields are filled', 'Ensure the format is correct'],
    };
  }

  // Server errors
  if (lowerError.includes('5') && (lowerError.includes('00') || lowerError.includes('02') || lowerError.includes('03'))) {
    return {
      userMessage: 'The server is experiencing issues. Please try again in a moment.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'server',
      suggestions: ['Wait a moment and try again', 'Contact support if the issue continues'],
    };
  }

  // Conversation creation errors
  if (lowerError.includes('conversation') && lowerError.includes('create')) {
    return {
      userMessage: 'Unable to start a new conversation. Please try again.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'server',
      suggestions: ['Try sending your message again', 'Refresh the page if the problem persists'],
    };
  }

  // Message sending errors
  if (lowerError.includes('message') && (lowerError.includes('send') || lowerError.includes('stream'))) {
    return {
      userMessage: 'Unable to send your message. Please try again.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'server',
      suggestions: ['Try sending your message again', 'Check that your message is not empty'],
    };
  }

  // File upload errors
  if (lowerError.includes('upload') || lowerError.includes('file')) {
    return {
      userMessage: 'Unable to upload the file. Please check the file size and format.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'validation',
      suggestions: ['Check that the file is not too large', 'Ensure the file format is supported', 'Try uploading a different file'],
    };
  }

  // Abort errors (user cancelled)
  if (lowerError.includes('abort') || lowerError.includes('cancel')) {
    return {
      userMessage: 'Operation was cancelled.',
      technicalMessage: errorMessage,
      isRetryable: true,
      category: 'client',
      suggestions: ['Try the operation again if needed'],
    };
  }

  // Generic error
  return {
    userMessage: 'An unexpected error occurred. Please try again.',
    technicalMessage: errorMessage,
    isRetryable: true,
    category: 'unknown',
    suggestions: ['Try the operation again', 'Refresh the page', 'Contact support if the problem continues'],
  };
}

/**
 * Retry function with configurable options
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoff = 'exponential'
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay based on backoff strategy
      const delay = backoff === 'exponential'
        ? retryDelay * Math.pow(2, attempt)
        : retryDelay;

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Debounced error handler to prevent error spam
 */
export class DebouncedErrorHandler {
  private errorTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceTime: number;

  constructor(debounceTime = 500) {
    this.debounceTime = debounceTime;
  }

  handleError(errorKey: string, handler: () => void) {
    // Clear existing timeout for this error type
    const existingTimeout = this.errorTimeouts.get(errorKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      handler();
      this.errorTimeouts.delete(errorKey);
    }, this.debounceTime);

    this.errorTimeouts.set(errorKey, timeout);
  }

  clear() {
    this.errorTimeouts.forEach(timeout => clearTimeout(timeout));
    this.errorTimeouts.clear();
  }
}

/**
 * Check if an error is likely a temporary network issue
 */
export function isTemporaryError(error: string | Error): boolean {
  const errorMessage = error instanceof Error ? error.message : error;
  const lowerError = errorMessage.toLowerCase();

  return lowerError.includes('network') ||
         lowerError.includes('timeout') ||
         lowerError.includes('5') && (lowerError.includes('00') || lowerError.includes('02') || lowerError.includes('03')) ||
         lowerError.includes('connection') ||
         lowerError.includes('fetch');
}

/**
 * Format error for user display with fallback
 */
export function formatErrorForUser(error: string | Error, fallback = 'An unexpected error occurred'): string {
  if (!error) return fallback;

  const errorContext = categorizeError(error);
  return errorContext.userMessage || fallback;
}