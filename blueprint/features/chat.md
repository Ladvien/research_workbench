# Feature: LLM Chat

## Purpose
Enable real-time, streaming conversations with multiple LLM providers as the foundation for all knowledge synthesis activities. This isn't just chat - it's the primary interface for knowledge exploration, questioning, and synthesis.

## User Story
As a researcher, I want to:
- Start conversations with different LLM models (GPT-4, Claude, local models)
- See responses stream in real-time as they're generated
- Switch between models mid-conversation to compare responses
- Continue previous conversations with full context
- See token usage and cost per message
- Stop generation mid-stream if heading wrong direction

## Technical Requirements

### Core Functionality
```yaml
Supported Providers:
  - OpenAI (GPT-4, GPT-4-turbo, GPT-3.5)
  - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku)
  - Local models (via Ollama/llama.cpp)
  - Google (Gemini Pro, Gemini Ultra)

Streaming Methods:
  - Server-Sent Events (SSE) for web clients
  - WebSocket for bidirectional communication
  - Batch API for non-interactive processing

Message Types:
  - system: Initial context/instructions
  - user: Human input
  - assistant: LLM response
  - function: Tool calls (future)

Configuration:
  - Per-conversation model selection
  - Adjustable temperature, max_tokens, top_p
  - System prompt customization
  - Token limit warnings
```

### Data Model
```sql
-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model VARCHAR(50) NOT NULL,  -- 'gpt-4', 'claude-3.5-sonnet', etc.
    system_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,  -- temperature, max_tokens, etc.
    metadata JSONB DEFAULT '{}'::jsonb   -- tags, categories, etc.
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES messages(id),  -- For branching
    role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function')),
    content TEXT NOT NULL,
    model VARCHAR(50),  -- Track if different from conversation default
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    cost_cents DECIMAL(10,4),
    latency_ms INTEGER,  -- Time to first token
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,  -- For branch management
    metadata JSONB DEFAULT '{}'::jsonb  -- Store tool calls, attachments, etc.
);

-- Streaming state (Redis)
Key: stream:{conversation_id}
Value: {
  "active": true,
  "message_id": "uuid",
  "tokens_streamed": 150,
  "started_at": "2024-01-01T00:00:00Z"
}

-- Indexes for performance
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
```

### API Endpoints

#### Send Message / Stream Response
```yaml
POST /api/conversations/:id/chat
Request:
  Content-Type: application/json
  Body:
    message: string
    model?: string  # Override conversation model
    parent_message_id?: string  # For branching
    settings?: {
      temperature?: number (0-2)
      max_tokens?: number
      top_p?: number
      stream?: boolean (default: true)
    }
    attachments?: [
      { type: 'file', id: 'uuid' },
      { type: 'context', content: 'string' }
    ]

Response (Streaming):
  Content-Type: text/event-stream
  Body: Server-Sent Events stream

Response (Non-streaming):
  Content-Type: application/json
  Body: {
    message: {
      id: "uuid",
      role: "assistant",
      content: "string",
      tokens: { prompt: 100, completion: 50 },
      cost_cents: 0.34,
      created_at: "ISO-8601"
    }
  }
```

#### Stop Active Generation
```yaml
POST /api/conversations/:id/stop
Response:
  {
    stopped: true,
    message_id: "uuid",
    tokens_generated: 150
  }
```

#### Get Conversation with Messages
```yaml
GET /api/conversations/:id
Query Parameters:
  include_branches?: boolean (default: false)
  limit?: number (messages to return)
  
Response:
  {
    id: "uuid",
    title: "string",
    model: "gpt-4",
    created_at: "ISO-8601",
    updated_at: "ISO-8601",
    settings: { temperature: 0.7, max_tokens: 2000 },
    messages: [
      {
        id: "uuid",
        role: "user|assistant|system",
        content: "string",
        tokens_prompt: 100,
        tokens_completion: 50,
        cost_cents: 0.34,
        created_at: "ISO-8601",
        parent_id: "uuid",
        is_active: true
      }
    ],
    total_tokens: 5000,
    total_cost_cents: 12.50
  }
```

#### List Conversations
```yaml
GET /api/conversations
Query Parameters:
  limit?: number (default: 20, max: 100)
  offset?: number (default: 0)
  search?: string (search in title and messages)
  model?: string (filter by model)
  sort?: 'created_at' | 'updated_at' (default: 'updated_at')
  order?: 'asc' | 'desc' (default: 'desc')

Response:
  {
    conversations: [
      {
        id: "uuid",
        title: "string",
        model: "gpt-4",
        updated_at: "ISO-8601",
        message_count: 10,
        total_tokens: 5000,
        last_message_preview: "string"
      }
    ],
    total: 150,
    limit: 20,
    offset: 0
  }
```

