# Quickstart: Walking Skeleton Health Check

**Feature**: Walking Skeleton Health Check
**Created**: 2025-10-30
**Purpose**: Step-by-step guide to run the walking skeleton end-to-end

---

## Overview

This guide walks you through setting up and running the walking skeleton health check feature from a fresh clone. The goal is to prove that all infrastructure components work together correctly before POC development begins.

**Time to Complete**: ~15 minutes (first time), ~5 minutes (after initial setup)

**What You'll Validate**:
- ✅ Nx monorepo builds successfully
- ✅ Supabase database connects via Prisma
- ✅ Express server serves REST+OpenAPI endpoints
- ✅ Next.js web app renders with React 19
- ✅ End-to-end type safety from database to UI
- ✅ Full CRUD cycle (create + read) works correctly

---

## Prerequisites

### Required Software

| Tool | Minimum Version | Check Command |
|------|----------------|---------------|
| **Node.js** | 20.19.9+ | `node --version` |
| **pnpm** | 10.19.0 | `pnpm --version` |
| **Git** | Any recent version | `git --version` |

**Install Missing Tools**:
- Node.js: https://nodejs.org/ (download LTS version)
- pnpm: `npm install -g pnpm`
- Git: https://git-scm.com/downloads

### Required Accounts

**Supabase Account** (free tier sufficient):
- Sign up: https://supabase.com/
- Create new project (takes ~2 minutes to provision)
- Note: You'll need database connection strings in step 3

---

## Step 1: Clone Repository & Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd nx-monorepo

# Checkout walking skeleton branch
git checkout P1-S5-SK2

# Install all dependencies (workspace + all projects)
pnpm install

# Verify installation succeeded
pnpm exec nx run-many -t lint
```

**Expected Output**: All lint checks pass (green checkmarks).

**Troubleshooting**:
- If `pnpm install` fails with peer dependency warnings: This is normal, dependencies are compatible
- If lint fails: Check Node.js version matches requirement (20.19.9+)

**Time**: ~3-5 minutes (depending on internet speed)

---

## Step 2: Configure Environment Variables

### 2.1 Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

### 2.2 Get Supabase Credentials

1. Open your Supabase project dashboard: https://app.supabase.com/
2. Navigate to **Settings** → **Database**
3. Scroll to **Connection Strings** section
4. Copy the following connection strings:

**Transaction Mode (port 6543)**:
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Session Mode (port 5432)**:
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

5. (Optional) Copy your **service_role** key from **Settings** → **API** → **service_role key** if you will use the Supabase SDK server-side (not needed for Prisma)

### 2.3 Update .env File

Open `.env` and update these values:

```bash
# Database connection (transaction mode - used by Prisma Client for queries)
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Direct connection (session mode - used by Prisma Migrate)
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Supabase API (for future features - not used by walking skeleton)
SUPABASE_URL="https://[PROJECT_REF].supabase.co"
SUPABASE_ANON_KEY="[your-anon-key]"
# Only needed if using the Supabase SDK server-side (API path)
SUPABASE_SERVICE_ROLE_KEY="[your-service-role-key]"

# Server configuration
PORT=3001
API_BASE_URL="http://localhost:3001"

# Web configuration
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

**Important**:
- Replace `[PROJECT_REF]`, `[PASSWORD]`, `[REGION]` with your actual Supabase values
- `service_role` bypass applies to the API path (PostgREST) only; Prisma uses DATABASE_URL/DIRECT_URL and a SQL database role
- Don't commit `.env` to git (already in `.gitignore`)

**Time**: ~2 minutes

---

## Step 3: Set Up Database

### 3.1 Generate Prisma Client

```bash
pnpm --filter @nx-monorepo/database run db:generate
```

**Expected Output**: `✔ Generated Prisma Client`

### 3.2 Run Migrations

Apply the health_checks table migration to Supabase:

```bash
pnpm --filter @nx-monorepo/database run db:deploy
```

**Expected Output**:
```
Applying migration `YYYYMMDDHHMMSS_create_health_checks`
✔ Database migrations completed
```

### 3.3 Verify Migration (Optional)

Check Supabase dashboard:
1. Open **Table Editor** in Supabase dashboard
2. Verify `health_checks` table exists with columns: `id`, `message`, `timestamp`
3. Verify RLS is enabled (shield icon next to table name)

**Troubleshooting**:
- If migration fails with "connection refused": Verify `DIRECT_URL` in `.env` uses port **5432** (session mode)
- If migration fails with "permission denied": Verify you're using the correct password and database name

**Time**: ~1 minute

---

## Step 4: Build All Projects

Build the entire monorepo to verify everything compiles:

```bash
pnpm exec nx run-many -t build
```

**Expected Output**: All projects build successfully (web, server, all packages).

