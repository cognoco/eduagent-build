# Research: Walking Skeleton Infrastructure Validation

**Feature**: Walking Skeleton - Infrastructure Validation
**Date**: 2025-10-29
**Branch**: `001-walking-skeleton`

## Purpose

This document captures research findings that inform implementation decisions for the walking skeleton feature. All uncertainties identified during planning have been resolved by examining the existing codebase.

---

## Research Questions & Findings

### 1. OpenAPI Generation Location & Pattern

**Question**: Where and how should OpenAPI specifications be generated in this monorepo?

**Decision**: ✅ **VALIDATED** - Runtime generation in `apps/server/src/openapi/` with per-feature registration pattern

**External Validation**:
- ✅ Runtime generation is **official @asteasolutions/zod-to-openapi v8.1.0 standard** (Context7 verified)
- ✅ Per-feature registration matches official examples (no changes needed)
- ✅ OpenAPI 3.1.0 with `OpenApiGeneratorV31` is current standard (confirmed via web search)
- ✅ Pattern is exemplary - no adjustments required

**Rationale**:
- Existing infrastructure already implements this pattern (apps/server/src/openapi/registry.ts)
- Per-feature registration functions keep OpenAPI definitions co-located with routes
- Runtime generation allows serving live documentation at `/api/docs/openapi.json`
- Aligns with architecture decision (Task 4.1.4) to use zod-to-openapi for code-first workflow

**Implementation Pattern**:
```typescript
// Step 1: Create feature OpenAPI registration (routes/health.openapi.ts)
export function registerHealthOpenApi() {
  registry.registerPath({
    method: 'post',
    path: '/health/ping',
    tags: ['Health'],
    request: { body: { content: { 'application/json': { schema: PingRequestSchema } } } },
    responses: { 201: { ... } }
  });
}

// Step 2: Register in openapi/register.ts
import { registerHealthOpenApi } from '../routes/health.openapi';
registerHealthOpenApi();

// Step 3: Spec served automatically at runtime via app.ts
```

**Alternatives Considered**:
- ❌ Build-time generation in packages/schemas - Would require separate build step and file watching
- ❌ Manual OpenAPI YAML files - Violates code-first principle and creates drift risk

**Source**: apps/server/src/openapi/registry.ts, apps/server/src/routes/health.openapi.ts, docs/architecture-decisions.md Task 4.1.4

---

### 2. Express Routing Structure

**Question**: What routing organization pattern should be used for new endpoints?

**Decision**: ✅ **VALIDATED** - Modular per-resource pattern with feature-based file organization

**External Validation**:
- ✅ Per-resource routing is **industry standard** for Express.js applications (web search verified)
- ✅ Feature-based organization matches official Express.js best practices (Context7 verified)
- ✅ Pattern scales well for medium-to-large APIs (Exa production examples)
- ✅ No changes needed - existing pattern is optimal

**Rationale**:
- Existing codebase already uses this pattern (routes/health.ts, routes/hello.ts)
- Scales better than monolithic routes file (each feature in separate file)
- Aligns with domain-driven design (routes grouped by feature, not HTTP method)
- Clear separation of concerns (routes → controllers → business logic)

**File Organization**:
```
apps/server/src/
├── routes/
│   ├── index.ts                 # Central router aggregator (mounts all features)
│   ├── health.ts                # Health check routes (NEW endpoints here)
│   └── health.openapi.ts        # Health check OpenAPI registration
├── controllers/
│   └── health.controller.ts     # Health check request handlers (NEW methods here)
└── middleware/
    └── validate.middleware.ts   # Zod validation middleware (reuse existing)
```

**Mounting Pattern**:
```typescript
// routes/index.ts (aggregator)
apiRouter.use('/health', healthRouter);  // Mounts at /api/health

// routes/health.ts (feature routes - path-agnostic)
healthRouter.get('/', healthController.check);         // GET /api/health
healthRouter.post('/ping', healthController.ping);     // POST /api/health/ping (NEW)
```

**Alternatives Considered**:
- ❌ Monolithic routes/index.ts - Doesn't scale, hard to navigate as features grow
- ❌ HTTP method grouping (routes/get.ts, routes/post.ts) - Splits related endpoints