### Streaming Protocol (SSE)
```typescript
// Event stream format
// Each event is sent as:
// event: <event_type>
// data: <json_data>
// \n\n

// Event Types
{ event: 'start', data: { message_id: 'uuid', model: 'gpt-4' } }
{ event: 'token', data: { content: 'The' } }
{ event: 'token', data: { content: ' answer' } }
{ event: 'token', data: { content: ' is' } }
{ event: 'usage', data: { prompt_tokens: 150, completion_tokens: 50 } }
{ event: 'cost', data: { cents: 0.34 } }
{ event: 'done', data: { 
    message_id: 'uuid', 
    finish_reason: 'stop',  // 'stop' | 'length' | 'error'
    total_tokens: 200 
  } 
}
{ event: 'error', data: { 
    code: 'rate_limit', 
    message: 'Rate limit exceeded. Try again in 10 seconds.' 
  } 
}
```

### Backend Implementation (Rust/Axum)

#### Core Service Structure
```rust
use axum::response::sse::{Event, Sse};
use futures::stream::Stream;

pub struct ChatService {
    openai: AsyncOpenAI,
    anthropic: AnthropicClient,
    ollama: Option<OllamaClient>,
    gemini: Option<GeminiClient>,
    db: PgPool,
    redis: RedisPool,
    token_counter: TokenCounter,
    cost_calculator: CostCalculator,
}

impl ChatService {
    pub async fn stream_chat(
        &self,
        conversation_id: Uuid,
        message: String,
        settings: ChatSettings,
    ) -> Result<impl Stream<Item = Result<Event, Error>>, ChatError> {
        // 1. Validate conversation exists and user has access
        let conversation = self.get_conversation(conversation_id).await?;
        
        // 2. Save user message to database
        let user_message = self.save_message(Message {
            conversation_id,
            role: Role::User,
            content: message.clone(),
            ..Default::default()
        }).await?;
        
        // 3. Get conversation history for context
        let context = self.build_context(conversation_id).await?;
        
        // 4. Select appropriate LLM client based on model
        let stream = match conversation.model.as_str() {
            "gpt-4" | "gpt-3.5-turbo" => {
                self.stream_openai(context, settings).await?
            },
            "claude-3.5-sonnet" | "claude-3-opus" => {
                self.stream_anthropic(context, settings).await?
            },
            model if model.starts_with("ollama/") => {
                self.stream_ollama(model, context, settings).await?
            },
            _ => return Err(ChatError::UnsupportedModel),
        };
        
        // 5. Transform LLM stream to SSE events
        Ok(self.transform_to_sse(stream, conversation_id))
    }
    
    async fn transform_to_sse(
        &self,
        stream: impl Stream<Item = String>,
        conversation_id: Uuid,
    ) -> impl Stream<Item = Result<Event, Error>> {
        // Buffer tokens, track usage, calculate costs
        // Save completed message to database
        // Emit SSE events
    }
}
```

#### Request Handlers
```rust
pub async fn chat_handler(
    State(service): State<Arc<ChatService>>,
    Path(conversation_id): Path<Uuid>,
    Json(request): Json<ChatRequest>,
) -> Response {
    match service.stream_chat(conversation_id, request.message, request.settings).await {
        Ok(stream) => {
            let sse = Sse::new(stream)
                .keep_alive(Duration::from_secs(30));
            sse.into_response()
        },
        Err(e) => {
            (StatusCode::BAD_REQUEST, Json(ErrorResponse::from(e))).into_response()
        }
    }
}

pub async fn stop_handler(
    State(service): State<Arc<ChatService>>,
    Path(conversation_id): Path<Uuid>,
) -> Result<Json<StopResponse>, ChatError> {
    service.stop_generation(conversation_id).await?;
    Ok(Json(StopResponse { 
        stopped: true,
        message_id: service.get_active_message_id(conversation_id).await?,
    }))
}
```

### Frontend Implementation (React/TypeScript)

#### Chat Hook
```typescript
import { useCallback, useEffect, useState } from 'react';
import { useSSE } from './useSSE';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: { prompt: number; completion: number };
  cost_cents?: number;
}

interface UseChatOptions {
  conversationId: string;
  onError?: (error: Error) => void;
  onTokens?: (tokens: number) => void;
}

export function useChat({ conversationId, onError, onTokens }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const { start, stop, isConnected } = useSSE({
    onMessage: (event) => {
      switch (event.type) {
        case 'token':
          setStreamingContent(prev => prev + event.data.content);
          break;
        case 'usage':
          onTokens?.(event.data.completion_tokens);
          break;
        case 'done':
          const finalMessage: ChatMessage = {
            id: event.data.message_id,
            role: 'assistant',
            content: streamingContent,
            tokens: event.data.tokens,
            cost_cents: event.data.cost_cents,
          };
          setMessages(prev => [...prev, finalMessage]);
          setStreamingContent('');
          setIsLoading(false);
          break;
        case 'error':
          onError?.(new Error(event.data.message));
          setIsLoading(false);
          break;
      }
    }
  });
  
  const sendMessage = useCallback(async (content: string, options?: ChatOptions) => {
    setIsLoading(true);
    
    // Optimistically add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Start SSE connection
    const response = await fetch(`/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, ...options }),
    });
    
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      start(response.body);
    } else {
      const error = await response.json();
      onError?.(new Error(error.message));
      setIsLoading(false);
    }
  }, [conversationId, start, onError]);
  
  const stopGeneration = useCallback(async () => {
    await fetch(`/api/conversations/${conversationId}/stop`, { method: 'POST' });
    stop();
    setIsLoading(false);
  }, [conversationId, stop]);
  
  return {
    messages,
    streamingContent,
    isLoading,
    sendMessage,
    stopGeneration,
  };
}
```

#### Chat Interface Component
```tsx
import React from 'react';
import { useChat } from './useChat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { TokenCounter } from './TokenCounter';

