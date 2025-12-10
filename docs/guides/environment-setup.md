---
Created: 2025-10-26
Modified: 2025-10-28T20:30
Version: 1
---

# Environment Variable Setup

This document explains how to configure environment variables for the Nx monorepo template, specifically for Supabase and database connectivity.

---

## Overview

This project uses **two separate connection methods** to Supabase:

1. **PostgreSQL Connection (Prisma)** - Server-side database operations
2. **Supabase SDK (HTTP API)** - Client-side authentication

Each connection method requires different credentials stored in separate environment files.

---

## Quick Start

### 1. Get Credentials from Supabase

**A. Create Supabase Project** (if not already done):
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Save the database password when prompted

**B. Get DATABASE_URL**:
1. Open your project in Supabase dashboard
2. Go to **Project Settings** → **Database**
3. Scroll to **Connection string** section
4. Select **URI** tab
5. Copy the connection string
6. Replace `[YOUR-PASSWORD]` with your database password

**C. Get Supabase Public Credentials**:
1. Stay in **Project Settings**
2. Go to **API** section
3. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (long JWT token starting with `eyJhbGc...`)

---

### 2. Create Environment Files

**Create `.env` in workspace root:**
```bash
# Server-side database connection (Prisma)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

**Create `.env.local` in workspace root (use `.env.example` as a template):**
```bash
# Server-side Supabase credentials
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Client-side Supabase credentials
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# API server endpoint
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

**Both files are gitignored** - they will never be committed to version control. See `.env.example` for placeholders you can copy.

---

## Environment Variables Explained

### SERVER-SIDE (.env)

#### `DATABASE_URL` + `DIRECT_URL`

**Purpose**: Supavisor connection pooler strategy (recommended 2025)

**Format**:
```
# Transaction mode (port 6543) - Used by Prisma Client for queries
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Session mode (port 5432) - Used by Prisma Migrate for migrations
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

**Used by**:
- `DATABASE_URL`: apps/server (Prisma queries), packages/database
- `DIRECT_URL`: Prisma Migrate commands only (migrate deploy, migrate dev, db push)

**What it's for**:
- `DATABASE_URL`: All CRUD operations, queries, transactions (connection pooling)
- `DIRECT_URL`: Schema migrations (direct connection required)

**Security**:
- ⚠️ **NEVER expose to browser/client**
- ⚠️ Server-side only
- ⚠️ Never use `NEXT_PUBLIC_` prefix

**Technical Notes**:
- This is a **PostgreSQL credential** (username/password)
- NOT the same as the Supabase service role key (which applies to the HTTP API path)
- Uses Supavisor connection pooler for better scalability
- See: `.env.example` for detailed comments and setup instructions

---

### SERVER-SIDE (.env or .env.local)

#### `SUPABASE_URL`

**Purpose**: Supabase project URL for server-side SDK connections

**Format**:
```
https://[PROJECT-REF].supabase.co
```

**Used by**:
- `apps/server` (Express API - server-side operations)

**What it's for**:
- Server-side Supabase client initialization
- Authentication token validation
- Admin operations with service role key

**Security**:
- ⚠️ **Server-side only** - not exposed to browser
- ✅ Safe to use with service role key
- ✅ Preferred over `NEXT_PUBLIC_SUPABASE_URL` for server apps

**Backward Compatibility**:
- Server code accepts `NEXT_PUBLIC_SUPABASE_URL` as fallback
- Use `SUPABASE_URL` for new server-side code
- Both variables can coexist in `.env.local`

---

#### `SUPABASE_SERVICE_ROLE_KEY`

**Purpose**: Admin key for server-side operations (bypasses RLS)

**Format**:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Used by**:
- `apps/server` (Express API - admin operations)

**What it's for**:
- Server-side authentication token validation
- Admin database operations (bypasses Row Level Security)
- Operations requiring elevated permissions

**Security**:
- ⚠️ **NEVER expose to browser/client**
- ⚠️ **Server-side only**
- ⚠️ Grants full database access - use carefully
- ⚠️ Never use `NEXT_PUBLIC_` prefix

**Get from**:
- Supabase Dashboard → Project Settings → API → service_role key (NOT anon key)

---

### CLIENT-SIDE (.env.local)

#### `NEXT_PUBLIC_SUPABASE_URL`

**Purpose**: Supabase project URL for SDK connections

**Format**:
```
https://[PROJECT-REF].supabase.co
```

**Used by**:
- `apps/web` (Next.js - browser and server components)
- `packages/supabase-client` (client factory)

**What it's for**:
- Supabase SDK initialization
- Authentication operations (login, signup, session management)

**Security**:
- ✅ Safe to expose to browser
- ✅ Public URL (not sensitive)

---

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Purpose**: Public anonymous key for Supabase SDK

**Format**:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Used by**:
- `apps/web` (Next.js)
- `packages/supabase-client` (client factory)

**What it's for**:
- **Authentication ONLY** (login, signup, password reset)
- NOT for data operations (those go through Express API)

**Security**:
- ✅ Safe to expose to browser
- ✅ Designed for client-side use
- ✅ Limited permissions (can only auth, not directly query database in our architecture)

**Technical Notes**:
- This is a **JWT token** (Supabase HTTP API key)
- NOT the same as DATABASE_URL password
- NOT the service role key (which should never be exposed to clients)

---

#### `NEXT_PUBLIC_API_URL`

**Purpose**: URL where your Express API server is running

**Format**:
```
# Development
http://localhost:4000/api

