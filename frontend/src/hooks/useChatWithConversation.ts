import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useState } from 'react';
import { useConversationStore } from './useConversationStore';
import { v4 as uuidv4 } from 'uuid';

export function useChatWithConversation() {
  const {
    currentConversationId,
    conversations,
    selectedModel,
    createConversation,
    loadConversation,
    setCurrentConversation,
  } = useConversationStore();

  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  // Use the AI SDK's useChat hook
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    error,
    reload,
    stop,
    append,
    setMessages,
  } = useChat({
    api: currentConversationId
      ? `/api/v1/conversations/${currentConversationId}/stream`
      : '/api/v1/conversations/stream',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      model: selectedModel,
      conversationId: currentConversationId,
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onFinish: (message) => {
      console.log('Message finished:', message);
      // Reload conversation to sync with backend
      if (currentConversationId) {
        loadConversation(currentConversationId);
      }
    },
  });

  // Custom submit handler that creates conversation if needed
  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    // If no conversation exists, create one first
    if (!currentConversationId && !isCreatingConversation) {
      setIsCreatingConversation(true);
      try {
        const title = input.substring(0, 50) || 'New Conversation';
        const conversationId = await createConversation({
          title,
          model: selectedModel,
        });

        if (conversationId) {
          // After creating conversation, submit the message
          setTimeout(() => {
            originalHandleSubmit(e);
          }, 100);
        }
      } catch (error) {
        console.error('Failed to create conversation:', error);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    // If conversation exists, submit normally
    originalHandleSubmit(e);
  }, [currentConversationId, input, selectedModel, createConversation, originalHandleSubmit, isCreatingConversation]);

  // Sync messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId).then(() => {
        // Convert our message format to AI SDK format if needed
        const store = useConversationStore.getState();
        const convertedMessages = store.currentMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          createdAt: new Date(msg.created_at),
        }));
        setMessages(convertedMessages);
      });
    } else {
      setMessages([]);
    }
  }, [currentConversationId, loadConversation, setMessages]);

  return {
    // Chat state
    messages,
    input,
    isLoading: isLoading || isCreatingConversation,
    error,

    // Chat actions
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    append,

    // Conversation state
    currentConversationId,
    conversations,
    selectedModel,

    // Conversation actions
    setCurrentConversation,
  };
}