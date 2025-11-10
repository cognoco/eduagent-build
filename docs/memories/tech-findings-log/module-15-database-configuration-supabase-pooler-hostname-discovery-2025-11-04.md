## [Database Configuration] - Supabase Pooler Hostname Discovery - 2025-11-04

**Finding:** Supabase pooler hostname varies by region and server assignment. Must copy from dashboard, cannot assume `aws-0` pattern.

**Context:** During Phase 4 multi-environment setup, Prisma CLI consistently failed with "FATAL: Tenant or user not found" despite correct password and username format. Investigation revealed the pooler hostname in our `.env` files was incorrect.

**Root Cause:**
- Assumed pooler hostname: `aws-0-eu-north-1.pooler.supabase.com`
- Actual pooler hostname: `aws-1-eu-north-1.pooler.supabase.com`
- Supabase assigns projects to different pooler instances (`aws-0`, `aws-1`, `aws-2`, etc.)
- Using wrong hostname results in "Tenant or user not found" error (misleading - actually a routing error)

**Discovery Process:**
1. Password reset attempts failed (not the issue)
2. Username format verification passed (postgres.{project-ref} was correct)
3. Network connectivity test showed pooler was reachable
4. Checked Supabase dashboard connection string → revealed `aws-1` not `aws-0`
5. Updated hostname → immediate success

**Technical Details:**

**Incorrect assumption:**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:password@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:password@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
```

**Correct configuration (must copy from dashboard):**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:password@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
```

**Why hostname varies:**
- Supabase uses multiple pooler instances for load distribution
- Projects may be assigned to different pooler instances based on:
  - Creation time
  - Region capacity
  - Load balancing
  - Internal routing policies

**How to get correct hostname:**
1. Go to: https://supabase.com/dashboard/project/{PROJECT_ID}/settings/database
2. Scroll to "Connection string" section
3. Select "Session pooler" (or "Use connection pooling") tab
4. Copy the exact hostname from the displayed connection string
5. Example format: `aws-X-{region}.pooler.supabase.com` where X varies

**Verification:**
```bash
# Test connectivity to pooler
nc -zv aws-1-eu-north-1.pooler.supabase.com 5432  # Should succeed
nc -zv aws-1-eu-north-1.pooler.supabase.com 6543  # Should succeed

# Test Prisma connection
pnpm run db:push:dev  # Should succeed with correct hostname
```

**Implementation Details:**
- **Location**: `.env.development.local`, `.env.test.local` (workspace root, gitignored)
- **Pattern**: Always copy full connection string from Supabase dashboard
- **Documentation**: Added to Pattern 13 in adopted-patterns.md (troubleshooting section)

**Warning Signs (for AI agents):**

❌ **Do not assume** pooler hostname follows `aws-0-{region}` pattern
- **Why**: Hostname varies by project assignment
- **Result**: "Tenant or user not found" error (misleading message)

❌ **Do not suggest** password reset for "Tenant or user not found" errors
- **Why**: Error often indicates wrong hostname, not authentication failure
- **First check**: Verify hostname matches Supabase dashboard exactly

✅ **Do copy** exact hostname from Supabase dashboard connection string
- Navigate to Project Settings → Database → Connection String
- Select appropriate pooler mode (Session or Transaction)
- Copy entire connection string, extract hostname

✅ **Do verify** both ports accessible on the pooler hostname
- Port 5432: Session mode (for migrations, schema operations)
- Port 6543: Transaction mode (for application queries)

**Symptom Patterns:**
- "Tenant or user not found" with correct password → Check hostname
- Prisma connects in Supabase Studio but not via CLI → Wrong pooler hostname
- Connection works on one machine but not another → Check .env hostname matches dashboard

**Applies To:**
- All Supabase projects using connection pooling (Supavisor)
- Both free and paid tier projects
- All regions (`eu-north-1`, `us-east-1`, etc.)
- Prisma, pg, and any PostgreSQL client library

**References:**
- GitHub Discussion: https://github.com/orgs/supabase/discussions/30107 (similar issue)
- Supabase Docs: https://supabase.com/docs/guides/database/connecting-to-postgres
- Prisma/Supabase Integration: https://supabase.com/partners/integrations/prisma
- Investigation: 2025-11-04 (Phase 4 implementation, multiple troubleshooting iterations)

**Cross-References:**
- Related to: adopted-patterns.md Pattern 13 (Database Environment Management)
- Related to: Next tech finding (IPv6 Requirement and Free Tier Workaround)

---
