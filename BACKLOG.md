# BACKLOG

## Critical Priority - Authentication




## High Priority - UX Improvements

### ✅ [UX-001] Frontend - Add Logout Functionality - COMPLETED
**Priority:** High
**Points:** 2
**Status:** ✅ Completed by FRONTEND_SPECIALIST-2 on 2025-09-15
**AC:**
- ✅ Add logout button in navigation/header
- ✅ Clear auth tokens on logout
- ✅ Reset application state on logout
- ✅ Redirect to login page after logout
- ✅ Call backend logout endpoint if session-based
- ✅ Add confirmation dialog for logout action
- ✅ Comprehensive test coverage (30+ tests)
**Dependencies:** AUTH-001, AUTH-002, AUTH-004
**Files:** frontend/src/components/Navigation.tsx, frontend/src/hooks/useAuthStore.ts, frontend/src/App.tsx

### ✅ [UX-002] Frontend - Handle Error Alerts Properly - COMPLETED
**Priority:** High
**Points:** 3
**Status:** ✅ Completed by FRONTEND_SPECIALIST on 2025-09-15
**AC:**
- ✅ Remove premature "Failed to create conversation" alert
- ✅ Only show errors after actual API failures
- ✅ Implement proper error boundaries
- ✅ Add user-friendly error messages
- ✅ Include retry mechanisms where appropriate
**Dependencies:** None
**Files:** frontend/src/components/BranchingChat.tsx, frontend/src/components/ErrorBoundary.tsx, frontend/src/components/ErrorAlert.tsx, frontend/src/utils/errorHandling.ts


## Medium Priority - Production Readiness


### [PROD-002] DevOps - Configure Production Build ✅ COMPLETED
**Priority:** Medium
**Points:** 2
**AC:**
- ✅ Replace pnpm preview with proper production server
- ✅ Configure nginx to serve static files
- ✅ Set up proper environment variables for production
- ✅ Optimize build for production (minification, tree-shaking)
- ✅ Configure CORS and security headers
**Dependencies:** None
**Files:** frontend/package.json, nginx-workbench.conf
**Completed by:** INFRASTRUCTURE_ENGINEER on 2025-09-15

## Completed Stories

### [PROD-003] DevOps - Create Systemd Services ✅ COMPLETED
**Priority:** Medium
**Points:** 3
**Completed:** 2025-09-15 by INFRASTRUCTURE_ENGINEER
**AC:**
- ✅ Create workbench-frontend.service for frontend
- ✅ Create workbench-backend.service for backend
- ✅ Configure auto-restart on failure
- ✅ Set up proper logging
- ✅ Add health checks
- ✅ Enable services for startup on boot
**Dependencies:** PROD-002
**Files:** workbench-frontend.service, workbench-backend.service, install-services.sh, build.sh, deploy.sh, docs/deployment/systemd-setup.md