#!/bin/bash

# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate
# Note: This is only for internal use - Cloudflare handles the real SSL
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/self-signed.key \
    -out /etc/nginx/ssl/self-signed.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=workbench.lolzlab.com"

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/self-signed.key
sudo chmod 644 /etc/nginx/ssl/self-signed.crt

# Copy nginx configuration
sudo cp /mnt/datadrive_m2/research_workbench/workbench.nginx /etc/nginx/sites-available/workbench

# Enable the site
sudo ln -sf /etc/nginx/sites-available/workbench /etc/nginx/sites-enabled/

# Remove default site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo nginx -s reload

echo "Nginx SSL setup complete!"
echo "Nginx is now listening on:"
echo "  - Port 80 (HTTP - redirects to HTTPS)"
echo "  - Port 443 (HTTPS)"
echo ""
echo "Update your Cloudflare tunnel to point to: 192.168.1.102:443"