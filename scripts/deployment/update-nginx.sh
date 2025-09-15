#!/bin/bash

echo "Updating nginx configuration..."

# Copy nginx configuration
sudo cp /mnt/datadrive_m2/research_workbench/workbench.nginx /etc/nginx/sites-available/workbench

# Test nginx configuration
echo "Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    # Reload nginx if config is valid
    echo "Reloading nginx..."
    sudo nginx -s reload
    echo "✅ Nginx configuration updated and reloaded successfully!"
else
    echo "❌ Nginx configuration test failed. Please check the configuration."
    exit 1
fi