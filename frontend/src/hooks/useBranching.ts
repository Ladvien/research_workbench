import { useState, useCallback } from 'react';
import type {
  ConversationTreeResponse,
  EditMessageRequest,
  SwitchBranchRequest,
} from '../types/chat';
import { BranchingAPI } from '../utils/branchingApi';

interface UseBranchingOptions {
  conversationId: string;
  onTreeUpdate?: (tree: ConversationTreeResponse) => void;
  onError?: (error: string) => void;
}

export const useBranching = ({ conversationId, onTreeUpdate, onError }: UseBranchingOptions) => {
  const [treeData, setTreeData] = useState<ConversationTreeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, defaultMessage: string) => {
    const message = err instanceof Error ? err.message : defaultMessage;
    setError(message);
    onError?.(message);
  }, [onError]);

  const loadTree = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const tree = await BranchingAPI.getConversationTree(conversationId);
      setTreeData(tree);
      onTreeUpdate?.(tree);
    } catch (err) {
      handleError(err, 'Failed to load conversation tree');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, onTreeUpdate, handleError]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await BranchingAPI.editMessage(messageId, { content });

      // Reload tree to get updated structure
      await loadTree();

      return response;
    } catch (err) {
      handleError(err, 'Failed to edit message');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadTree, handleError]);

  const switchBranch = useCallback(async (targetMessageId: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await BranchingAPI.switchBranch(conversationId, {
        targetMessageId,
      });

      // Reload tree to get updated active thread
      await loadTree();

      return response;
    } catch (err) {
      handleError(err, 'Failed to switch branch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, loadTree, handleError]);

  const deleteMessage = useCallback(async (messageId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await BranchingAPI.deleteMessage(messageId);

      // Reload tree to get updated structure
      await loadTree();
    } catch (err) {
      handleError(err, 'Failed to delete message');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadTree, handleError]);

  const getMessageBranches = useCallback(async (messageId: string) => {
    setError(null);

    try {
      return await BranchingAPI.getMessageBranches(messageId);
    } catch (err) {
      handleError(err, 'Failed to get message branches');
      return [];
    }
  }, [handleError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    treeData,
    isLoading,
    error,
    loadTree,
    editMessage,
    switchBranch,
    deleteMessage,
    getMessageBranches,
    clearError,
  };
};