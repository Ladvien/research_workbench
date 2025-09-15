# LLM Chat Application Architecture
## workbench.lolzlab.com

---

## Executive Summary

A production-ready LLM chat application built with Rust (Axum) backend and React frontend, deployed on the Lolz Lab infrastructure. The system provides real-time streaming chat interactions with multiple LLM providers, conversation persistence, and file handling capabilities.

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph Internet
        CF[Cloudflare Tunnel<br/>workbench.lolzlab.com]
    end
    
    subgraph "Home Network (192.168.1.0/24)"
        subgraph "Infrastructure Services"
            RP[.102<br/>Reverse Proxy]
            DB[.104<br/>PostgreSQL 17]
            NAS[.103<br/>NAS Storage]
        end
        
        subgraph "Application Servers"
            APP1[.101<br/>App Server]
            APP2[.105<br/>App Server]
        end
    end
    
    CF --> RP
    RP --> APP1
    RP --> APP2
    APP1 --> DB
    APP1 --> NAS
    APP2 --> DB
    APP2 --> NAS
```

### Component Architecture

```mermaid
graph TB
    subgraph "React Frontend (SPA)"
        UI[Chat UI<br/>assistant-ui]
        SDK[AI SDK hooks<br/>useChat, useCompletion]
        State[State Management<br/>Zustand]
        MD[Markdown Rendering<br/>react-markdown]
        Files[File Upload/Preview]
    end
    
    subgraph "Axum Backend (Rust)"
        API[API Layer<br/>REST, SSE, WebSocket]
        Auth[Auth Service]
        Chat[Chat Service]
        FileService[File Service]
        LLM[LLM Integration Layer<br/>async-openai, anthropic-rust, langchain-rust]
    end
    
    subgraph "Data Storage"
        PG[(PostgreSQL 17<br/>.104)]
        NFS[NAS Storage<br/>.103]
    end
    
    UI --> API
    SDK --> API
    State --> API
    Files --> API
    
    API --> Auth
    API --> Chat
    API --> FileService
    
    Auth --> PG
    Chat --> LLM
    Chat --> PG
    FileService --> NFS
    
    LLM --> PG
```

## Initial Admin Account
📧 .env Configuration

ADMIN_EMAIL="xyz@yahoo.com"
ADMIN_PASSWORD="<PASSWORD>"

🚀 Auto-Creation Process

1. Backend startup reads ADMIN_EMAIL and ADMIN_PASSWORD from .env
2. Checks if user exists by email address
3. Creates admin user if not found:
- Password: Hashed with Argon2
4. Logs result: "Admin user with email 'xyz@yahoo.com' already exists"


## Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **UI Components**: assistant-ui (composable AI chat components)
- **LLM Integration**: AI SDK by Vercel
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Markdown**: react-markdown + react-syntax-highlighter
- **Build Tool**: Vite
- **Package Manager**: pnpm

### Backend
- **Framework**: Axum 0.7+
- **Runtime**: Tokio
- **LLM Clients**: async-openai, anthropic-rust
- **Orchestration**: langchain-rust
- **Database**: sqlx (PostgreSQL driver)
- **Session**: tower-sessions with Redis backend
- **Rate Limiting**: tower-governor
- **Serialization**: serde + serde_json
- **Logging**: tracing + tracing-subscriber
- **Error Handling**: anyhow + thiserror

### Infrastructure
- **Database**: PostgreSQL 17 with pgvector and PostGIS extensions
- **Cache**: Redis (for sessions and semantic cache)
- **File Storage**: NFS mount to .103
- **Reverse Proxy**: Nginx/Caddy at .102
- **SSL**: Cloudflare tunnel handles TLS
- **Monitoring**: OpenTelemetry + Prometheus

## Database Schema

### Core Tables

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table (supports branching)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES messages(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Message embeddings for semantic search
CREATE TABLE message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File attachments
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model VARCHAR(50) NOT NULL,
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    cost_cents INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_message_embeddings_embedding ON message_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_api_usage_user_created ON api_usage(user_id, created_at);
```

## API Design

### REST Endpoints

```yaml
# Authentication
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

# Conversations
GET    /api/conversations                 # List user's conversations
POST   /api/conversations                 # Create new conversation
GET    /api/conversations/:id            # Get conversation with messages
DELETE /api/conversations/:id            # Delete conversation
PATCH  /api/conversations/:id            # Update conversation metadata

# Messages
POST   /api/conversations/:id/messages   # Send message (returns SSE stream)
PATCH  /api/messages/:id                 # Edit message (creates branch)
DELETE /api/messages/:id                 # Delete message

# File handling
POST   /api/upload                       # Upload file attachment
GET    /api/files/:id                    # Download file
DELETE /api/files/:id                    # Delete file

# Search
GET    /api/search                       # Semantic search across conversations

# Models
GET    /api/models                       # List available models
```

### SSE Streaming Format

```typescript
// Token stream events
{ type: 'token', data: { content: 'Hello' } }
{ type: 'usage', data: { prompt: 100, completion: 50 } }
{ type: 'error', data: { message: 'Rate limit exceeded' } }
{ type: 'done', data: { messageId: 'uuid' } }
```

### WebSocket Protocol

```typescript
// Client -> Server
{ type: 'message', conversationId: 'uuid', content: 'text', parentId?: 'uuid' }
{ type: 'regenerate', messageId: 'uuid' }
{ type: 'stop', conversationId: 'uuid' }

// Server -> Client  
{ type: 'token', content: 'text' }
{ type: 'message_complete', messageId: 'uuid' }
{ type: 'error', error: 'string' }
```

