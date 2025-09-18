# Research Workbench

A vibe-coded, work-in-progress LLM chat application featuring multi-provider AI support, real-time streaming, and advanced conversation management.

## 🚧 Work in Progress

This project is actively being developed and is very much "vibe-coded" - built iteratively with rapid experimentation. Expect rough edges, frequent changes, and occasional chaos. Contributions and patience are equally welcome.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Rust, Axum, SQLx
- **Database**: PostgreSQL with pgvector for semantic search
- **AI Providers**: OpenAI, Anthropic, and Claude Code integration
- **Infrastructure**: Bare metal deployment with systemd and nginx

## Features

- ✨ Multi-provider LLM support (GPT-4, Claude, etc.)
- 🚀 Real-time streaming responses
- 💬 Conversation management with branching
- 🔍 Semantic search across conversations
- 📎 File attachments and processing
- 🔐 JWT-based authentication
- 📊 Usage analytics and tracking

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Ladvien/research_workbench.git
cd research_workbench

# Set up environment
cp .env.example .env
# Edit .env with your configuration:
# - Set DATABASE_URL with your PostgreSQL credentials
# - Change BIND_ADDRESS to 0.0.0.0:4512
# - Add your OPENAI_API_KEY and ANTHROPIC_API_KEY
# - Generate a secure JWT_SECRET

# Install frontend dependencies
cd frontend
pnpm install
cd ..

# Start services (each in a separate terminal):

# 1. Start nginx (required for proper routing)
sudo nginx -c $(pwd)/config/nginx.conf

# 2. Start backend
cd backend
cargo run

# 3. Start frontend
cd frontend
VITE_PORT=4511 pnpm dev
# or use the local script:
# pnpm dev:local

# Access the application at http://localhost:4510
```

## Development

### Prerequisites

- Node.js 18+ and pnpm
- Rust 1.70+
- PostgreSQL 17
- Redis (for session management)
- nginx (for local routing)

### Configuration

All configuration is handled through environment variables. See `.env.example` for required settings.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `BIND_ADDRESS` - Backend server address (must be 0.0.0.0:4512)
- `OPENAI_API_KEY` - For GPT models
- `ANTHROPIC_API_KEY` - For Claude models
- `JWT_SECRET` - Session security
- `REDIS_URL` - Redis connection for sessions

### Testing

```bash
# Frontend tests
cd frontend && pnpm test

# Backend tests
cd backend && cargo test

# E2E tests
cd frontend && pnpm test:e2e
```

## Architecture

This is a fairly standard web application with some interesting choices:

- **Bare metal deployment**: No Docker, direct systemd services for maximum performance
- **Streaming-first**: Built around SSE for real-time AI responses
- **pgvector integration**: Semantic search using PostgreSQL vector extensions
- **Multi-provider abstraction**: Easily swap between different LLM providers

## Contributing

This project is open for contributions! Since it's actively being developed, please:

1. Check existing issues before starting work
2. Open an issue for discussion on major changes
3. Keep PRs focused and small
4. Add tests for new functionality
5. Be patient - this is a work in progress

## Current Status

- ✅ Core chat functionality working
- ✅ Streaming responses implemented
- ✅ Basic authentication complete
- 🚧 File attachments in progress
- 🚧 Semantic search being refined
- 📝 Documentation needs improvement
- 🐛 Various UI/UX improvements needed

## Known Issues

- Frontend tests have some failures (being fixed)
- Conversation state can get stale after backend restarts (auto-recovery implemented)
- UI needs polish in several areas
- Performance optimization ongoing

## License

GPL-3.0 - See [LICENSE](LICENSE) for details

## Acknowledgments

Built with assistance from Claude Code and various open-source projects. Special thanks to the Rust and React communities for excellent documentation and tooling.

---

**Note**: This is an experimental project built for learning and exploration. Use at your own risk and definitely don't deploy to production without a thorough security review!