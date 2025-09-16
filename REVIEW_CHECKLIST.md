# Code Review Checklist

## Security Review
- [ ] No hardcoded credentials or secrets
- [ ] Proper authentication and authorization checks
- [ ] Input validation and sanitization
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention in frontend
- [ ] CSRF protection enabled
- [ ] Rate limiting implemented
- [ ] Secure session management
- [ ] Password strength requirements enforced
- [ ] JWT secrets from environment variables only
- [ ] Cookie security flags (HttpOnly, Secure, SameSite)
- [ ] CORS configured correctly
- [ ] No sensitive data in logs
- [ ] OWASP Top 10 compliance

## Architecture & Design
- [ ] Follows project architecture patterns (handlers/services/repositories)
- [ ] Proper separation of concerns
- [ ] No Docker/containerization code
- [ ] Correct port usage (4510/4511/4512)
- [ ] Database connection pool properly configured (max 100)
- [ ] Error handling follows Result<T, E> pattern
- [ ] Streaming responses where applicable
- [ ] API versioning implemented (/api/v1/)
- [ ] Consistent error response format
- [ ] RESTful design principles followed

## Performance
- [ ] No N+1 query problems
- [ ] Database indexes for frequent queries
- [ ] Connection pooling configured correctly
- [ ] No excessive cloning in hot paths
- [ ] Async operations properly implemented
- [ ] Streaming responses for large datasets
- [ ] Caching implemented where beneficial
- [ ] Batch processing for bulk operations
- [ ] Rate limiting to prevent abuse
- [ ] Memory allocation optimized

## Testing
- [ ] Tests written before implementation (TDD)
- [ ] Unit tests for all functions
- [ ] Integration tests for API endpoints
- [ ] Error cases covered
- [ ] Edge cases handled
- [ ] Tests pass with cargo test
- [ ] Frontend tests pass with pnpm test
- [ ] E2E tests pass with pnpm test:e2e
- [ ] Performance benchmarks included
- [ ] Security tests for auth flows

## Code Quality
- [ ] No TODO/FIXME comments
- [ ] No commented-out code
- [ ] Code follows project naming conventions
- [ ] Proper documentation for public APIs
- [ ] No compiler warnings (cargo clippy)
- [ ] No linter errors (eslint)
- [ ] Consistent formatting (cargo fmt, pnpm format)
- [ ] Dependencies up to date
- [ ] No unused dependencies
- [ ] Error messages user-friendly

## Database
- [ ] Migrations follow naming convention
- [ ] Indexes on foreign keys and frequent queries
- [ ] Proper constraints and validations
- [ ] Transaction boundaries correct
- [ ] Connection pool usage optimal
- [ ] No hardcoded SQL in application code
- [ ] Prepared statements used
- [ ] pgvector/PostGIS used appropriately
- [ ] Backup and recovery considered
- [ ] Data privacy requirements met

## Frontend Specific
- [ ] Components follow single responsibility
- [ ] TypeScript interfaces for all props
- [ ] Custom hooks properly abstracted
- [ ] Zustand state management minimal
- [ ] Error boundaries implemented
- [ ] Loading states handled
- [ ] Accessibility requirements met
- [ ] Responsive design implemented
- [ ] No direct backend port references
- [ ] API calls through /api/* proxy

## Backend Specific
- [ ] Bind to 0.0.0.0:4512
- [ ] Handlers validate input
- [ ] Services contain business logic
- [ ] Repositories handle data access
- [ ] anyhow for general errors
- [ ] thiserror for custom error types
- [ ] Validator crate for input validation
- [ ] SSE for streaming responses
- [ ] Proper middleware chain
- [ ] Health endpoint functional

## Deployment & Operations
- [ ] Environment variables documented
- [ ] .env.example updated
- [ ] No secrets in repository
- [ ] Systemd services configured
- [ ] Nginx configuration correct
- [ ] Logging properly configured
- [ ] Monitoring endpoints available
- [ ] Graceful shutdown handled
- [ ] Resource limits defined
- [ ] Production build optimized

## Documentation
- [ ] README updated with changes
- [ ] API documentation current
- [ ] Architecture diagrams updated
- [ ] Deployment instructions clear
- [ ] Environment setup documented
- [ ] Troubleshooting guide updated
- [ ] CHANGELOG updated
- [ ] Breaking changes documented
- [ ] Migration guide if needed
- [ ] Code comments where necessary