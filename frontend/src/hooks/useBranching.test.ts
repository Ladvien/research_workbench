import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBranching } from './useBranching';
import { BranchingAPI } from '../utils/branchingApi';
import type {
  ConversationTreeResponse,
  EditMessageResponse,
  SwitchBranchResponse,
  BranchOption,
} from '../types/chat';

// Mock the BranchingAPI
vi.mock('../utils/branchingApi', () => ({
  BranchingAPI: {
    getConversationTree: vi.fn(),
    editMessage: vi.fn(),
    switchBranch: vi.fn(),
    deleteMessage: vi.fn(),
    getMessageBranches: vi.fn(),
  },
}));

const mockBranchingAPI = vi.mocked(BranchingAPI);

describe('useBranching', () => {
  const conversationId = 'conv-123';
  const onTreeUpdate = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct default values', () => {
      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      expect(result.current.treeData).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loadTree', () => {
    it('should load conversation tree successfully', async () => {
      const mockTreeData: ConversationTreeResponse = {
        conversation_id: conversationId,
        nodes: [],
        active_thread: [],
      };

      mockBranchingAPI.getConversationTree.mockResolvedValue(mockTreeData);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.loadTree();
      });

      expect(mockBranchingAPI.getConversationTree).toHaveBeenCalledWith(conversationId);
      expect(result.current.treeData).toBe(mockTreeData);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(onTreeUpdate).toHaveBeenCalledWith(mockTreeData);
    });

    it('should handle API error during tree loading', async () => {
      const error = new Error('Failed to load tree');
      mockBranchingAPI.getConversationTree.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.loadTree();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Failed to load tree');
      expect(result.current.treeData).toBeNull();
      expect(onError).toHaveBeenCalledWith('Failed to load tree');
    });

    it('should not load tree when conversationId is empty', async () => {
      const { result } = renderHook(() =>
        useBranching({ conversationId: '', onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.loadTree();
      });

      expect(mockBranchingAPI.getConversationTree).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('should set loading state correctly during operation', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      mockBranchingAPI.getConversationTree.mockReturnValue(promise);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      act(() => {
        result.current.loadTree();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise({ conversation_id: conversationId, nodes: [], active_thread: [] });
        await promise;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('editMessage', () => {
    it('should edit message successfully and reload tree', async () => {
      const messageId = 'msg-123';
      const content = 'Updated content';
      const mockResponse: EditMessageResponse = {
        message_id: messageId,
        new_branch_id: 'branch-456',
        success: true,
      };
      const mockTreeData: ConversationTreeResponse = {
        conversation_id: conversationId,
        nodes: [],
        active_thread: [],
      };

      mockBranchingAPI.editMessage.mockResolvedValue(mockResponse);
      mockBranchingAPI.getConversationTree.mockResolvedValue(mockTreeData);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      let editResult: EditMessageResponse;
      await act(async () => {
        editResult = await result.current.editMessage(messageId, content);
      });

      expect(mockBranchingAPI.editMessage).toHaveBeenCalledWith(messageId, { content });
      expect(mockBranchingAPI.getConversationTree).toHaveBeenCalledWith(conversationId);
      expect(editResult!).toBe(mockResponse);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle edit message error', async () => {
      const messageId = 'msg-123';
      const content = 'Updated content';
      const error = new Error('Edit failed');

      mockBranchingAPI.editMessage.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await expect(result.current.editMessage(messageId, content)).rejects.toThrow('Edit failed');
      });

      expect(result.current.error).toBe('Edit failed');
      expect(result.current.isLoading).toBe(false);
      expect(onError).toHaveBeenCalledWith('Edit failed');
    });
  });

  describe('switchBranch', () => {
    it('should switch branch successfully and reload tree', async () => {
      const targetMessageId = 'msg-456';
      const mockResponse: SwitchBranchResponse = {
        new_active_thread: [targetMessageId],
        success: true,
      };
      const mockTreeData: ConversationTreeResponse = {
        conversation_id: conversationId,
        nodes: [],
        active_thread: [targetMessageId],
      };

      mockBranchingAPI.switchBranch.mockResolvedValue(mockResponse);
      mockBranchingAPI.getConversationTree.mockResolvedValue(mockTreeData);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      let switchResult: SwitchBranchResponse;
      await act(async () => {
        switchResult = await result.current.switchBranch(targetMessageId);
      });

      expect(mockBranchingAPI.switchBranch).toHaveBeenCalledWith(conversationId, {
        targetMessageId,
      });
      expect(mockBranchingAPI.getConversationTree).toHaveBeenCalledWith(conversationId);
      expect(switchResult!).toBe(mockResponse);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should not switch branch when conversationId is empty', async () => {
      const { result } = renderHook(() =>
        useBranching({ conversationId: '', onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.switchBranch('msg-456');
      });

      expect(mockBranchingAPI.switchBranch).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle switch branch error', async () => {
      const targetMessageId = 'msg-456';
      const error = new Error('Switch failed');

      mockBranchingAPI.switchBranch.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await expect(result.current.switchBranch(targetMessageId)).rejects.toThrow('Switch failed');
      });

      expect(result.current.error).toBe('Switch failed');
      expect(result.current.isLoading).toBe(false);
      expect(onError).toHaveBeenCalledWith('Switch failed');
    });
  });

  describe('deleteMessage', () => {
    it('should delete message successfully and reload tree', async () => {
      const messageId = 'msg-789';
      const mockTreeData: ConversationTreeResponse = {
        conversation_id: conversationId,
        nodes: [],
        active_thread: [],
      };

      mockBranchingAPI.deleteMessage.mockResolvedValue(undefined);
      mockBranchingAPI.getConversationTree.mockResolvedValue(mockTreeData);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.deleteMessage(messageId);
      });

      expect(mockBranchingAPI.deleteMessage).toHaveBeenCalledWith(messageId);
      expect(mockBranchingAPI.getConversationTree).toHaveBeenCalledWith(conversationId);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle delete message error', async () => {
      const messageId = 'msg-789';
      const error = new Error('Delete failed');

      mockBranchingAPI.deleteMessage.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        try {
          await result.current.deleteMessage(messageId);
        } catch (e) {
          // Expected to throw, but we want to check the state afterwards
        }
      });

      expect(result.current.error).toBe('Delete failed');
      expect(result.current.isLoading).toBe(false);
      expect(onError).toHaveBeenCalledWith('Delete failed');
    });
  });

  describe('getMessageBranches', () => {
    it('should get message branches successfully', async () => {
      const messageId = 'msg-123';
      const mockBranches: BranchOption[] = [
        { message_id: 'msg-456', content: 'Branch 1', created_at: '2023-01-01T00:00:00Z' },
        { message_id: 'msg-789', content: 'Branch 2', created_at: '2023-01-02T00:00:00Z' },
      ];

      mockBranchingAPI.getMessageBranches.mockResolvedValue(mockBranches);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      let branches: BranchOption[];
      await act(async () => {
        branches = await result.current.getMessageBranches(messageId);
      });

      expect(mockBranchingAPI.getMessageBranches).toHaveBeenCalledWith(messageId);
      expect(branches!).toBe(mockBranches);
      expect(result.current.error).toBeNull();
    });

    it('should handle get message branches error', async () => {
      const messageId = 'msg-123';
      const error = new Error('Get branches failed');

      mockBranchingAPI.getMessageBranches.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      let branches: BranchOption[];
      await act(async () => {
        branches = await result.current.getMessageBranches(messageId);
      });

      expect(branches!).toEqual([]);
      expect(result.current.error).toBe('Get branches failed');
      expect(onError).toHaveBeenCalledWith('Get branches failed');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      const error = new Error('Some error');
      mockBranchingAPI.getConversationTree.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      // First create an error
      await act(async () => {
        await result.current.loadTree();
      });

      expect(result.current.error).toBe('Some error');

      // Then clear it
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      mockBranchingAPI.getConversationTree.mockRejectedValue('String error');

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await result.current.loadTree();
      });

      expect(result.current.error).toBe('Failed to load conversation tree');
      expect(onError).toHaveBeenCalledWith('Failed to load conversation tree');
    });

    it('should use Error message when available', async () => {
      const customError = new Error('Custom error message');
      mockBranchingAPI.editMessage.mockRejectedValue(customError);

      const { result } = renderHook(() =>
        useBranching({ conversationId, onTreeUpdate, onError })
      );

      await act(async () => {
        await expect(result.current.editMessage('msg-123', 'content')).rejects.toThrow();
      });

      expect(result.current.error).toBe('Custom error message');
      expect(onError).toHaveBeenCalledWith('Custom error message');
    });
  });

  describe('callback functions', () => {
    it('should work without optional callbacks', () => {
      const { result } = renderHook(() => useBranching({ conversationId }));

      expect(result.current.treeData).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should not call callbacks when they are undefined', async () => {
      const mockTreeData: ConversationTreeResponse = {
        conversation_id: conversationId,
        nodes: [],
        active_thread: [],
      };
      mockBranchingAPI.getConversationTree.mockResolvedValue(mockTreeData);

      const { result } = renderHook(() => useBranching({ conversationId }));

      await act(async () => {
        await result.current.loadTree();
      });

      // Should not throw error and should still work
      expect(result.current.treeData).toBe(mockTreeData);
    });
  });
});
