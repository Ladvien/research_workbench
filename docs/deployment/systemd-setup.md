# Systemd Services Setup Guide

This guide covers the installation and configuration of systemd services for the Workbench application on bare metal infrastructure.

## Overview

The Workbench application consists of two systemd services:

- **workbench-backend.service**: Rust backend API server (port 4512)
- **workbench-frontend.service**: React frontend application (port 4510)

## Architecture

```
nginx (192.168.1.102) → workbench.lolzlab.com:4510 → frontend:4510 → backend:4512
                                                   └→ PostgreSQL (192.168.1.104:5432)
                                                   └→ Redis (192.168.1.104:6379)
```

## Prerequisites

- Ubuntu/Debian Linux system (bare metal, NO DOCKER)
- PostgreSQL 17 with pgvector extension available at 192.168.1.104
- Redis server available at 192.168.1.104:6379
- Node.js with pnpm package manager
- Rust toolchain for building backend

## Quick Installation

1. **Run the installation script:**
   ```bash
   sudo ./install-services.sh
   ```

This will:
- Create `workbench` user and group
- Set up `/opt/workbench/` installation directory
- Create `/var/log/workbench/` for logging
- Install systemd service files
- Enable services for auto-start on boot

## Service Configuration

### Backend Service (workbench-backend.service)

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

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/mnt/nas /var/log/workbench

# Logging
StandardOutput=append:/var/log/workbench/backend.log
StandardError=append:/var/log/workbench/backend-error.log

[Install]
WantedBy=multi-user.target
```

### Frontend Service (workbench-frontend.service)

```ini
[Unit]
Description=Workbench Frontend
After=network.target

[Service]
Type=simple
User=workbench
Group=workbench
WorkingDirectory=/opt/workbench/frontend
ExecStart=/usr/bin/pnpm preview --port 4510 --host 0.0.0.0
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
EnvironmentFile=-/opt/workbench/.env

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=append:/var/log/workbench/frontend.log
StandardError=append:/var/log/workbench/frontend-error.log

[Install]
WantedBy=multi-user.target
```

## Manual Installation Steps

If you prefer to install manually instead of using the script:

1. **Create workbench user:**
   ```bash
   sudo useradd --system --home-dir /opt/workbench --shell /bin/bash workbench
   ```

2. **Create directories:**
   ```bash
   sudo mkdir -p /opt/workbench/{backend,frontend}
   sudo mkdir -p /var/log/workbench
   sudo chown -R workbench:workbench /opt/workbench
   sudo chown -R workbench:workbench /var/log/workbench
   ```

3. **Install service files:**
   ```bash
   sudo cp workbench-backend.service /etc/systemd/system/
   sudo cp workbench-frontend.service /etc/systemd/system/
   sudo chmod 644 /etc/systemd/system/workbench-*.service
   ```

4. **Enable services:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable workbench-backend workbench-frontend
   ```

## Deployment Process

1. **Build the backend:**
   ```bash
   cd backend
   cargo build --release --target x86_64-unknown-linux-gnu
   # OR for ARM64: cargo build --release --target aarch64-unknown-linux-gnu
   ```

2. **Build the frontend:**
   ```bash
   cd frontend
   pnpm install --frozen-lockfile
   pnpm build
   ```

3. **Deploy binaries:**
   ```bash
   sudo cp backend/target/release/workbench-server /opt/workbench/backend/
   sudo cp -r frontend/dist/* /opt/workbench/frontend/
   sudo chown -R workbench:workbench /opt/workbench
   ```

4. **Configure environment:**
   ```bash
   sudo cp .env /opt/workbench/
   sudo chown workbench:workbench /opt/workbench/.env
   sudo chmod 600 /opt/workbench/.env
   ```

5. **Start services:**
   ```bash
   sudo systemctl start workbench-backend workbench-frontend
   ```

## Service Management

### Starting Services
```bash
sudo systemctl start workbench-backend
sudo systemctl start workbench-frontend
```

### Stopping Services
```bash
sudo systemctl stop workbench-backend workbench-frontend
```

### Restarting Services
```bash
sudo systemctl restart workbench-backend workbench-frontend
```

### Checking Status
```bash
sudo systemctl status workbench-backend workbench-frontend
```

