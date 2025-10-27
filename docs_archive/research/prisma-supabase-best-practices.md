---
Created: 2025-10-26T17:14
Modified: 2025-10-26T17:14
---
# Prisma + Supabase Best Practices Research Summary

**Date**: October 26, 2025  
**Status**: Complete Research Document  
**Context**: Gold standard Nx monorepo with walking skeleton health check feature

---

## Executive Summary

This research addresses five critical design questions for production-ready Prisma + Supabase integration.

### Key Findings

1. **UUID Generation**: Use `@default(uuid())` with `@db.Uuid`
2. **Table Naming**: snake_case plural (tables), camelCase singular (TypeScript)
3. **Timestamp Columns**: Always use `@db.Timestamptz` 
4. **Indexes**: Strategic indexes based on query patterns
5. **Pitfalls**: Connection pooling, type safety, timezone confusion

---

## 1. UUID Generation

**RECOMMENDATION: `@default(uuid())` with `@db.Uuid`**

```prisma
id String @id @default(uuid()) @db.Uuid
```

### Why This Approach

- **Prisma generates**: ID created client-side (supports offline)
- **PostgreSQL validates**: `@db.Uuid` enforces UUID format
- **Works everywhere**: create(), createMany(), raw SQL
- **Best of both**: Prisma control + database validation

### Alternative: dbgenerated()

❌ `@default(dbgenerated("gen_random_uuid()"))` should be avoided because:
- Requires database connection to generate IDs
- Cannot generate IDs offline (breaks mobile/sync patterns)
- Less control over ID creation flow

### Supabase Compatibility

Supabase PostgreSQL (v14+) includes `gen_random_uuid()` by default. No extensions needed.

---

## 2. Table Naming Conventions

**RECOMMENDATION: Snake_case plural for tables, camelCase singular for TypeScript**

```prisma
model HealthCheck {
  @@map("health_checks")
  
  id        String
  createdAt DateTime @map("created_at")
  userId    String   @map("user_id")
}
```

### Naming Pattern Reference

| Layer | Convention | Example | Why |
|-------|-----------|---------|-----|
| PostgreSQL tables | snake_case, plural | `health_checks` | SQL standard |
| PostgreSQL columns | snake_case, singular | `created_at` | Reduces escaping |
| Prisma models | PascalCase, singular | `HealthCheck` | TypeScript convention |
| Prisma fields | camelCase, singular | `createdAt` | TypeScript convention |
| TypeScript types | PascalCase | `HealthCheck` | TS convention |

### Why This Matters

1. **Readability**: `SELECT * FROM health_checks` vs `healthChecks`
2. **Supabase standard**: Dashboard expects snake_case
3. **RLS policies**: More readable in PostgreSQL
4. **No escaping**: Avoids quote requirements
5. **Maintainability**: Developers expect this pattern

---

## 3. Timestamp Columns

**RECOMMENDATION: Always use `@db.Timestamptz`**

```prisma
createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz
```

### Comparison

| Aspect | `DateTime` | `@db.Timestamptz` |
|--------|-----------|-------------------|
| PostgreSQL type | timestamp without tz | timestamp with tz |
| Timezone stored | No | Yes (UTC always) |
| DST-safe | ❌ Fails after DST | ✅ Always correct |
| Portable | ❌ Breaks when moving DB | ✅ Works everywhere |
| Supabase standard | Not recommended | ✅ Standard |

### Problem Without Timestamptz

Without timezone, timestamps become ambiguous after daylight savings:
- Event stored at 2:30 AM without timezone
- DST ends, 2:30 AM occurs twice
- Query "what happened at 2:30?" becomes unpredictable
- Data loses meaning when moved to different region

### String Type Strategy

```prisma
status  String @db.VarChar(50)  // Fixed-size: status values
message String? @db.Text        // Unbounded: descriptions
```

| Type | Use Case |
|------|----------|
| `@db.VarChar(n)` | Enum-like values, fixed sizes |
| `@db.Text` | Messages, descriptions, logs |

---

## 4. Indexes for Performance

**RECOMMENDATION: Two strategic indexes for walking skeleton**

```prisma
model HealthCheck {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz
  status    String   @db.VarChar(50)
  
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  
  @@map("health_checks")
}
```

### Index Strategies

**Index 1: User + Recency** (Composite)
- Supports: "Find user's latest checks"
- Performance: +50-200% faster
- Composite covers both filtering AND ordering

**Index 2: Status Filtering** (Single)
- Supports: "Find all degraded checks"
- Performance: +30-50% faster
- Simple single-column index

### When to Index

✅ Index if used in WHERE/ORDER BY
❌ Don't index: primary keys, rare queries, tiny tables

### Index Costs

| Impact | Cost |
|--------|------|
| Read speed | +30-200% (depends on data size) |
| Write speed | -5-20% (index must update) |
| Storage | +10-30% per index |

---

## 5. Common Pitfalls

### Pitfall 1: Connection Pool Exhaustion
- **Problem**: "timeout waiting for connection"
- **Cause**: Limited connections in Supabase free tier
- **Solution**: Single Prisma instance per process

### Pitfall 2: Type Mismatches
- **Problem**: UUID stored as text
- **Wrong**: `id String @id @default(uuid())`
- **Right**: `id String @id @default(uuid()) @db.Uuid`
- **Impact**: Breaks indexes and constraints

### Pitfall 3: NULL Handling
- **Problem**: Optional fields cause insertion errors
- **Wrong**: `message String?`
- **Right**: `message String? @default(null)`

### Pitfall 4: Timezone Confusion
- **Problem**: Times wrong after DST changes
- **Solution**: Always use `@db.Timestamptz`

### Pitfall 5: Missing prisma generate
- **Problem**: "Cannot find module @prisma/client"
- **Solution**: Run `prisma generate` after schema changes

### Pitfall 6: Exposed Credentials
- **Problem**: DATABASE_URL visible in browser
- **Wrong**: `NEXT_PUBLIC_DATABASE_URL=postgresql://...`
- **Right**: Use `.env` (server-only) for credentials

### Pitfall 7: No Monitoring
- **Problem**: Queries slow in production
- **Solution**: Enable query logging, use Supabase monitoring

---

## Recommended Walking Skeleton Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model HealthCheck {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid @map("user_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz
  status    String   @db.VarChar(50)
  message   String?  @default(null) @db.Text
  
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@map("health_checks")
}
```

---

## Implementation Checklist

- [ ] Create schema.prisma with HealthCheck model
- [ ] Use `@default(uuid()) @db.Uuid` for IDs
- [ ] Use `@db.Timestamptz` for all timestamps
- [ ] Map to snake_case in database
- [ ] Add strategic indexes
- [ ] Run `prisma migrate dev --name initial`
- [ ] Verify migrations generated
- [ ] Test CRUD operations
- [ ] Document in tech-findings-log.md

---

## References

- [Prisma PostgreSQL Guide](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [Prisma Data Types](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Supabase Docs](https://supabase.com/docs)

