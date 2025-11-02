# API Contracts: Walking Skeleton Health Check

**Feature**: Walking Skeleton Health Check
**Created**: 2025-10-30
**Purpose**: OpenAPI 3.1.0 contract specifications for health check endpoints

---

## Overview

These contracts define the API interface between the web application and server for the walking skeleton health check feature. They serve as:

1. **Design documentation**: What endpoints exist and how they behave
2. **Implementation guide**: Exact request/response shapes for server implementation
3. **Type generation source**: Input for `openapi-typescript` to generate API client types
4. **Testing reference**: Expected behavior for integration and E2E tests

**Throwaway Code**: All contracts defined here are marked for deletion once infrastructure validation is complete.

Policy note: This repository is code‑first (Zod → OpenAPI). YAML contracts here are reference‑only; the authoritative spec is generated from Zod and written to `dist/apps/server/openapi.json`.

---

## Contracts

### 1. GET /health - List Health Checks
**File**: `health-get.yaml`

**Purpose**: Retrieve all health check records from the database.

**Request**: No parameters or body required.

**Response (200)**:
```json
{
  "healthChecks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "message": "Health check ping",
      "timestamp": "2025-10-30T14:23:45.678Z"
    }
  ]
}
```

**Validates**:
- ✅ Supabase → Prisma connection works
- ✅ Database query results are correctly typed
- ✅ End-to-end type safety from database to UI

---

### 2. POST /health/ping - Create Health Check
**File**: `health-ping.yaml`

**Purpose**: Create a new health check record with optional custom message.

**Request**:
```json
{
  "message": "Custom ping message"  // Optional
}
```

**Response (201)**:
```json
{
  "healthCheck": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "message": "Custom ping message",
    "timestamp": "2025-10-30T14:30:00.123Z"
  }
}
```

**Validates**:
- ✅ Zod schema validation works correctly
- ✅ Prisma write operations persist to Supabase
- ✅ End-to-end type safety for write operations
- ✅ UUID and timestamp generation work correctly

---

## REST+OpenAPI Toolchain

These contracts integrate into the monorepo's REST+OpenAPI architecture:

### 1. Server-Side (Runtime Generation)
**Tool**: `@asteasolutions/zod-to-openapi` (v8.1.0)

**Process**:
1. Define Zod schemas in `packages/schemas/src/health.schema.ts`
2. Register schemas with OpenAPI generator in `apps/server/src/routes/health.routes.ts`
3. Generate complete OpenAPI spec at runtime (not build time)
4. Write spec to `dist/apps/server/openapi.json` for type generation

**Why Runtime**: Allows dynamic registration of routes, hot-reloading during development, and per-feature spec composition.

### 2. Client-Side (Build-Time Type Generation)
**Tool**: `openapi-typescript` (v7.10.0)

**Process**:
1. Server writes `openapi.json` during build (`nx run server:spec-write`)
2. Type generator reads spec and creates `packages/api-client/src/gen/openapi.d.ts`
3. API client uses generated types with `openapi-fetch` (v0.13.7)
4. Web UI imports type-safe client methods

**Build Dependency Chain**:
```
server:build → server:spec-write → api-client:generate-types → web:build
```

Orchestrated by Nx target dependencies in `project.json` files.

### 3. Type Safety Validation
**Goal**: Prove types flow correctly through all layers without manual casting.

**Type Chain**:
```
Prisma schema → Prisma Client types → Zod schemas → OpenAPI spec → openapi-typescript → API client types → React components
```

**Walking Skeleton Proves**:
- No type assertions (`as`) needed anywhere in the chain
- TypeScript autocomplete works in VS Code for API client methods
- Compile-time errors catch API contract mismatches

---

## Contract Design Principles

### 1. Standard REST Patterns
- GET for retrieval (idempotent, no side effects)
- POST for creation (returns 201 + created resource)
- Use plural resource names (`/health` not `/health-check`)
  - Servers/paths rule: Top-level `servers: [{ url: '/api' }]` with relative `paths` (e.g., `/health`, `/health/ping`). Do not embed `/api` in path keys.