# Production
https://api.your-domain.com/api
```

**Used by**:
- `apps/web` (openapi-fetch client)

**What it's for**:
- All data operations (GET/POST/PUT/DELETE)
- Web app calls this API, which then uses Prisma to query database

**Security**:
- ✅ Safe to expose to browser
- ⚠️ Update for production deployment

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Supabase Cloud Project                                       │
│  ├─ PostgreSQL Database (data storage)                      │
│  └─ Auth Service (login/signup/sessions)                    │
└──────────────────────────────────────────────────────────────┘
           ↑                                    ↑
           │                                    │
    DATABASE_URL                    SUPABASE_URL + SERVICE_ROLE_KEY
    (PostgreSQL)                    (HTTP API - Server)
           │                                    │
           │                        NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
           │                                    (HTTP API - Client)
           │                                    │
    ┌──────┴─────┐                   ┌─────────┴─────────┐
    │   .env     │                   │   .env.local      │
    │            │                   │                   │
    │  Prisma   │                   │  Supabase SDK     │
    │   (ORM)   │                   │  (Auth + Admin)   │
    └──────┬─────┘                   └─────────┬─────────┘
           │                                    │
           │                                    │
    ┌──────┴──────────┐                ┌───────┴───────────┐
    │  apps/server    │                │  apps/web         │
    │  (Express API)  │                │  (Next.js)        │
    │                 │                │                   │
    │  CRUD via       │←───────────────│  Calls API via    │
    │  Prisma         │      HTTP      │  openapi-fetch    │
    │                 │                │                   │
    │  Auth via       │                │  Auth via         │
    │  service role   │                │  anon key         │
    └─────────────────┘                └───────────────────┘
```

---

## File Structure

```
nx-monorepo/
├── .env                  # Server credentials (gitignored)
├── .env.local            # Client credentials (gitignored)
├── .env.example          # Template (committed to git)
└── .gitignore            # Ignores .env and .env.local
```

---

## Security Best Practices

### ✅ DO:

- **Use `.env` for server-only secrets** (DATABASE_URL)
- **Use `.env.local` for client-safe variables** (NEXT_PUBLIC_* vars)
- **Commit `.env.example`** template to git
- **Keep database password secure** (password manager recommended)
- **Rotate credentials** if accidentally exposed

### ❌ DON'T:

