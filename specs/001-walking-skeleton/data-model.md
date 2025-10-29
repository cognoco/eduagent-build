# Data Model: Walking Skeleton

**Feature**: Walking Skeleton - Infrastructure Validation
**Date**: 2025-10-29
**Branch**: `001-walking-skeleton`

## Overview

This document defines the data model for the walking skeleton feature. The model is intentionally minimal to validate infrastructure without unnecessary complexity.

---

## Entities

### HealthCheck

**Purpose**: Represents a single health check ping event that validates end-to-end data flow from UI → API → Database

**Attributes**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | Primary Key, Auto-generated | Unique identifier for the health check record |
| `message` | String | Required, 1-500 characters | Human-readable health check message |
| `timestamp` | DateTime | Required, Auto-generated, Default: NOW() | When the health check was created |

**Relationships**: None (standalone entity)

**Indexes**:
- Primary key on `id` (automatic)
- Consider index on `timestamp DESC` for list queries (optional for Phase 1)

**Business Rules**:
1. `message` cannot be empty (enforced by Zod schema)
2. `message` max length 500 characters (prevents abuse)
3. `timestamp` is automatically set to current time on creation (no manual override)
4. `id` is automatically generated as UUID v4 (no manual specification)

---

## Prisma Schema

**File**: `packages/database/prisma/schema.prisma`

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled connection (port 6543)
  directUrl = env("DIRECT_URL")        // Direct connection (port 5432) for migrations
}

model HealthCheck {
  id        String   @id @default(uuid()) @db.Uuid
  message   String   @db.VarChar(500)
  timestamp DateTime @default(now()) @db.Timestamptz

  @@map("health_checks")
}
```

**Schema Notes**:
- `@db.Uuid`: PostgreSQL-specific UUID type
- `@db.VarChar(500)`: Explicit length constraint at database level
- `@db.Timestamptz`: PostgreSQL timestamp with timezone (recommended for all timestamps)
- `@@map("health_checks")`: Uses snake_case table name (PostgreSQL convention)

**CRITICAL: Supabase Configuration** ⚠️
- **`url`**: Pooled connection via Supabase transaction mode (port 6543) for application queries
- **`directUrl`**: Direct connection (port 5432) for migrations - bypasses pgBouncer
- **Required**: Both URLs must be configured in `.env` for Prisma + Supabase to work correctly

**Environment Variables Required**:
```bash
# Pooled connection for application (transaction mode, port 6543)
DATABASE_URL="postgresql://postgres:[password]@[project-ref].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30"

# Direct connection for migrations (bypass pooler, port 5432)
DIRECT_URL="postgresql://postgres:[password]@[project-ref].supabase.co:5432/postgres"
```

**Connection Parameters Explained**:
- `?pgbouncer=true` - **REQUIRED** for Supabase transaction mode (disables prepared statements)
- `connection_limit=1` - Prevents connection exhaustion in serverless environments
- `pool_timeout=30` - Graceful connection timeout handling

**Without these parameters**: Connection errors, poor performance, migration failures

---

## Zod Validation Schemas

**File**: `packages/schemas/src/lib/health.schema.ts`

### Base Entity Schema

```typescript
export const HealthCheckSchema = z.object({
  id: z.string().uuid().openapi({
    description: 'Unique identifier for the health check',
    example: '550e8400-e29b-41d4-a716-446655440000'
  }),
  message: z.string().min(1).max(500).openapi({
    description: 'Health check message',
    example: 'System operational'
  }),
  timestamp: z.date().openapi({
    description: 'When the health check was created',
    example: '2025-10-29T12:00:00Z'
  })
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
```

### Request Schemas

```typescript
export const CreateHealthCheckRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(500, 'Message too long').openapi({
    description: 'Health check message to record',
    example: 'Manual health check triggered'
  })
});

export type CreateHealthCheckRequest = z.infer<typeof CreateHealthCheckRequestSchema>;
```

### Response Schemas

```typescript
// Success responses return data directly (no wrapper)
export const HealthCheckResponseSchema = HealthCheckSchema.openapi('HealthCheckResponse', {
  description: 'Successful health check creation response'
});