**Source**: apps/server/src/routes/index.ts, apps/server/src/routes/health.ts

---

### 3. REST API Error Handling Standards

**Question**: What is the standardized error response format for this API?

**Decision**: ❌ **REVISED AFTER RESEARCH** - Use Stripe-style error format (remove `success` field)

**Critical Finding**: External research (MCP servers + web search) revealed that the existing `{success: boolean}` pattern is an **anti-pattern in 2025 industry standards**.

**Problems with Original Pattern**:
1. `success` field duplicates HTTP status code information
2. Forces clients to check two things instead of one (status code AND success field)
3. Major APIs (Stripe, GitHub, Twilio, Google) **do not use this pattern**
4. Violates REST principles (HTTP status codes are the success indicator)

**Corrected Error Response Format** (Stripe-style):
```typescript
// Error (HTTP 400 Bad Request)
{
  "error": {
    "code": "VALIDATION_ERROR",          // Machine-readable error code
    "message": "Request validation failed",  // Human-readable summary
    "errors": [                          // Field-level validation errors
      {
        "field": "message",
        "code": "invalid_format",
        "message": "Message cannot be empty"
      }
    ]
  }
}

// Success (HTTP 200 OK) - NO WRAPPER
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "System operational",
  "timestamp": "2025-10-29T12:00:00.000Z"
}
// Note: Success responses return data directly, not wrapped in {success: true, data: ...}
```

**HTTP Status Codes**:
- `200 OK` - Successful GET requests
- `201 Created` - Successful POST requests that create resources
- `400 Bad Request` - Validation failures (Zod schema violations)
- `404 Not Found` - Resource not found (Prisma P2025 error)
- `409 Conflict` - Unique constraint violation (Prisma P2002 error)
- `500 Internal Server Error` - Unexpected server errors

**Error Code Mapping**:
```typescript
// Map Prisma errors to HTTP status codes
import { Prisma } from '@prisma/client';

try {
  // Prisma operation
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return res.status(409).json({ error: { ... } });  // Conflict
    if (e.code === 'P2025') return res.status(404).json({ error: { ... } });  // Not found
  }
  return res.status(500).json({ error: { message: 'Internal server error' } });
}
```

**Industry Standards Reference**:
- **RFC 9457** (supersedes RFC 7807) - Official IETF standard for HTTP problem details
- **Stripe API** - Industry-leading API design (no success field, direct data returns)
- **GitHub API** - Consistent error structure with machine-readable codes
- **Modern consensus** - HTTP status codes are the canonical success indicator

**Migration Required**:
1. Remove `success` field from all response schemas
2. Wrap errors in `error` object (not `{success, error, details}`)
3. Return data directly for success responses (no wrapper)
4. Add machine-readable error codes (e.g., `VALIDATION_ERROR`)
5. Update Zod schemas to reflect corrected structure
6. Add Prisma error handling middleware

**Research Source**: Parallel agent research using Context7 MCP (official docs), Exa MCP (production examples), and web search (industry standards)

**Alternatives Considered**:
- ❌ Keep existing pattern - Ships anti-pattern to production
- ❌ RFC 9457 strict compliance - More complex than needed for Phase 1
- ✅ Stripe-style format - Battle-tested, simple, industry standard

**Source**: research-validation.md (Agent 2 findings), external research via MCP servers

---

### 4. Testing Enhancement Libraries

**Question**: Which testing libraries are installed and need to be added?

**Decision**: ✅ **VALIDATED** - Install missing libraries with modern usage patterns

**Current Status** (verified from package.json):
- ✅ `@testing-library/react`: "16.1.0" (installed)
- ✅ `@testing-library/dom`: "10.4.0" (installed)
- ❌ `@testing-library/jest-dom` (missing - REQUIRED for Next.js 15)
- ❌ `@testing-library/user-event` (missing - REQUIRED for Next.js 15)
- ⚠️ `msw` (missing - OPTIONAL, can add later)

**Action Required** (from official Next.js 15 docs):
```bash
# Install core testing dependencies (official Next.js 15 recommendations)
pnpm add -D jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom ts-node

# Install user interaction library
pnpm add -D @testing-library/user-event

# MSW: Optional - start without it, add later if API mocking becomes complex
# pnpm add -D msw
```