- **Never commit `.env` or `.env.local`** to git
- **Never expose DATABASE_URL to browser/client**
- **Never use `NEXT_PUBLIC_` prefix for sensitive credentials**
- **Never share service role key** (we don't use it in Phase 1, but if you do in Phase 2+, keep it server-only)
- **Never hardcode credentials** in source code

---

## Common Issues

### Issue: "Environment variables not loading"

**Symptoms**: App can't connect to database, undefined env vars

**Solutions**:
1. Verify files exist: `ls -la .env*`
2. Check file names are exact: `.env` not `env` or `.env.txt`
3. Restart dev server after creating/editing env files
4. Next.js: Prefix client vars with `NEXT_PUBLIC_`

---

### Issue: "Database connection failed"

**Symptoms**: Error: "ENOTFOUND" or "Connection refused"

**Solutions**:
1. Verify `DATABASE_URL` format is correct
2. Check password has no typos (copy from Supabase dashboard)
3. Ensure Supabase project is active (not paused)
4. Test connectivity: Supabase dashboard → Database → Connection pooler status

---

### Issue: "Supabase SDK errors in browser"

**Symptoms**: "Invalid API key" or "Cannot initialize Supabase client"

**Solutions**:
1. Verify `NEXT_PUBLIC_SUPABASE_URL` matches project URL exactly
2. Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the **anon public** key (not service role)
3. Restart Next.js dev server (`pnpm exec nx run web:dev`)
4. Clear browser cache/cookies

---

## Template Users: First-Time Setup

If you're cloning this template for the first time:

1. **Copy the example file**:
   ```bash
   # From workspace root
   cp .env.example .env
   cp .env.example .env.local
   ```

2. **Create your own Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new organization (free tier)
   - Create new project
   - Save database password

3. **Fill in your credentials**:
   - Edit `.env` with your `DATABASE_URL`
   - Edit `.env.local` with your Supabase public credentials

4. **Verify setup**:
   ```bash
   # Check files exist and are ignored by git
   ls -la .env*
   git status  # Should NOT show .env or .env.local
   ```

5. **Run migrations** (Stage 4.4+):
   ```bash
   pnpm --filter @nx-monorepo/database prisma migrate dev
   ```

---

## Production Deployment

### Environment Variables in Production

**DO NOT use `.env` or `.env.local` in production.** Instead:

1. **Use hosting platform's env var system**:
   - Vercel: Project Settings → Environment Variables
   - Netlify: Site Settings → Build & Deploy → Environment
   - Railway: Project → Variables
   - Render: Dashboard → Environment → Environment Variables

2. **Set the same variables**:
   ```bash
   # Server (backend deployment)
   DATABASE_URL="postgresql://..."
   SUPABASE_URL="https://..."
   SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."

   # Web (Next.js deployment)
   NEXT_PUBLIC_SUPABASE_URL="https://..."
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."
   NEXT_PUBLIC_API_URL="https://api.your-domain.com/api"
   ```

3. **Update API URL** for production:
   - Change `NEXT_PUBLIC_API_URL` from localhost to your deployed API domain

---

## Staging Deployment Environment

Reference `docs/architecture-decisions.md` Stage 5 for deployment platform decisions.

### Staging Environment (Vercel + Railway)

**Web App (Vercel)**:
```bash
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"      # TEST project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."               # TEST project anon key
BACKEND_URL="https://nx-monoreposerver-production.up.railway.app"  # Railway API URL
```

**⚠️ Important: Use `BACKEND_URL`, NOT `NEXT_PUBLIC_API_URL`**

| Variable | Layer | Purpose |
|----------|-------|---------|
| `BACKEND_URL` | Server-side (Next.js rewrites) | Configures where Next.js proxies `/api/*` requests |
| `NEXT_PUBLIC_API_URL` | Client-side (baked into JS) | **Do NOT use** — bypasses proxy, causes path issues |

**How it works:**
1. Client code calls `/api/health` (relative URL)
2. Next.js rewrite proxies to `${BACKEND_URL}/api/health`
3. Railway receives request at full URL

This keeps API calls going through the Next.js proxy, avoiding CORS issues and keeping backend URL out of client bundles.

**Server App (Railway)**:
```bash
# Required environment variables
DATABASE_URL="postgresql://..."                   # TEST project pooler connection
DIRECT_URL="postgresql://..."                     # TEST project direct connection
SUPABASE_URL="https://xxxx.supabase.co"          # TEST project URL
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."           # TEST project service key
NODE_ENV="production"                             # Enables production optimizations
PORT="4000"                                       # Railway will override this
```

**Note:** The server does NOT need `SUPABASE_ANON_KEY` — it only uses the service role key for admin operations.

See `.env.example` (lines 108-138) for the complete multi-environment variable reference.

**Key Differences from Production**:
- Uses Supabase **TEST** project (not DEV or PROD)
- May use less restrictive rate limits for testing
- Error details may be more verbose for debugging
- No user email verification required

### Vercel Build Configuration

For Nx monorepo deployments on Vercel, use these dashboard settings:

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Root Directory** | `.` (empty) | Required for Nx to resolve workspace packages |
| **Build Command** | See below | Custom command for Prisma + Nx |
| **Output Directory** | `apps/web/.next` | Standard Next.js output |
| **Node.js Version** | `22.x` | Match project's `engines.node` |

**Build Command:**
```bash
rm -rf apps/web/.next && pnpm exec prisma generate --schema=packages/database/prisma/schema.prisma && pnpm exec nx build web --skip-nx-cache
```

**Why this specific command:**
- `rm -rf apps/web/.next` — Clears cached files to prevent conflicts
- `prisma generate` — Generates Prisma client with custom schema path
- `--skip-nx-cache` — Avoids "File exists" error with Next.js standalone output symlinks

See `docs/memories/tech-findings-log/module-21-deployment-vercel-railway-nx-monorepo-configuration-2025-12-08.md` for full technical details.

---

## Supabase Auth Configuration

This section documents the Supabase Authentication settings configured for this project.

### Configured Settings (nx-monorepo-DEV and nx-monorepo-STAGING)

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Email provider** | Enabled | Primary auth method for MVP |
| **Minimum password length** | 8 characters | Standard security baseline (NIST recommendation) |
| **Password requirements** | No required characters | Sufficient for dev; tighten for production |
| **Email confirmation** | OFF | Faster testing during development |
| **Secure email change** | OFF | Simpler UX for MVP |
| **Secure password change** | OFF | Users can change password anytime |
| **Email OTP expiration** | 3600s (1 hour) | Supabase default |
| **Email OTP length** | 6 digits | Supabase default |
| **JWT access token expiry** | 3600s (1 hour) | Supabase default; good balance |
| **Refresh token expiry** | 7 days | Supabase default; reasonable session persistence |
| **Detect compromised tokens** | ON | Security feature enabled |
| **Refresh token reuse interval** | 10 seconds | Supabase recommended default |

### Redirect URLs (nx-monorepo-DEV and nx-monorepo-STAGING)

Configured redirect URLs for authentication callbacks:

```
http://localhost:3000/**
http://localhost:3001/**
http://localhost:3002/**
http://localhost:3003/**
```

These allow the web app (Next.js) to receive auth callbacks on common development ports.

### RLS and Auth Context (Phase 2 Reference)

Row Level Security (RLS) policies can use `auth.uid()` to restrict data access per user. Here's how the auth context flows:

```
┌─────────────┐     JWT Token      ┌─────────────────┐
│   Browser   │ ─────────────────► │  Express API    │
│  (Next.js)  │                    │  (Service Role) │
└─────────────┘                    └────────┬────────┘
                                            │
                                   Uses service role key
                                   (bypasses RLS)
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │   PostgreSQL    │
                                   │   (Supabase)    │
                                   └─────────────────┘
```

**Current State (Phase 1)**:
- RLS is enabled on tables but no policies are defined
- Express server uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS
- All authorization logic is in Express middleware (`requireAuth`)

**Phase 2 Pattern** (when user-specific data is needed):
```sql
-- Example: Users can only read their own tasks
CREATE POLICY "Users can view own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

-- Example: Users can only insert tasks for themselves
CREATE POLICY "Users can create own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**Key Functions**:
- `auth.uid()` - Returns the authenticated user's UUID from the JWT
- `auth.role()` - Returns the role ('authenticated', 'anon', 'service_role')
- `auth.email()` - Returns the authenticated user's email

For more details, see [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security).

### Production Considerations

When deploying to production, update these settings:

| Setting | Dev Value | Production Recommendation |
|---------|-----------|---------------------------|
| Email confirmation | OFF | **ON** - verify user emails |
| Password requirements | None | **Letters + digits** minimum |
| Redirect URLs | localhost:* | **Exact production URLs only** |
| Secure password change | OFF | **ON** - require recent auth |

### Dashboard Navigation

To access these settings:

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (e.g., nx-monorepo-DEV)
3. Navigate to:
   - **Authentication → Providers → Email** - Password policy, email confirmation
   - **Authentication → URL Configuration** - Redirect URLs
   - **Authentication → Settings** - Session/token settings

---

## Related Documentation

- [Architecture Decisions](./architecture-decisions.md) - Why we use this architecture
- [RLS Policy Decisions](../architecture-decisions.md#decision-4-rls-policy-approach) - Defense-in-depth with service_role bypass
- [Supabase Documentation](https://supabase.com/docs) - Official Supabase docs
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth) - Official auth docs
- [Prisma Documentation](https://www.prisma.io/docs) - Official Prisma docs
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables) - Next.js env var docs

---

## Changelog

- **2025-12-08**: Updated staging deployment configuration (Story 5.2)
  - Added `BACKEND_URL` as the correct variable for Vercel → Railway proxy
  - Clarified why NOT to use `NEXT_PUBLIC_API_URL` (bypasses proxy, causes path issues)
  - Added Vercel Build Configuration section with monorepo-specific settings
  - Documented the custom build command and rationale for each part
  - Added reference to tech-findings-log module for full details
- **2025-12-05**: Fixed environment variable naming inconsistency
  - Added `SUPABASE_URL` as preferred server-side variable (Story 5.1)
  - Added `SUPABASE_SERVICE_ROLE_KEY` documentation
  - Maintained backward compatibility with `NEXT_PUBLIC_SUPABASE_URL`
  - Updated `.env.example` with all server-side Supabase variables
  - Updated architecture diagram to show both server/client paths
  - Documented server-side vs client-side variable conventions
- **2025-12-04**: Added Supabase Auth Configuration section (Story 4.2)
  - Documented auth settings for both DEV and TEST projects
  - Included password policy, email confirmation, JWT settings
  - Added redirect URLs for development
  - Included production considerations
  - Added RLS and auth context documentation for Phase 2 reference
- **2025-10-26**: Initial documentation created for Stage 4.3
  - Documented two connection methods (Prisma vs Supabase SDK)
  - Explained all environment variables with security notes
  - Added troubleshooting section for common issues
  - Included production deployment guidance
