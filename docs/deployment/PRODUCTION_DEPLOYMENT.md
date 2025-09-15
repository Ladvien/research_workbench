# Production Deployment Guide

## Quick Deployment Steps

### 1. Run Production Setup Script
```bash
cd /mnt/datadrive_m2/research_workbench
sudo ./setup-production.sh
```

This script will:
- ✅ Configure nginx as HTTP reverse proxy (Cloudflare handles SSL)
- ✅ Install systemd services
- ✅ Enable automatic startup
- ✅ Start nginx and backend services

### 2. Transition from Manual to Systemd Services
```bash
# Find and stop manual frontend processes
ps aux | grep serve
kill <process-ids-for-serve-on-port-4510>

# Start systemd frontend service
sudo systemctl start research-workbench-frontend.service

# Verify all services are running
sudo systemctl status nginx
sudo systemctl status research-workbench-backend
sudo systemctl status research-workbench-frontend
```

### 3. Update Cloudflare Tunnel
Follow instructions in `cloudflare-tunnel-config.md`:
- Change target from `192.168.1.110:4510` to `192.168.1.110:80`
- Simple HTTP tunnel (Cloudflare handles SSL termination)

## Service Management

### Status Checks
```bash
# All services
sudo systemctl status nginx research-workbench-backend research-workbench-frontend

# Individual services
sudo systemctl status nginx
sudo systemctl status research-workbench-backend
sudo systemctl status research-workbench-frontend
```

### Restart Services
```bash
# Restart all
sudo systemctl restart nginx research-workbench-backend research-workbench-frontend

# Restart individual
sudo systemctl restart research-workbench-backend
sudo systemctl restart research-workbench-frontend
sudo systemctl restart nginx
```

### View Logs
```bash
# Live logs
sudo journalctl -u research-workbench-backend -f
sudo journalctl -u research-workbench-frontend -f
sudo journalctl -u nginx -f

# Recent logs
sudo journalctl -u research-workbench-backend --since "1 hour ago"
```

## Health Checks

### Local Tests
```bash
# Backend direct
curl http://localhost:8080/health

# Through nginx
curl http://localhost:80/health

# Frontend
curl http://localhost:80/
```

### Production Tests
```bash
# Through domain
curl https://workbench.lolzlab.com/health
curl https://workbench.lolzlab.com/
```

## Security Features Enabled

- ✅ **JWT Secret Validation**: 256-bit minimum requirement
- ✅ **HTTPS Enforcement**: Session cookies secure + SameSite=Strict
- ✅ **CORS Hardening**: Environment-configurable origins
- ✅ **Rate Limiting**: Authentication endpoints protected
- ✅ **Security Headers**: HSTS, XSS protection, CSP, etc.
- ✅ **No Debug Logging**: Production builds cleaned
- ✅ **SSL/TLS**: Modern cipher suites, TLS 1.2/1.3 only

## File Structure
```
/mnt/datadrive_m2/research_workbench/
├── setup-production.sh              # Main setup script
├── cloudflare-tunnel-config.md      # Tunnel configuration guide
├── PRODUCTION_DEPLOYMENT.md         # This file
├── workbench.nginx                  # Hardened nginx config
├── workbench-backend.service        # Backend systemd service
├── workbench-frontend.service       # Frontend systemd service
├── backend/target/release/          # Compiled backend binary
├── frontend/dist/                   # Built frontend assets
└── .env                            # Environment configuration
```

## Environment Variables Required

```bash
# Database
DATABASE_HOST=192.168.1.104
DATABASE_PORT=5432
DATABASE_NAME=workbench
DATABASE_USER=workbench
DATABASE_PASSWORD=<secure-password>

# Security
JWT_SECRET=<32+character-secure-string>

# API Keys
OPENAI_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>

# CORS
CORS_ORIGINS=http://localhost:4510,https://workbench.lolzlab.com

# Application
BIND_ADDRESS=0.0.0.0:8080
FRONTEND_PORT=451
FRONTEND_HOST=0.0.0.0
```

## Troubleshooting

### Service Won't Start
```bash
# Check service status
sudo systemctl status research-workbench-backend

# View detailed logs
sudo journalctl -u research-workbench-backend -n 50

# Check configuration
nginx -t
```

### API Not Working
```bash
# Test backend directly
curl http://localhost:8080/health

# Test nginx proxy
curl http://localhost:80/api/health

# Check nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Environment Issues
```bash
# Check environment file
cat /mnt/datadrive_m2/research_workbench/.env

# Test JWT secret length
echo $JWT_SECRET | wc -c  # Should be 33+ (32 chars + newline)
```

## Production Checklist

- [ ] All services running and enabled for startup
- [ ] nginx configuration tested and valid
- [ ] SSL certificates generated and accessible
- [ ] Environment variables properly configured
- [ ] Database connectivity verified
- [ ] Cloudflare tunnel updated to point to nginx
- [ ] Frontend loads without errors
- [ ] API endpoints respond correctly
- [ ] Authentication flow works
- [ ] Security headers present in responses
- [ ] Logs show no errors

## Support
- **Configuration Issues**: Check logs and service status
- **Security Concerns**: All hardening applied per security audit
- **Performance Issues**: Monitor with `systemctl status` and logs
- **Updates**: Restart services after code changes