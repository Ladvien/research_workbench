# Deployment Status - Research Workbench

## Current Status

### Frontend
✅ **RUNNING** - Port 4510
- Built for production successfully
- Running via `serve` static file server
- Accessible at: http://192.168.1.102:4510

### Backend
❌ **NOT RUNNING** - Database authentication issue
- Built for release successfully
- Issue: Password authentication failing for PostgreSQL
- Password contains special characters that are not being properly handled

## Known Issues

### 1. Database Password Authentication
The PostgreSQL password contains special characters that are causing authentication failures despite:
- Password working correctly with `psql` when provided via PGPASSWORD env var
- Multiple attempts to escape/encode the password in the connection string
- Trying both URL encoding and direct PgConnectOptions

**Temporary Solution Options:**
1. Change the database password to something without special characters
2. Use a secrets management system that doesn't require shell escaping
3. Hardcode the password directly in the binary (not recommended for production)

### 2. Port 451 Permission Denied
- Port 451 requires elevated permissions (< 1024)
- Frontend currently running on port 4510 instead
- Cloudflare tunnel needs to be updated to redirect to port 4510

## Next Steps

1. **Fix Database Authentication**:
   - DevOps to either change the password or provide a working connection method
   - Alternative: Use environment variable DATABASE_PASSWORD directly in PgConnectOptions

2. **Update Cloudflare Tunnel**:
   - Update tunnel configuration to forward to port 4510 instead of 451
   - Or run frontend with elevated permissions (not recommended)

3. **Complete Deployment**:
   - Once backend is running, verify API connectivity
   - Test full application flow
   - Set up systemd services for automatic startup

## Service Commands

### Start Frontend (currently running)
```bash
cd /mnt/datadrive_m2/research_workbench/frontend
serve -s dist -l tcp://0.0.0.0:4510
```

### Start Backend (when database issue resolved)
```bash
cd /mnt/datadrive_m2/research_workbench/backend
RUST_LOG=info target/release/workbench-server
```

## Environment Variables Required
- DATABASE_HOST=192.168.1.104
- DATABASE_PORT=5432
- DATABASE_NAME=workbench
- DATABASE_USER=workbench
- DATABASE_PASSWORD=(needs fixing)
- BIND_ADDRESS=0.0.0.0:8080
- FRONTEND_PORT=4510
- FRONTEND_HOST=0.0.0.0