**What This Validates**:
- ✅ TypeScript compiles without errors
- ✅ Prisma Client generates types correctly
- ✅ OpenAPI spec generates from server
- ✅ API client types generate from OpenAPI spec
- ✅ Nx dependency graph is correct

**Troubleshooting**:
- If `database` build fails: Re-run `pnpm exec nx run database:prisma-generate`
- If `api-client` build fails: Verify server OpenAPI spec was generated (`apps/server/openapi.json` should exist)

**Time**: ~2-3 minutes (first build), ~30 seconds (cached rebuilds)

---

## Step 5: Start Development Servers

### 5.1 Start API Server

In one terminal window:

```bash
pnpm exec nx run server:serve
```

**Expected Output**:
```
Server running on http://localhost:3001
OpenAPI spec available at http://localhost:3001/api/docs
```

**Verify Server**:
```bash
curl http://localhost:3001/api/health
```

Should return: `{"healthChecks":[]}`

### 5.2 Start Web Application

In a **second terminal window**:

```bash
pnpm exec nx run web:dev
```

**Expected Output**:
```
▲ Next.js 15.2.4
- Local:        http://localhost:3000
- Ready in 2.5s
```

**Keep Both Terminals Open**: The walking skeleton requires both servers running simultaneously.

**Time**: ~1 minute

---

## Step 6: Validate Walking Skeleton

### 6.1 Navigate to Health Check Page

Open your browser and go to:
```
http://localhost:3000/health
```

**Expected**: Page loads with "Health Check" heading and a "Ping" button.

### 6.2 Create Health Check Record

1. Click the **"Ping"** button
2. Wait 1 second (API request completes)
3. New health check record appears in the list with:
   - UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
   - Message: "Health check ping"
   - Timestamp: Current time in ISO format

### 6.3 Verify Persistence

**Test 1 - Browser Refresh**:
1. Refresh the page (F5 or Cmd+R)
2. Health check record still appears (proves Supabase persistence)

**Test 2 - Multiple Records**:
1. Click "Ping" button 3-4 more times
2. Each click creates a new distinct record
3. Records display in timestamp descending order (newest first)

**Test 3 - Supabase Dashboard Verification**:
1. Open Supabase dashboard → **Table Editor**
2. Click `health_checks` table
3. Verify all records visible in database with correct UUIDs, messages, and timestamps

### 6.4 Test Error Handling (Optional)

**Stop Server Test**:
1. Stop the API server (Ctrl+C in server terminal)
2. Refresh web page
3. Should see error message: "Unable to connect to server"
4. Restart server: `pnpm exec nx run server:serve`
5. Refresh page - data loads correctly again

**Time**: ~3 minutes

---

## Step 7: Run Tests

### 7.1 Run All Tests

```bash
pnpm exec nx run-many -t test
```

**Expected Output**: All tests pass (packages: database, schemas, api-client, server).

**Coverage Verification**:
```bash
pnpm exec nx run database:test -- --coverage
pnpm exec nx run schemas:test -- --coverage
pnpm exec nx run api-client:test -- --coverage
```

Each package should report **≥60% coverage** (Phase 1 requirement).

### 7.2 Run E2E Tests (Optional - Phase 1)

```bash
pnpm exec nx run web-e2e:e2e
```

**Expected**: Playwright tests pass (health check page loads, button works).

**Time**: ~2-3 minutes

---

## Step 8: Verify Type Safety

### 8.1 Test TypeScript Autocomplete

1. Open `apps/web/src/app/health/page.tsx` in VS Code
2. Configure the client with baseUrl including the API prefix:
   ```ts
   const apiClient = createClient<paths>({ baseUrl: 'http://localhost:3001/api' });
   ```
3. Find the API client call: `apiClient.GET('/health')`
3. Type `apiClient.` and verify autocomplete shows:
   - `GET` method
   - `POST` method
   - Both with full type information
4. Hover over `GET('/api/health')` and verify return type shows:
  ```typescript
  Promise<{ healthChecks: HealthCheck[] }>
  ```

### 8.2 Test Type Errors

Try introducing a type error:

```typescript
// Change message to a number (should fail)
const result = await apiClient.POST('/health/ping', {
  body: { message: 123 }  // Type error: message must be string
});
```

**Expected**: Red squiggle in VS Code with error message.

**Revert the change** after verifying.

**Time**: ~2 minutes

---

## Success Criteria Checklist

After completing all steps, verify these outcomes:

