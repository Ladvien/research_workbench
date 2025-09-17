import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  categorizeError,
  retryOperation,
  DebouncedErrorHandler,
  isTemporaryError,
  formatErrorForUser,
} from './errorHandling';

describe('errorHandling', () => {
  describe('categorizeError', () => {
    it('should categorize network errors', () => {
      const networkErrors = [
        'fetch failed',
        'Network error occurred',
        'Connection timeout',
        new Error('fetch: network error'),
      ];

      networkErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('network');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('Unable to connect to the server');
        expect(result.suggestions).toContain('Check your internet connection');
      });
    });

    it('should categorize authentication errors', () => {
      const authErrors = [
        'HTTP 401',
        'Unauthorized access',
        'Authentication failed',
        new Error('401: Unauthorized'),
      ];

      authErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('authentication');
        expect(result.isRetryable).toBe(false);
        expect(result.userMessage).toContain('session has expired');
        expect(result.suggestions).toContain('Log in again');
      });
    });

    it('should categorize validation errors', () => {
      const validationErrors = [
        'HTTP 400',
        'Validation failed',
        'Invalid input provided',
        new Error('400: Bad Request'),
      ];

      validationErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('validation');
        expect(result.isRetryable).toBe(false);
        expect(result.userMessage).toContain('issue with the information provided');
        expect(result.suggestions).toContain('Check that all required fields are filled');
      });
    });

    it('should categorize server errors', () => {
      const serverErrors = [
        'HTTP 500',
        'HTTP 502',
        'HTTP 503',
        'Error 500 occurred',
        new Error('500: Internal Server Error'),
      ];

      serverErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('server');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('server is experiencing issues');
        expect(result.suggestions).toContain('Wait a moment and try again');
      });
    });

    it('should categorize conversation creation errors', () => {
      const conversationErrors = [
        'Failed to create conversation',
        'Conversation creation failed',
        new Error('Unable to create conversation'),
      ];

      conversationErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('server');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('Unable to start a new conversation');
        expect(result.suggestions).toContain('Try sending your message again');
      });
    });

    it('should categorize message sending errors', () => {
      const messageErrors = [
        'Failed to send message',
        'Message streaming error',
        new Error('Unable to send message'),
      ];

      messageErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('server');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('Unable to send your message');
        expect(result.suggestions).toContain('Try sending your message again');
      });
    });

    it('should categorize file upload errors', () => {
      const fileErrors = [
        'File upload failed',
        'Upload error',
        'File too large',
        new Error('Unable to upload file'),
      ];

      fileErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('validation');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('Unable to upload the file');
        expect(result.suggestions).toContain('Check that the file is not too large');
      });
    });

    it('should categorize abort/cancel errors', () => {
      const abortErrors = [
        'Operation aborted',
        'Request cancelled',
        'User cancelled operation',
        new Error('AbortError: Operation was aborted'),
      ];

      abortErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('client');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('Operation was cancelled');
        expect(result.suggestions).toContain('Try the operation again if needed');
      });
    });

    it('should categorize unknown errors', () => {
      const unknownErrors = [
        'Some random error',
        'Unexpected failure',
        new Error('Unknown system error'),
      ];

      unknownErrors.forEach(error => {
        const result = categorizeError(error);
        expect(result.category).toBe('unknown');
        expect(result.isRetryable).toBe(true);
        expect(result.userMessage).toContain('unexpected error occurred');
        expect(result.suggestions).toContain('Try the operation again');
      });
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error message');
      const result = categorizeError(error);

      expect(result.technicalMessage).toBe('Test error message');
    });

    it('should handle string errors', () => {
      const error = 'String error message';
      const result = categorizeError(error);

      expect(result.technicalMessage).toBe('String error message');
    });

    it('should include context in technical message when provided', () => {
      const error = 'Test error';
      const context = 'During user login';
      const result = categorizeError(error, context);

      expect(result.technicalMessage).toBe('Test error');
    });
  });

  describe('retryOperation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryOperation(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      const promise = retryOperation(operation, { maxRetries: 3, retryDelay: 100 });

      // Fast-forward through delays in steps
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max retries', async () => {
      const finalError = new Error('Final failure');
      const operation = vi.fn().mockRejectedValue(finalError);

      const promise = retryOperation(operation, { maxRetries: 2, retryDelay: 10 });

      // Fast-forward through delays
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Final failure');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const promise = retryOperation(operation, {
        maxRetries: 2,
        retryDelay: 10,
        backoff: 'exponential',
      });

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use fixed backoff', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const promise = retryOperation(operation, {
        maxRetries: 2,
        retryDelay: 10,
        backoff: 'fixed',
      });

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle non-Error exceptions', async () => {
      const operation = vi.fn().mockRejectedValue('String error');

      const promise = retryOperation(operation, { maxRetries: 1, retryDelay: 10 });

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('String error');
    });

    it('should use default options', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      const promise = retryOperation(operation);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('DebouncedErrorHandler', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce error handling', () => {
      const handler = new DebouncedErrorHandler(500);
      const errorCallback = vi.fn();

      // Call multiple times quickly
      handler.handleError('network-error', errorCallback);
      handler.handleError('network-error', errorCallback);
      handler.handleError('network-error', errorCallback);

      // Should not have called yet
      expect(errorCallback).not.toHaveBeenCalled();

      // Fast-forward past debounce time
      vi.advanceTimersByTime(500);

      // Should have called only once
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle different error types separately', () => {
      const handler = new DebouncedErrorHandler(500);
      const networkCallback = vi.fn();
      const authCallback = vi.fn();

      handler.handleError('network-error', networkCallback);
      handler.handleError('auth-error', authCallback);

      vi.advanceTimersByTime(500);

      expect(networkCallback).toHaveBeenCalledTimes(1);
      expect(authCallback).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on new error of same type', () => {
      const handler = new DebouncedErrorHandler(500);
      const errorCallback = vi.fn();

      handler.handleError('network-error', errorCallback);
      vi.advanceTimersByTime(300); // Not enough to trigger

      handler.handleError('network-error', errorCallback); // Reset timer
      vi.advanceTimersByTime(300); // Still not enough

      expect(errorCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200); // Now enough for second call

      expect(errorCallback).toHaveBeenCalledTimes(1);
    });

    it('should clear all timers', () => {
      const handler = new DebouncedErrorHandler(500);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      handler.handleError('error1', callback1);
      handler.handleError('error2', callback2);

      handler.clear();

      vi.advanceTimersByTime(1000);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should use custom debounce time', () => {
      const handler = new DebouncedErrorHandler(1000);
      const errorCallback = vi.fn();

      handler.handleError('test-error', errorCallback);

      vi.advanceTimersByTime(500);
      expect(errorCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });

    it('should use default debounce time', () => {
      const handler = new DebouncedErrorHandler();
      const errorCallback = vi.fn();

      handler.handleError('test-error', errorCallback);

      vi.advanceTimersByTime(500); // Default debounce time
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('isTemporaryError', () => {
    it('should identify temporary network errors', () => {
      const temporaryErrors = [
        'Network error',
        'Connection timeout',
        'Fetch failed',
        'HTTP 500',
        'HTTP 502',
        'HTTP 503',
        new Error('Network connection failed'),
      ];

      temporaryErrors.forEach(error => {
        expect(isTemporaryError(error)).toBe(true);
      });
    });

    it('should identify non-temporary errors', () => {
      const permanentErrors = [
        'HTTP 400',
        'HTTP 401',
        'HTTP 404',
        'Validation failed',
        'Authentication error',
        new Error('Bad request'),
      ];

      permanentErrors.forEach(error => {
        expect(isTemporaryError(error)).toBe(false);
      });
    });

    it('should handle Error objects', () => {
      const temporaryError = new Error('Network timeout occurred');
      const permanentError = new Error('Invalid user input');

      expect(isTemporaryError(temporaryError)).toBe(true);
      expect(isTemporaryError(permanentError)).toBe(false);
    });

    it('should handle string errors', () => {
      expect(isTemporaryError('network failure')).toBe(true);
      expect(isTemporaryError('validation error')).toBe(false);
    });
  });

  describe('formatErrorForUser', () => {
    it('should format errors using categorization', () => {
      const networkError = 'Network connection failed';
      const result = formatErrorForUser(networkError);

      expect(result).toContain('Unable to connect to the server');
    });

    it('should use fallback for null/undefined errors', () => {
      expect(formatErrorForUser(null as any)).toBe('An unexpected error occurred');
      expect(formatErrorForUser(undefined as any)).toBe('An unexpected error occurred');
      expect(formatErrorForUser('')).toBe('An unexpected error occurred');
    });

    it('should use custom fallback message', () => {
      const customFallback = 'Custom error message';
      const result = formatErrorForUser(null as any, customFallback);

      expect(result).toBe(customFallback);
    });

    it('should handle Error objects', () => {
      const error = new Error('HTTP 401: Unauthorized');
      const result = formatErrorForUser(error);

      expect(result).toContain('session has expired');
    });

    it('should handle string errors', () => {
      const error = 'File upload failed';
      const result = formatErrorForUser(error);

      expect(result).toContain('Unable to upload the file');
    });

    it('should fallback to default when categorization fails', () => {
      const result = formatErrorForUser('Unknown error type');

      expect(result).toContain('unexpected error occurred');
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const result = categorizeError('');
      expect(result.category).toBe('unknown');
      expect(result.technicalMessage).toBe('');
    });

    it('should handle whitespace-only strings', () => {
      const result = categorizeError('   ');
      expect(result.category).toBe('unknown');
      expect(result.technicalMessage).toBe('   ');
    });

    it('should handle very long error messages', () => {
      const longError = 'A'.repeat(10000);
      const result = categorizeError(longError);
      expect(result.technicalMessage).toBe(longError);
      expect(result.userMessage).toBeDefined();
    });

    it('should handle special characters in error messages', () => {
      const specialError = 'Error: <script>alert("xss")</script> 网络错误 🚨';
      const result = categorizeError(specialError);
      expect(result.technicalMessage).toBe(specialError);
      expect(result.userMessage).toBeDefined();
    });

    it('should handle objects that are not Error instances', () => {
      const objectError = { message: 'Custom error object' };
      const result = categorizeError(objectError as any);
      expect(result.technicalMessage).toBe('[object Object]');
      expect(result.category).toBe('unknown');
    });
  });
});
