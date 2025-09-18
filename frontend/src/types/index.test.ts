import { describe, it, expect } from 'vitest';
import type {
  User,
  Conversation,
  Message,
  ConversationWithMessages,
  CreateConversationRequest,
  CreateMessageRequest,
  ApiResponse,
  StreamingMessage,
  ConversationState,
  SearchRequest,
  SearchResult,
  SearchResponse,
  SearchState,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  AuthState,
  MessageRole,
  Provider,
  Model
} from './index';

describe('TypeScript Type Definitions', () => {
  describe('Core Types', () => {
    it('defines User interface correctly', () => {
      const user: User = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2025-09-18T10:00:00Z',
        updated_at: '2025-09-18T10:00:00Z'
      };

      expect(user.id).toBe('user-1');
      expect(user.email).toBe('test@example.com');
      expect(user.username).toBe('testuser');
    });

    it('defines Conversation interface correctly', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        user_id: 'user-1',
        title: 'Test Conversation',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T10:00:00Z',
        updated_at: '2025-09-18T10:00:00Z',
        metadata: { key: 'value' }
      };

      expect(conversation.id).toBe('conv-1');
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.metadata).toEqual({ key: 'value' });
    });

    it('allows optional title in Conversation', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        user_id: 'user-1',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T10:00:00Z',
        updated_at: '2025-09-18T10:00:00Z',
        metadata: {}
      };

      expect(conversation.title).toBeUndefined();
    });

    it('defines Message interface correctly', () => {
      const message: Message = {
        id: 'msg-1',
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Hello, world!',
        created_at: '2025-09-18T10:00:00Z',
        is_active: true,
        metadata: {}
      };

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.is_active).toBe(true);
    });

    it('allows optional fields in Message', () => {
      const message: Message = {
        id: 'msg-1',
        conversation_id: 'conv-1',
        parent_id: 'msg-0',
        role: 'assistant',
        content: 'Hello! How can I help?',
        tokens_used: 15,
        created_at: '2025-09-18T10:01:00Z',
        is_active: true,
        metadata: { model: 'claude-code-opus' }
      };

      expect(message.parent_id).toBe('msg-0');
      expect(message.tokens_used).toBe(15);
    });

    it('defines StreamingMessage interface correctly', () => {
      const streamingMessage: StreamingMessage = {
        id: 'stream-1',
        conversation_id: 'conv-1',
        role: 'assistant',
        content: 'Partial response...',
        created_at: '2025-09-18T10:00:00Z',
        isStreaming: true
      };

      expect(streamingMessage.isStreaming).toBe(true);
      expect(streamingMessage.content).toBe('Partial response...');
    });
  });

  describe('API Types', () => {
    it('defines CreateConversationRequest correctly', () => {
      const request: CreateConversationRequest = {
        title: 'New Conversation',
        model: 'claude-code-opus',
        provider: 'anthropic',
        metadata: { source: 'frontend' }
      };

      expect(request.model).toBe('claude-code-opus');
      expect(request.provider).toBe('anthropic');
    });

    it('allows minimal CreateConversationRequest', () => {
      const request: CreateConversationRequest = {
        model: 'gpt-4'
      };

      expect(request.model).toBe('gpt-4');
      expect(request.title).toBeUndefined();
    });

    it('defines CreateMessageRequest correctly', () => {
      const request: CreateMessageRequest = {
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Test message',
        metadata: { timestamp: Date.now() }
      };

      expect(request.conversation_id).toBe('conv-1');
      expect(request.role).toBe('user');
    });

    it('defines ApiResponse with success data correctly', () => {
      const response: ApiResponse<Conversation> = {
        data: {
          id: 'conv-1',
          user_id: 'user-1',
          title: 'Test',
          model: 'claude-code-opus',
          provider: 'anthropic',
          created_at: '2025-09-18T10:00:00Z',
          updated_at: '2025-09-18T10:00:00Z',
          metadata: {}
        },
        status: 200
      };

      expect(response.data?.id).toBe('conv-1');
      expect(response.status).toBe(200);
      expect(response.error).toBeUndefined();
    });

    it('defines ApiResponse with error correctly', () => {
      const response: ApiResponse<Conversation> = {
        error: 'Conversation not found',
        status: 404
      };

      expect(response.error).toBe('Conversation not found');
      expect(response.status).toBe(404);
      expect(response.data).toBeUndefined();
    });
  });

  describe('Enum Types', () => {
    it('validates MessageRole values', () => {
      const userRole: MessageRole = 'user';
      const assistantRole: MessageRole = 'assistant';
      const systemRole: MessageRole = 'system';

      expect(userRole).toBe('user');
      expect(assistantRole).toBe('assistant');
      expect(systemRole).toBe('system');
    });

    it('validates Provider values', () => {
      const openAI: Provider = 'open_a_i';
      const anthropic: Provider = 'anthropic';
      const claudeCode: Provider = 'claude_code';

      expect(openAI).toBe('open_a_i');
      expect(anthropic).toBe('anthropic');
      expect(claudeCode).toBe('claude_code');
    });
  });

  describe('State Types', () => {
    it('defines ConversationState interface correctly', () => {
      // This is a shape test - we're checking the interface has all required properties
      const stateShape: keyof ConversationState = 'currentConversationId';
      expect(stateShape).toBe('currentConversationId');

      // Test that all required methods exist in the interface
      const requiredMethods: (keyof ConversationState)[] = [
        'setCurrentConversation',
        'setSelectedModel',
        'loadConversations',
        'loadConversation',
        'createConversation',
        'sendMessage',
        'sendStreamingMessage',
        'stopStreaming',
        'updateConversationTitle',
        'deleteConversation',
        'clearError'
      ];

      requiredMethods.forEach(method => {
        expect(typeof method).toBe('string');
      });
    });

    it('defines SearchState interface correctly', () => {
      const stateShape: keyof SearchState = 'isSearching';
      expect(stateShape).toBe('isSearching');

      const requiredMethods: (keyof SearchState)[] = [
        'search',
        'clearSearch',
        'clearError'
      ];

      requiredMethods.forEach(method => {
        expect(typeof method).toBe('string');
      });
    });

    it('defines AuthState interface correctly', () => {
      const stateShape: keyof AuthState = 'isAuthenticated';
      expect(stateShape).toBe('isAuthenticated');

      const requiredMethods: (keyof AuthState)[] = [
        'login',
        'register',
        'logout',
        'refreshToken',
        'clearError'
      ];

      requiredMethods.forEach(method => {
        expect(typeof method).toBe('string');
      });
    });
  });

  describe('Search Types', () => {
    it('defines SearchRequest correctly', () => {
      const request: SearchRequest = {
        query: 'test search',
        limit: 10,
        similarity_threshold: 0.8
      };

      expect(request.query).toBe('test search');
      expect(request.limit).toBe(10);
      expect(request.similarity_threshold).toBe(0.8);
    });

    it('allows minimal SearchRequest', () => {
      const request: SearchRequest = {
        query: 'test'
      };

      expect(request.query).toBe('test');
      expect(request.limit).toBeUndefined();
    });

    it('defines SearchResult correctly', () => {
      const result: SearchResult = {
        message_id: 'msg-1',
        content: 'Found content',
        role: 'user',
        created_at: '2025-09-18T10:00:00Z',
        conversation_id: 'conv-1',
        conversation_title: 'Test Conversation',
        similarity: 0.95,
        preview: 'Found content...'
      };

      expect(result.similarity).toBe(0.95);
      expect(result.preview).toBe('Found content...');
    });

    it('defines SearchResponse correctly', () => {
      const response: SearchResponse = {
        query: 'test search',
        results: [],
        total_found: 0
      };

      expect(response.query).toBe('test search');
      expect(response.results).toEqual([]);
      expect(response.total_found).toBe(0);
    });
  });

  describe('Auth Types', () => {
    it('defines AuthTokens correctly', () => {
      const tokens: AuthTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: Date.now() + 3600000
      };

      expect(tokens.accessToken).toBe('access-token-123');
      expect(tokens.refreshToken).toBe('refresh-token-456');
      expect(typeof tokens.expiresAt).toBe('number');
    });

    it('allows optional refreshToken in AuthTokens', () => {
      const tokens: AuthTokens = {
        accessToken: 'access-token-123',
        expiresAt: Date.now() + 3600000
      };

      expect(tokens.refreshToken).toBeUndefined();
    });

    it('defines LoginRequest correctly', () => {
      const request: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      expect(request.email).toBe('test@example.com');
      expect(request.password).toBe('password123');
    });

    it('defines RegisterRequest correctly', () => {
      const request: RegisterRequest = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123'
      };

      expect(request.email).toBe('test@example.com');
      expect(request.username).toBe('testuser');
      expect(request.password).toBe('password123');
    });

    it('defines AuthResponse correctly', () => {
      const response: AuthResponse = {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          username: 'testuser',
          created_at: '2025-09-18T10:00:00Z',
          updated_at: '2025-09-18T10:00:00Z'
        },
        tokens: {
          accessToken: 'access-token-123',
          expiresAt: Date.now() + 3600000
        }
      };

      expect(response.user.id).toBe('user-1');
      expect(response.tokens?.accessToken).toBe('access-token-123');
    });
  });

  describe('Model Types', () => {
    it('defines Model interface correctly', () => {
      const model: Model = {
        id: 'claude-code-opus',
        name: 'Claude Code (Opus)',
        provider: 'claude_code',
        max_tokens: 4096,
        supports_streaming: true,
        cost_per_token: 0.000015
      };

      expect(model.id).toBe('claude-code-opus');
      expect(model.provider).toBe('claude_code');
      expect(model.supports_streaming).toBe(true);
    });

    it('allows optional cost_per_token in Model', () => {
      const model: Model = {
        id: 'free-model',
        name: 'Free Model',
        provider: 'open_a_i',
        max_tokens: 2048,
        supports_streaming: false
      };

      expect(model.cost_per_token).toBeUndefined();
    });
  });

  describe('Composite Types', () => {
    it('defines ConversationWithMessages correctly', () => {
      const conversationWithMessages: ConversationWithMessages = {
        conversation: {
          id: 'conv-1',
          user_id: 'user-1',
          title: 'Test Conversation',
          model: 'claude-code-opus',
          provider: 'anthropic',
          created_at: '2025-09-18T10:00:00Z',
          updated_at: '2025-09-18T10:00:00Z',
          metadata: {}
        },
        messages: [
          {
            id: 'msg-1',
            conversation_id: 'conv-1',
            role: 'user',
            content: 'Hello',
            created_at: '2025-09-18T10:00:00Z',
            is_active: true,
            metadata: {}
          }
        ]
      };

      expect(conversationWithMessages.conversation.id).toBe('conv-1');
      expect(conversationWithMessages.messages).toHaveLength(1);
      expect(conversationWithMessages.messages[0].content).toBe('Hello');
    });
  });

  describe('Type Safety', () => {
    it('enforces strict typing for MessageRole', () => {
      const validRoles: MessageRole[] = ['user', 'assistant', 'system'];
      expect(validRoles).toHaveLength(3);

      // This would fail TypeScript compilation if uncommented:
      // const invalidRole: MessageRole = 'invalid';
    });

    it('enforces strict typing for Provider', () => {
      const validProviders: Provider[] = ['open_a_i', 'anthropic', 'claude_code'];
      expect(validProviders).toHaveLength(3);

      // This would fail TypeScript compilation if uncommented:
      // const invalidProvider: Provider = 'invalid_provider';
    });

    it('ensures required fields are not optional', () => {
      // These should not compile if required fields are missing:

      // Missing required field 'model' - would fail compilation:
      // const invalidConversation: Conversation = {
      //   id: 'conv-1',
      //   user_id: 'user-1',
      //   provider: 'anthropic',
      //   created_at: '2025-09-18T10:00:00Z',
      //   updated_at: '2025-09-18T10:00:00Z',
      //   metadata: {}
      // };

      // This should compile fine:
      const validConversation: Conversation = {
        id: 'conv-1',
        user_id: 'user-1',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T10:00:00Z',
        updated_at: '2025-09-18T10:00:00Z',
        metadata: {}
      };

      expect(validConversation.model).toBe('claude-code-opus');
    });
  });
});