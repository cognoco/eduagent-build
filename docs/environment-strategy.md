---
title: Environment Strategy
purpose: Formal architecture for deployment environments across all platforms
audience: DevOps, developers, AI agents
created: 2025-12-08
last-updated: 2025-12-10
---

# Environment Strategy

This document defines the formal environment architecture for the nx-monorepo template, covering all deployment platforms and their relationships.

---

## Executive Summary

| Environment | Trigger | Web (Primary) | Web (Secondary) | API | Database | Purpose |
|-------------|---------|---------------|-----------------|-----|----------|---------|
| **Local Dev** | Manual | localhost:3000 | N/A | localhost:4000 | Supabase DEV | Developer workstation |
| **CI Testing** | PR/Push | N/A | N/A | N/A | Local PostgreSQL | Automated tests |
| **Staging** | PR to main / non-main branches | Vercel Preview | Railway Web | Railway API | Supabase STAGING | Pre-merge validation, demos |
| **Production** | Merge to main | Vercel Production | Railway Web | Railway API | Supabase STAGING* | Live system |

*Production uses STAGING database until Supabase PROD is created

**Dual Frontend Architecture:** Both Vercel and Railway host the same Next.js web application. Vercel is primary (auto-deploy, preview URLs), Railway is secondary (demonstrates deployment portability, Docker-based).

---

## Environment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENVIRONMENT ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LOCAL DEVELOPMENT                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Web: localhost:3000 (Next.js dev server)                            │   │
│  │ API: localhost:4000 (Express dev server)                            │   │
│  │ DB:  Supabase DEV project (pjbnwtsufqpgsdlxydbo)                    │   │
│  │ Config: .env.development.local                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  CI TESTING (GitHub Actions)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Web: Build only (no deployment)                                     │   │
│  │ API: Build only (no deployment)                                     │   │
│  │ DB:  Local PostgreSQL container (isolated, hermetic)                │   │
│  │ Config: Inline in workflow                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STAGING (PRs / Non-main branches)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Web (Primary):   Vercel Preview (*.vercel.app)                      │   │
│  │ Web (Secondary): Railway Web (nx-monorepoweb-staging.up.railway.app)│   │
│  │ API: Railway staging (nx-monoreposerver-staging.up.railway.app)     │   │
│  │ DB:  Supabase STAGING project (uvhnqtzufwvaqvbdgcnn)                │   │
│  │ Config: GitHub staging environment + platform dashboards            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  PRODUCTION (Main branch merges)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Web (Primary):   Vercel Production (*.vercel.app or custom domain)  │   │
│  │ Web (Secondary): Railway Web (nx-monorepoweb-production.up.railway) │   │
│  │ API: Railway production (nx-monoreposerver-production.up.railway)   │   │
│  │ DB:  Supabase STAGING → PROD (when created)                         │   │
│  │ Config: GitHub production environment + platform dashboards         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Platform Mapping

### Supabase Projects

| Project | Ref | Region | Purpose | Used By |
|---------|-----|--------|---------|---------|
| **nx-monorepo-DEV** | `pjbnwtsufqpgsdlxydbo` | eu-north-1 | Local development | Developers only |
| **nx-monorepo-STAGING** | `uvhnqtzufwvaqvbdgcnn` | eu-north-1 | Staging + Prod (temp) | Staging, Production |
| **nx-monorepo-PROD** | TBD | TBD | Production (future) | Production |

### GitHub Environments

#### Our Environments (Secret Storage)

| Environment | Purpose | Secrets | Protection Rules |
|-------------|---------|---------|------------------|
| `staging` | Staging deployments | VERCEL_*, RAILWAY_* | None (auto-deploy) |
| `production` | Production deployments | VERCEL_*, RAILWAY_* | Optional approval |

#### Vercel Auto-Created Environments (Status Tracking)

Vercel automatically creates GitHub environments for deployment status reporting. These appear as:

| Environment | Created By | Purpose |
|-------------|------------|---------|
| `nx-monorepo / staging` | Vercel (auto) | Shows deployment status on PRs |
| `nx-monorepo / production` | Vercel (auto) | Shows deployment status for main branch |

**Important:** These Vercel-created environments:
- Are **separate** from our `staging`/`production` environments
- Contain no secrets (Vercel manages them internally)
- Should be **left alone** - deleting them just causes Vercel to recreate them
- Provide useful deployment status checks on GitHub PRs

**Do not confuse:**
- `staging` (ours, holds secrets) ≠ `nx-monorepo / staging` (Vercel's, status tracking)
- `production` (ours, holds secrets) ≠ `nx-monorepo / production` (Vercel's, status tracking)

### Vercel Configuration

| Deployment Type | Trigger | URL Pattern | Environment |
|-----------------|---------|-------------|-------------|
| Preview | PR / non-main push | `*.vercel.app` (unique per deploy) | Staging vars |
| Production | main branch | Primary domain or `project.vercel.app` | Production vars |

**Deployment Protection:** SSO protection is **disabled** for production to allow public access. Anyone with the URL can view the deployed application.

**Critical:** `NEXT_PUBLIC_API_URL` must be set to `/api` (not the Railway URL directly). This ensures client-side code uses the Next.js proxy, avoiding CORS errors. See [Environment Variables Matrix](./environment-variables-matrix.md) for details.

### Railway Configuration

#### API Server (`@nx-monorepo/server`)

| Environment | Purpose | URL | Deployment Trigger |
|-------------|---------|-----|-------------------|
| `staging` | Staging API | `nx-monoreposerver-staging.up.railway.app` | GitHub Actions |
| `production` | Production API | `nx-monoreposerver-production.up.railway.app` | Auto-deploy on merge to `main` |

#### Web Frontend (`@nx-monorepo/web`)

| Environment | Purpose | URL | Deployment Trigger |
|-------------|---------|-----|-------------------|
| `staging` | Staging Web (secondary) | `nx-monorepoweb-staging.up.railway.app` | GitHub Actions |
| `production` | Production Web (secondary) | `nx-monorepoweb-production.up.railway.app` | GitHub Actions |

**Configuration files:**
- API: `apps/server/railway.json` - Dockerfile path, health check (`/api/health`)
- Web: `apps/web/railway.json` - Dockerfile path, health check (`/health`)

**Key insight:** Railway web uses Docker builds (unlike Vercel's native builder). The `BACKEND_URL` must be passed as a Docker build ARG because Next.js bakes `NEXT_PUBLIC_*` and rewrite configuration at build time.

---

## CI Database Strategy

### Local PostgreSQL for CI Tests

**We use a local PostgreSQL container in CI, not Supabase.**

#### Rationale

| Factor | Local PostgreSQL | Supabase |
|--------|-----------------|----------|
| **Isolation** | ✅ Hermetic - parallel PRs can't conflict | ❌ Shared state between runs |
| **Speed** | ✅ ~100ms latency | ❌ ~500ms+ network latency |
| **Cost** | ✅ Free (GitHub Actions) | ❌ Consumes free tier limits |
| **Data Cleanliness** | ✅ Fresh every run | ❌ Test data accumulates |
| **Reliability** | ✅ No network dependencies | ❌ Network failures = CI failures |

#### How CI vs Local Tests Are Differentiated

The `load-database-env.ts` utility uses a simple check:

```typescript
// If DATABASE_URL already exists (CI, Docker, cloud), skip file loading
if (process.env.DATABASE_URL) {
  return; // Uses pre-set DATABASE_URL (local PostgreSQL in CI)
}
// Otherwise, load .env.test.local (STAGING Supabase for local tests)
```

| Context | `DATABASE_URL` pre-set? | Result |
|---------|-------------------------|--------|
| **CI** | ✅ Yes (workflow env) | Uses local PostgreSQL |
| **Local tests** | ❌ No | Loads `.env.test.local` → STAGING Supabase |
| **Local dev** | ❌ No | Loads `.env.development.local` → DEV Supabase |

This means local integration tests run against STAGING Supabase (for Supabase-specific behavior testing), while CI tests run against isolated local PostgreSQL (for speed and isolation).

#### Validation Layers

This creates a defense-in-depth testing strategy:

```
CI (Local PostgreSQL)        → Validates CODE works
                               - Unit tests
                               - Integration tests
                               - Type checking
                               - Linting

Staging (Supabase STAGING)   → Validates INFRASTRUCTURE works
                               - Supabase connection pooling
                               - RLS policies (if any)
                               - Prisma + Supavisor interaction
                               - Real network conditions

Production (Supabase STAGING/PROD) → Validates FULL PATH works
                               - Production configuration
                               - Production secrets
                               - Full deployment pipeline
```

---

## Naming Conventions

### Platform Name Mapping

| Concept | GitHub | Vercel | Railway | Supabase |
|---------|--------|--------|---------|----------|
| Pre-production | `staging` | Preview | `staging` | STAGING |
| Live production | `production` | Production | `production` | PROD |

**Note:** Vercel uses "Preview" for what we call "staging" - we accept this naming difference.

### File Naming

| Context | Local File | Connects To | Purpose |
|---------|------------|-------------|---------|
| Development | `.env.development.local` | DEV Supabase | Local development |
| Testing | `.env.test.local` | STAGING Supabase | Running local tests |
| Template | `.env.example` | (none) | Template for all variables |

> **Why `.env.test.local` connects to STAGING:**
>
> The file naming follows the `NODE_ENV` convention, not the database naming. When you run tests (`NODE_ENV=test`), the code automatically loads `.env.test.local`. This file happens to point to our STAGING Supabase instance because:
> 1. **Test isolation**: STAGING provides a shared, persistent database for integration testing
> 2. **CI parity**: Local tests can validate against the same schema that CI/staging uses
> 3. **Convention compliance**: Jest and other tools expect `NODE_ENV=test`
>
> The "test" in `.env.test.local` refers to the **execution context** (running tests), not the database environment. See `packages/test-utils/src/lib/load-database-env.ts` for the loading logic.

---

## Workflow Triggers

### Hybrid Deployment Approach

| Platform | Service | Environment | Trigger | Controlled By |
|----------|---------|-------------|---------|---------------|
| **Vercel** | Web | Preview | Auto-deploy on every push | Vercel platform |
| **Vercel** | Web | Production | Auto-deploy on merge to main | Vercel platform |
| **Railway** | API | staging | GitHub Actions on PR/push | `deploy-staging.yml` |
| **Railway** | API | production | Auto-deploy on merge to main | Railway (connected to `main`) |
| **Railway** | Web | staging | GitHub Actions on PR/push | `deploy-staging.yml` |
| **Railway** | Web | production | GitHub Actions after CI | `deploy-production.yml` |

**Rationale:**
- **Vercel Web:** Instant preview URLs are their sweet spot, very fast feedback. Primary frontend.
- **Railway API Staging:** Deploy via Actions because feature branches are dynamic - Railway can't connect to branches that don't exist yet.
- **Railway API Production:** Auto-deploy on main is safe because code was already tested on the feature branch before merge.
- **Railway Web:** Secondary frontend demonstrating deployment portability. Both staging and production deployed via GitHub Actions.

### deploy-staging.yml (Railway staging - API + Web)

```yaml
triggers:
  - pull_request to main (opened, synchronize, reopened)
  - push to non-main branches
  - workflow_dispatch (manual)

deploys_to:
  - Railway API: staging environment (@nx-monorepo/server)
  - Railway Web: staging environment (@nx-monorepo/web)

note: Vercel auto-deploys Preview on every push (not in this workflow)
```

### deploy-production.yml (Railway production - API + Web)

```yaml
triggers:
  - workflow_run after CI passes on main
  - workflow_dispatch (manual)

deploys_to:
  - Railway API: production environment (@nx-monorepo/server)
  - Railway Web: production environment (@nx-monorepo/web)

note: Railway API production auto-deploys from main; this workflow provides
      explicit control and deploys both API and Web together
```

---

## Secrets Management

### Secret Categories

| Category | Where Stored | Examples |
|----------|--------------|----------|
| **Platform API tokens** | GitHub Secrets (per environment) | VERCEL_TOKEN, RAILWAY_TOKEN |
| **Database credentials** | Platform dashboards | DATABASE_URL, DIRECT_URL |
| **Supabase keys** | Platform dashboards | SUPABASE_ANON_KEY, SERVICE_ROLE_KEY |
| **Observability** | Platform dashboards | NEXT_PUBLIC_SENTRY_DSN (web), SENTRY_DSN_API (server), SENTRY_AUTH_TOKEN |

### GitHub Secrets Structure

```
Repository level:
  - CLAUDE_CODE_OAUTH_TOKEN (existing)

staging environment:
  - VERCEL_TOKEN
  - VERCEL_ORG_ID
  - VERCEL_PROJECT_ID
  - RAILWAY_TOKEN

production environment:
  - VERCEL_TOKEN (can share with staging)
  - VERCEL_ORG_ID (can share with staging)
  - VERCEL_PROJECT_ID (can share with staging)
  - RAILWAY_TOKEN (can share with staging)
```

---

## Rollback Procedures

When a deployment succeeds but the application is broken (health checks pass but functionality fails):

### Vercel Rollback (Web)

**Via Dashboard (recommended):**
1. Go to [Vercel Dashboard](https://vercel.com) → Project → Deployments
2. Find the last known-good deployment
3. Click "..." menu → "Promote to Production" (for production) or view URL for preview

**Via CLI:**
```bash
# List recent deployments
vercel list

# Rollback to specific deployment
vercel rollback [deployment-url-or-id]
```

### Railway Rollback (API)

**Via Dashboard (recommended):**
1. Go to [Railway Dashboard](https://railway.app) → Project → Service
2. Click "Deployments" tab
3. Find the last known-good deployment
4. Click "..." menu → "Redeploy"

**Via Git revert:**
```bash
# If issue is in code, revert the commit
git revert <commit-hash>
git push origin main

# Railway production will auto-deploy the revert
# For staging, trigger workflow manually
```

### Emergency Procedures

| Scenario | Action |
|----------|--------|
| **API down** | Railway dashboard → Restart service OR rollback to previous deployment |
| **Web down** | Vercel dashboard → Rollback to previous deployment |
| **Database issue** | Check Supabase dashboard → Service health, consider point-in-time recovery |
| **Both down** | Rollback both platforms independently, API first (web depends on it) |

**Important:** Railway production auto-deploys from `main`. If you need to stop auto-deploys temporarily:
1. Railway Dashboard → Service → Settings → Build
2. Disconnect the branch temporarily
3. Fix the issue
4. Reconnect when ready

---

## Future: Production Database

When ready for production Supabase:

1. Create `nx-monorepo-PROD` project in Supabase
2. Run migrations: `prisma migrate deploy`
3. Update GitHub `production` environment secrets
4. Update Railway `production` environment variables
5. Update Vercel production environment variables
6. No code changes required

---

## Related Documentation

- [Environment Variables Matrix](./environment-variables-matrix.md) - Detailed variable traceability
- [Architecture Decisions - Epic 5](./architecture-decisions.md#epic-5-cicd-staging--production-deployment) - Platform selection rationale
- [Guides: Environment Setup](./guides/environment-setup.md) - Developer setup guide

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-08 | SM Agent (Rincewind) | Initial document created during Story 5.4 |
| 2025-12-10 | Claude Opus 4.5 | Added Railway web frontend (dual frontend architecture) per Story 5.9 |