export const HealthCheckListResponseSchema = z.array(HealthCheckSchema).openapi('HealthCheckListResponse', {
  description: 'List of health check records'
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;  // HealthCheck
export type HealthCheckListResponse = z.infer<typeof HealthCheckListResponseSchema>;  // HealthCheck[]
```

### Error Schemas

```typescript
// Error responses follow Stripe-style format
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().openapi({
      description: 'Machine-readable error code',
      example: 'VALIDATION_ERROR'
    }),
    message: z.string().openapi({
      description: 'Human-readable error summary',
      example: 'Request validation failed'
    }),
    errors: z.array(z.object({
      field: z.string(),
      code: z.string(),
      message: z.string()
    })).optional().openapi({
      description: 'Field-level validation errors'
    })
  })
}).openapi('ApiError', {
  description: 'Error response format'
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
```

---

## Database Migration

**Migration Name**: `create_health_checks_table`

**Generated File**: `packages/database/prisma/migrations/<timestamp>_create_health_checks_table/migration.sql`

```sql
-- CreateTable
CREATE TABLE "health_checks" (
    "id" UUID NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- Disable Row Level Security (API server is security boundary)
-- Architecture: docs/architecture-decisions.md - Stage 4.2, Decision 4
ALTER TABLE "health_checks" DISABLE ROW LEVEL SECURITY;
```

**Post-Generation Steps** (per post-generation-checklist.md):
1. Edit migration file to add `ALTER TABLE "health_checks" DISABLE ROW LEVEL SECURITY;`
2. Run `pnpm --filter @nx-monorepo/database prisma migrate dev` to apply
3. Verify RLS is disabled in Supabase dashboard

---

## Data Access Patterns

### Read Operations

**Query**: Get all health checks ordered by newest first

```typescript
const checks = await prisma.healthCheck.findMany({
  orderBy: { timestamp: 'desc' }
});
```

**Performance**: Acceptable for Phase 1 (expected ~50-100 records max)
**Future**: Add pagination if dataset grows beyond 1000 records

### Write Operations

**Query**: Create new health check

```typescript
const check = await prisma.healthCheck.create({
  data: {
    message: validatedInput.message
    // id and timestamp auto-generated
  }
});
```

**Transaction**: Not required (single insert operation)

---

## Data Validation Strategy

**Three-Layer Validation**:

1. **Client-Side** (apps/web):
   - Zod schema validation before API call
   - Provides immediate feedback to user
   - Prevents unnecessary network requests

2. **API Layer** (apps/server):
   - Zod schema validation via `validateBody` middleware
   - Returns 400 Bad Request with detailed error messages
   - Prevents invalid data from reaching database

3. **Database Layer** (PostgreSQL):
   - NOT NULL constraints
   - CHECK constraints (future)
   - Type constraints (UUID, VARCHAR(500), TIMESTAMPTZ)

**Why Three Layers**:
- Defense in depth (multiple validation points)
- Clear error messages at each layer
- Prevents invalid data regardless of entry point

---

## Edge Cases & Constraints

### Empty State
- When no health checks exist: `GET /api/health` returns `{ success: true, data: [] }`
- UI handles empty array gracefully with "No health checks yet" message

### Data Volume
- **Phase 1**: No pagination (display all records)
- **Rationale**: Walking skeleton validates pipeline, not scale
- **Future**: Add pagination when dataset exceeds 1000 records

### Concurrent Writes
- PostgreSQL handles concurrent INSERTs without conflicts
- Each health check has unique UUID (no collision risk)
- No explicit locking required

### Invalid Input
- Empty message: Rejected by Zod (400 error)
- Message too long (>500 chars): Rejected by Zod (400 error)
- Invalid message type (number, null): Rejected by Zod (400 error)

### Timestamp Handling
- Always use `DateTime` (Zod) / `Timestamptz` (PostgreSQL) for timezone awareness
- Server generates timestamp (client cannot override)
- Prevents timezone-related bugs

---

## TypeScript Type Exports

**Package**: `@nx-monorepo/schemas`

**Exported Types**:
```typescript
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type CreateHealthCheckRequest = z.infer<typeof CreateHealthCheckRequestSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;  // HealthCheck (direct)
export type HealthCheckListResponse = z.infer<typeof HealthCheckListResponseSchema>;  // HealthCheck[] (direct)
export type ApiError = z.infer<typeof ApiErrorSchema>;
```

**Usage**:
```typescript
// Server
import { CreateHealthCheckRequest, HealthCheck, ApiError } from '@nx-monorepo/schemas';

// API Client
import { HealthCheck, HealthCheckListResponse } from '@nx-monorepo/schemas';

// Example: Direct data access (no wrapper)
const checks: HealthCheck[] = await listHealthChecks();  // Returns array directly
const check: HealthCheck = await createHealthCheckPing('test');  // Returns object directly
```

---

## Related Documentation

- **Prisma Schema**: `packages/database/prisma/schema.prisma`
- **Zod Schemas**: `packages/schemas/src/lib/health.schema.ts`
- **Migration Guide**: `docs/memories/post-generation-checklist.md` (After Prisma Migration section)
- **Architecture Decision**: `docs/architecture-decisions.md` Stage 4.2 (RLS disabled)
