// Zustand store for managing conversation state with persistence

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ConversationState, StreamingMessage } from '../types';
import { apiClient } from '../services/api';
import { categorizeError, formatErrorForUser } from '../utils/errorHandling';

// Helper function to generate conversation title from first message
const generateTitleFromMessage = (content: string): string => {
  // Remove extra whitespace and line breaks
  const cleanContent = content.trim().replace(/\s+/g, ' ');

  // If content is very short, use it as is
  if (cleanContent.length <= 30) {
    return cleanContent;
  }

  // Try to extract the first sentence
  const firstSentence = cleanContent.split(/[.!?]/)[0];

  if (firstSentence.length > 0 && firstSentence.length <= 50) {
    return firstSentence.trim();
  }

  // If first sentence is too long, truncate at word boundary
  const words = cleanContent.split(' ');
  let title = '';

  for (const word of words) {
    const testTitle = title + (title ? ' ' : '') + word;
    if (testTitle.length > 40) {
      break;
    }
    title = testTitle;
  }

  return title || cleanContent.substring(0, 40) + '...';
};

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      conversations: [],
      currentMessages: [],
      streamingMessage: null,
      selectedModel: 'gpt-4', // Default model
      isLoading: false,
      isStreaming: false,
      error: null,
      abortController: null,

      setCurrentConversation: (id: string) => {
        set({ currentConversationId: id });
        // Load the conversation messages when switching
        get().loadConversation(id);
      },

      setSelectedModel: (modelId: string) => {
        set({ selectedModel: modelId });
      },

      loadConversations: async () => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.getConversations();

          if (response.error) {
            set({ error: response.error, isLoading: false });
            return;
          }

          set({
            conversations: response.data || [],
            isLoading: false,
            error: null
          });
        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to load conversations');
          set({
            error: errorMessage,
            isLoading: false
          });
        }
      },

      loadConversation: async (id: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.getConversation(id);

          if (response.error) {
            set({ error: response.error, isLoading: false });
            return;
          }

          if (response.data) {
            set({
              currentMessages: response.data.messages,
              currentConversationId: id,
              isLoading: false,
              error: null
            });
          }
        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to load conversation');
          set({
            error: errorMessage,
            isLoading: false
          });
        }
      },

      createConversation: async (request) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.createConversation(request);

          if (response.error) {
            const errorContext = categorizeError(response.error);
            set({
              error: errorContext.userMessage,
              isLoading: false
            });
            throw new Error(response.error);
          }

          if (response.data) {
            // Add the new conversation to the list
            set(state => ({
              conversations: [response.data!, ...state.conversations],
              currentConversationId: response.data!.id,
              currentMessages: [],
              isLoading: false,
              error: null
            }));

            return response.data.id;
          }

          throw new Error('No conversation data received');
        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to create conversation');
          set({
            error: errorMessage,
            isLoading: false
          });
          throw error;
        }
      },

      sendMessage: async (content: string) => {
        const { currentConversationId, selectedModel } = get();

        if (!currentConversationId) {
          // Create a new conversation first with title generated from first message
          try {
            const generatedTitle = generateTitleFromMessage(content);
            const conversationId = await get().createConversation({
              title: generatedTitle,
              model: selectedModel,
            });

            // Now send the message to the new conversation
            await get().sendMessage(content);
            return;
          } catch (error) {
            // Let the createConversation error handling take care of the error message
            return;
          }
        }

        set({ isLoading: true, error: null });

        try {
          // Optimistically add the user message to the current messages
          const userMessage = {
            id: uuidv4(),
            conversation_id: currentConversationId,
            role: 'user' as const,
            content,
            created_at: new Date().toISOString(),
            is_active: true,
            metadata: {},
          };

          set(state => ({
            currentMessages: [...state.currentMessages, userMessage],
          }));

          const response = await apiClient.sendMessage(currentConversationId, content);

          if (response.error) {
            // Remove the optimistic message on error
            set(state => ({
              currentMessages: state.currentMessages.filter(msg => msg.id !== userMessage.id),
              error: response.error,
              isLoading: false
            }));
            return;
          }

          // Reload the conversation to get the updated messages
          await get().loadConversation(currentConversationId);

        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to send message');
          set({
            error: errorMessage,
            isLoading: false
          });
        }
      },

      sendStreamingMessage: async (content: string) => {
        const { currentConversationId, selectedModel } = get();

        if (!currentConversationId) {
          // Create a new conversation first with title generated from first message
          try {
            const generatedTitle = generateTitleFromMessage(content);
            const conversationId = await get().createConversation({
              title: generatedTitle,
              model: selectedModel,
            });

            // Now send the streaming message to the new conversation
            await get().sendStreamingMessage(content);
            return;
          } catch (error) {
            // Let the createConversation error handling take care of the error message
            return;
          }
        }

        // Create abort controller for this streaming request
        const abortController = new AbortController();

        set({ isStreaming: true, error: null, streamingMessage: null, abortController });

        try {
          // Optimistically add the user message to the current messages
          const userMessage = {
            id: uuidv4(),
            conversation_id: currentConversationId,
            role: 'user' as const,
            content,
            created_at: new Date().toISOString(),
            is_active: true,
            metadata: {},
          };

          set(state => ({
            currentMessages: [...state.currentMessages, userMessage],
          }));

          // Create initial streaming message
          const streamingMessageId = uuidv4();
          const initialStreamingMessage: StreamingMessage = {
            id: streamingMessageId,
            conversation_id: currentConversationId,
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString(),
            isStreaming: true,
          };

          set({ streamingMessage: initialStreamingMessage });

          // Start streaming
          await apiClient.streamMessage(
            currentConversationId,
            content,
            // onToken callback
            (token: string) => {
              set(state => {
                if (state.streamingMessage) {
                  return {
                    streamingMessage: {
                      ...state.streamingMessage,
                      content: state.streamingMessage.content + token
                    }
                  };
                }
                return state;
              });
            },
            // onError callback
            (error: string) => {
              set({
                error,
                isStreaming: false,
                streamingMessage: null,
                abortController: null
              });
            },
            // onComplete callback
            (messageId?: string) => {
              const { streamingMessage } = get();
              if (streamingMessage) {
                // Convert streaming message to regular message
                const completedMessage = {
                  id: messageId || streamingMessage.id,
                  conversation_id: streamingMessage.conversation_id,
                  parent_id: undefined,
                  role: streamingMessage.role,
                  content: streamingMessage.content,
                  tokens_used: undefined,
                  created_at: streamingMessage.created_at,
                  is_active: true,
                  metadata: {},
                };

                set(state => ({
                  currentMessages: [...state.currentMessages, completedMessage],
                  streamingMessage: null,
                  isStreaming: false,
                  abortController: null,
                }));
              } else {
                set({ isStreaming: false, streamingMessage: null, abortController: null });
              }
            },
            // Pass abort signal
            abortController.signal
          );

        } catch (error) {
          // Handle abort errors gracefully
          if (error instanceof Error && error.name === 'AbortError') {
            set({
              isStreaming: false,
              streamingMessage: null,
              abortController: null
            });
          } else {
            const errorMessage = formatErrorForUser(error, 'Unable to send streaming message');
            set({
              error: errorMessage,
              isStreaming: false,
              streamingMessage: null,
              abortController: null
            });
          }
        }
      },

      stopStreaming: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }
        set({
          isStreaming: false,
          streamingMessage: null,
          abortController: null
        });
      },

      updateConversationTitle: async (id: string, title: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.updateConversationTitle(id, title);

          if (response.error) {
            set({ error: response.error, isLoading: false });
            throw new Error(response.error);
          }

          // Update the conversation in the local state
          set(state => ({
            conversations: state.conversations.map(conv =>
              conv.id === id ? { ...conv, title, updated_at: new Date().toISOString() } : conv
            ),
            isLoading: false,
            error: null
          }));

        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to update conversation title');
          set({
            error: errorMessage,
            isLoading: false
          });
          throw error;
        }
      },

      deleteConversation: async (id: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.deleteConversation(id);

          if (response.error) {
            set({ error: response.error, isLoading: false });
            throw new Error(response.error);
          }

          // Remove the conversation from local state
          set(state => {
            const updatedConversations = state.conversations.filter(conv => conv.id !== id);
            const newCurrentId = state.currentConversationId === id
              ? (updatedConversations.length > 0 ? updatedConversations[0].id : null)
              : state.currentConversationId;

            return {
              conversations: updatedConversations,
              currentConversationId: newCurrentId,
              currentMessages: state.currentConversationId === id ? [] : state.currentMessages,
              isLoading: false,
              error: null
            };
          });

        } catch (error) {
          const errorMessage = formatErrorForUser(error, 'Unable to delete conversation');
          set({
            error: errorMessage,
            isLoading: false
          });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'workbench-conversation-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        selectedModel: state.selectedModel,
        // Don't persist conversations and messages as they should be fetched from server
      }),
    }
  )
);