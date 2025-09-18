// Zustand store for managing conversation state with persistence

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ConversationState, StreamingMessage } from '../types';
import { apiClient } from '../services/api';
import { categorizeError, formatErrorForUser } from '../utils/errorHandling';

// Memoized title generation cache for performance
const titleCache = new Map<string, string>();

// Optimized helper function to generate conversation title from first message
const generateTitleFromMessage = (content: string): string => {
  // Check cache first
  const cacheKey = content.slice(0, 200); // Use first 200 chars as cache key
  if (titleCache.has(cacheKey)) {
    return titleCache.get(cacheKey)!;
  }

  let title: string;

  // Remove extra whitespace and line breaks
  const cleanContent = content.trim().replace(/\s+/g, ' ');

  // If content is very short, use it as is
  if (cleanContent.length <= 30) {
    title = cleanContent;
  } else {
    // Try to extract the first sentence
    const firstSentence = cleanContent.split(/[.!?]/)[0];

    if (firstSentence.length > 0 && firstSentence.length <= 50) {
      title = firstSentence.trim();
    } else {
      // If first sentence is too long, truncate at word boundary
      const words = cleanContent.split(' ');
      let tempTitle = '';

      for (const word of words) {
        const testTitle = tempTitle + (tempTitle ? ' ' : '') + word;
        if (testTitle.length > 40) {
          break;
        }
        tempTitle = testTitle;
      }

      title = tempTitle || cleanContent.substring(0, 40) + '...';
    }
  }

  // Cache the result (limit cache size to prevent memory leaks)
  if (titleCache.size > 1000) {
    const firstKey = titleCache.keys().next().value;
    titleCache.delete(firstKey);
  }
  titleCache.set(cacheKey, title);

  return title;
};

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      conversations: [],
      currentMessages: [],
      streamingMessage: null,
      selectedModel: 'claude-code-opus', // Default model
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
            // If conversation not found, clear the invalid ID from state
            if (response.error.includes('not found') || response.error.includes('404')) {
              console.log('[ConversationStore] Conversation not found, clearing invalid ID:', id);
              set({
                currentConversationId: null,
                currentMessages: [],
                error: null, // Don't show error for not found, just clear state
                isLoading: false
              });
            } else {
              set({ error: response.error, isLoading: false });
            }
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

          // Check if it's a 404 error in the catch block as well
          if (errorMessage.includes('not found') || errorMessage.includes('404')) {
            console.log('[ConversationStore] Conversation not found in catch, clearing invalid ID:', id);
            set({
              currentConversationId: null,
              currentMessages: [],
              error: null,
              isLoading: false
            });
          } else {
            set({
              error: errorMessage,
              isLoading: false
            });
          }
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
            console.log('[ConversationStore] Creating new conversation with:', {
              title: generatedTitle,
              model: selectedModel
            });
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

        console.log('[ConversationStore] sendStreamingMessage called:', {
          content: content.substring(0, 100) + '...',
          currentConversationId,
          selectedModel,
          isNewConversation: !currentConversationId
        });

        if (!currentConversationId) {
          // Create a new conversation first with title generated from first message
          try {
            const generatedTitle = generateTitleFromMessage(content);
            console.log('[ConversationStore] Creating new conversation with:', {
              title: generatedTitle,
              model: selectedModel
            });
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
          console.log('[ConversationStore] Starting stream with:', {
            conversationId: currentConversationId,
            contentLength: content.length,
            model: selectedModel
          });
          await apiClient.streamMessage(
            currentConversationId,
            content,
            // onToken callback
            (token: string) => {
              set(state => {
                if (state.streamingMessage) {
                  let processedToken = token;
                  const currentContent = state.streamingMessage.content;

                  // Smart newline insertion for Markdown formatting
                  // Check if we need to add a newline before this token
                  if (currentContent.length > 0) {
                    const lastChar = currentContent[currentContent.length - 1];
                    const trimmedToken = token.trimStart();

                    // Add newline before headers
                    if (trimmedToken.startsWith('#') && lastChar !== '\n') {
                      processedToken = '\n' + token;
                    }
                    // Add newline before lists
                    else if ((trimmedToken.startsWith('-') || trimmedToken.match(/^\d+\./)) &&
                             lastChar !== '\n' && !currentContent.endsWith('- ')) {
                      processedToken = '\n' + token;
                    }
                    // Add newline before blockquotes
                    else if (trimmedToken.startsWith('>') && lastChar !== '\n') {
                      processedToken = '\n' + token;
                    }
                    // Add newline before horizontal rules
                    else if (trimmedToken.startsWith('---') && lastChar !== '\n') {
                      processedToken = '\n' + token;
                    }
                    // Add newline before code blocks
                    else if (trimmedToken.startsWith('```') && lastChar !== '\n') {
                      processedToken = '\n' + token;
                    }
                    // Add newline after code blocks
                    else if (currentContent.endsWith('```') && !token.startsWith('\n')) {
                      processedToken = '\n' + token;
                    }
                    // Add newline before tables
                    else if (trimmedToken.startsWith('|') && lastChar !== '\n' && !currentContent.endsWith('| ')) {
                      processedToken = '\n' + token;
                    }
                  }

                  return {
                    streamingMessage: {
                      ...state.streamingMessage,
                      content: state.streamingMessage.content + processedToken
                    }
                  };
                }
                return state;
              });
            },
            // onError callback
            async (error: string) => {
              // Handle conversation not found error
              if (error === 'CONVERSATION_NOT_FOUND') {
                console.log('[ConversationStore] Conversation not found, creating new conversation and retrying...');

                // Clear the invalid conversation ID
                set({
                  currentConversationId: null,
                  currentMessages: [],
                  streamingMessage: null,
                  isStreaming: false,
                  abortController: null
                });

                // Create new conversation and retry
                try {
                  const generatedTitle = generateTitleFromMessage(content);
                  const newConversationId = await get().createConversation({
                    title: generatedTitle,
                    model: selectedModel,
                  });

                  // Retry streaming with the new conversation
                  if (newConversationId) {
                    await get().sendStreamingMessage(content);
                  }
                } catch (createError) {
                  console.error('[ConversationStore] Failed to create new conversation:', createError);
                  set({
                    error: 'Failed to create a new conversation. Please try again.',
                    isStreaming: false,
                    streamingMessage: null,
                    abortController: null
                  });
                }
                return;
              }

              // Handle other errors normally
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