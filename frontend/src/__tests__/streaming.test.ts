import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../services/api';

// Mock fetch globally
global.fetch = vi.fn();

describe('Streaming API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle streaming response correctly', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"token","data":{"content":"Hello"}}\n\n')
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"token","data":{"content":" World"}}\n\n')
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"done"}\n\n')
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn()
        })
      }
    };

    (fetch as any).mockResolvedValue(mockResponse);

    const tokens: string[] = [];
    let completed = false;

    await apiClient.streamMessage(
      'test-conversation-id',
      'Hello',
      (token) => tokens.push(token),
      (error) => { throw new Error(error); },
      () => { completed = true; }
    );

    expect(tokens).toEqual(['Hello', ' World']);
    expect(completed).toBe(true);
  });

  it('should handle streaming errors correctly', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"error","data":{"message":"Test error"}}\n\n')
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn()
        })
      }
    };

    (fetch as any).mockResolvedValue(mockResponse);

    let errorMessage = '';
    let completed = false;

    await apiClient.streamMessage(
      'test-conversation-id',
      'Hello',
      () => {},
      (error) => { errorMessage = error; },
      () => { completed = true; }
    );

    expect(errorMessage).toBe('Test error');
    expect(completed).toBe(false);
  });

  it('should handle network errors', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));

    let errorMessage = '';

    await apiClient.streamMessage(
      'test-conversation-id',
      'Hello',
      () => {},
      (error) => { errorMessage = error; },
      () => {}
    );

    expect(errorMessage).toBe('Network error');
  });

  it('should handle HTTP errors', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    };

    (fetch as any).mockResolvedValue(mockResponse);

    let errorMessage = '';

    await apiClient.streamMessage(
      'test-conversation-id',
      'Hello',
      () => {},
      (error) => { errorMessage = error; },
      () => {}
    );

    expect(errorMessage).toBe('HTTP 500: Internal Server Error');
  });
});