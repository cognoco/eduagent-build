---
title: Environment Variables Matrix
purpose: Traceability matrix for all environment variables across platforms and environments
audience: DevOps, developers, AI agents
created: 2025-12-08
last-updated: 2025-12-10
---

# Environment Variables Matrix

This document provides a complete traceability matrix for all environment variables used in the nx-monorepo template.

---

## Quick Reference

### Variable Categories

| Category | Prefix | Exposure | Examples |
|----------|--------|----------|----------|
| Public (Browser-safe) | `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*` | Client bundles | API URLs, Supabase URL/anon key |
| Server-side | No prefix | Server only | DATABASE_URL, SERVICE_ROLE_KEY |
| Build-time | Various | Build process | SENTRY_AUTH_TOKEN |

---

## Full Variable Matrix

### Database Variables

| Variable | Used By | Local Dev | Local Tests | CI | Staging | Production | Type |
|----------|---------|-----------|-------------|-----|---------|------------|------|
| `DATABASE_URL` | apps/server | DEV Supabase | STAGING Supabase | Local PostgreSQL | STAGING Supabase | STAGING* Supabase | Secret |
| `DIRECT_URL` | Prisma migrations | DEV Supabase | STAGING Supabase | Local PostgreSQL | STAGING Supabase | STAGING* Supabase | Secret |

*Production uses STAGING until PROD Supabase is created

**How database variables are loaded:**

| Context | `DATABASE_URL` set? | Behavior | Database Used |
|---------|---------------------|----------|---------------|
| **CI** | ✅ Yes (workflow env) | `load-database-env.ts` returns early | Local PostgreSQL container |
| **Local dev** | ❌ No | Loads `.env.development.local` | DEV Supabase |
| **Local tests** | ❌ No | Loads `.env.test.local` | STAGING Supabase |

> The `load-database-env.ts` utility first checks if `DATABASE_URL` is already set (CI, Docker, cloud). If yes, it skips file loading. This is why CI uses local PostgreSQL even though `NODE_ENV=test` would normally load `.env.test.local`.

**Format:**
```bash
# Transaction mode (queries) - Port 6543
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Session mode (migrations) - Port 5432
DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
```

---

### Supabase Client Variables

| Variable | Used By | Local Dev | CI | Staging | Production | Type |
|----------|---------|-----------|-----|---------|------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | apps/web | DEV URL | N/A | STAGING URL | STAGING* URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | apps/web | DEV key | N/A | STAGING key | STAGING* key | Public |
| `SUPABASE_URL` | apps/server | DEV URL | N/A | STAGING URL | STAGING* URL | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | apps/server | DEV key | N/A | STAGING key | STAGING* key | Secret |

**Supabase Project References:**

| Project | Ref | Purpose |
|---------|-----|---------|
| DEV | `pjbnwtsufqpgsdlxydbo` | Local development |
| STAGING | `uvhnqtzufwvaqvbdgcnn` | Staging + Production (temporary) |
| PROD | TBD | Production (future) |

---

### API Configuration Variables

| Variable | Used By | Local Dev | CI | Staging | Production | Type |
|----------|---------|-----------|-----|---------|------------|------|
| `NEXT_PUBLIC_API_URL` | apps/web (client-side) | `http://localhost:4000/api` | N/A | `/api` | `/api` | Public |
| `BACKEND_URL` | apps/web (Next.js rewrites) | N/A | N/A | Railway staging URL | Railway prod URL | Build ARG |
| `CORS_ORIGIN` | apps/server | `localhost:3000,3001,3002` | N/A | Vercel + Railway URLs | Vercel + Railway URLs | Server |
| `HOST` | apps/server | `localhost` | `localhost` | `0.0.0.0` | `0.0.0.0` | Server |
| `PORT` | apps/server | `4000` | `4000` | Railway assigned | Railway assigned | Server |

**Critical for both Vercel AND Railway web deployments:**

| Variable | Purpose | Must Be |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | Client-side API base URL | `/api` (NOT direct server URL) |
| `BACKEND_URL` | Next.js server-side rewrite target | Full Railway API URL |

