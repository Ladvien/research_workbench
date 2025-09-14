// Zustand store for managing conversation state with persistence

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ConversationState } from '../types';
import { apiClient } from '../services/api';

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      conversations: [],
      currentMessages: [],
      isLoading: false,
      error: null,

      setCurrentConversation: (id: string) => {
        set({ currentConversationId: id });
        // Load the conversation messages when switching
        get().loadConversation(id);
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
          set({
            error: error instanceof Error ? error.message : 'Failed to load conversations',
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
          set({
            error: error instanceof Error ? error.message : 'Failed to load conversation',
            isLoading: false
          });
        }
      },

      createConversation: async (request) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.createConversation(request);

          if (response.error) {
            set({ error: response.error, isLoading: false });
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

          throw new Error('Failed to create conversation');
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create conversation',
            isLoading: false
          });
          throw error;
        }
      },

      sendMessage: async (content: string) => {
        const { currentConversationId } = get();

        if (!currentConversationId) {
          // Create a new conversation first
          try {
            const conversationId = await get().createConversation({
              title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
              model: 'gpt-4',
            });

            // Now send the message to the new conversation
            await get().sendMessage(content);
            return;
          } catch (error) {
            set({ error: 'Failed to create new conversation' });
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
          set({
            error: error instanceof Error ? error.message : 'Failed to send message',
            isLoading: false
          });
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
        // Don't persist conversations and messages as they should be fetched from server
      }),
    }
  )
);