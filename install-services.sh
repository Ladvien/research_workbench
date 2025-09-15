#!/bin/bash

# install-services.sh - Systemd Services Installation Script
# Install and configure workbench systemd services for production deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="/etc/systemd/system"
LOG_DIR="/var/log/workbench"
INSTALL_DIR="/opt/workbench"

echo "=== Workbench Systemd Services Installation ==="
echo "Script directory: $SCRIPT_DIR"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo)" >&2
   exit 1
fi

# Create workbench user and group if they don't exist
if ! id -u workbench >/dev/null 2>&1; then
    echo "Creating workbench user and group..."
    useradd --system --home-dir /opt/workbench --shell /bin/bash workbench
    usermod -aG workbench workbench
else
    echo "User 'workbench' already exists"
fi

# Create installation directory
echo "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"/{backend,frontend}
chown -R workbench:workbench "$INSTALL_DIR"

# Create log directory
echo "Creating log directory: $LOG_DIR"
mkdir -p "$LOG_DIR"
chown -R workbench:workbench "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Copy systemd service files
echo "Installing systemd service files..."
cp "$SCRIPT_DIR/workbench-backend.service" "$SERVICE_DIR/"
cp "$SCRIPT_DIR/workbench-frontend.service" "$SERVICE_DIR/"

# Set correct permissions on service files
chmod 644 "$SERVICE_DIR/workbench-backend.service"
chmod 644 "$SERVICE_DIR/workbench-frontend.service"

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable services for startup on boot
echo "Enabling services for startup on boot..."
systemctl enable workbench-backend.service
systemctl enable workbench-frontend.service

# Create environment file if it doesn't exist
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    echo "Creating environment file from template..."
    if [[ -f "$SCRIPT_DIR/.env.example" ]]; then
        cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    elif [[ -f "$SCRIPT_DIR/.env" ]]; then
        cp "$SCRIPT_DIR/.env" "$INSTALL_DIR/.env"
    else
        echo "Warning: No environment file template found. Please create $INSTALL_DIR/.env manually."
    fi
    chown workbench:workbench "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Build and copy your application binaries to $INSTALL_DIR/"
echo "2. Configure $INSTALL_DIR/.env with your settings"
echo "3. Start the services with:"
echo "   sudo systemctl start workbench-backend"
echo "   sudo systemctl start workbench-frontend"
echo ""
echo "Service management commands:"
echo "  Status:  sudo systemctl status workbench-backend workbench-frontend"
echo "  Logs:    sudo journalctl -u workbench-backend -f"
echo "  Logs:    sudo journalctl -u workbench-frontend -f"
echo "  Stop:    sudo systemctl stop workbench-backend workbench-frontend"
echo "  Restart: sudo systemctl restart workbench-backend workbench-frontend"
echo ""
echo "Log files are written to: $LOG_DIR/"
echo "Installation directory: $INSTALL_DIR/"