# Story 5.4: Environment Strategy Documentation

Status: done

## Story

As a **DevOps engineer**,
I want **a formal environment strategy document**,
So that **all deployment environments are clearly defined and traceable**.

## Acceptance Criteria

1. **Given** the project has multiple deployment targets (local, staging, production)
   **When** I create the environment strategy document
   **Then** documentation covers:
   - Environment architecture (local dev → staging → production)
   - Platform mapping (Vercel, Railway, Supabase per environment)
   - Environment variable matrix (all vars, all platforms, all environments)
   - CI database strategy (local Postgres vs Supabase)
   - Naming conventions (staging vs preview)

2. **Given** the environment strategy is documented
   **When** I create the traceability matrix
   **Then** document is in `docs/environment-variables-matrix.md`

3. **Given** documentation is complete
   **When** reviewed against current infrastructure
   **Then** all platforms and environments are accounted for

## Tasks / Subtasks

- [x] **Task 1: Create environment strategy document** (AC: #1)
  - [x] Document environment architecture diagram
  - [x] Define platform mapping per environment
  - [x] Document CI database strategy rationale
  - [x] Define naming conventions

- [x] **Task 2: Create environment variables matrix** (AC: #2)
  - [x] Inventory all environment variables across all apps
  - [x] Map variables to platforms (Vercel, Railway, GitHub, local)
  - [x] Map variables to environments (local, staging, production)
  - [x] Note which are secrets vs public

- [x] **Task 3: Validate against current state** (AC: #3)
  - [x] Cross-reference with actual GitHub environments
  - [x] Cross-reference with Railway configuration
  - [x] Cross-reference with Vercel configuration
  - [x] Cross-reference with Supabase projects
  - [x] Document any gaps or misalignments (Story 5.5 will address)

## Dev Notes

### Environment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENVIRONMENT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LOCAL DEV                                                              │
│  ├─ Web: localhost:3000 (Next.js dev server)                           │
│  ├─ API: localhost:4000 (Express dev server)                           │
│  └─ DB:  Supabase DEV project                                          │
│                                                                         │
│  CI TESTING                                                             │
│  ├─ Web: N/A (build only)                                              │
│  ├─ API: N/A (build only)                                              │
│  └─ DB:  Local PostgreSQL container (isolated, fast)                   │
│                                                                         │
│  STAGING (PRs / Non-main branches)                                     │
│  ├─ Web: Vercel Preview URLs (*.vercel.app)                            │
│  ├─ API: Railway staging environment (*.up.railway.app)                │
│  └─ DB:  Supabase STAGING project (was TEST)                           │
│                                                                         │
│  PRODUCTION (Main branch merges)                                       │
│  ├─ Web: Vercel Production (custom domain or *.vercel.app)             │
│  ├─ API: Railway production environment (*.up.railway.app)             │
│  └─ DB:  Supabase STAGING (temporary) → PROD (when created)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Platform Mapping

| Environment | Web Platform | API Platform | Database |
|-------------|--------------|--------------|----------|
| Local Dev | localhost:3000 | localhost:4000 | Supabase DEV |
| CI Testing | N/A | N/A | Local PostgreSQL |
| Staging | Vercel Preview | Railway `staging` | Supabase STAGING |
| Production | Vercel Production | Railway `production` | Supabase STAGING → PROD |

### Supabase Project Mapping

| Project Name | Ref | Purpose |
|--------------|-----|---------|
| nx-monorepo-DEV | `pjbnwtsufqpgsdlxydbo` | Local development only |
| nx-monorepo-STAGING | `uvhnqtzufwvaqvbdgcnn` | Staging + Production (until PROD exists) |
| nx-monorepo-PROD | TBD | Future production database |

### CI Database Strategy

**Decision:** Use local PostgreSQL container for CI tests (not Supabase).

**Rationale:**
- **Isolation**: CI tests must be hermetic; parallel PRs shouldn't conflict
- **Speed**: Local container ~100ms vs ~500ms+ network latency
- **Cost**: No impact on Supabase free tier limits
- **Cleanliness**: Staging data stays clean for demos

**Infrastructure validation happens at deployment, not CI:**
- CI validates CODE (unit tests, type checking, linting)
- Staging deployment validates INFRASTRUCTURE (Supabase connection, RLS, etc.)
- Production deployment validates FULL PATH

### Naming Conventions

| Platform | Staging Name | Production Name | Notes |
|----------|--------------|-----------------|-------|
| GitHub Environments | `staging` | `production` | Our naming |
| Vercel | Preview | Production | Their naming (we adapt) |
| Railway | `staging` | `production` | Our naming |
| Supabase | STAGING | PROD | Our naming |

### Dependencies

This story **MUST** be completed after:
- ✅ Story 5.1: Select Staging Platform (COMPLETED)
- ✅ Story 5.2: Configure GitHub Actions Deployment Workflow (COMPLETED)
- ✅ Story 5.3: Configure Docker Containerization (COMPLETED)

### Expected Outputs

1. `docs/environment-strategy.md` - Full environment architecture document
2. `docs/environment-variables-matrix.md` - Traceability matrix
3. Updated sprint-status.yaml with new story structure

### References

- [Source: docs/epics.md#Story-5.4]
- [Source: docs/architecture-decisions.md#Epic-5]
- Prerequisites: Stories 5.1, 5.2, 5.3

## Dev Agent Record

### Context Reference

N/A - Story created during environment alignment work

### Agent Model Used

<!-- To be filled by implementing agent -->

### Debug Log References

<!-- To be filled during implementation -->

### Completion Notes List

1. Created comprehensive environment strategy document at `docs/environment-strategy.md`
2. Created detailed environment variables traceability matrix at `docs/environment-variables-matrix.md`
3. Updated architecture-decisions.md with CI database strategy rationale
4. Extended Epic 5 from 4 to 9 stories to include production pipeline
5. Extended Epic 6 from 5 to 7 stories to include mobile CI/CD
6. Story 5.5 (infrastructure alignment) queued next to clean up GitHub environments

### File List

**Created:**
- `docs/environment-strategy.md` - Full environment architecture document
- `docs/environment-variables-matrix.md` - Variable traceability matrix
- `docs/sprint-artifacts/5-4-environment-strategy-documentation.md` - This story
- `docs/sprint-artifacts/5-5-environment-infrastructure-alignment.md` - New story
- `docs/sprint-artifacts/5-7-production-deployment-pipeline.md` - New story
- `docs/sprint-artifacts/5-8-validate-production-deployment.md` - New story
- `docs/sprint-artifacts/6-6-mobile-cicd-pipeline-integration.md` - New story
- `docs/sprint-artifacts/6-7-validate-mobile-deployment-pipeline.md` - New story

**Modified:**
- `docs/epics.md` - Extended Epic 5 and Epic 6 with new stories
- `docs/architecture-decisions.md` - Updated Decision 4 with CI database strategy
- `docs/sprint-artifacts/sprint-status.yaml` - Updated with all new stories

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-08 | SM Agent (Rincewind) | Initial story creation during Epic 5 extension |
| 2025-12-08 | SM Agent (Rincewind) | Completed - Created environment-strategy.md and environment-variables-matrix.md |