**Why this matters:**
- `NEXT_PUBLIC_API_URL` = `/api` tells client-side code to use same-origin proxy (avoids CORS)
- `BACKEND_URL` = Railway URL tells Next.js server where to forward `/api/*` requests
- **Railway web builds**: `BACKEND_URL` must be passed as a Docker build ARG because Next.js bakes rewrites at build time
- Setting `NEXT_PUBLIC_API_URL` to the Railway URL directly causes **client-side CORS errors**

---

### Observability Variables

| Variable | Used By | Local Dev | CI | Staging | Production | Type |
|----------|---------|-----------|-----|---------|------------|------|
| `SENTRY_DSN_API` | apps/server | Optional | N/A | Yes | Yes | Server |
| `NEXT_PUBLIC_SENTRY_DSN` | apps/web | Optional | N/A | Yes | Yes | Public |
| `SENTRY_ORG` | Build process | Yes | Yes | Yes | Yes | Build |
| `SENTRY_PROJECT` | Build process | Yes | Yes | Yes | Yes | Build |
| `SENTRY_AUTH_TOKEN` | Build process | Yes | Yes | Yes | Yes | Secret |

**Sentry Configuration:**
- Organization: `zwizzly`
- Project: `nx-monorepo`
- Same DSN can be used across environments (tagged by environment)

---

### Node/Runtime Variables

| Variable | Used By | Local Dev | CI | Staging | Production | Type |
|----------|---------|-----------|-----|---------|------------|------|
| `NODE_ENV` | All apps | `development` | `test` | `production` | `production` | Server |
| `CI` | Build scripts | Not set | `true` | Not set | Not set | Build |

---

## Platform-Specific Configuration

### GitHub Environments

| Environment | Variables | Secrets |
|-------------|-----------|---------|
| `staging` | `STAGING_API_URL=https://nx-monoreposerver-staging.up.railway.app` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN` |
| `production` | `PRODUCTION_API_URL=https://nx-monoreposerver-production.up.railway.app` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN` |

**Note:** Vercel also creates GitHub environments (`nx-monorepo / staging`, `nx-monorepo / production`) for deployment status tracking. These are separate and should be left alone.

### Vercel Environment Variables

**Preview (Staging):**
```bash
NEXT_PUBLIC_API_URL=/api                                          # MUST be /api (not Railway URL!)
NEXT_PUBLIC_SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
BACKEND_URL=https://nx-monoreposerver-staging.up.railway.app      # Server-side proxy target
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_ORG=zwizzly
SENTRY_PROJECT=nx-monorepo
SENTRY_AUTH_TOKEN=sntryu_...
```

**Production:**
```bash
NEXT_PUBLIC_API_URL=/api                                          # MUST be /api (not Railway URL!)
NEXT_PUBLIC_SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co  # STAGING until PROD
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
BACKEND_URL=https://nx-monoreposerver-production.up.railway.app   # Server-side proxy target
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_ORG=zwizzly
SENTRY_PROJECT=nx-monorepo
SENTRY_AUTH_TOKEN=sntryu_...
```

**Deployment Protection:** SSO protection is disabled for production to allow public access.

### Railway Environment Variables

**Staging:**
```bash
DATABASE_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SENTRY_DSN_API=https://...
NODE_ENV=production
CORS_ORIGIN=https://nx-monorepo-jornco.vercel.app,https://nx-monorepo-git-*.vercel.app
```

**Production:**
```bash
DATABASE_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true  # STAGING until PROD
DIRECT_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SENTRY_DSN_API=https://...
NODE_ENV=production
CORS_ORIGIN=https://nx-monorepo.vercel.app,https://nx-monorepoweb-production.up.railway.app
```

> **CORS_ORIGIN Configuration Notes:**
>
> The Express server supports comma-separated CORS origins (see `apps/server/src/main.ts`).
>
> **Staging challenge:** Vercel Preview URLs are dynamic (`nx-monorepo-<hash>-<user>.vercel.app`).
> The current implementation does NOT support wildcard patterns - each origin must be exact.
>
> **Options for staging CORS:**
> 1. **Use Next.js proxy** (recommended): Client uses `/api` which proxies through Vercel/Railway → Railway API (same-origin, no CORS)
> 2. **Add known deployment URLs**: Add common branch preview URLs when known
> 3. **Accept all origins in staging** (not recommended): Set `CORS_ORIGIN=*` for staging only
>
> **Current approach:** We use the Next.js proxy (`NEXT_PUBLIC_API_URL=/api`), so browser requests are same-origin and CORS doesn't apply for client-side fetches. The `CORS_ORIGIN` setting is primarily for direct API access (Swagger UI, external tools).