- [ ] Repository clones and installs without errors
- [ ] Database migrations apply successfully to Supabase
- [ ] All projects build successfully (`pnpm exec nx run-many -t build`)
- [ ] Server starts and responds at `http://localhost:3001`
- [ ] Web app starts and renders at `http://localhost:3000`
- [ ] `/health` page displays empty list initially
- [ ] Clicking "Ping" creates new records that appear immediately
- [ ] Records persist in Supabase database (verifiable in dashboard)
- [ ] All tests pass with ≥60% coverage
- [ ] TypeScript autocomplete works for API client methods
- [ ] No type errors in any project (`pnpm exec nx run-many -t typecheck`)

**If all items checked**: ✅ Infrastructure validation complete!

---

## Common Issues & Solutions

### Issue: "Cannot connect to database"

**Symptoms**: Migrations fail or server crashes with database connection error.

**Solutions**:
1. Verify `DATABASE_URL` in `.env` matches Supabase connection string exactly
2. Check Supabase project is running (not paused due to inactivity)
3. Verify port numbers: 6543 for `DATABASE_URL`, 5432 for `DIRECT_URL`
4. Test connection: `psql $DATABASE_URL` (requires PostgreSQL client installed)

### Issue: "Module not found: @nx-monorepo/api-client"

**Symptoms**: Web app fails to build with import error.

**Solutions**:
1. Verify `api-client` package built: `pnpm exec nx run api-client:build`
2. Check OpenAPI types generated: `packages/api-client/src/gen/openapi.ts` should exist
3. Rebuild dependency chain: `pnpm exec nx run server:spec-write && pnpm exec nx run api-client:generate-types`

### Issue: Jest hangs on Windows

**Symptoms**: Tests print "did not exit one second after test run" or show "Terminate batch job (Y/N)?".

**Solution**: Use `NX_DAEMON=false` prefix:
```bash
NX_DAEMON=false pnpm exec nx run-many -t test
```

See `CLAUDE.md` → "Jest Exits Slowly or Hangs (Windows)" for full troubleshooting.

### Issue: "Port 3000 already in use"

**Symptoms**: Web app fails to start.

**Solutions**:
1. Check if another process is using port 3000: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
2. Stop conflicting process or change port: `PORT=3002 pnpm exec nx run web:dev`

### Issue: Pre-commit hook fails

**Symptoms**: `git commit` blocked with lint or test errors.

**Solutions**:
1. Run manually to see full output: `pnpm exec nx affected -t lint test --base=HEAD~1`
2. Fix linting: `pnpm exec nx run-many -t lint --fix`
3. Fix tests: Address specific test failures shown in output
4. Bypass hook (NOT RECOMMENDED): `git commit --no-verify`

---

## Next Steps

After validating the walking skeleton:

1. **Review Architecture**: Read `docs/architecture-decisions.md` to understand design choices
2. **Study Patterns**: Review `docs/memories/adopted-patterns.md` for monorepo standards
3. **Plan POC Features**: Start Phase 2 POC development with confidence in infrastructure
4. **Delete Walking Skeleton**: Follow cleanup checklist in `data-model.md` and `contracts/README.md`

---

## Development Workflow Reference

### Daily Development Commands

```bash
# Start both servers (requires 2 terminals)
pnpm exec nx run server:serve  # Terminal 1
pnpm exec nx run web:dev        # Terminal 2

# Run tests for affected projects only
pnpm exec nx affected -t test --base=main

# Lint and fix all projects
pnpm exec nx run-many -t lint --fix

# Build entire monorepo
pnpm exec nx run-many -t build

# Visualize dependency graph
pnpm exec nx graph
```

### Database Commands

```bash
# Generate Prisma Client after schema changes
pnpm exec nx run database:prisma-generate

# Create new migration
pnpm exec nx run database:migrate-dev --name=my_migration_name

# Apply migrations to production database
pnpm exec nx run database:migrate-deploy

# Open Prisma Studio (database GUI)
pnpm exec nx run database:studio
```

### Type Generation Commands

```bash
# Generate OpenAPI spec from server
pnpm exec nx run server:spec-write

# Generate TypeScript types from OpenAPI spec
pnpm exec nx run api-client:generate-types

# Full regeneration (after API changes)
pnpm exec nx run server:spec-write && pnpm exec nx run api-client:generate-types
```

---

## Support & Documentation

- **Project README**: `README.md` (root directory)
- **Architecture Decisions**: `docs/architecture-decisions.md`
- **Adopted Patterns**: `docs/memories/adopted-patterns.md`
- **Tech Stack**: `docs/tech-stack.md`
- **Phase 1 Plan**: `docs/P1-plan.md`
- **Troubleshooting**: `docs/memories/troubleshooting.md`
- **Agent Rules**: `CLAUDE.md` (for AI assistant context)

**Questions?** Check documentation first, then open an issue with:
- Full error message
- Steps to reproduce
- Output of `node --version`, `pnpm --version`, `git --version`
- Operating system and version
