# Workbench LLM Chat Application

A production-ready LLM chat application built with React (TypeScript) frontend and Rust (Axum) backend, featuring multi-provider AI support, conversation management, and advanced features like semantic search and file attachments.

## ⚠️ SECURITY NOTICE

**This application is NOT production-ready in its current state.** A comprehensive security audit has identified critical vulnerabilities that must be addressed before deployment. See `BACKLOG.md` for complete details.

**Critical Issues:**
- Hardcoded production credentials in configuration files
- Weak JWT secrets
- Exposed network information in documentation
- Missing HTTPS enforcement

**Action Required:** Complete all CRITICAL priority items in `BACKLOG.md` before any production deployment.

## Quick Start

1. **Clone and setup environment**:
   ```bash
   git clone <repository-url>
   cd research_workbench
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start the application**:
   ```bash
   # Terminal 1: Backend
   cd backend
   cargo run

   # Terminal 2: Frontend
   cd frontend
   npm install
   npm run dev
   ```

3. **Access the application**:
   - Frontend: http://localhost:451 (or your configured `FRONTEND_PORT`)
   - Backend API: http://localhost:8080 (or your configured `BIND_ADDRESS`)

## Environment Configuration

All configuration is managed through environment variables in the `.env` file. Copy `.env.example` to `.env` and customize as needed.

### Key Environment Variables

#### Frontend Configuration
- `FRONTEND_PORT=451` - Port for the development server (default: 451)
- `FRONTEND_HOST=0.0.0.0` - Host binding for the frontend (default: 0.0.0.0)

#### Backend Configuration
- `BIND_ADDRESS=0.0.0.0:8080` - Backend server address and port
- `RUST_LOG=info` - Logging level (trace, debug, info, warn, error)

#### Database Configuration
- `DATABASE_URL` - Full PostgreSQL connection string
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` - Individual database settings
- `DATABASE_USER`, `DATABASE_PASSWORD` - Database credentials

#### Redis Configuration
- `REDIS_URL` - Full Redis connection string
- `REDIS_HOST`, `REDIS_PORT` - Individual Redis settings

#### AI Provider Configuration
- `OPENAI_API_KEY` - OpenAI API key (required)
- `ANTHROPIC_API_KEY` - Anthropic API key (optional)
- `OPENAI_MODEL`, `ANTHROPIC_MODEL` - Default models to use
- `OPENAI_MAX_TOKENS`, `ANTHROPIC_MAX_TOKENS` - Token limits
- `OPENAI_TEMPERATURE`, `ANTHROPIC_TEMPERATURE` - Model temperature settings

#### Security Configuration
- `JWT_SECRET` - JWT token signing secret (generate a secure random string)

#### File Storage
- `NFS_MOUNT` - Path to NFS mount for file storage

#### Rate Limiting (Optional)
- `RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=1000`
- `RATE_LIMIT_API_REQUESTS_PER_HOUR=100`
- `RATE_LIMIT_UPLOADS_PER_HOUR=10`
- `RATE_LIMIT_PREMIUM_MULTIPLIER=5`
- `RATE_LIMIT_ADMIN_OVERRIDE=true`

## Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Axum + SQLx + PostgreSQL 17
- **AI Providers**: OpenAI GPT-4/3.5, Anthropic Claude (extensible)
- **Features**: Real-time streaming, conversation branching, semantic search, file attachments
- **Infrastructure**: Docker-ready, systemd services, reverse proxy support

## Development

### Prerequisites
- Node.js 18+ with npm/pnpm
- Rust 1.70+
- PostgreSQL 17
- Redis 6+

### Frontend Development
```bash
cd frontend
npm install
npm run dev    # Starts on port from FRONTEND_PORT env var
npm test       # Run tests
npm run build  # Production build
```

### Backend Development
```bash
cd backend
cargo build    # Build debug version
cargo run      # Start development server
cargo test     # Run tests
cargo build --release  # Production build
```

### Environment Setup for Different Ports

To run the frontend on a different port:

1. **Method 1: Environment Variable**
   ```bash
   # In .env file
   FRONTEND_PORT=3000
   FRONTEND_HOST=localhost
   ```

2. **Method 2: Command Line Override**
   ```bash
   FRONTEND_PORT=8000 npm run dev
   ```

3. **Method 3: Multiple Environment Files**
   ```bash
   # Create .env.local, .env.staging, .env.production
   # Load with: dotenv -e .env.local npm run dev
   ```

## Production Deployment

### Using Systemd Services

1. **Frontend Service** (`/etc/systemd/system/workbench-frontend.service`):
   ```ini
   [Unit]
   Description=Workbench Frontend
   After=network.target

   [Service]
   Type=simple
   User=workbench
   Group=workbench
   WorkingDirectory=/opt/workbench/frontend
   ExecStart=/usr/bin/npm run dev
   Restart=always
   RestartSec=10
   EnvironmentFile=/opt/workbench/.env

   [Install]
   WantedBy=multi-user.target
   ```

2. **Backend Service** (`/etc/systemd/system/workbench-backend.service`):
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
   EnvironmentFile=/opt/workbench/.env

   [Install]
   WantedBy=multi-user.target
   ```

### Reverse Proxy Configuration

Update your reverse proxy (Nginx/Caddy) to use the configured ports:

```nginx
server {
    server_name your-domain.com;

    # Frontend - adjust port based on FRONTEND_PORT
    location / {
        proxy_pass http://localhost:451;  # Use your FRONTEND_PORT
    }

    # Backend API - adjust port based on BIND_ADDRESS
    location /api {
        proxy_pass http://localhost:8080;  # Use your backend port
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## Features

- ✅ **Multi-Provider LLM Support**: OpenAI GPT-4/3.5, Anthropic Claude
- ✅ **Real-time Streaming**: Token-by-token response streaming
- ✅ **Conversation Management**: Create, rename, delete, switch conversations
- ✅ **User Authentication**: JWT-based auth with session management
- ✅ **Conversation Branching**: Edit messages and explore alternative paths
- ✅ **File Attachments**: Upload images, PDFs, documents with preview
- ✅ **Semantic Search**: AI-powered search across all conversations
- ✅ **Usage Analytics**: Token usage tracking and cost analysis
- ✅ **Rate Limiting**: Configurable rate limits per user tier
- ✅ **Responsive Design**: Mobile and desktop optimized

## API Documentation

The backend provides a RESTful API with the following endpoints:

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `POST /api/conversations/:id/messages` - Send message
- `GET /api/search` - Semantic search
- `GET /api/analytics/*` - Usage analytics
- `POST /api/upload` - File upload

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:
1. Check what's using the port: `lsof -i :451`
2. Change the port in `.env`: `FRONTEND_PORT=3000`
3. Restart the development server

### Environment Variables Not Loading
1. Ensure `.env` file exists in the project root
2. Check file permissions: `chmod 644 .env`
3. Verify environment variable names match exactly

### Database Connection Issues
1. Ensure PostgreSQL is running: `systemctl status postgresql`
2. Check database credentials in `.env`
3. Verify database exists: `psql -h localhost -U workbench -d workbench`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test` (frontend), `cargo test` (backend)
5. Submit a pull request

## License

[Add your license information here]