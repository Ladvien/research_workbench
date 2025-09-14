# CLAUDE.md - Project Constraints & Guidelines

## Critical Project Constraints

### 🚫 DOCKER IS STRICTLY PROHIBITED

**This project will NOT use Docker under any circumstances.**

- ❌ No Docker containers
- ❌ No docker-compose
- ❌ No Dockerfile
- ❌ No containerization of any kind
- ❌ No Kubernetes, Podman, or any container orchestration

### Rationale
This application is designed to run directly on bare metal infrastructure. The Lolz Lab cluster uses systemd services and direct process management for maximum performance and minimal overhead.

## Supported Architectures

### ✅ Multi-Architecture Support
This application supports both AMD64 and ARM64 architectures:

- **AMD64 (x86_64)**: For development workstations and Intel/AMD servers
- **ARM64 (aarch64)**: For Raspberry Pi 4/5 deployment

## Database Configuration

### PostgreSQL 17
The production database at `192.168.1.104` runs PostgreSQL 17 with:
- ✅ **pgvector** extension (pre-installed)
- ✅ **PostGIS** extension (pre-installed)
- ✅ All required extensions already configured
- ✅ Optimized for SSD storage

## Approved Deployment Methods

### ✅ Systemd Services
All applications will be deployed as systemd services:
```bash
# Frontend service
/etc/systemd/system/workbench-frontend.service

# Backend service  
/etc/systemd/system/workbench-backend.service
```

### ✅ Direct Binary Execution
- Rust backend compiled to native binary (AMD64 or ARM64)
- React frontend served via nginx/caddy
- Direct process management via systemd

### ✅ Native Package Management
- Rust dependencies via Cargo
- Node.js dependencies via pnpm
- System dependencies via apt

## Development Environment

### Local Development
```bash
# Backend
cargo run --release

# Frontend
pnpm dev
```

### Production Build
```bash
# Backend - compile for target architecture
# For AMD64 (x86_64)
cargo build --release --target x86_64-unknown-linux-gnu

# For ARM64 (Raspberry Pi 4/5)
cargo build --release --target aarch64-unknown-linux-gnu

# Or let Cargo detect the native target
cargo build --release

# Frontend - production build (architecture-agnostic)
pnpm build
```

## Cross-Compilation Setup

### From AMD64 to ARM64
```bash
# Install cross-compilation toolchain
sudo apt install gcc-aarch64-linux-gnu

# Configure Cargo for cross-compilation
cat >> ~/.cargo/config.toml << EOF
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"
EOF

# Build for ARM64
cargo build --release --target aarch64-unknown-linux-gnu
```

### From ARM64 to AMD64
```bash
# Install cross-compilation toolchain
sudo apt install gcc-x86-64-linux-gnu

# Configure Cargo for cross-compilation
cat >> ~/.cargo/config.toml << EOF
[target.x86_64-unknown-linux-gnu]
linker = "x86_64-linux-gnu-gcc"
EOF

# Build for AMD64
cargo build --release --target x86_64-unknown-linux-gnu
```

## Deployment Architecture

```mermaid
graph TD
    subgraph "Bare Metal Deployment"
        A[Systemd] --> B[workbench-backend.service]
        A --> C[workbench-frontend.service]
        A --> D[postgresql@17-main.service]
        A --> E[redis.service]
        A --> F[nginx.service]
    end
```

## Infrastructure Rules

1. **Direct Hardware Access**: Applications run directly on hardware (AMD64 or ARM64)
2. **Systemd Management**: All services managed through systemd
3. **Native Compilation**: Rust binaries compiled for target architecture
4. **File System Access**: Direct NFS mounts, no volume abstractions
5. **Network Access**: Direct network interface access, no network namespaces

## Required Environment Variables

Set in systemd service files or `/etc/environment`:

```bash
# Database (PostgreSQL 17)
DATABASE_URL=postgresql://user:pass@192.168.1.104/workbench

# Redis
REDIS_URL=redis://192.168.1.104:6379

# NFS Mount
NFS_STORAGE_PATH=/mnt/nas

# Application
RUST_LOG=info
BIND_ADDRESS=0.0.0.0:8080

# Architecture-specific optimizations
RUST_TARGET_CPU=native  # Optimize for the current CPU
```

## File Paths

All paths are absolute on the host filesystem:

- **Backend Binary**: `/opt/workbench/backend/workbench-server`
- **Frontend Static Files**: `/opt/workbench/frontend/dist`
- **Configuration**: `/etc/workbench/config.toml`
- **Logs**: `/var/log/workbench/`
- **NFS Mount**: `/mnt/nas`
- **PostgreSQL Socket**: `/var/run/postgresql/.s.PGSQL.5432`

## Service Configuration Example

### workbench-backend.service
```ini
[Unit]
Description=Workbench LLM Chat Backend
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=workbench
Group=workbench
WorkingDirectory=/opt/workbench/backend
ExecStart=/opt/workbench/backend/workbench-server
Restart=always
RestartSec=10

# Environment
Environment="DATABASE_URL=postgresql://workbench:password@192.168.1.104/workbench"
Environment="REDIS_URL=redis://192.168.1.104:6379"
Environment="RUST_LOG=info"
Environment="BIND_ADDRESS=0.0.0.0:8080"

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Build Script Example

```bash
#!/bin/bash
# build.sh - Multi-architecture build script

ARCH=$(uname -m)

echo "Building for architecture: $ARCH"

# Backend
cd backend
if [ "$ARCH" = "x86_64" ]; then
    cargo build --release --target x86_64-unknown-linux-gnu
elif [ "$ARCH" = "aarch64" ]; then
    cargo build --release --target aarch64-unknown-linux-gnu
else
    cargo build --release
fi

# Frontend
cd ../frontend
pnpm install
pnpm build

echo "Build complete for $ARCH"
```

## PostgreSQL 17 Connection

```rust
// Cargo.toml
[dependencies]
sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "uuid", "json", "time"] }
pgvector = { version = "0.3", features = ["sqlx"] }

// Connection with pgvector support
let pool = PgPoolOptions::new()
    .max_connections(100)
    .connect("postgresql://user:pass@192.168.1.104/workbench")
    .await?;

// Enable pgvector
sqlx::query("CREATE EXTENSION IF NOT EXISTS vector")
    .execute(&pool)
    .await?;

// PostGIS is already available
sqlx::query("CREATE EXTENSION IF NOT EXISTS postgis")
    .execute(&pool)
    .await?;
```

## Important Notes

1. **NO DOCKER**: Never suggest, implement, or reference Docker in any form
2. **Architecture Detection**: Always detect and build for the correct architecture
3. **PostgreSQL 17**: Use features specific to PostgreSQL 17 where beneficial
4. **Extensions Pre-installed**: pgvector and PostGIS are already available, just enable them
5. **Direct Execution**: All processes run directly on the host OS