export function ChatInterface({ conversationId }: { conversationId: string }) {
  const {
    messages,
    streamingContent,
    isLoading,
    sendMessage,
    stopGeneration,
  } = useChat({ conversationId });
  
  const [totalTokens, setTotalTokens] = useState(0);
  
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b p-4">
        <TokenCounter tokens={totalTokens} />
      </header>
      
      <div className="flex-1 overflow-auto">
        <MessageList messages={messages} />
        {streamingContent && (
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50">
            <div className="whitespace-pre-wrap">{streamingContent}</div>
            <button
              onClick={stopGeneration}
              className="mt-2 text-sm text-red-600 hover:text-red-800"
            >
              Stop generating
            </button>
          </div>
        )}
      </div>
      
      <ChatInput
        onSend={sendMessage}
        disabled={isLoading}
        placeholder={isLoading ? "Generating response..." : "Ask anything..."}
      />
    </div>
  );
}
```

## Configuration

### Environment Variables
```bash
# LLM Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
OLLAMA_HOST=http://localhost:11434  # Optional, for local models

# Default Model Settings
DEFAULT_MODEL=gpt-4
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=2000

# Rate Limiting
LLM_REQUESTS_PER_MINUTE=60
LLM_TOKENS_PER_MINUTE=100000

# Streaming Configuration
SSE_KEEPALIVE_SECONDS=30
SSE_BUFFER_SIZE=1024
TOKEN_BUFFER_COUNT=5  # Buffer before sending
```

## Error Handling

### Error Types
```typescript
enum ChatErrorCode {
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MODEL_UNAVAILABLE = 'model_unavailable',
  INVALID_REQUEST = 'invalid_request',
  PROVIDER_ERROR = 'provider_error',
  NETWORK_ERROR = 'network_error',
}

interface ChatError {
  code: ChatErrorCode;
  message: string;
  retry_after?: number;  // seconds
  details?: any;
}
```

### Retry Strategy
- Exponential backoff for rate limits
- Automatic failover to alternative models
- Queue messages during provider outages
- Cache partial responses on connection loss

## Performance Considerations

### Optimization Strategies
1. **Token Buffering**: Accumulate 5-10 tokens before sending to reduce overhead
2. **Connection Pooling**: Maintain persistent connections to LLM providers
3. **Response Caching**: Cache identical prompts for 5 minutes (configurable)
4. **Database Batching**: Batch insert messages in 100ms windows
5. **Compression**: Use gzip for large responses

### Benchmarks
- Time to First Token: < 500ms
- Streaming Latency: < 100ms per token
- Concurrent Conversations: 100+ per server
- Message History Retrieval: < 50ms for 1000 messages

## Security Considerations

### API Key Management
- Store in environment variables or secure vault
- Never expose in frontend code
- Rotate keys quarterly
- Use separate keys for dev/staging/production

### Rate Limiting
- Per-user limits based on subscription tier
- Global limits to prevent abuse
- Token bucket algorithm for smooth throttling

### Content Filtering
- Sanitize user input for prompt injection
- Filter responses for sensitive information
- Audit log all conversations for compliance

## Testing Strategy

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_stream_chat() {
        // Test streaming with mock LLM
    }
    
    #[tokio::test]
    async fn test_token_counting() {
        // Verify accurate token counting
    }
    
    #[tokio::test]
    async fn test_cost_calculation() {
        // Test cost calculation for different models
    }
}
```

### Integration Tests
- Test each LLM provider integration
- Verify SSE streaming end-to-end
- Test conversation branching
- Validate error handling and recovery

### Load Tests
- Simulate 100 concurrent conversations
- Test provider failover under load
- Measure token throughput limits

## Dependencies
- **Required**: User Authentication, Database (PostgreSQL), Redis
- **Optional**: Ollama (for local models), Rate Limiter

## Implementation Priority
**CRITICAL** - This is the foundation feature. Nothing else works without chat.

## Success Criteria
- [ ] Stream responses from OpenAI, Anthropic, and 1+ other provider
- [ ] Response latency < 500ms to first token
- [ ] Handle 10+ concurrent conversations per user
- [ ] Accurate token counting (±5% of provider's count)
- [ ] Clean stop/resume of streaming
- [ ] Conversation persistence across sessions
- [ ] Cost tracking accurate to $0.01

## Future Enhancements
- **Function Calling**: Enable tool use for knowledge retrieval
- **Multimodal Input**: Support images and documents in chat
- **Voice Interface**: Speech-to-text and text-to-speech
- **Model Routing**: Automatically select best model for query type
- **Conversation Templates**: Pre-configured prompts for common tasks
- **Collaborative Chat**: Multiple users in same conversation
- **Export Formats**: Download conversations as markdown, PDF, JSON