## Pattern 8: Prisma Schema Conventions

**Our Standard**: Use PostgreSQL-specific types, snake_case plural table names, and disable RLS for API-secured applications

### Pattern

**Prisma Schema Configuration:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  // Supavisor connection pooler strategy:
  // - url: Transaction mode (port 6543) for queries
  // - directUrl: Session mode (port 5432) for migrations
}

generator client {
  provider = "prisma-client-js"
  // binaryTargets defaults to ["native"] for auto-detection
}

model HealthCheck {
  id        String   @id @default(uuid()) @db.Uuid
  message   String
  timestamp DateTime @default(now()) @db.Timestamptz

  @@map("health_checks")  // snake_case plural table names
}
```

**Key Conventions:**
- **Database types**: Use PostgreSQL-specific types (`@db.Uuid`, `@db.Timestamptz`)
- **Table naming**: snake_case plural (`health_checks`, not `HealthCheck` or `healthChecks`)
- **Connection**: Supavisor connection pooler (ports 6543 + 5432), `directUrl` required (updated 2025)
- **Binary targets**: Omit `binaryTargets` field to use implicit "native" (auto-detection)
- **RLS (Row Level Security)**: Enable for defense-in-depth on the API path (PostgREST). Prisma bypasses RLS via its SQL database role (superuser in Phase 1). The service_role key applies to PostgREST requests, not Prisma SQL connections.

### Applies To

All Prisma packages in the monorepo (currently `packages/database/`)

### Rationale

**PostgreSQL-specific types**:
- `@db.Uuid`: Ensures proper UUID validation at database level
- `@db.Timestamptz`: Timezone-aware timestamps, DST-safe

**snake_case plural table naming**:
- PostgreSQL convention (matches common practices)
- Explicit with `@@map()` prevents ambiguity
- Consistent with Supabase dashboard expectations

**Supavisor connection pooler strategy** (updated 2025):
- `url`: Transaction mode (port 6543) with connection pooling for better scalability
- `directUrl`: Session mode (port 5432) required for migrations
- Recommended by Supabase + Prisma official documentation (2025)
- See research: `specs/001-walking-skeleton/research-validation.md` - Agent 1 findings

**Implicit binaryTargets**:
- Prisma auto-detects platform ("native")
- Reduces bundle size
- Avoids version mismatch errors

**RLS enabled (scope clarified, updated 2025):**
- Defense-in-depth on API path: PostgREST calls with service_role bypass RLS
- Prisma path: bypass via SQL role (superuser in Phase 1), not via service_role
- Protects against accidental Data API exposure on the API path
- See research: `specs/001-walking-skeleton/research-validation.md`

### When Adding New Models

**Required actions:**
1. Use PostgreSQL-specific types (`@db.Uuid`, `@db.Timestamptz`, etc.)
2. Add `@@map("table_name")` with snake_case plural
3. Follow migration checklist (see post-generation-checklist.md)

**Validation:**
```bash
# Validate schema
npx prisma validate --schema=packages/database/prisma/schema.prisma

# Check generated migration
cat packages/database/prisma/migrations/*/migration.sql
```

### Last Validated

2025-10-27 (Prisma 6.17.1, Supabase PostgreSQL 15)

**References**:
- docs/architecture-decisions.md (Stage 4.2, Decision 4 - RLS strategy)
- docs_archive/research/stage-4.4a-research-findings.md (Track 1-3 research)
- packages/database/PLATFORM-NOTES.md (Windows ARM64 limitation)

---