**Why These Libraries**:
- **jest-dom**: DOM-specific matchers (`toBeInTheDocument`, `toHaveTextContent`) - Next.js 15 standard
- **user-event**: Realistic user interactions - **MUST use modern `userEvent.setup()` API**
- **msw**: Optional - Complex HTTP mocking (recommend skipping initially)

**Modern userEvent Pattern** (IMPORTANT):
```typescript
// ✅ Modern API (use this)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('button click', async () => {
  const user = userEvent.setup();  // ← Setup per test
  render(<MyButton />);
  await user.click(screen.getByRole('button'));  // ← Async
});

// ❌ Legacy API (do NOT use)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('button click', () => {
  render(<MyButton />);
  userEvent.click(screen.getByRole('button'));  // ← Synchronous, deprecated
});
```

**MSW Decision**:
- **Recommendation**: Start without MSW, add later if needed
- **Rationale**: Walking skeleton has simple API interactions; MSW adds complexity without immediate value
- **Future**: Add MSW when testing complex multi-endpoint workflows

**Post-Installation Configuration**:
1. Create `apps/web/jest.setup.ts`: `import '@testing-library/jest-dom';`
2. Update `apps/web/jest.config.ts`: Add `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`

**External Validation**:
- ✅ Next.js 15 official docs recommend these exact libraries (Context7 verified)
- ✅ Modern `userEvent.setup()` pattern is current standard (web search verified)
- ⚠️ MSW optional for simple REST APIs (production examples via Exa)

**Rationale**:
- Adopted Pattern 10 mandates these libraries for consistency across UI projects
- Modern patterns prevent using deprecated APIs
- Industry-standard testing practices (used by React team and major projects)

**Alternatives Considered**:
- ❌ Skip testing enhancement libraries - Would violate Pattern 10 and create inconsistency
- ❌ Use legacy userEvent API - Deprecated, may break in future versions
- ✅ Skip MSW initially - Reduces complexity, can add later if needed

**Research Source**: Context7 MCP (Next.js 15 official docs), web search (modern userEvent patterns), Exa MCP (production examples)

**Source**: docs/memories/post-generation-checklist.md:28-43, docs/memories/adopted-patterns.md Pattern 10, research-validation.md (Agent 5 findings)

---

### 5. Prisma + Supabase Integration Pattern

**Question**: How should database queries be structured for the walking skeleton?

**Decision**: ⚠️ **VALIDATED WITH CRITICAL ADDITIONS** - Direct Prisma queries with required Supabase configuration

**Validated Patterns** (correct as-is):
- ✅ Direct Prisma queries in controllers (no repository abstraction) - Appropriate for simple REST APIs
- ✅ RLS disabled with API server as security boundary - Correct architecture
- ✅ Prisma client in separate package - Good separation

**CRITICAL Missing Configuration** (must add):

#### 1. Connection String Parameters ⚠️ **REQUIRED**

**Current `.env` (INCORRECT)**:
```bash
DATABASE_URL="postgresql://postgres:[password]@...supabase.com:6543/postgres"
```

**Corrected `.env` (REQUIRED)**:
```bash
DATABASE_URL="postgresql://postgres:[password]@...supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30"
#                                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
# Required parameters for Supabase transaction mode
```

**Why critical**:
- `?pgbouncer=true` - **REQUIRED** for Supabase transaction mode (disables prepared statements)
- `connection_limit=1` - Prevents connection exhaustion in serverless environments
- `pool_timeout=30` - Graceful connection timeout handling
- **Without these**: Connection errors, poor performance, potential transaction failures

#### 2. Direct URL for Migrations ⚠️ **REQUIRED**

**Update `packages/database/prisma/schema.prisma`**:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled connection (port 6543) for app
  directUrl = env("DIRECT_URL")        // Direct connection (port 5432) for migrations
}
```

**Add to `.env`**:
```bash
# Pooled connection for application (transaction mode, port 6543)
DATABASE_URL="postgresql://postgres:[password]@...supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30"

