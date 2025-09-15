# Cloudflare Tunnel Configuration for Production

## Overview
Update the Cloudflare tunnel configuration to point to the nginx reverse proxy instead of the direct frontend service.

## Current Configuration
- **Domain**: workbench.lolzlab.com
- **Current Target**: Direct to frontend on port 4510
- **New Target**: nginx reverse proxy on port 80 (HTTP)

## Required Changes

### Recommended Configuration: HTTP Tunnel
```yaml
# In your cloudflared configuration (tunnel.yml or via dashboard)
ingress:
  - hostname: workbench.lolzlab.com
    service: http://192.168.1.110:80
```

**Why HTTP?** Cloudflare handles SSL termination, so internal encryption between the tunnel and nginx is unnecessary. This simplifies configuration and eliminates certificate management.

## Configuration Methods

### Method 1: Via Cloudflare Dashboard
1. Log into [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Tunnels**
3. Find your existing tunnel for workbench.lolzlab.com
4. Click **Configure**
5. Update the **Public Hostname** settings:
   - **Service Type**: HTTP
   - **URL**: `192.168.1.110:80`

### Method 2: Via Command Line
```bash
# If using cloudflared CLI
cloudflared tunnel route dns <tunnel-name> workbench.lolzlab.com

# Update tunnel configuration
cloudflared tunnel ingress rule <tunnel-name> \
  --hostname workbench.lolzlab.com \
  --service http://192.168.1.110:80
```

### Method 3: Configuration File Update
Update your tunnel configuration file (usually `~/.cloudflared/config.yml` or `/etc/cloudflared/config.yml`):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  - hostname: workbench.lolzlab.com
    service: http://192.168.1.110:80
  - service: http_status:404
```

Then restart the tunnel service:
```bash
sudo systemctl restart cloudflared
```

## Network Requirements

### Firewall Rules
Ensure the following ports are accessible from Cloudflare to your server:

**On Manjaro server (.110):**
```bash
# Allow HTTP (port 80)
sudo ufw allow from any to any port 80 proto tcp

# Note: Port 443 not needed - Cloudflare handles SSL termination
# sudo ufw allow from any to any port 443 proto tcp

# Check firewall status
sudo ufw status
```

### Port Verification
Verify nginx is listening on the correct ports:
```bash
# Check nginx is running
sudo systemctl status nginx

# Check port listeners
sudo netstat -tlnp | grep nginx
# Should show:
# tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN <pid>/nginx
```

## Testing the Configuration

### 1. Test Local nginx
```bash
# Test HTTP
curl -H "Host: workbench.lolzlab.com" http://192.168.1.110/health

# Note: No HTTPS testing needed - nginx only serves HTTP
```

### 2. Test Frontend Serving
```bash
# Test frontend loads
curl -H "Host: workbench.lolzlab.com" http://192.168.1.110/

# Test API proxy
curl -H "Host: workbench.lolzlab.com" http://192.168.1.110/api/health
```

### 3. Test from External
After updating Cloudflare tunnel:
```bash
# Test public domain
curl https://workbench.lolzlab.com/health

# Should return backend health JSON:
# {"service":"workbench-server","status":"healthy","timestamp":"...","version":"0.1.0"}
```

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**: nginx can't reach backend
   - Check backend is running: `systemctl status research-workbench-backend`
   - Check backend port: `curl http://localhost:8080/health`

2. **Port Issues**: nginx not listening
   - Check nginx is running: `systemctl status nginx`
   - Verify port 80 is open: `netstat -tlnp | grep :80`

3. **404 Not Found**: Frontend not loading
   - Check frontend service: `systemctl status research-workbench-frontend`
   - Check nginx config: `nginx -t`

4. **Connection Refused**: Network connectivity
   - Check firewall rules
   - Verify server IP address (should be 192.168.1.110)
   - Check cloudflared service: `systemctl status cloudflared`

### Log Files
Monitor these logs during configuration:
```bash
# Cloudflared tunnel logs
sudo journalctl -u cloudflared -f

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Backend logs
sudo journalctl -u research-workbench-backend -f

# Frontend logs
sudo journalctl -u research-workbench-frontend -f
```

## Rollback Plan
If issues occur, quickly rollback to current working setup:

1. **Via Dashboard**: Change service back to `http://192.168.1.110:4510`
2. **Via CLI**: Update tunnel back to port 4510
3. **Emergency**: Restart manual frontend service:
   ```bash
   cd /mnt/datadrive_m2/research_workbench/frontend
   serve -s dist -p 4510
   ```

## Post-Configuration Verification

After updating the tunnel, verify:

1. ✅ **Frontend loads**: https://workbench.lolzlab.com/
2. ✅ **API works**: https://workbench.lolzlab.com/health returns JSON
3. ✅ **No errors**: Check error message in UI is gone
4. ✅ **Full functionality**: Can create conversations and send messages

## Support Contacts
- **Cloudflare Support**: For tunnel configuration issues
- **System Admin**: For server-side nginx/systemd issues
- **Development Team**: For application-level problems

---
**⚠️ Important**: Test the configuration during low-traffic periods. Have the rollback plan ready in case of issues.