### 2. Consistent Error Responses
All endpoints return standardized error objects:
- `error`: Error type/category
- `message`: Human-readable description
- `statusCode`: HTTP status code
- `details`: Optional field-level validation errors (Zod)

### 3. Minimal Phase 1 Implementation
- No authentication/authorization (deferred to Phase 2)
- No pagination (throwaway validation code)
- No filtering or sorting (not needed for infrastructure testing)
- Basic error handling only

### 4. OpenAPI 3.1.0 Features
- JSON Schema for request/response validation
- Multiple response examples showing different scenarios
- Detailed descriptions explaining validation goals
- Reusable component schemas for consistency

---

## Implementation Mapping

Each contract maps to specific implementation files:

### GET /health
- **Server Route**: `apps/server/src/routes/health.routes.ts` (Express router)
- **Database Query**: `packages/database/src/health.ts` (`getHealthChecks()`)
- **API Client**: `packages/api-client/src/index.ts` (generated method from `openapi-fetch`)
- **Web UI**: `apps/web/src/app/health/page.tsx` (React Server Component)
- **Tests**: `apps/server/src/routes/health.routes.spec.ts` (integration tests)

### POST /health/ping
- **Server Route**: `apps/server/src/routes/health.routes.ts` (Express router with Zod validation)
- **Zod Schema**: `packages/schemas/src/health.schema.ts` (`healthPingSchema`)
- **Database Mutation**: `packages/database/src/health.ts` (`createHealthCheck()`)
- **API Client**: `packages/api-client/src/index.ts` (generated method from `openapi-fetch`)
- **Web UI**: `apps/web/src/app/health/page.tsx` (button click handler)
- **Tests**: `apps/server/src/routes/health.routes.spec.ts` (integration tests with request body validation)

---

## Testing Strategy

### Unit Tests (Schemas Package)
```typescript
// packages/schemas/src/health.schema.spec.ts
test('healthPingSchema validates optional message', () => {
  expect(healthPingSchema.parse({})).toEqual({ message: undefined });
  expect(healthPingSchema.parse({ message: 'test' })).toEqual({ message: 'test' });
});
```

### Integration Tests (Server)
```typescript
// apps/server/src/routes/health.routes.spec.ts
test('POST /api/health/ping creates health check', async () => {
  const response = await request(app)
    .post('/api/health/ping')
    .send({ message: 'Test ping' })
    .expect(201);

  expect(response.body.healthCheck).toMatchObject({
    id: expect.stringMatching(UUID_REGEX),
    message: 'Test ping',
    timestamp: expect.any(String)
  });
});
```

### E2E Tests (Web - Optional Phase 1)
```typescript
// apps/web-e2e/src/health.spec.ts
test('user can create health check', async ({ page }) => {
  await page.goto('http://localhost:3000/health');
  await page.click('button:has-text("Ping")');
  await expect(page.locator('text=Health check ping')).toBeVisible();
});
```

---

## Future Cleanup

**Deletion Checklist** (execute after infrastructure validation complete):
- [ ] Delete `specs/001-walking-skeleton/contracts/` directory entirely
- [ ] Remove health check routes from `apps/server/src/routes/health.routes.ts`
- [ ] Remove health check schemas from `packages/schemas/src/health.schema.ts`
- [ ] Delete health check database functions from `packages/database/src/health.ts`
- [ ] Remove `/health` page from `apps/web/src/app/health/`

**Verification**: After cleanup, regenerate OpenAPI spec (`nx run server:spec-write`) and verify no health check endpoints remain.

---

## References

- **OpenAPI 3.1.0 Specification**: https://spec.openapis.org/oas/v3.1.0
- **@asteasolutions/zod-to-openapi**: https://github.com/asteasolutions/zod-to-openapi
- **openapi-typescript**: https://github.com/drwpow/openapi-typescript
- **openapi-fetch**: https://github.com/drwpow/openapi-typescript/tree/main/packages/openapi-fetch
- **REST API Design Best Practices**: See `docs/architecture-decisions.md` (Stage 4.1)
