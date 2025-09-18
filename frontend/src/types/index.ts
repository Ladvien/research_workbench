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
  metadata: Record<string, unknown>;
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
  metadata: Record<string, unknown>;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface CreateConversationRequest {
  title?: string;
  model: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageRequest {
  conversation_id: string;
  parent_id?: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
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
export type Provider = 'open_a_i' | 'anthropic' | 'claude_code';

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

// Search types
export interface SearchRequest {
  query: string;
  limit?: number;
  similarity_threshold?: number;
}

export interface SearchResult {
  message_id: string;
  content: string;
  role: MessageRole;
  created_at: string;
  conversation_id: string;
  conversation_title?: string;
  similarity: number;
  preview: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_found: number;
}

export interface SearchState {
  isSearching: boolean;
  searchResults: SearchResult[];
  searchQuery: string;
  error: string | null;
  lastSearchTime?: string;

  // Actions
  search: (query: string, limit?: number, similarity_threshold?: number) => Promise<void>;
  clearSearch: () => void;
  clearError: () => void;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  tokens?: AuthTokens;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
}
// Re-export everything from analytics and chat
export * from './analytics';
export * from './chat';
