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
# Client-side Supabase credentials
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# API server endpoint
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
```

**Both files are gitignored** - they will never be committed to version control. See `.env.example` for placeholders you can copy.

---

## Environment Variables Explained

### SERVER-SIDE (.env)

#### `DATABASE_URL`

**Purpose**: Direct PostgreSQL connection for Prisma ORM

**Format**:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Used by**:
- `apps/server` (Express API server)
- `packages/database` (Prisma client)

**What it's for**:
- All CRUD database operations
- Running migrations
- Complex queries and transactions

**Security**:
- ⚠️ **NEVER expose to browser/client**
- ⚠️ Server-side only
- ⚠️ Never use `NEXT_PUBLIC_` prefix

**Technical Notes**:
- This is a **PostgreSQL credential** (username/password)
- NOT the same as Supabase service role key
- Connects via PostgreSQL protocol (port 5432 or 6543 for pooler)

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
http://localhost:3001/api

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
┌─────────────────────────────────────────────────────────┐
│ Supabase Cloud Project                                  │
│  ├─ PostgreSQL Database (data storage)                 │
│  └─ Auth Service (login/signup/sessions)               │
└─────────────────────────────────────────────────────────┘
           ↑                           ↑
           │                           │
    DATABASE_URL               SUPABASE_URL + Keys
    (PostgreSQL)               (HTTP API)
           │                           │
           │                           │
    ┌──────┴─────┐            ┌────────┴──────┐
    │   .env     │            │  .env.local   │
    │            │            │               │
    │  Prisma   │            │ Supabase SDK  │
    │   (ORM)   │            │   (Auth)      │
    └──────┬─────┘            └────────┬──────┘
           │                           │
           │                           │
    ┌──────┴──────────┐       ┌────────┴──────────┐
    │  apps/server    │       │  apps/web         │
    │  (Express API)  │       │  (Next.js)        │
    │                 │       │                   │
    │  CRUD via       │←──────│  Calls API via    │
    │  Prisma         │  HTTP │  openapi-fetch    │
    └─────────────────┘       └───────────────────┘
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

   # Web (Next.js deployment)
   NEXT_PUBLIC_SUPABASE_URL="https://..."
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."
   NEXT_PUBLIC_API_URL="https://api.your-domain.com/api"
   ```

3. **Update API URL** for production:
   - Change `NEXT_PUBLIC_API_URL` from localhost to your deployed API domain

---

## Related Documentation

- [Architecture Decisions](./architecture-decisions.md) - Why we use this architecture
- [Security Architecture](./security-architecture.md) - RLS decisions and security model (TODO: Stage 4.4+)
- [Supabase Documentation](https://supabase.com/docs) - Official Supabase docs
- [Prisma Documentation](https://www.prisma.io/docs) - Official Prisma docs
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables) - Next.js env var docs

---

## Changelog

- **2025-10-26**: Initial documentation created for Stage 4.3
  - Documented two connection methods (Prisma vs Supabase SDK)
  - Explained all environment variables with security notes
  - Added troubleshooting section for common issues
  - Included production deployment guidance