# Direct connection for migrations (bypass pooler, port 5432)
DIRECT_URL="postgresql://postgres:[password]@...supabase.com:5432/postgres"
```

**Why critical**:
- Migrations require direct database connection (not pooled)
- Port 6543 = Transaction mode (pooled, for app queries)
- Port 5432 = Direct mode (bypasses pooler, for migrations)
- **Without this**: Migration failures, schema drift

#### 3. Prisma Error Handling ⚠️ **REQUIRED FOR PRODUCTION**

**Add error handling middleware**:
```typescript
// controllers/health.controller.ts
import { Prisma } from '@prisma/client';

export const healthController = {
  async listChecks(req, res) {
    try {
      const checks = await prisma.healthCheck.findMany({
        orderBy: { timestamp: 'desc' }
      });
      res.json(checks);  // Direct data return (no wrapper)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Map Prisma errors to HTTP status codes
        if (e.code === 'P2002') {
          return res.status(409).json({
            error: {
              code: 'CONFLICT',
              message: 'Resource already exists'
            }
          });
        }
        if (e.code === 'P2025') {
          return res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: 'Resource not found'
            }
          });
        }
      }
      console.error('Database error:', e);
      return res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }
};
```

**Common Prisma Error Codes**:
- `P2002` - Unique constraint violation → 409 Conflict
- `P2025` - Record not found → 404 Not Found
- `P2003` - Foreign key constraint → 400 Bad Request
- Other errors → 500 Internal Server Error

**Implementation Pattern** (with corrected response format):
```typescript
// controllers/health.controller.ts
import { prisma } from '@nx-monorepo/database';
import { Prisma } from '@prisma/client';

export const healthController = {
  async listChecks(req, res) {
    try {
      const checks = await prisma.healthCheck.findMany({
        orderBy: { timestamp: 'desc' }
      });
      res.json(checks);  // Direct return, no {success: true, data: ...} wrapper
    } catch (e) {
      // See error handling above
    }
  },

  async ping(req, res) {
    try {
      const check = await prisma.healthCheck.create({
        data: { message: req.body.message }
      });
      res.status(201).json(check);  // Direct return
    } catch (e) {
      // See error handling above
    }
  }
};
```

**Database Package Usage**:
- Import Prisma client singleton from `@nx-monorepo/database`
- No custom query functions needed in database package for Phase 1
- Let Prisma generated client handle all query logic

**External Validation**:
- ✅ Supabase official docs require pgbouncer=true parameter (Context7 verified)
- ✅ directUrl pattern is Prisma + Supabase best practice (web search verified)
- ✅ Prisma error handling is production requirement (Exa production examples)

**Rationale**:
- Constitution principle: Simplicity First - avoid premature abstraction (validated ✅)
- Direct queries sufficient for walking skeleton (validated ✅)
- **But**: Production stability requires proper configuration and error handling

**Alternatives Considered**:
- ❌ Repository pattern - Premature abstraction, violates constitution simplicity principle
- ❌ Query functions in database package - Unnecessary layer for walking skeleton
- ❌ Skip connection parameters - Would cause production failures
- ❌ Skip error handling - Would result in generic 500 errors for all database issues

**Research Source**: Context7 MCP (Supabase + Prisma docs), web search (connection pooling best practices), Exa MCP (production examples), research-validation.md (Agent 4 findings)

**Source**: .specify/memory/constitution.md (Simplicity First), docs/architecture-decisions.md Stage 4.2, research-validation.md (Critical Prisma Configuration)

---

### 6. Zod Schema Organization

**Question**: Where should health check Zod schemas be defined?

**Decision**: Co-locate all schemas in `packages/schemas/src/lib/health.schema.ts`

**Rationale**:
- Existing pattern already established (health.schema.ts, hello.schema.ts)
- Single source of truth for validation across client and server
- Enables code-first OpenAPI generation via zod-to-openapi
- Package reuse: Both server (validation) and api-client (types) consume schemas

**Schema Structure**:
```typescript
// packages/schemas/src/lib/health.schema.ts

// 1. Prisma model shape (matches database)
export const HealthCheckSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
  timestamp: z.date()
});

// 2. API request schemas
export const CreateHealthCheckRequestSchema = z.object({
  message: z.string().min(1).max(500)
});

// 3. API response schemas
export const HealthCheckResponseSchema = z.object({
  success: z.literal(true),
  data: HealthCheckSchema
});

