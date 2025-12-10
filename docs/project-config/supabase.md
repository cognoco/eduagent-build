# Supabase Configuration

> **Project-Specific**: This document contains credentials and configuration for THIS project's Supabase instances. When forking the template, replace with your own Supabase projects.

---

## Overview

This project uses **two separate Supabase PostgreSQL databases**:

| Supabase Project | Project ID | Purpose | Env File | NODE_ENV |
|------------------|------------|---------|----------|----------|
| **DEV** | `pjbnwtsufqpgsdlxydbo` | Local development | `.env.development.local` | `development` |
| **STAGING** | `uvhnqtzufwvaqvbdgcnn` | Staging + local tests | `.env.test.local` | `test` |
| **PROD** | *Deferred* | Real production | `.env.production.local` | `production` |

> **Why `.env.test.local` connects to STAGING:** The env file naming follows `NODE_ENV` convention (test, development, production), not the database naming. When running tests (`NODE_ENV=test`), the code loads `.env.test.local`, which points to our STAGING database for integration testing.

**Organization**: ZIX-DEV
**Region**: `eu-north-1`
**Cost**: $0/month (both on free tier)

---

## Quick Setup (10-15 minutes)

### Prerequisites

1. **Access to Supabase projects** - Ask team lead to invite you to ZIX-DEV organization
2. **Repository cloned and dependencies installed**:
   ```bash
   git clone <repository-url>
   cd nx-monorepo
   pnpm install
   ```

### Step 1: Create Environment Files

```bash
cp .env.example .env.development.local
cp .env.example .env.test.local
```

### Step 2: Get Development Credentials

1. Navigate to: https://supabase.com/dashboard/project/pjbnwtsufqpgsdlxydbo
2. **Reset password** (if needed): Settings → Database → Database Settings → Reset Database Password
   - Use only letters and numbers (e.g., `MyPassword123`)
   - **Avoid special characters** - they cause connection issues
3. **Get connection string**: Settings → Database → Connection string → "Session pooler" tab
   - **Copy the EXACT hostname** (e.g., `aws-1-eu-north-1`) - it varies by project!
4. **Get API credentials**: Settings → API
   - Copy `URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

5. **Fill in `.env.development.local`**:
   ```env
   DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-X-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-X-eu-north-1.pooler.supabase.com:5432/postgres"
   NEXT_PUBLIC_SUPABASE_URL="https://pjbnwtsufqpgsdlxydbo.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   NEXT_PUBLIC_API_URL="http://localhost:4000/api"
   ```

### Step 3: Get STAGING Credentials

Repeat for STAGING project: https://supabase.com/dashboard/project/uvhnqtzufwvaqvbdgcnn

**Note**: STAGING project may have a DIFFERENT hostname than dev!

### Step 4: Verify Setup

```bash
pnpm run validate:env         # Validate environment files
pnpm run db:push:dev          # Test dev database connectivity
pnpm run db:push:test         # Test test database connectivity
```

---

## Project Details

### Development Project

- **Project ID**: `pjbnwtsufqpgsdlxydbo`
- **Organization ID**: `cispguvwukegvvxmeyzt`
- **Pooler Hostname**: `aws-1-eu-north-1.pooler.supabase.com`
- **Dashboard**: https://supabase.com/dashboard/project/pjbnwtsufqpgsdlxydbo
- **Purpose**: Local development, rapid iteration, schema experimentation

**Connection Details**:
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://pjbnwtsufqpgsdlxydbo.supabase.co"
```

**Schema Status**:
- Migrations applied: `20251027072808_create_health_check`
- Tables: `health_checks`, `_prisma_migrations`
- Row Level Security: Enabled

---

### STAGING Project (loaded via `.env.test.local`)

- **Project ID**: `uvhnqtzufwvaqvbdgcnn`
- **Organization ID**: `cispguvwukegvvxmeyzt`
- **Pooler Hostname**: `aws-1-eu-north-1.pooler.supabase.com`
- **Dashboard**: https://supabase.com/dashboard/project/uvhnqtzufwvaqvbdgcnn
- **Purpose**: Staging deployments + local integration tests
- **Loaded when**: `NODE_ENV=test` (via `.env.test.local`)

**Connection Details**:
```env
DATABASE_URL="postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://uvhnqtzufwvaqvbdgcnn.supabase.co"
```

**Schema Status**: Synchronized with development project

---

### Production Project (Deferred)

- **Organization**: PIX (planned)
- **Status**: Will be created when ready for real deployment
- **Rationale**: Phase 1 goal is walking skeleton validation, not production deployment

---

## Understanding Connection Strings

### DATABASE_URL (Transaction Mode - Port 6543)

Used by Prisma for application queries (SELECT, INSERT, UPDATE, DELETE).

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-X-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

### DIRECT_URL (Session Mode - Port 5432)

Used by Prisma for schema operations (migrations, introspection).

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-X-[REGION].pooler.supabase.com:5432/postgres
```

### Why Pooler for Both?

Traditional setup uses direct connection (`db.[ref].supabase.co`) for DIRECT_URL. We use pooler for both because:
- Direct connection requires IPv6 support
- Many dev environments lack IPv6 (WSL2, Docker, some ISPs)
- Pooler provides IPv4 compatibility

---

## Critical: Pooler Hostname Discovery

**The pooler hostname varies by project and CANNOT be predicted!**

| What you might assume | Reality |
|----------------------|---------|
| `aws-0-eu-north-1` | Could be `aws-1`, `aws-2`, `aws-3`, etc. |
| Same as other project | May differ between projects |

**How to find the correct hostname**:
1. Supabase Dashboard → Settings → Database → Connection string
2. Select "Session pooler" tab
3. Copy the EXACT hostname shown

**Symptom of wrong hostname**: `Error: Tenant or user not found`

---

## Troubleshooting

### "Tenant or user not found"

**Cause**: Wrong pooler hostname

**Fix**: Copy EXACT hostname from Supabase Dashboard → Settings → Database → Connection string → "Session pooler" tab

### "Can't reach database server"

**Possible causes**:
1. Network/firewall blocking ports 5432, 6543
2. Supabase project paused

**Fix**: Check project status in dashboard, try different network

### "Authentication failed"

**Cause**: Password contains special characters

**Fix**: Reset password to alphanumeric only (Settings → Database → Reset Database Password)

### Environment Variables Not Loading

**Check**:
1. File exists with correct name (`.env.development.local`, not `.env.dev.local`)
2. No spaces around `=` sign
3. NODE_ENV matches filename

---

## Migration Commands

```bash
# Development
pnpm run db:migrate:dev           # Create and apply new migration
pnpm run db:migrate:deploy:dev    # Apply existing migrations

# Test
pnpm run db:migrate:deploy:test   # Apply migrations (read-only)

# View migrations
ls packages/database/prisma/migrations/
```

---

## Security

**DO**:
- Keep `.env.*.local` files in `.gitignore` (already configured)
- Use different credentials for each environment
- Rotate credentials if compromised

**DO NOT**:
- Commit `.env.*.local` files to git
- Share credentials via insecure channels
- Hardcode credentials in source code

---

## References

- **Environment architecture**: `docs/environment-strategy.md` (platform mapping, CI database strategy)
- **Variable matrix**: `docs/environment-variables-matrix.md` (all variables across all platforms)
- **Generic setup pattern**: `docs/guides/environment-setup.md` (for template users)
- **Environment patterns**: `docs/memories/adopted-patterns.md` Pattern 13, 14
- **Technical findings**: `docs/memories/tech-findings-log.md` (pooler hostname, IPv6)

---

**Last Updated**: 2025-12-09