## Security Architecture

### Authentication & Authorization
- **Method**: JWT tokens with refresh tokens
- **Storage**: HttpOnly cookies for tokens
- **Session**: Redis-backed sessions via tower-sessions
- **Password**: Argon2id hashing

### Rate Limiting
- **Global**: 1000 requests/hour per IP
- **API Calls**: 100 LLM requests/hour per user
- **Uploads**: 10 files/hour, 10MB max per file

### Input Validation
- **SQL Injection**: Parameterized queries via sqlx
- **XSS**: React's automatic escaping + CSP headers
- **CSRF**: Double-submit cookie pattern
- **File Upload**: Type validation, virus scanning

### Network Security
- **TLS**: Handled by Cloudflare tunnel
- **Internal**: Private network communication only
- **Firewall**: No exposed ports except through tunnel

## Performance Optimizations

### Caching Strategy

```rust
// Three-tier caching
1. Browser Cache: Static assets with long TTL
2. Redis Cache: 
   - Session data (24 hour TTL)
   - Semantic cache for similar prompts (1 hour TTL)
   - Rate limit counters
3. PostgreSQL: 
   - Conversation history
   - User preferences
   - Embeddings with pgvector
```

### Streaming Optimizations
- **Token Buffering**: 5-token buffer before sending
- **Compression**: Brotli for API responses
- **Connection Pooling**: 100 connections to PostgreSQL
- **Async Processing**: All I/O operations non-blocking

### Database Optimizations
- **Connection Pool**: r2d2 with 10-100 connections
- **Prepared Statements**: Cached query plans
- **Batch Operations**: Insert messages in batches
- **Partitioning**: Monthly partitions for messages table

## Deployment Architecture

### Systemd Service Structure

```mermaid
graph TD
    subgraph "System Services"
        Systemd[systemd]
        Systemd --> Frontend[workbench-frontend.service<br/>nginx serving React build]
        Systemd --> Backend[workbench-backend.service<br/>Axum binary]
        Systemd --> Redis[redis.service]
        Systemd --> Postgres[postgresql@17-main.service]
        Systemd --> NFS[nfs-kernel-server.service]
    end
```

### Service Configuration

#### Frontend Service (`/etc/systemd/system/workbench-frontend.service`)
```ini
[Unit]
Description=Workbench Frontend
After=network.target

[Service]
Type=simple
User=workbench
Group=workbench
WorkingDirectory=/opt/workbench/frontend
# Use npm run dev for development, or serve built files for production
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

# Environment variables (loaded from .env)
Environment="FRONTEND_PORT=451"
Environment="FRONTEND_HOST=0.0.0.0"
EnvironmentFile=-/opt/workbench/.env

[Install]
WantedBy=multi-user.target
```

#### Backend Service (`/etc/systemd/system/workbench-backend.service`)  
```ini
[Unit]
Description=Workbench Backend API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=workbench
Group=workbench
WorkingDirectory=/opt/workbench/backend
ExecStart=/opt/workbench/backend/workbench-server
Restart=always
RestartSec=10

# Environment variables (loaded from .env file)
EnvironmentFile=/opt/workbench/.env
# Or specify individual environment variables:
# Environment="DATABASE_URL=postgresql://workbench:password@192.168.1.104/workbench"
# Environment="REDIS_URL=redis://192.168.1.104:6379"
# Environment="NFS_MOUNT=/mnt/nas"
# Environment="RUST_LOG=info"
# Environment="BIND_ADDRESS=0.0.0.0:8080"

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/mnt/nas /var/log/workbench

[Install]
WantedBy=multi-user.target
```

### Build and Deployment Process

```bash
#!/bin/bash
# deploy.sh - Production deployment script

# Detect architecture
ARCH=$(uname -m)

# Build backend
cd backend
if [ "$ARCH" = "x86_64" ]; then
    cargo build --release --target x86_64-unknown-linux-gnu
    BINARY=target/x86_64-unknown-linux-gnu/release/workbench-server
else
    cargo build --release --target aarch64-unknown-linux-gnu
    BINARY=target/aarch64-unknown-linux-gnu/release/workbench-server
fi

# Build frontend
cd ../frontend
pnpm install
pnpm build

# Deploy files
sudo cp $BINARY /opt/workbench/backend/
sudo cp -r dist/* /opt/workbench/frontend/

# Restart services
sudo systemctl daemon-reload
sudo systemctl restart workbench-backend
sudo systemctl restart workbench-frontend
```

### Reverse Proxy Configuration (at .102)

```nginx
# Note: Replace ${FRONTEND_PORT} and ${BACKEND_PORT} with actual values from .env
server {
    server_name workbench.lolzlab.com;

    # Frontend - Uses FRONTEND_PORT from environment (default: 451)
    location / {
        proxy_pass http://192.168.1.101:${FRONTEND_PORT};
    }

    # API & SSE - Uses backend BIND_ADDRESS port from environment (default: 8080)
    location /api {
        proxy_pass http://192.168.1.101:${BACKEND_PORT};
        proxy_http_version 1.1;

        # SSE specific
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # WebSocket - Uses backend BIND_ADDRESS port from environment (default: 8080)
    location /ws {
        proxy_pass http://192.168.1.101:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring & Observability

### Metrics Collection

```yaml
Application Metrics:
  - Request latency (p50, p95, p99)
  - Active conversations
  - Messages per second
  - Token usage per model
  - Cache hit rates

LLM Metrics:
  - Time to first token (TTFT)
  - Tokens per second
  - API error rates
  - Cost per conversation