### Viewing Logs
```bash
# Real-time logs
sudo journalctl -u workbench-backend -f
sudo journalctl -u workbench-frontend -f

# Log files
sudo tail -f /var/log/workbench/backend.log
sudo tail -f /var/log/workbench/frontend.log
```

## Health Checks

### Backend Health Check
```bash
curl http://localhost:4512/health
```

Expected response:
```json
{"status": "healthy", "timestamp": "2025-09-15T..."}
```

### Frontend Health Check
```bash
curl http://localhost:4510/
```

Expected: HTML response from React application

### Service Health Check
```bash
# Check if services are running
systemctl is-active workbench-backend workbench-frontend

# Check if services are enabled
systemctl is-enabled workbench-backend workbench-frontend
```

## Environment Configuration

Create `/opt/workbench/.env` with:

```bash
# Database Configuration
DATABASE_URL=postgresql://workbench:password@192.168.1.104/workbench

# Redis Configuration
REDIS_URL=redis://192.168.1.104:6379

# Application Settings
BIND_ADDRESS=0.0.0.0:4512
FRONTEND_PORT=4510
BACKEND_PORT=4512
RUST_LOG=info

# File Storage
NFS_MOUNT=/mnt/nas

# Security
JWT_SECRET=your_secure_jwt_secret_here
```

## Security Features

- **NoNewPrivileges=true**: Prevents privilege escalation
- **PrivateTmp=true**: Provides private /tmp directory
- **ProtectSystem=strict**: Read-only filesystem protection
- **User isolation**: Services run as dedicated `workbench` user
- **Log file permissions**: Restricted access to log files

## Troubleshooting

### Service Won't Start
1. Check logs: `sudo journalctl -u workbench-backend -n 50`
2. Verify binary exists: `ls -la /opt/workbench/backend/workbench-server`
3. Check permissions: `ls -la /opt/workbench/`
4. Verify environment file: `sudo cat /opt/workbench/.env`

### Port Conflicts
1. Check if ports are in use: `sudo ss -tlnp | grep -E '4510|4512'`
2. Kill conflicting processes or change ports in configuration

### Database Connection Issues
1. Test connection: `pg_isready -h 192.168.1.104 -p 5432`
2. Verify credentials in .env file
3. Check network connectivity: `telnet 192.168.1.104 5432`

### Permission Errors
```bash
# Fix ownership
sudo chown -R workbench:workbench /opt/workbench
sudo chown -R workbench:workbench /var/log/workbench

# Fix permissions
sudo chmod 755 /opt/workbench
sudo chmod 600 /opt/workbench/.env
sudo chmod +x /opt/workbench/backend/workbench-server
```

## Cross-Architecture Deployment

### For ARM64 (Raspberry Pi)
```bash
# Cross-compile backend
cargo build --release --target aarch64-unknown-linux-gnu

# Deploy ARM64 binary
sudo cp target/aarch64-unknown-linux-gnu/release/workbench-server /opt/workbench/backend/
```

### For AMD64 (x86_64)
```bash
# Cross-compile backend
cargo build --release --target x86_64-unknown-linux-gnu

# Deploy AMD64 binary
sudo cp target/x86_64-unknown-linux-gnu/release/workbench-server /opt/workbench/backend/
```

## Monitoring and Maintenance

### Log Rotation
The system logs are written to files in `/var/log/workbench/`. Set up logrotate:

```bash
# Create /etc/logrotate.d/workbench
/var/log/workbench/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 workbench workbench
    sharedscripts
    postrotate
        systemctl reload workbench-backend workbench-frontend
    endscript
}
```

### System Monitoring
```bash
# Resource usage
htop -p $(pgrep -f workbench)

# Network connections
ss -tlnp | grep -E '4510|4512'

# Service dependencies
systemctl list-dependencies workbench-backend
systemctl list-dependencies workbench-frontend
```

## Production Checklist

- [ ] PostgreSQL 17 with pgvector extension configured
- [ ] Redis server accessible at 192.168.1.104:6379
- [ ] Nginx reverse proxy configured
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Backup strategy for /opt/workbench and database
- [ ] Monitoring and alerting set up
- [ ] Log rotation configured
- [ ] Environment variables secured
- [ ] Services enabled for auto-start

## IMPORTANT: NO DOCKER

This deployment is designed for **bare metal infrastructure only**. Docker and containerization are strictly prohibited per project requirements. All services run directly on the host system using systemd.