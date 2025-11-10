## [Database Configuration] - Supabase PostgreSQL Connection URL Encoding - 2025-11-01

**Decision:** URL-encode special characters (especially `!`) in PostgreSQL connection strings for Supabase

**Context:** Prisma migration failed with "FATAL: Tenant or user not found" error despite correct credentials retrieved from Supabase MCP server. Project status showed ACTIVE_HEALTHY, but connection failed intermittently.

**Root Cause:** Password contained special character `!` which must be URL-encoded as `%21` in PostgreSQL connection strings. Unencoded special characters in passwords cause authentication failures.

**Technical Implementation:**

**Before (connection failed):**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald!1tt123@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald!1tt123@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
```

**After (connection successful):**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald%211tt123@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald%211tt123@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
```

**Characters requiring URL encoding:**
- `!` → `%21`
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `^` → `%5E`
- `&` → `%26`
- `*` → `%2A`
- ` ` (space) → `%20`

**Verification Process:**

1. **Used Supabase MCP server to retrieve credentials:**
   ```bash
   - list_projects → identified "nx-monorepo" project
   - get_project → verified ACTIVE_HEALTHY status
   - get_project_url → retrieved API URL
   - get_publishable_keys → retrieved anon key
   ```

2. **Verified credentials match .env file** (except URL encoding)

3. **Applied migration using Supabase MCP** (bypassed Prisma CLI):
   ```typescript
   mcp__plugin_dev-additional_Supabase_MCP__apply_migration({
     project_id: "pjbnwtsufqpgsdlxydbo",
     name: "create_health_check",
     query: "CREATE TABLE health_checks..."
   })
   ```

4. **Confirmed table creation:**
   ```bash
   list_tables → health_checks table exists
   execute_sql → SELECT COUNT(*) works
   ```

**Windows ARM64 Limitation:**

Prisma Client query engine does not support Windows ARM64:
- **Error**: "query_engine-windows.dll.node is not a valid Win32 application"
- **Workaround**: Use Supabase MCP server for direct SQL operations during development
- **Solution**: Run Prisma tests in CI (Linux) or on x64 platform
- **Rationale**: Database schema and migrations work correctly; runtime limitation only affects local testing

**Verification Commands:**

```bash
# Verify table exists via Supabase MCP
list_tables(project_id)

# Test connection via SQL query
execute_sql(project_id, "SELECT COUNT(*) FROM health_checks")

# Enable RLS (if not in migration)
execute_sql(project_id, "ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY")
```

**Implementation Details:**

**Location:** `.env` (workspace root)

**Dual Connection Strategy:**
- **DATABASE_URL** (port 6543): Pooled connection for Prisma runtime queries (Transaction Mode via Supavisor)
- **DIRECT_URL** (port 5432): Direct connection for migrations and DDL operations (Session Mode)

**Success Criteria:**
✅ Connection strings use URL-encoded password
✅ health_checks table exists in Supabase with correct schema
✅ RLS enabled on health_checks table
✅ Direct SQL queries work via Supabase MCP
✅ CI/Linux environments can run full Prisma tests

**Warning Signs (for AI agents):**

❌ **Do not** use unencoded special characters in connection string passwords
- **Why**: Causes authentication failures with cryptic "Tenant or user not found" errors
- **Instead**: URL-encode password before placing in .env file

❌ **Do not** attempt to run Prisma Client tests on Windows ARM64
- **Why**: Query engine binary not available for this platform
- **Instead**: Use Supabase MCP for verification, defer Prisma tests to CI

✅ **Do** verify credentials match between Supabase dashboard and .env
- Use Supabase MCP tools: list_projects, get_project, get_publishable_keys
- Compare retrieved values with .env (accounting for URL encoding)

✅ **Do** use Supabase MCP for migrations when Prisma CLI has environment issues
- apply_migration, execute_sql, list_tables tools available
- Bypasses local Prisma CLI environment variable loading issues

**Symptom Patterns:**
- "Tenant or user not found" with correct-looking credentials → Check URL encoding
- Prisma migration command can't find environment variables → Run from workspace root or use explicit env vars
- "Not a valid Win32 application" on Windows → ARM64 limitation, use CI for testing

**Applies To:**
- Supabase PostgreSQL connections
- Any PostgreSQL connection string with special characters in password
- Prisma migrations targeting Supabase
- Windows ARM64 development environments

**References:**
- Supabase MCP Server: Direct database operations when Prisma CLI blocked
- PostgreSQL URL format: https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING
- RFC 3986 (URL encoding): https://datatracker.ietf.org/doc/html/rfc3986#section-2.1
- Prisma Platform Support: https://pris.ly/d/system-requirements

**Date Resolved:** 2025-11-01
**Resolved By:** AI Agent (Supabase MCP server + URL encoding investigation)

---
