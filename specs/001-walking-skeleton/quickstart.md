# Quick Start: Walking Skeleton Demo

**Feature**: Walking Skeleton - Infrastructure Validation
**Date**: 2025-10-29
**Branch**: `001-walking-skeleton`

## Purpose

This guide helps developers run the walking skeleton demo to validate that all infrastructure components work end-to-end. Follow these steps to see data flow from browser → Next.js → Express API → Prisma → Supabase PostgreSQL and back.

---

## Prerequisites

✅ **Already Complete** (from previous stages):
- Node.js 22+ installed
- pnpm installed
- Git repository cloned
- Dependencies installed (`pnpm install`)
- Supabase cloud project created
- Environment variables configured (`.env` and `.env.local`)

---

## Setup (One-Time)

### 1. Install Missing Test Libraries

```bash
# Install testing enhancement libraries (from official Next.js 15 docs)
pnpm add -D jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom ts-node @testing-library/user-event

# Verify installation
pnpm list | grep -E "@testing-library|jest"
```

**Expected Output**:
```
@testing-library/dom 10.4.0
@testing-library/jest-dom <version>
@testing-library/react 16.1.0
@testing-library/user-event <version>
jest <version>
jest-environment-jsdom <version>
```

**Note on MSW**: Mock Service Worker (MSW) is **optional** for Phase 1. The walking skeleton has simple API interactions that don't require MSW. Add it later if complex API mocking becomes necessary.

### 2. Configure Environment Variables

**CRITICAL**: Supabase + Prisma requires specific connection parameters.

**Update `.env`** (repository root):
```bash
# Pooled connection for application (transaction mode, port 6543)
DATABASE_URL="postgresql://postgres:[YOUR_PASSWORD]@[YOUR_PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30"

# Direct connection for migrations (bypass pooler, port 5432)
DIRECT_URL="postgresql://postgres:[YOUR_PASSWORD]@[YOUR_PROJECT_REF].supabase.co:5432/postgres"
```

**Parameters Explained**:
- `?pgbouncer=true` - **REQUIRED** for Supabase transaction mode
- `connection_limit=1` - Prevents connection exhaustion
- `pool_timeout=30` - Graceful timeout handling
- Port 6543 = Pooled (for app), Port 5432 = Direct (for migrations)

**Update `packages/database/prisma/schema.prisma`**:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled (port 6543)
  directUrl = env("DIRECT_URL")        // Direct (port 5432)
}
```

### 3. Apply Database Migration

```bash
# Generate and apply migration for HealthCheck table
cd packages/database
pnpm prisma migrate dev --name create_health_checks

# Verify table created in Supabase dashboard
# Navigate to: Table Editor → should see "health_checks" table
```

**Migration Verification**:
```bash
# Check migration applied
ls prisma/migrations/

# Should see directory: <timestamp>_create_health_checks/
```

### 3. Seed Test Data (Optional)

```bash
# Create a few test records directly in database
pnpm prisma studio

# Or use SQL in Supabase dashboard:
```

```sql
INSERT INTO health_checks (id, message, timestamp)
VALUES
  (gen_random_uuid(), 'Initial system check', NOW()),
  (gen_random_uuid(), 'Database connection verified', NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), 'API server operational', NOW() - INTERVAL '2 hours');
```

---

## Running the Demo

### Terminal 1: Start API Server

```bash
# From repository root
pnpm exec nx run server:serve

# Wait for message: "[ ready ] Listening on port 3001"
```

**Verify Server Running**:
```bash
curl http://localhost:3001/api/health

# Expected: [{"id":"...","message":"...","timestamp":"..."}]
```

### Terminal 2: Start Web Application

```bash
# From repository root
pnpm exec nx run web:dev

# Wait for message: "ready started server on 0.0.0.0:3000"
```

**Access Application**:
- Open browser: http://localhost:3000/health
- You should see the health check dashboard

---

## Using the Demo

### 1. View Health Checks

**What it validates**: Read operations (database → API → UI)

1. Navigate to http://localhost:3000/health
2. See list of existing health check records
3. Each record shows:
   - Message text
   - Timestamp (when created)
   - Unique ID (UUID)

**Empty State**: If no records exist, you'll see "No health checks yet. Click 'Ping' to create one."

### 2. Create Health Check Ping

**What it validates**: Write operations (UI → API → database)

1. Click the **"Ping"** button
2. New health check record created with default message
3. New record appears at top of list immediately (no page refresh)
4. Timestamp shows current time

**Verification**:
```bash
# Check database directly
cd packages/database
pnpm prisma studio

# Or query via API
curl http://localhost:3001/api/health
```

### 3. Verify Data Persistence

**What it validates**: Database storage (not in-memory)

1. Create a health check ping
2. Refresh the browser page (F5 or Ctrl+R)
3. Health check should still be visible
4. Restart server and web app
5. Health check should still be visible

---

## API Endpoints

### List Health Checks

```bash
curl http://localhost:3001/api/health
```

**Response**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "message": "System operational",
    "timestamp": "2025-10-29T12:00:00.000Z"
  }
]
```

### Create Health Check

```bash
curl -X POST http://localhost:3001/api/health/ping \
  -H "Content-Type: application/json" \
  -d '{"message": "Manual test ping"}'
```

