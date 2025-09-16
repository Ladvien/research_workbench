# Knowledge Research Workbench

## 🚫 NO DOCKER - BARE METAL ONLY
- This project runs directly on hardware via systemd
- No containers, no docker-compose, no Kubernetes
- Direct process management for maximum performance

## Tech Stack
- Frontend: React 18, TypeScript, Vite
- Backend: Rust, Axum, SQLx
- Database: PostgreSQL 17 @ 192.168.1.104 (pgvector, PostGIS pre-installed)
- Testing: Vitest, Playwright, React Testing Library, cargo test
- State: Zustand
- Storage: NFS @ 192.168.1.103
- Proxy: Local nginx routing

## Network Architecture
```
workbench.lolzlab.com → Cloudflare → 192.168.1.102 (nginx) → 192.168.1.110:4510 (local nginx) → routes to:
  - /api/* → localhost:4512 (backend)
  - /* → localhost:4511 (frontend Vite)
```

## Fixed Ports - DO NOT CHANGE
- **nginx**: 4510 (entry point, receives external traffic)
- **Frontend**: 4511 (Vite dev server, internal only)
- **Backend**: 4512 (Axum server, internal only)
- All testing via: workbench.lolzlab.com

## Project Structure
- `backend/` - Rust/Axum API server
- `frontend/` - React/Vite application  
- `db/` - Database schemas
- `config/` - Configuration files (including nginx.conf)
- `scripts/` - Build and utility scripts
- `docs/` - Documentation

## Development Rules
- Use specialized agents where possible
- Parallize subagent deployment wherever possible

## Development Commands
- Start nginx: `sudo nginx -c $(pwd)/config/nginx.conf`
- Frontend dev: `cd frontend && VITE_PORT=4511 pnpm dev`
- Backend dev: `cd backend && cargo run`
- Frontend tests: `pnpm test` (unit), `pnpm test:e2e` (e2e)
- Backend tests: `cargo test`
- Format: `cargo fmt`, `pnpm format`
- Lint: `cargo clippy`, `pnpm lint`
- DB reset: `psql $DATABASE_URL -f db/reset.sql`

## Local Nginx Configuration
- Entry point: 192.168.1.110:4510
- Routes /api/* to localhost:4512 (backend)
- Routes /* to localhost:4511 (frontend)
- Config location: `config/nginx.conf`
- Reload: `sudo nginx -s reload`

## Testing Requirements - TEST FIRST ALWAYS
- Write tests FIRST before any implementation
- All testing through workbench.lolzlab.com
- Use puppeteer MCP to verify application works
- Frontend: `*.test.ts`, `*.test.tsx` files
- Backend: `#[cfg(test)]` modules
- Never consider feature complete without passing tests
- Fix all failures before moving to next task

## Code Standards
- Rust: snake_case, rustfmt, clippy with no warnings
- TypeScript: camelCase, PascalCase for components
- No TODOs in code - implement fully or don't merge
- No commented-out code - delete it
- No shortcuts - do it right the first time
- No Docker - bare metal only with systemd

## API Design
- Base URL: `http://localhost:4512/api`
- Public URL: `https://workbench.lolzlab.com/api`
- All responses stream where applicable
- Use axum::response::Sse for server-sent events
- Connection pooling: max 100 connections via SQLx

## Frontend Patterns (React Best Practices)
- Functional components with hooks only
- Single responsibility components
- TypeScript interfaces for all props: [Component]Props
- Custom hooks in separate files with use* prefix
- Zustand for global state (minimal boilerplate)
- Error boundaries on all routes
- API calls to `/api/*` (nginx handles routing)
- No direct backend port references
- Component composition over inheritance

## Backend Patterns
- Separate handlers, services, repositories
- Use anyhow for errors, thiserror for custom types
- Validate input with validator crate
- Return Result<T, E> everywhere
- Stream responses with axum::response::Sse
- Bind to 0.0.0.0:4512

## Database Rules - PROTOTYPE MODE
- Drop and recreate tables freely - no legacy support
- No migrations - we're iterating fast
- pgvector extension pre-installed (enable with CREATE EXTENSION)
- PostGIS extension pre-installed (available when needed)
- Connection via .env DATABASE_URL only
- Max 100 connections via SQLx pool

## Environment Variables (.env) - DO NOT CHANGE WITHOUT PERMISSION
- DATABASE_URL - PostgreSQL connection
- NFS_PATH - Storage mount point  
- RUST_LOG=info - Logging level
- BIND_ADDRESS=0.0.0.0:4512 - Backend bind
- VITE_PORT=4511 - Frontend port
- Use .env variables as inputs for application

## Build & Deploy - BARE METAL ONLY
- Frontend: `pnpm build` → `dist/`
- Backend: `cargo build --release`
- Target: x86_64-unknown-linux-gnu (AMD64)
- Deploy via systemd services at /opt/workbench/
- Systemd files: workbench-backend.service, workbench-nginx.service

## Production Test Process
```bash
# Backend
cd backend && cargo test --release

# Frontend  
cd frontend && pnpm test:run && pnpm test:e2e

# Verify via workbench.lolzlab.com with puppeteer MCP
```

## Quality Gates
- Tests pass at workbench.lolzlab.com
- Zero compiler warnings (cargo clippy)
- Zero linter errors (eslint)
- No TODO/FIXME comments
- Streaming responses verified
- nginx routing confirmed

## NEVER DO - STRICT RULES
- Change ports 4510, 4511, or 4512
- Use Docker, containers, or Kubernetes
- Leave TODOs, FIXMEs, or "TODO later"
- Leave commented-out code blocks
- Skip writing tests first (TDD required)
- Take shortcuts or placeholder implementations
- Deploy without testing at workbench.lolzlab.com
- Modify .env without explicit permission
- Create migrations (drop/recreate in prototype)
- Add backwards compatibility or legacy support
- Mock implementations that don't work