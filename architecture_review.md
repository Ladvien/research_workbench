
### Commit: 2542ff72 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227380 feat: Comprehensive test coverage improvements for handlers, services, and components

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: f834359d - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227183 docs: SECURITY MISSION ACCOMPLISHED - Critical vulnerabilities resolved

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 0c1d358b - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758226992 SECURITY: Fix critical vulnerabilities in auth system

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 7892de08 - Thomas - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** 1757870652 Initial commit

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 6ec4c0e6 - MVDream - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** 1758125089 feat: Major e2e test infrastructure improvements

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 131e0e91 - MVDream - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** 1758133893 feat: Add comprehensive test coverage infrastructure and component tests

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 32ee9dd5 - MVDream - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** 1758133940 feat: Comprehensive React Testing Library integration test suite

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: fd84d090 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758208507 fix: Critical security vulnerabilities in JWT authentication

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: e4d3f735 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758212160 feat: Security enhancements and repository organization

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 537097cb - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758225718 feat: Add test file to demonstrate TEST-ORCHESTRATOR functionality

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 0c1d358b - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758226992 SECURITY: Fix critical vulnerabilities in auth system

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: f834359d - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227183 docs: SECURITY MISSION ACCOMPLISHED - Critical vulnerabilities resolved

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 2542ff72 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227380 feat: Comprehensive test coverage improvements for handlers, services, and components

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 2542ff72 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227380 feat: Comprehensive test coverage improvements for handlers, services, and components

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: f834359d - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758227183 docs: SECURITY MISSION ACCOMPLISHED - Critical vulnerabilities resolved

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 0c1d358b - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758226992 SECURITY: Fix critical vulnerabilities in auth system

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: 537097cb - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758225718 feat: Add test file to demonstrate TEST-ORCHESTRATOR functionality

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: e4d3f735 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758212160 feat: Security enhancements and repository organization

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)


### Commit: fd84d090 - C. - 1969-12-31 18:00:00
**Reviewer:** ARCH-VALIDATOR
**Zone:** structure/config/patterns
**Risk Level:** High
**Subject:** Brittain 1758208507 fix: Critical security vulnerabilities in JWT authentication

#### Architecture Violations:
1. HIGH: Forbidden port 8080 found in configuration:
2. ./frontend/src/hooks/useAuthStore.ts:const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
3. ./frontend/src/services/fileService.ts:const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
4. HIGH: TODO/FIXME comments found (forbidden in CLAUDE.md):
5. ./backend/src/middleware/session_auth.rs:    // 3. TODO: Implement JWT blacklisting for immediate invalidation
6. ./backend/src/llm/anthropic.rs:        // TODO: Implement actual Anthropic streaming when supported
7. ./backend/src/models.rs:    // TODO: Uncomment after database migration adds lockout fields
8. MEDIUM: Commented-out code blocks found:
9. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)
10. ./frontend/tests/contexts/AuthContext_test.tsx:      // Mock initial checkAuth (unauthenticated)