**Response** (201 Created):
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "message": "Manual test ping",
  "timestamp": "2025-10-29T12:05:00.000Z"
}
```

**Validation Error Example**:
```bash
curl -X POST http://localhost:3001/api/health/ping \
  -H "Content-Type: application/json" \
  -d '{"message": ""}'
```

**Response** (400 Bad Request):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "errors": [
      {
        "field": "message",
        "code": "too_small",
        "message": "Message cannot be empty"
      }
    ]
  }
}
```

---

## API Documentation

### Swagger UI (Interactive)

1. Start API server
2. Navigate to: http://localhost:3001/api/docs
3. See interactive API documentation
4. Try endpoints directly from browser

### OpenAPI Specification (JSON)

```bash
curl http://localhost:3001/api/docs/openapi.json

# Or visit in browser: http://localhost:3001/api/docs/openapi.json
```

---

## Running Tests

### All Tests

```bash
# Run all tests across entire monorepo
pnpm exec nx run-many -t test

# Expected: All tests pass
```

### Specific Project Tests

```bash
# Web app tests
pnpm exec nx run web:test

# Server tests
pnpm exec nx run server:test

# Schemas package tests
pnpm exec nx run schemas:test

# Database package tests
pnpm exec nx run database:test
```

### E2E Tests

```bash
# Run Playwright E2E tests
pnpm exec nx run web-e2e:e2e

# Expected: Browser opens, tests run, closes automatically
```

### Coverage Report

```bash
# Generate coverage report for all projects
pnpm exec nx run-many -t test --coverage

# View coverage reports in:
# - coverage/apps/web/lcov-report/index.html
# - coverage/apps/server/lcov-report/index.html
```

---

## Troubleshooting

### Issue: Server won't start

**Error**: `EADDRINUSE: address already in use :::3001`

**Solution**:
```bash
# Find process using port 3001
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process or use different port
PORT=3002 pnpm exec nx run server:serve
```

### Issue: Database connection fails

**Error**: `Can't reach database server at ...`

**Solution**:
1. Verify `DATABASE_URL` in `.env` is correct
2. Check Supabase project is running (not paused)
3. Test connection: `cd packages/database && pnpm prisma db pull`

### Issue: Migration fails

**Error**: `P3009: migrate found failed migrations`

**Solution**:
```bash
# Reset database (WARNING: deletes all data)
cd packages/database
pnpm prisma migrate reset

# Or manually fix failed migration in Supabase SQL editor
```

### Issue: TypeScript errors in IDE

**Error**: Cannot find module '@nx-monorepo/schemas'

**Solution**:
```bash
# Rebuild all packages
pnpm exec nx run-many -t build

# Restart TypeScript server in IDE
# VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### Issue: Tests hang on Windows

**Solution**:
```bash
# Use NX_DAEMON=false to prevent Jest hanging
NX_DAEMON=false pnpm exec nx run-many -t test
```

**Reference**: docs/memories/troubleshooting.md - "Jest Exits Slowly or Hangs (Windows)"

---

## What This Validates

✅ **Database Layer** (packages/database):
- Prisma client connection
- Model queries (findMany, create)
- Migration system

✅ **Schema Layer** (packages/schemas):
- Zod validation
- OpenAPI metadata generation
- Type exports

✅ **Server Layer** (apps/server):
- Express routing
- REST endpoints
- Validation middleware
- Error handling
- OpenAPI spec generation

✅ **API Client Layer** (packages/api-client):
- Type-safe HTTP client (openapi-fetch)
- Generated TypeScript types
- Request/response handling

✅ **Web Layer** (apps/web):
- Next.js 15 rendering
- React 19 components
- API integration
- User interactions

✅ **E2E Layer** (apps/web-e2e):
- Playwright browser tests
- Full user journeys
- Visual validation

---

## Success Criteria

Your walking skeleton is working correctly if:

1. ✅ Server starts without errors
2. ✅ Web app loads at http://localhost:3000/health
3. ✅ Existing health checks display in list
4. ✅ "Ping" button creates new health check
5. ✅ New health check appears immediately in list
6. ✅ Page refresh preserves all health checks
7. ✅ API documentation accessible at /api/docs
8. ✅ All tests pass: `pnpm exec nx run-many -t test`
9. ✅ Coverage meets 60% minimum
10. ✅ No TypeScript errors: `pnpm exec nx run-many -t typecheck`

---

## Next Steps

After validating the walking skeleton:

1. **Review Implementation**: Understand code patterns in each layer
2. **Run Code Coverage**: Verify 60% minimum achieved
3. **Delete Walking Skeleton**: Remove health check feature (Phase 1 complete)
4. **Implement Real Features**: Use walking skeleton patterns as reference

**Walking Skeleton Lifecycle**: This feature is **temporary** and will be deleted after Phase 1 validation. It serves only as infrastructure proof.

---

## Related Documentation

- **Feature Specification**: `specs/001-walking-skeleton/spec.md`
- **Implementation Plan**: `specs/001-walking-skeleton/plan.md`
- **Data Model**: `specs/001-walking-skeleton/data-model.md`
- **API Contracts**: `specs/001-walking-skeleton/contracts/health-endpoints.md`
- **Research Findings**: `specs/001-walking-skeleton/research.md`
- **P1 Plan**: `docs/P1-plan.md` (Stage 5 details)
