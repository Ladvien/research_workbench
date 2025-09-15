#!/bin/bash

# Production Setup Script for Workbench on Manjaro (.110)
# Run with sudo privileges: sudo ./setup-production.sh

set -e

echo "=================================================="
echo "🚀 Setting up Workbench for Production on Manjaro (.110)"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo)"
   exit 1
fi

PROJECT_DIR="/mnt/datadrive_m2/research_workbench"
cd "$PROJECT_DIR"

print_status "Working directory: $(pwd)"

# 1. Install nginx configuration (HTTP only - Cloudflare handles SSL)
print_status "Installing nginx configuration..."
cp workbench-simple.nginx /etc/nginx/sites-available/workbench

# Enable the site
mkdir -p /etc/nginx/sites-enabled
ln -sf /etc/nginx/sites-available/workbench /etc/nginx/sites-enabled/

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
print_status "Testing nginx configuration..."
if nginx -t; then
    print_status "Nginx configuration is valid"
else
    print_error "Nginx configuration test failed"
    exit 1
fi

# 2. Install systemd services
print_status "Installing systemd services..."

# Install backend service
cp workbench-backend.service /etc/systemd/system/research-workbench-backend.service

# Install frontend service
cp workbench-frontend.service /etc/systemd/system/research-workbench-frontend.service

# Reload systemd
systemctl daemon-reload

print_status "Systemd services installed"

# 3. Enable and start services
print_status "Enabling and starting services..."

# Enable nginx
systemctl enable nginx

# Enable workbench services
systemctl enable research-workbench-backend.service
systemctl enable research-workbench-frontend.service

# Start nginx
systemctl start nginx

# Start backend
systemctl start research-workbench-backend.service

# Start frontend (note: this will replace the current manual process)
print_warning "Frontend service will be started after manual processes are stopped"

print_status "Services enabled for automatic startup"

# 4. Check service status
print_status "Checking service status..."

echo "nginx status:"
systemctl status nginx --no-pager -l

echo -e "\nBackend service status:"
systemctl status research-workbench-backend.service --no-pager -l

# 5. Test endpoints
print_status "Testing endpoints..."

echo "Testing backend health:"
if curl -s http://localhost:8080/health > /dev/null; then
    print_status "Backend health check: ✅ PASS"
else
    print_error "Backend health check: ❌ FAIL"
fi

echo "Testing nginx proxy:"
if curl -s http://localhost:80/health > /dev/null; then
    print_status "Nginx proxy health check: ✅ PASS"
else
    print_error "Nginx proxy health check: ❌ FAIL"
fi

# 6. Firewall configuration (if ufw is active)
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    print_status "Configuring firewall..."
    ufw allow 80/tcp comment "HTTP for nginx"
    # ufw allow 443/tcp comment "HTTPS for nginx"  # Not needed - Cloudflare handles SSL
    print_status "Firewall rules added"
fi

print_status "🎉 Production setup complete!"
echo ""
echo "Next steps:"
echo "1. Stop the manual frontend processes: kill the 'serve' processes running on port 4510"
echo "2. Start the frontend service: sudo systemctl start research-workbench-frontend.service"
echo "3. Update Cloudflare tunnel to point to this server's nginx (see cloudflare-tunnel-config.md)"
echo ""
echo "Service management commands:"
echo "  sudo systemctl status research-workbench-backend"
echo "  sudo systemctl status research-workbench-frontend"
echo "  sudo systemctl status nginx"
echo "  sudo systemctl restart research-workbench-backend"
echo "  sudo systemctl restart research-workbench-frontend"
echo ""
echo "Logs:"
echo "  sudo journalctl -u research-workbench-backend -f"
echo "  sudo journalctl -u research-workbench-frontend -f"
echo "  sudo journalctl -u nginx -f"