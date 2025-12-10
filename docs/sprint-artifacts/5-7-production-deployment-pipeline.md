# Story 5.7: Production Deployment Pipeline

Status: review

## Story

As a **DevOps engineer**,
I want **a production deployment pipeline**,
So that **merges to main automatically deploy to production**.

## Acceptance Criteria

1. **Given** staging deployment is validated
   **When** I configure production deployment workflow
   **Then** the workflow:
   - Triggers on push to main branch (after CI passes)
   - Deploys web to Vercel production
   - Deploys API to Railway production environment
   - Runs health checks after deployment
   - Reports deployment status

2. **Given** production workflow is configured
   **When** deployment runs
   **Then** workflow uses GitHub `production` environment secrets

3. **Given** production is deployed
   **When** checking database connectivity
   **Then** connects to Supabase STAGING (temporary until PROD exists)

4. **Given** deployment fails
   **When** rollback is needed
   **Then** rollback possible via Vercel/Railway dashboard

## Tasks / Subtasks

- [x] **Task 1: Create production deployment workflow** (AC: #1)
  - [x] Create `.github/workflows/deploy-production.yml`
  - [x] Configure trigger: push to main (after CI workflow)
  - [x] Add Vercel production deployment job *(via Vercel Git integration auto-deploy)*
  - [x] Add Railway production deployment job
  - [x] Add health check verification

- [x] **Task 2: Configure GitHub production environment** (AC: #2)
  - [x] Create/verify `production` environment in GitHub
  - [x] Add required secrets (VERCEL_*, RAILWAY_*)
  - [x] Configure environment protection rules (optional approval)

- [x] **Task 3: Configure Railway production environment** (AC: #3)
  - [x] Create/verify `production` environment in Railway
  - [x] Set DATABASE_URL to Supabase STAGING (temporary)
  - [x] Set all required environment variables
  - [x] Document temporary database mapping *(see docs/environment-strategy.md)*

- [x] **Task 4: Verify Vercel production** (AC: #1)
  - [x] Verify Vercel production settings
  - [x] Set BACKEND_URL to Railway production URL
  - [x] Verify environment variables

- [x] **Task 5: Document rollback procedures** (AC: #4)
  - [x] Document Vercel rollback via dashboard *(see docs/environment-strategy.md)*
  - [x] Document Railway rollback via dashboard *(see docs/environment-strategy.md)*
  - [x] Note: Full rollback documentation in Story 5.8

## Dev Notes

### Workflow Structure

```yaml
# deploy-production.yml
name: Deploy to Production

on:
  workflow_run:
    workflows: ["CI"]
    branches: [main]
    types: [completed]
  workflow_dispatch:

jobs:
  deploy-web:
    environment: production
    # Deploy to Vercel production

  deploy-api:
    environment: production
    # Deploy to Railway production

  post-deploy:
    # Health checks and notifications
```

### Environment Variables (Production)

**Vercel (Web):**
```
NEXT_PUBLIC_SUPABASE_URL     (STAGING project for now)
NEXT_PUBLIC_SUPABASE_ANON_KEY
BACKEND_URL                   (Railway production URL)
NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, etc.
```

**Railway (API):**
```
DATABASE_URL                  (STAGING pooler connection)
DIRECT_URL                    (STAGING direct connection)
SUPABASE_URL                  (STAGING project URL)
SUPABASE_SERVICE_ROLE_KEY     (STAGING service key)
SENTRY_DSN_API
NODE_ENV=production
CORS_ORIGIN                   (Vercel production URL)
```

### Temporary Database Strategy

Until Supabase PROD is created:
- Production deployment uses STAGING database
- Document this as technical debt
- When PROD exists, only change environment variables

### Dependencies

This story **MUST** be completed after:
- ✅ Story 5.6: Validate Staging Deployment

### Expected Outputs

1. `.github/workflows/deploy-production.yml`
2. Configured GitHub `production` environment
3. Configured Railway `production` environment
4. Basic rollback documentation

### References

- [Source: docs/epics.md#Story-5.7]
- Prerequisites: Story 5.6

## Dev Agent Record

### Context Reference

N/A - Story created during Epic 5 extension

### Agent Model Used

Claude Opus 4 (Dev Agent - Mort)

### Debug Log References

- Verified deploy-production.yml against story requirements
- Confirmed Vercel auto-deploy pattern (matches staging workflow)
- Verified Railway production environment variables
- Verified Vercel production environment variables
- Confirmed rollback procedures already documented in environment-strategy.md

### Completion Notes List

- Task 1: Production workflow exists with workflow_run trigger, Railway deployment, health checks
- Task 2: GitHub production environment configured with required secrets (user confirmed)
- Task 3: Railway production environment configured with all required variables
  - Fixed: Renamed SENTRY_DSN → SENTRY_DSN_API
  - Added: CORS_ORIGIN with Vercel production URL
- Task 4: Vercel production variables verified correct (NEXT_PUBLIC_API_URL=/api ✅)
- Task 5: Rollback procedures documented in docs/environment-strategy.md

### File List

- `.github/workflows/deploy-production.yml` (pre-existing, verified)
- `docs/environment-strategy.md` (pre-existing, contains rollback docs)
- `docs/environment-variables-matrix.md` (pre-existing, reference)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-08 | SM Agent (Rincewind) | Initial story creation during Epic 5 extension |
