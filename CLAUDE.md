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
```
workbench/
├── backend/                   # Rust/Axum API server
│   ├── src/
│   │   ├── handlers/          # Request handlers
│   │   ├── services/          # Business logic
│   │   ├── repositories/      # Data access
│   │   └── main.rs
│   └── Cargo.toml
├── frontend/                  # React/Vite application (pages-based)
│   ├── src/
│   │   ├── pages/             # Route-level components
│   │   ├── components/        # Shared reusable components
│   │   ├── hooks/             # Global custom hooks
│   │   ├── services/          # API service layer
│   │   ├── stores/            # Zustand stores
│   │   ├── utils/             # Utility functions
│   │   ├── types/             # Global TypeScript types
│   │   ├── styles/            # Global styles
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── db/                         # Database schemas
├── config/                     # Configuration files
├── scripts/                    # Build and utility scripts
├── docs/                       # Documentation
└── .env                        # Environment variables
```

## Development Rules
- Use specialized agents where possible
- Parallelize subagent deployment wherever possible
- Pages-based structure for medium complexity (15-50 components)
- Colocation principle: keep related files together

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
- Frontend: `*.test.ts`, `*.test.tsx` files colocated with components
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

## Frontend Patterns (Pages-Based React Architecture)

### Component Organization
- **Pages**: Route-level components in `src/pages/`
  - Each page in its own folder with index.tsx as entry point
  - Colocate page-specific components, hooks, and utilities
  - Page-specific state management within page folders
- **Shared Components**: Reusable UI in `src/components/`
  - Folder-per-component pattern
  - Each component folder contains: component, types, tests, styles
  - Export via index.tsx barrel file
- **Global Hooks**: Cross-page hooks in `src/hooks/`
- **Services**: API layer in `src/services/`
  - Separate from components for clean testing
  - Return typed responses

### React Best Practices
- Functional components with hooks only
- Single responsibility components
- TypeScript interfaces for all props: `[Component]Props`
- Custom hooks in separate files with `use*` prefix
- Zustand for global state (minimal boilerplate)
- Error boundaries on all routes
- API calls to `/api/*` (nginx handles routing)
- No direct backend port references
- Component composition over inheritance
- Colocation: tests, types, styles with components
- Maximum nesting: 3-4 levels deep
- Barrel files only at page and component boundaries

### File Naming Conventions
- Components: PascalCase (e.g., `Button.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useAuth.ts`)
- Services: camelCase with `.api.ts` suffix
- Types: PascalCase with `.types.ts` suffix
- Tests: same name with `.test.tsx` or `.test.ts`
- Styles: same name with `.styles.ts` or `.module.css`

### Import Organization
```typescript
// 1. React/third-party imports
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Absolute imports from src/
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';

// 3. Relative imports from current module
import { DashboardChart } from './DashboardChart';
import type { DashboardProps } from './Dashboard.types';
```

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

## Migration Path (When to Move Beyond Pages)
Monitor for these signals to transition to feature-based:
- Component count exceeds 50
- Pages folder has 10+ routes
- Shared components folder exceeds 20 components
- Multiple teams working on different pages
- Page-specific logic leaking into shared components
- Difficulty finding related code across folders

When these occur, refactor incrementally:
1. Group related pages into feature folders
2. Move page-specific components into features
3. Keep truly shared components in global folder
4. Establish feature boundaries and public APIs

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
- Nest folders deeper than 3-4 levels
- Mix page-specific and shared components in same folder
- Put API calls directly in components
- Create barrel files everywhere (only at boundaries)
- Store everything in global state