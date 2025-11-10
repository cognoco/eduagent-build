## After: `prisma migrate dev --create-only` (Prisma Migration Generation)

### Issue
Prisma generates migration SQL files but does not include Row Level Security (RLS) configuration. For API-secured applications, RLS must be manually disabled after table creation.

### Required Actions

**1. Edit the generated migration SQL file**

Location: `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`

After each CREATE TABLE statement, add:
```sql
-- Enable Row Level Security (defense-in-depth on API path)
-- Architecture: docs/architecture-decisions.md - Stage 4.2, Decision 4
ALTER TABLE "table_name" ENABLE ROW LEVEL SECURITY;
```

Example:
```sql
-- CreateTable
CREATE TABLE "health_checks" (
    "id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- Enable Row Level Security (defense-in-depth on API path)
-- Architecture: docs/architecture-decisions.md - Stage 4.2, Decision 4
ALTER TABLE "health_checks" ENABLE ROW LEVEL SECURITY;
```

**2. Format the migration with Prisma**

```bash
pnpm --filter @nx-monorepo/database prisma format
```

**3. Apply the migration**

```bash
pnpm --filter @nx-monorepo/database prisma migrate dev
```

**4. Verify RLS is enabled**

Query the database to confirm:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'your_table_name';
```

Expected: `rowsecurity = t` (true)

### Validation

Verify in Supabase dashboard:
1. Navigate to Table Editor
2. Select your table
3. Check that RLS is disabled

### Why This Matters

Our architecture uses the API server as the primary security boundary, but we enable RLS as a database-level safety net on the API path (defense-in-depth). Prisma connects via a SQL role that bypasses RLS; the service_role key applies to the PostgREST API path. Enabling RLS protects against accidental Data API exposure while keeping server-side Prisma access unaffected.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 8: Prisma Schema Conventions

---