export const HealthCheckListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(HealthCheckSchema)
});

// 4. Export types for TypeScript
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type CreateHealthCheckRequest = z.infer<typeof CreateHealthCheckRequestSchema>;
```

**OpenAPI Integration**:
- Use `.openapi()` method to add OpenAPI metadata
- Example: `z.string().min(1).openapi({ description: 'Health check message', example: 'System OK' })`

**Source**: packages/schemas/src/lib/health.schema.ts, docs/architecture-decisions.md Task 4.1.4

---

### 7. Test-Driven Development Workflow

**Question**: How should TDD be applied for the walking skeleton?

**Decision**: Strict RED-GREEN-REFACTOR cycle per constitution requirement

**TDD Workflow** (from constitution.md):
1. **RED**: Write failing test first
2. **GREEN**: Write minimal code to pass test
3. **REFACTOR**: Clean up while keeping tests green

**Test Coverage Requirements**:
- Minimum: 60% for Phase 1 (walking skeleton)
- Target: 80% for Phase 2+ (real features)

**Testing Layers** (all required):
```
1. Unit Tests (packages/schemas, packages/database)
   - Zod schema validation
   - Individual functions in isolation

2. Integration Tests (apps/server)
   - Endpoint tests using supertest
   - Full request/response cycle
   - Database interaction

3. Component Tests (apps/web)
   - React components with @testing-library/react
   - User interactions with @testing-library/user-event
   - MSW for API mocking

4. E2E Tests (apps/web-e2e)
   - Playwright browser tests
   - Full user journeys
   - Real API + database
```

**Test File Location**:
- Co-located with source files in `src/` directory
- Pattern: `file.ts` → `file.spec.ts`

**Rationale**:
- Constitution mandates TDD for all code
- Tests serve as living documentation
- Prevents regressions during future changes

**Source**: .specify/memory/constitution.md (Test-Driven Development), docs/memories/testing-reference.md

---

## Best Practices Summary

Based on research (existing codebase + external validation via MCP servers), the following best practices apply:

### ✅ Validated Patterns (No Changes Needed)

1. **OpenAPI Generation**: Runtime generation with per-feature registration in `apps/server/src/openapi/` - Official @asteasolutions/zod-to-openapi v8.1.0 standard
2. **Routing**: Modular per-resource files with central aggregator - Express.js industry best practice
3. **Schema Organization**: Single source in `packages/schemas` with Zod - Code-first workflow standard
4. **TDD**: Strict RED-GREEN-REFACTOR with 60% coverage minimum - Constitutional requirement

### ❌ Patterns Requiring Changes (Critical)

5. **Error Handling**: ~~`{success, error, details}` format~~ → **Stripe-style format** (remove `success` field, return data directly)
6. **Database Configuration**: Add `?pgbouncer=true&connection_limit=1` to DATABASE_URL + `directUrl` to schema.prisma
7. **Prisma Error Handling**: Add error handling middleware with P2002/P2025/P2003 code mapping

### ⚠️ Patterns Requiring Adjustments (Recommended)

8. **Testing Libraries**: Install jest-dom + user-event (use modern `userEvent.setup()` API), MSW optional
9. **Database Access**: Direct Prisma queries (no repository abstraction for Phase 1) - Validated, but add error handling

### Research Validation Summary

- **5 parallel research agents** dispatched using Context7 MCP (official docs), Exa MCP (production examples), and web search (industry standards)
- **3 critical issues discovered** that existing codebase examination alone would have missed:
  1. REST error format anti-pattern (success field)
  2. Missing Supabase connection parameters (pgbouncer, directUrl)
  3. Missing Prisma error handling (P2002, P2025 mapping)
- **4 patterns validated** as correct with no changes needed (OpenAPI, routing, schemas, TDD)
- **2 patterns enhanced** with modern best practices (testing libraries, error handling)

All validated patterns align with 2025 industry standards and constitutional principles.

---

## Next Steps

With research complete, proceed to:
1. **Phase 1 Design**: Generate data-model.md (entity definitions)
2. **Phase 1 Contracts**: Generate API endpoint contracts
3. **Phase 1 Quickstart**: Generate developer getting-started guide
4. **Implementation**: Execute tasks following TDD workflow