### Railway Web Environment Variables

Railway web (`@nx-monorepo/web`) runs the same Next.js application as Vercel but uses Docker builds.

**Staging:**
```bash
NEXT_PUBLIC_API_URL=/api                                          # MUST be /api (not Railway server URL!)
NEXT_PUBLIC_SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
BACKEND_URL=https://nx-monoreposerver-staging.up.railway.app      # Docker build ARG for Next.js rewrites
NEXT_PUBLIC_SENTRY_DSN=https://...
NODE_ENV=production
```

**Production:**
```bash
NEXT_PUBLIC_API_URL=/api                                          # MUST be /api (not Railway server URL!)
NEXT_PUBLIC_SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co  # STAGING until PROD
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
BACKEND_URL=https://nx-monoreposerver-production.up.railway.app   # Docker build ARG for Next.js rewrites
NEXT_PUBLIC_SENTRY_DSN=https://...
NODE_ENV=production
```

> **Railway Web Build-Time vs Runtime Variables:**
>
> Unlike Vercel (which handles `NEXT_PUBLIC_*` automatically), Railway Docker builds require special handling:
>
> | Variable | Type | How It Works |
> |----------|------|--------------|
> | `NEXT_PUBLIC_*` | Build ARG | Automatically passed by Railway as Docker build args |
> | `BACKEND_URL` | Build ARG | Must be defined as `ARG` in Dockerfile for Next.js rewrites |
> | `NODE_ENV` | Runtime | Set as environment variable |
>
> The `apps/web/Dockerfile` includes:
> ```dockerfile
> ARG BACKEND_URL
> ENV BACKEND_URL=$BACKEND_URL
> ```
>
> This ensures Next.js rewrites (configured in `next.config.js`) know where to proxy `/api/*` requests at build time.

---

## CI Workflow Variables

**`.github/workflows/ci.yml`:**
```yaml
env:
  DATABASE_URL: postgresql://prisma:prisma@localhost:5432/tests?schema=public
  DIRECT_URL: postgresql://prisma:prisma@localhost:5432/tests?schema=public
  CI: true
```

**Note:** CI uses local PostgreSQL container, not Supabase. This provides isolation and speed.

---

## Local Development Files

### `.env.development.local`
```bash
# Supabase DEV project
DATABASE_URL=postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.pjbnwtsufqpgsdlxydbo:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://pjbnwtsufqpgsdlxydbo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://pjbnwtsufqpgsdlxydbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### `.env.test.local`

> **Note**: This file is named "test" because it's loaded when `NODE_ENV=test` (i.e., when running tests), not because of the database it connects to. It connects to the STAGING Supabase instance.

```bash
# Supabase STAGING project (loaded when NODE_ENV=test)
DATABASE_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.uvhnqtzufwvaqvbdgcnn:[PASSWORD]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://uvhnqtzufwvaqvbdgcnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Migration Checklist: Adding Production Supabase

When creating `nx-monorepo-PROD` Supabase project:

### 1. Create Project
- [ ] Create new Supabase project in appropriate organization
- [ ] Note project ref and region
- [ ] Save database password securely

### 2. Run Migrations
```bash
# Set production DATABASE_URL temporarily
export DATABASE_URL="postgresql://postgres.[PROD-REF]:[PASSWORD]@..."
pnpm --filter @nx-monorepo/database prisma migrate deploy
```

### 3. Update Vercel (Production)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` → PROD URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` → PROD key

### 4. Update Railway (Production)
- [ ] `DATABASE_URL` → PROD pooler connection
- [ ] `DIRECT_URL` → PROD direct connection
- [ ] `SUPABASE_URL` → PROD URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` → PROD service key

### 5. Verify
- [ ] Deploy to production
- [ ] Verify health check works
- [ ] Verify data is isolated from staging

---

## Related Documentation

- [Environment Strategy](./environment-strategy.md) - High-level architecture
- [Guides: Environment Setup](./guides/environment-setup.md) - Developer setup
- [.env.example](../.env.example) - Template with all variables

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-08 | SM Agent (Rincewind) | Initial matrix created during Story 5.4 |
| 2025-12-10 | Claude Opus 4.5 | Added Railway Web environment variables section per Story 5.9 |


