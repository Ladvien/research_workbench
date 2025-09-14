// Core types for the workbench frontend application

export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title?: string;
  model: string;
  provider: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  parent_id?: string;
  role: MessageRole;
  content: string;
  tokens_used?: number;
  created_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface CreateConversationRequest {
  title?: string;
  model: string;
  provider?: string;
  metadata?: Record<string, any>;
}

export interface CreateMessageRequest {
  conversation_id: string;
  parent_id?: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// Streaming message type for partial responses
export interface StreamingMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string; // Accumulating content as tokens arrive
  created_at: string;
  isStreaming: boolean;
}

// Model types
export type Provider = 'openai' | 'anthropic';

export interface Model {
  id: string;
  name: string;
  provider: Provider;
  max_tokens: number;
  supports_streaming: boolean;
  cost_per_token?: number;
}

// Zustand store types
export interface ConversationState {
  currentConversationId: string | null;
  conversations: Conversation[];
  currentMessages: Message[];
  streamingMessage: StreamingMessage | null; // Current streaming message
  selectedModel: string; // Currently selected model for new conversations
  isLoading: boolean;
  isStreaming: boolean; // Track streaming state separately
  error: string | null;
  abortController: AbortController | null; // For canceling streaming requests

  // Actions
  setCurrentConversation: (id: string) => void;
  setSelectedModel: (modelId: string) => void;
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (request: CreateConversationRequest) => Promise<string>;
  sendMessage: (content: string) => Promise<void>;
  sendStreamingMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearError: () => void;
}