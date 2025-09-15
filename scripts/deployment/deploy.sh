#!/bin/bash
# deploy.sh - Production deployment script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/workbench.backup.$TIMESTAMP"

echo "=== Workbench Production Deployment ==="
echo "Timestamp: $TIMESTAMP"
echo "Backup location: $BACKUP_DIR"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo)" >&2
   exit 1
fi

# Stop services if they're running
echo "Stopping services..."
systemctl stop workbench-backend workbench-frontend 2>/dev/null || true

# Backup current version if it exists
if [[ -d "/opt/workbench" ]]; then
    echo "Backing up current version to $BACKUP_DIR..."
    cp -r /opt/workbench "$BACKUP_DIR"
fi

# Run the build script
echo "Building application..."
cd "$SCRIPT_DIR"
sudo -u $(logname) ./build.sh

# Determine binary path based on architecture
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    BINARY_PATH="backend/target/x86_64-unknown-linux-gnu/release/workbench-server"
elif [ "$ARCH" = "aarch64" ]; then
    BINARY_PATH="backend/target/aarch64-unknown-linux-gnu/release/workbench-server"
else
    BINARY_PATH="backend/target/release/workbench-server"
fi

# Ensure installation directory exists
mkdir -p /opt/workbench/{backend,frontend}

# Deploy backend binary
echo "Deploying backend binary..."
cp "$SCRIPT_DIR/$BINARY_PATH" /opt/workbench/backend/
chmod +x /opt/workbench/backend/workbench-server

# Deploy frontend files
echo "Deploying frontend files..."
cp -r "$SCRIPT_DIR/frontend/dist"/* /opt/workbench/frontend/

# Copy environment file
echo "Deploying environment configuration..."
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env" /opt/workbench/
    chmod 600 /opt/workbench/.env
fi

# Update permissions
echo "Setting permissions..."
chown -R workbench:workbench /opt/workbench

# Install/update systemd services
echo "Installing systemd services..."
"$SCRIPT_DIR/install-services.sh"

# Reload systemd and restart services
echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Starting services..."
systemctl start workbench-backend workbench-frontend

# Wait a moment for services to start
sleep 3

# Check service status
echo "=== Service Status ==="
systemctl status workbench-backend workbench-frontend --no-pager -l

# Health checks
echo "=== Health Checks ==="
echo "Backend health check..."
if curl -s http://localhost:4512/health >/dev/null 2>&1; then
    echo "✅ Backend is responding on port 4512"
else
    echo "❌ Backend health check failed"
fi

echo "Frontend health check..."
if curl -s http://localhost:4510/ >/dev/null 2>&1; then
    echo "✅ Frontend is responding on port 4510"
else
    echo "❌ Frontend health check failed"
fi

echo ""
echo "=== Deployment Complete ==="
echo "Services deployed and started successfully"
echo "Backend: http://localhost:4512"
echo "Frontend: http://localhost:4510"
echo "Logs: /var/log/workbench/"
echo "Backup: $BACKUP_DIR"
echo ""
echo "Monitor with:"
echo "  sudo systemctl status workbench-backend workbench-frontend"
echo "  sudo journalctl -u workbench-backend -f"
echo "  sudo tail -f /var/log/workbench/backend.log"