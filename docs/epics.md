# AI-Native Nx Monorepo Template - Epic Breakdown

**Author:** Jørn (BMAD create-epics-and-stories workflow)
**Date:** 2025-12-03
**Project Level:** Enterprise-Grade Template
**Target Scale:** MVP (Stages 0-11) + Task App PoC (Phase 2)

---

## Overview

This document provides the complete epic and story breakdown for the AI-Native Nx Monorepo Template, decomposing the requirements from the [PRD](./PRD.md) into implementable stories.

**Living Document Notice:** This is the initial version created from PRD, Architecture, and existing roadmap stages.

**Source Documents:**
- ✅ **PRD.md** - 28 functional requirements across 6 categories
- ✅ **architecture.md** - Technical decisions, API contracts, data models
- ❌ **UX Design.md** - Not applicable (infrastructure template, not UI product)

**Context Notes:**
- This is a **brownfield project** with Phase 1 Stages 0-5 already completed
- Existing roadmap.md contains detailed stage breakdowns being ported to BMAD format
- Epics are organized by **user value**, not technical layers

---

## Functional Requirements Inventory

### Foundation & Architecture (FR1-FR6)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR1 | Nx workspace configuration with multi-app, multi-package builds | MVP | ✅ Complete |
| FR2 | Walking skeleton (health check) executes successfully after clone | MVP | ✅ Complete |
| FR3 | Shared package boundaries follow unidirectional dependency flow | MVP | ✅ Complete |
| FR4 | TypeScript configurations enforce strict mode and path aliases | MVP | ✅ Complete |
| FR5 | Documentation synchronized with template behavior for AI agents | MVP | Partial |
| FR6 | Workspace-level scripts for common operations | MVP | ✅ Complete |

### Type Safety & Data Layer (FR7-FR11)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR7 | Zod schemas as single source of truth for API contracts | MVP | ✅ Complete |
| FR8 | Prisma schema manages Supabase PostgreSQL with conventions | MVP | ✅ Complete |
| FR9 | API client factory exposes type-safe helpers | MVP | ✅ Complete |
| FR10 | Supabase client factories for browser and server contexts | MVP | ✅ Complete |
| FR11 | Environment configuration validated at startup | MVP | ✅ Complete |

### Quality & Governance (FR12-FR15)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR12 | Husky and lint-staged run quality gates on every commit | MVP | ✅ Complete |
| FR13 | CI pipeline executes lint, test, build, typecheck, e2e | MVP | Partial |
| FR14 | TDD enforced with co-located tests and coverage reporting | MVP | ✅ Complete |
| FR15 | Nx Cloud integration for remote caching | MVP | Partial |

### DevOps, Observability & Secrets (FR16-FR19)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR16 | GitHub Actions manages secrets and deploys to staging | MVP | Pending |
| FR17 | Observability platform captures errors and performance | MVP | Pending |
| FR18 | Docker containerization for consistent deployment | MVP | Pending |
| FR19 | CI/CD deploys to lightweight production platforms | PoC | Pending |

### Multi-Channel & Mobile (FR20-FR22)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR20 | Mobile app shares API client, types, and auth patterns | MVP | Pending |
| FR21 | Mobile walking skeleton mirrors web experience | MVP | Pending |
| FR22 | Mobile development documentation | MVP | Pending |

### Task App PoC (FR23-FR28)

| FR ID | Description | Phase | Status |
|-------|-------------|-------|--------|
| FR23 | Task/todo CRUD with validation and optimistic updates | PoC | Pending |
| FR24 | Authenticated sessions gate routes and endpoints | PoC | Pending |
| FR25 | PoC uses shared packages without dependency violations | PoC | Pending |
| FR26 | Production deployments with rollback procedures | PoC | Pending |
| FR27 | Test coverage reaches ≥80% | PoC | Pending |
| FR28 | Observability dashboards track PoC-specific flows | PoC | Pending |

---

## FR Coverage Map

| Epic | FRs Covered | Phase |
|------|-------------|-------|
| Epic 1: Foundation Complete | FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR14 | MVP (Done) |
| Epic 2: E2E Testing & Quality Gates | FR13, FR14, FR15 | MVP |
| Epic 3: Observability Baseline | FR17 | MVP |
| Epic 4: Authentication Infrastructure | FR10 (completion) | MVP |
| Epic 5: CI/CD Staging & Production Deployment | FR16, FR18, FR19 | MVP |
| Epic 6: Mobile Walking Skeleton | FR20, FR21, FR22 | MVP |
| Epic 7: MVP Documentation | FR5 | MVP |
| Epic 8: Task Data Model & CRUD | FR23, FR25 | PoC |
| Epic 9: User Authentication Flows | FR24 | PoC |
| Epic 10: Web Task Management | FR23 | PoC |
| Epic 11: Mobile Task Management | FR20, FR23 | PoC |
| Epic 12: Quality Gate Enforcement | FR27 | PoC |
| Epic 13: Production Deployment | FR19, FR26 | PoC |
| Epic 14: Production Observability | FR28 | PoC |

---

## Epic Structure Plan

### Design Principles Applied

1. **User-Value First**: Each epic enables users (developers/orchestrators) to accomplish something meaningful
2. **Leverage Architecture**: Builds upon technical decisions from architecture.md
3. **Incremental Delivery**: Each epic is independently valuable
4. **Logical Dependencies**: Dependencies flow naturally based on infrastructure requirements

### Phase 1: MVP Epics (Stages 6-11)

> **Note:** Epic 1 (Foundation & Walking Skeleton) covers Stages 0-5 and is already **COMPLETE**.
> The stories below cover remaining MVP work.

---

## Epic 1: Foundation & Walking Skeleton ✅ COMPLETE

**User Value Statement:** A new developer can clone the repository, run `pnpm install`, and have a working full-stack application (web → API → server → database) within 30 minutes.

**Status:** ✅ Complete (Stages 0-5)

**PRD Coverage:** FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR14

**What Was Delivered:**
- Nx workspace with web app, server app, and 4 shared packages
- Walking skeleton health check feature working end-to-end
- Type-safe API client with generated OpenAPI types
- Prisma + Supabase database layer
- Husky pre-commit hooks with lint-staged
- Jest testing infrastructure with co-located tests

**Technical Context:** See `docs/roadmap.md` Stages 0-5 for detailed completion notes.

---

## Epic 2: E2E Testing & Quality Gates

**User Value Statement:** Developers have confidence that their changes don't break user-facing functionality through comprehensive E2E tests and automated quality enforcement.

**PRD Coverage:** FR13, FR14, FR15

**Technical Context from Architecture:**
- Playwright for E2E browser testing (architecture.md Section 4)
- E2E tests in `apps/web-e2e/src/` directory
- CI pipeline integration for automated E2E execution
- Nx Cloud for remote caching and distributed execution

**Dependencies:** Epic 1 complete (walking skeleton available for testing)

### Story 2.1: Evaluate TestSprite MCP for E2E Testing

As a development team evaluating testing tools,
I want to trial TestSprite MCP with the health check flow,
So that I can make an informed decision about our E2E testing approach.

**Acceptance Criteria:**

**Given** the walking skeleton is running (server + web)
**When** I configure TestSprite MCP integration
**Then** I can execute test scenarios against the `/health` page

**And** I can compare the experience with native Playwright setup
**And** I document findings including: setup complexity, execution speed, debugging experience, CI integration

**Prerequisites:** None (Epic 1 complete)

**Technical Notes:**
- Research TestSprite MCP integration requirements
- Trial with existing health check flow
- Compare with Playwright setup in `apps/web-e2e/`
- Document decision in `docs/architecture-decisions.md`

---

### Story 2.2: E2E Testing Decision and Strategy

As a technical architect,
I want to document our E2E testing strategy decision,
So that the team has clear guidance on testing approach.

**Acceptance Criteria:**

**Given** TestSprite evaluation is complete
**When** I analyze findings against project requirements
**Then** I select: Playwright, TestSprite, or hybrid approach

**And** decision is documented in `docs/architecture-decisions.md` with rationale
**And** any configuration changes are applied to the repository

**Prerequisites:** Story 2.1 complete

**Technical Notes:**
- Consider: maintenance overhead, CI/CD integration, debugging experience
- Document rejected alternatives with rationale
- Update CI workflow if approach changes

---

### Story 2.3: Write E2E Tests for Walking Skeleton

As a developer validating the walking skeleton,
I want comprehensive E2E tests for the health check flow,
So that I can verify end-to-end functionality automatically.

**Acceptance Criteria:**

**Given** E2E testing strategy is decided
**When** I write E2E tests using the chosen approach
**Then** the following scenarios are covered:

1. **Given** the `/health` page is loaded
   **When** initial data exists in database
   **Then** health check list displays with correct data

2. **Given** the `/health` page is loaded
   **When** I click the "Ping" button
   **Then** a new health check record appears in the list

3. **Given** I have created a health check
   **When** I refresh the page
   **Then** the data persists (proving database persistence)

4. **Given** the API server is not running
   **When** I navigate to `/health`
   **Then** I see a clear error message

**And** all E2E tests pass: `pnpm exec nx run web-e2e:e2e`

**Prerequisites:** Story 2.2 complete

**Technical Notes:**
- Tests in `apps/web-e2e/src/` (Playwright) or configured TestSprite location
- Include page object pattern for maintainability
- Add to CI pipeline verification

---

### Story 2.4: Optimize Nx Cloud Remote Caching

As a development team,
I want Nx Cloud remote caching working efficiently,
So that build times are minimized across team members and CI.

**Acceptance Criteria:**

**Given** Nx Cloud is configured in `nx.json`
**When** a developer runs a build after another developer
**Then** cache hit rate exceeds 50% (verifiable via Nx Cloud dashboard)

**And** CI pipeline leverages remote cache
**And** Nx Cloud setup is documented in README or docs

**Prerequisites:** None

**Technical Notes:**
- Verify `nxCloudId` in `nx.json` is correct
- Test cache propagation between local dev and CI
- Document cache invalidation patterns

---

## Epic 3: Observability Baseline

**User Value Statement:** The team can track errors and performance issues across all application surfaces, enabling proactive debugging and monitoring.

**PRD Coverage:** FR17

**Technical Context from Architecture:**
- Sentry for error tracking and performance monitoring
- Integration points: server (Express), web (Next.js), future mobile (React Native)
- Credentials managed through environment secrets

**Dependencies:** Epic 1 complete (applications exist to instrument)

### Story 3.1: Set Up Sentry Project and Configuration

As an operations team member,
I want Sentry configured for the project,
So that we have centralized error tracking infrastructure.

**Acceptance Criteria:**

**Given** I have Sentry account access
**When** I create a project for this monorepo
**Then** I have DSN credentials for server, web, and mobile

**And** credentials are added to `.env.example` template
**And** GitHub Actions secrets are configured for CI/CD environments

**Prerequisites:** None

**Technical Notes:**
- Create Sentry project in appropriate organization
- Generate DSNs for each application type
- Document in `docs/environment-setup.md`

---

### Story 3.2: Integrate Sentry with Express Server

As a backend developer,
I want Sentry error tracking in the Express server,
So that server-side errors are captured and reported.

**Acceptance Criteria:**

**Given** Sentry project exists with server DSN
**When** I integrate `@sentry/node` into `apps/server`
**Then** runtime errors are captured and appear in Sentry dashboard

**And** performance transactions are tracked
**And** environment (staging/production) is correctly tagged
**And** source maps are uploaded for stack trace resolution

**Prerequisites:** Story 3.1 complete

**Technical Notes:**
- Install: `pnpm add @sentry/node --filter @nx-monorepo/server`
- Initialize early in `apps/server/src/main.ts`
- Configure error handler middleware
- Test with intentional error throw

---

### Story 3.3: Integrate Sentry with Next.js Web App

As a frontend developer,
I want Sentry error tracking in the Next.js web app,
So that client-side errors are captured and reported.

**Acceptance Criteria:**

**Given** Sentry project exists with web DSN
**When** I integrate `@sentry/nextjs` into `apps/web`
**Then** client-side errors are captured and appear in Sentry dashboard

**And** server-side rendering errors are captured
**And** performance metrics (Core Web Vitals) are tracked
**And** source maps are uploaded for stack trace resolution

**Prerequisites:** Story 3.1 complete

**Technical Notes:**
- Install: `pnpm add @sentry/nextjs --filter @nx-monorepo/web`
- Run Sentry wizard or configure manually
- Configure `sentry.client.config.ts` and `sentry.server.config.ts`
- Update `next.config.js` with Sentry plugin

---

### Story 3.4: Verify Observability End-to-End

As an operations team member,
I want to verify that error tracking works across all surfaces,
So that I have confidence in our observability infrastructure.

**Acceptance Criteria:**

**Given** Sentry is integrated in server and web
**When** I trigger intentional errors in each application
**Then** errors appear in Sentry dashboard within 1 minute

**And** errors include: stack trace, environment, user context (if available)
**And** performance transactions show in dashboard
**And** documentation exists for observability setup and dashboards

**Prerequisites:** Stories 3.2 and 3.3 complete

**Technical Notes:**
- Create test endpoint that throws error
- Verify correlation between client and server errors
- Document alerting configuration (future enhancement)

---

## Epic 4: Authentication Infrastructure Wiring

**User Value Statement:** Authentication infrastructure is in place and ready for application-level implementation in Phase 2, reducing friction when building auth flows.

**PRD Coverage:** FR10 (completion for server context)

**Technical Context from Architecture:**
- Supabase Auth for identity management
- Server middleware patterns for protected routes
- Client factories for browser (SSR) and server contexts
- JWT token validation on API endpoints

**Dependencies:** Epic 1 complete (Supabase client factories exist)

### Story 4.1: Create Server Auth Middleware Structure

As a backend developer,
I want auth middleware patterns in the server,
So that I can easily protect API endpoints in Phase 2.

**Acceptance Criteria:**

**Given** the Express server exists
**When** I create auth middleware in `apps/server/src/middleware/`
**Then** I have reusable middleware functions for:
  - Extracting JWT from Authorization header
  - Validating token with Supabase
  - Attaching user context to request

**And** middleware is documented with usage examples
**And** middleware is NOT applied to routes (just prepared for Phase 2)

**Prerequisites:** None

**Technical Notes:**
- Create `apps/server/src/middleware/auth.ts`
- Use Supabase admin client for token verification
- Export `requireAuth` middleware function
- Document in code comments and README

---

### Story 4.2: Configure Supabase Auth Project Settings

As a system administrator,
I want Supabase Auth configured for the project,
So that authentication is ready for user implementation.

**Acceptance Criteria:**

**Given** Supabase project exists
**When** I configure Auth settings
**Then** the following are enabled/configured:
  - Email/password authentication
  - Email confirmation (optional, can disable for dev)
  - JWT expiration settings
  - Redirect URLs for web app

**And** settings are documented in `docs/environment-setup.md`

**Prerequisites:** None

**Technical Notes:**
- Configure in Supabase dashboard → Authentication → Settings
- Document provider setup for future OAuth expansion
- Note any RLS policies that interact with auth

---

### Story 4.3: Create Web Auth State Management Patterns

As a frontend developer,
I want auth state management patterns for Next.js,
So that I have a foundation for building auth UI in Phase 2.

**Acceptance Criteria:**

**Given** Supabase client factories exist
**When** I create auth utilities in `apps/web`
**Then** I have documented patterns for:
  - Getting current session/user
  - Subscribing to auth state changes
  - Protecting routes with middleware

**And** patterns are documented (not full implementation)
**And** example code exists but is not wired into routes

**Prerequisites:** None

**Technical Notes:**
- Create `apps/web/src/lib/auth.ts` with utility exports
- Document Next.js 15 App Router patterns (Server Components, Route Handlers)
- Reference `@nx-monorepo/supabase-client` factories

---

### Story 4.4: Validate Auth Infrastructure Readiness

As a technical lead,
I want to verify auth infrastructure is ready for Phase 2,
So that authentication work can proceed without infrastructure blockers.

**Acceptance Criteria:**

**Given** all auth infrastructure stories are complete
**When** I review the infrastructure
**Then** I can document:
  - What is in place (middleware, patterns, configuration)
  - What needs application-level implementation (UI, flows, protected routes)
  - Any gaps or blockers identified

**And** validation notes are added to `docs/roadmap.md` or architecture docs

**Prerequisites:** Stories 4.1, 4.2, 4.3 complete

**Technical Notes:**
- This is a validation/documentation story, not implementation
- Identify any deferred work for Phase 2 planning

---

## Epic 5: CI/CD Multi-Platform Deployment

**User Value Statement:** Code changes automatically deploy to multiple platforms, demonstrating deployment portability with dual frontend architecture (Vercel + Railway) pointing to a single Railway backend.

**PRD Coverage:** FR16, FR18, FR19

**Technical Context from Architecture:**
- **Dual Frontend Architecture**: Both Vercel AND Railway host the web frontend, both pointing to the same Railway backend
- **Hybrid Deployment Triggers**: Vercel auto-deploys on push; Railway controlled via GitHub Actions
- **Single Backend**: Railway hosts the Express API for both frontends
- Environment strategy documentation and traceability
- Health check endpoints for deployment validation

**Architecture:**
```
┌────────────────────┐     ┌────────────────────┐
│  Vercel Frontend   │     │  Railway Frontend  │
│  (auto-deploy)     │     │  (controlled)      │
└─────────┬──────────┘     └─────────┬──────────┘
          │    Same BACKEND_URL      │
          └────────────┬─────────────┘
                       ▼
            ┌──────────────────┐
            │  Railway Backend │
            └────────┬─────────┘
                     ▼
            ┌──────────────────┐
            │ Supabase STAGING │
            └──────────────────┘
```

**Dependencies:** Epic 1 complete, Epic 3 recommended (observability for staging/production)

### Story 5.1: Select Staging Platform

As a DevOps engineer,
I want to select a staging deployment platform,
So that we have a home for our deployed application.

**Acceptance Criteria:**

**Given** the project requirements (Next.js + Express + PostgreSQL)
**When** I evaluate lightweight hosting options
**Then** I select a platform with documented rationale

**And** evaluation considers: Vercel, Railway, Render, Fly.io
**And** decision is documented in `docs/architecture-decisions.md`

**Prerequisites:** None

**Technical Notes:**
- Consider: ease of setup, cost, Supabase integration, CI/CD support
- Document rejected alternatives
- Verify platform supports both Next.js and Express deployments

---

### Story 5.2: Configure GitHub Actions Deployment Workflow

As a DevOps engineer,
I want a GitHub Actions workflow for staging deployment,
So that merges to main trigger automatic deployments.

**Acceptance Criteria:**

**Given** staging platform is selected
**When** I create/update `.github/workflows/deploy-staging.yml`
**Then** the workflow:
  - Triggers on push to main branch
  - Runs after CI checks pass
  - Deploys to staging environment
  - Reports deployment status

**And** workflow uses GitHub environment secrets (not hardcoded)
**And** deployment is verified via health check endpoint

**Prerequisites:** Story 5.1 complete

**Technical Notes:**
- May need platform-specific CLI or action
- Configure environment protection rules
- Add deployment status badge to README

---

### Story 5.3: Configure Docker Containerization

As a DevOps engineer,
I want Docker configuration for the applications,
So that deployments are consistent and portable.

**Acceptance Criteria:**

**Given** the server and web applications exist
**When** I create Dockerfile(s) for deployment
**Then** I can build production-ready containers locally

**And** containers include only production dependencies
**And** health check endpoints respond correctly in container
**And** docker-compose or build scripts are documented

**Prerequisites:** None

**Technical Notes:**
- Multi-stage builds for optimized image size
- Consider: separate containers vs monolithic
- Document build commands in README

---

### Story 5.4: Environment Strategy Documentation

As a DevOps engineer,
I want a formal environment strategy document,
So that all deployment environments are clearly defined and traceable.

**Acceptance Criteria:**

**Given** the project has multiple deployment targets (local, staging, production)
**When** I create the environment strategy document
**Then** documentation covers:
  - Environment architecture (local dev → staging → production)
  - Platform mapping (Vercel, Railway, Supabase per environment)
  - Environment variable matrix (all vars, all platforms, all environments)
  - CI database strategy (local Postgres vs Supabase)
  - Naming conventions (staging vs preview)

**And** document is in `docs/environment-strategy.md`
**And** traceability matrix is in `docs/environment-variables-matrix.md`

**Prerequisites:** Stories 5.1, 5.2, 5.3 complete

**Technical Notes:**
- Formalizes decisions made during Stories 5.1-5.3
- Enables consistent environment management across platforms
- Reference for future infrastructure work

---

### Story 5.5: Environment Infrastructure Alignment

As a DevOps engineer,
I want infrastructure aligned with the environment strategy,
So that all platforms match our documented architecture.

**Acceptance Criteria:**

**Given** environment strategy is documented
**When** I align infrastructure
**Then** the following are configured:
  - GitHub environments: `staging`, `production` (cruft removed)
  - Railway environments: `staging`, `production`
  - Vercel: Preview (staging) and Production configured
  - Supabase: DEV renamed if needed, STAGING (was TEST), PROD (future)

**And** GitHub secrets are in correct environments
**And** deploy workflows reference correct environments

**Prerequisites:** Story 5.4 complete

**Technical Notes:**
- Delete unused auto-created GitHub environments (Railway placeholders, empty environments)
- Keep Vercel status-tracking environments (`nx-monorepo / staging`, `nx-monorepo / production`) - they are separate from our secret-holding environments
- Create proper environment protection rules
- Update workflow files to match environment naming

---

### Story 5.6: Validate Staging Deployment

As a stakeholder,
I want to verify the staging environment works correctly,
So that I can demo and validate features.

**Acceptance Criteria:**

**Given** staging deployment is configured (Stories 5.2, 5.3, 5.5)
**When** a PR is created or non-main branch is pushed
**Then** within 10 minutes:
  - Application is deployed to staging URL
  - Walking skeleton health check works
  - Observability captures staging events (if Epic 3 complete)

**And** staging URL is documented in README
**And** environment-specific configuration is correct (API URLs, etc.)

**Prerequisites:** Stories 5.2, 5.3, 5.5 complete

**Technical Notes:**
- Manual validation checklist
- Document any staging-specific quirks
- Verify database connectivity to Supabase STAGING

---

### Story 5.7: Production Deployment Pipeline

As a DevOps engineer,
I want a production deployment pipeline,
So that merges to main automatically deploy to production.

**Acceptance Criteria:**

**Given** staging deployment is validated
**When** I configure production deployment workflow
**Then** the workflow:
  - Triggers on push to main branch (after CI passes)
  - Deploys web to Vercel production
  - Deploys API to Railway production environment
  - Runs health checks after deployment
  - Reports deployment status

**And** workflow uses GitHub `production` environment secrets
**And** database points to Supabase STAGING (temporary until PROD exists)
**And** rollback is possible via Vercel/Railway dashboard

**Prerequisites:** Story 5.6 complete

**Technical Notes:**
- Create `deploy-production.yml` workflow (separate from staging)
- Configure environment protection rules (approval if desired)
- Document temporary STAGING→PROD database mapping

---

### Story 5.8: Validate Production Deployment

As a stakeholder,
I want to verify the production environment works correctly,
So that I have confidence in the full CI/CD pipeline.

**Acceptance Criteria:**

**Given** production deployment is configured
**When** a PR is merged to main
**Then** within 10 minutes:
  - Application is deployed to production URL
  - Walking skeleton health check works
  - Observability captures production events

**And** production URLs are documented in README
**And** deployment badge shows status

**Prerequisites:** Story 5.7 complete

**Technical Notes:**
- Execute full validation checklist
- Document any production-specific quirks
- Verify end-to-end flow: web → API → database

---

### Story 5.9: Configure Railway Web Frontend

As a DevOps engineer,
I want the web frontend deployed to Railway,
So that we demonstrate dual frontend architecture with deployment portability.

**Acceptance Criteria:**

**Given** Vercel frontend is validated (Story 5.8)
**When** I deploy the web frontend to Railway
**Then**:
  - Railway web service uses `apps/web/Dockerfile`
  - Environment variables point to same Railway backend
  - CORS on backend accepts both Vercel and Railway origins

**And** both frontends (Vercel + Railway) can access the same API
**And** deployment workflow updated for Railway web

**Prerequisites:** Story 5.8 complete, `apps/web/Dockerfile` exists

**Technical Notes:**
- Uses existing Docker standalone output (`output: 'standalone'` in next.config.js)
- Both frontends use same `BACKEND_URL` pointing to Railway API
- Backend CORS must include both frontend origins
- No code changes to frontend - just deployment configuration

---

### Story 5.10: Validate Dual Frontend Architecture

As a stakeholder,
I want to verify both frontends work correctly,
So that I have confidence in deployment portability.

**Acceptance Criteria:**

**Given** both frontends are deployed (Vercel + Railway)
**When** I test each frontend
**Then**:
  - Vercel frontend: health check works end-to-end
  - Railway frontend: health check works end-to-end
  - Both create records in same database

**And** documentation includes both frontend URLs
**And** architecture decision updated to reflect dual frontend (not two-target choice)

**Prerequisites:** Story 5.9 complete

**Technical Notes:**
- Manual validation of both paths
- Document any differences in performance or behavior
- Update README with both staging URLs

---

## Epic 6: Mobile Walking Skeleton

**User Value Statement:** Mobile app validates that shared business logic works identically across platforms, proving cross-platform code sharing.

**PRD Coverage:** FR20, FR21, FR22

**Technical Context from Architecture:**
- React Native with Expo for mobile development
- Shares `@nx-monorepo/api-client` and `@nx-monorepo/schemas`
- Same API endpoints as web
- Expo managed workflow

> **📋 Design Decisions Document:** See `docs/sprint-artifacts/epic-6-design-decisions.md` for architectural decisions made during technical contexting (2025-12-05). Key decisions:
> - **Expo SDK 53** (stable) - React 19.0.0 matches web exactly
> - **Expo Router** - File-based routing (officially recommended)
> - **Walking skeleton approach** - Use out-of-box scaffolding, no custom navigation patterns
>
> **⚠️ Post-Implementation:** Formalize validated decisions into `docs/architecture.md`, `docs/tech-stack.md`, and memory files.

**Dependencies:** Epic 1 complete, Epic 5 recommended (staging for mobile testing)

### Story 6.1: Generate Expo Mobile Application

As a mobile developer,
I want an Expo mobile app in the monorepo,
So that I can build cross-platform mobile experiences.

**Acceptance Criteria:**

**Given** the Nx workspace exists
**When** I generate the mobile app with `pnpm exec nx g @nx/expo:app mobile --directory=apps/mobile`
**Then** the app is created with correct structure

**And** `pnpm exec nx run mobile:start` launches Expo dev server
**And** `pnpm exec nx run mobile:lint` passes
**And** `pnpm exec nx run mobile:test` passes (default tests)

**Prerequisites:** None

**Technical Notes:**
- **SDK Version:** Use Expo SDK 53 (stable) with React 19.0.0 (see `epic-6-design-decisions.md`)
- **Nx Generation:** Primary: `pnpm exec nx g @nx/expo:app mobile --directory=apps/mobile`
- **Fallback:** If @nx/expo doesn't support SDK 53, use `create-expo-app` and integrate manually
- Follow `docs/memories/post-generation-checklist.md` after generation
- Verify path aliases work for shared packages
- Configure Metro for monorepo support (see `epic-6-design-decisions.md` D4)
- Update `.github/workflows/ci.yml` if needed

---

### Story 6.2: Configure API Client for Mobile

As a mobile developer,
I want the API client working in the mobile app,
So that I can make type-safe API calls from mobile.

**Acceptance Criteria:**

**Given** mobile app is generated
**When** I import `@nx-monorepo/api-client`
**Then** I can configure the client with mobile-appropriate base URL

**And** TypeScript autocomplete works for API endpoints
**And** API calls work against local development server
**And** networking configuration is documented (localhost on simulators)

**Prerequisites:** Story 6.1 complete

**Technical Notes:**
- Mobile localhost is different (10.0.2.2 for Android emulator)
- May need environment configuration for API URL
- Document Expo dev client setup for testing

---

### Story 6.3: Implement Mobile Health Check Screen

As a mobile developer,
I want a health check screen mirroring the web experience,
So that I can validate end-to-end mobile connectivity.

**Acceptance Criteria:**

**Given** API client is configured
**When** I create a health check screen
**Then** the screen:
  - Displays list of health checks from database
  - Has a "Ping" button that creates new health check
  - Shows new record after ping (mirrors web behavior)

**And** screen works on iOS simulator
**And** screen works on Android emulator
**And** data created on mobile appears on web (cross-platform sync)

**Prerequisites:** Story 6.2 complete

**Technical Notes:**
- Use React Native components (FlatList, Button, etc.)
- Style with appropriate mobile patterns
- Test against local server or staging

---

### Story 6.4: Validate Cross-Platform Sync

As a product owner,
I want to verify data syncs between web and mobile,
So that I have confidence in cross-platform functionality.

**Acceptance Criteria:**

**Given** both web and mobile apps are running
**When** I create a health check on web
**Then** refreshing mobile shows the new record

**When** I create a health check on mobile
**Then** refreshing web shows the new record

**And** validation is documented with screenshots or recording
**And** any sync issues are documented as known limitations

**Prerequisites:** Story 6.3 complete

**Technical Notes:**
- This is manual validation
- Document any polling/refresh patterns needed
- Note any latency observations

---

### Story 6.5: Document Mobile Development Setup

As a new mobile developer,
I want documentation for mobile development,
So that I can get started quickly.

**Acceptance Criteria:**

**Given** mobile walking skeleton is complete
**When** I create/update mobile documentation
**Then** documentation covers:
  - Simulator/emulator setup (iOS and Android)
  - Expo commands and workflow
  - Networking configuration for local dev
  - Running against staging API

**And** documentation is in `docs/` or apps/mobile/README.md
**And** new developer can follow docs to run mobile app

**Prerequisites:** Stories 6.1-6.4 complete

**Technical Notes:**
- Include common troubleshooting
- Document Expo Go vs dev client
- Reference Supabase mobile auth patterns (for Phase 2)

---

### Story 6.6: Mobile CI/CD Pipeline Integration

As a DevOps engineer,
I want the mobile app integrated into the CI/CD pipeline,
So that mobile builds and tests run automatically.

**Acceptance Criteria:**

**Given** mobile app is generated and working locally
**When** I configure CI/CD for mobile
**Then** the following run on PR/push:
  - Mobile lint: `pnpm exec nx run mobile:lint`
  - Mobile test: `pnpm exec nx run mobile:test`
  - Mobile type check: included in typecheck target

**And** CI workflow is updated to include mobile targets
**And** EAS Build is configured for preview builds (optional)
**And** mobile-specific secrets are documented

**Prerequisites:** Stories 6.1-6.4 complete, Epic 5 CI/CD infrastructure

**Technical Notes:**
- Update `.github/workflows/ci.yml` with mobile targets
- Consider EAS Build for actual mobile builds (staging/production)
- Document Expo credentials management
- Mobile doesn't need separate deployment workflow (EAS handles it)

---

### Story 6.7: Validate Mobile Deployment Pipeline

As a stakeholder,
I want to verify mobile CI/CD works correctly,
So that mobile app quality is maintained automatically.

**Acceptance Criteria:**

**Given** mobile CI/CD is configured
**When** a PR touches mobile code
**Then** mobile lint, test, and typecheck run automatically

**And** failures block PR merge
**And** EAS Build can be triggered manually or automatically (if configured)
**And** mobile CI is documented in README or docs

**Prerequisites:** Story 6.6 complete

**Technical Notes:**
- Manual validation of CI pipeline
- Test with intentional lint/test failure
- Document EAS Build workflow if configured

---

## Epic 7: MVP Documentation

**User Value Statement:** Documentation is comprehensive and AI-agent accessible, enabling new developers and AI coding agents to understand and work with the codebase effectively.

**PRD Coverage:** FR5

**Technical Context:**
- Documentation in `docs/` directory
- CLAUDE.md for AI agent instructions
- Architecture decisions in `docs/architecture-decisions.md`
- Patterns in `docs/memories/`

**Dependencies:** All previous epics complete (documents completed work)

### Story 7.1: Document Walking Skeleton Architecture

As a new developer,
I want architecture documentation for the walking skeleton,
So that I understand how the layers connect.

**Acceptance Criteria:**

**Given** the walking skeleton is complete
**When** I create `docs/walking-skeleton.md`
**Then** documentation includes:
  - Architecture diagram showing data flow
  - Component responsibilities (web, server, database, packages)
  - How type safety flows end-to-end
  - Why this architecture was chosen

**And** diagram is included (Mermaid or image)

**Prerequisites:** None

**Technical Notes:**
- Can extract from existing documentation
- Keep focused on walking skeleton, not full architecture
- Reference other docs for deep dives

---

### Story 7.2: Create Setup and Running Guide

As a new developer,
I want a clear setup guide,
So that I can get the project running quickly.

**Acceptance Criteria:**

**Given** someone has cloned the repository
**When** they follow the setup guide
**Then** they can:
  - Install dependencies
  - Configure environment variables
  - Run the full stack locally
  - Execute the test suite
  - See the walking skeleton working

**And** guide is in README.md or `docs/quickstart.md`
**And** estimated setup time is under 30 minutes

**Prerequisites:** None

**Technical Notes:**
- Include prerequisites (Node, pnpm versions)
- Reference `docs/environment-setup.md` for env vars
- Add troubleshooting section

---

### Story 7.3: Compile Troubleshooting Guide

As a developer encountering issues,
I want a troubleshooting guide,
So that I can resolve common problems quickly.

**Acceptance Criteria:**

**Given** common issues have been documented in memory files
**When** I compile troubleshooting documentation
**Then** guide covers:
  - Jest hanging issues (Windows)
  - Database connection issues
  - TypeScript path resolution
  - Nx cache issues
  - Build/test failures

**And** each issue has: symptoms, cause, solution
**And** guide is in `docs/troubleshooting.md` or consolidated from memories

**Prerequisites:** None

**Technical Notes:**
- Extract from `docs/memories/troubleshooting.md`
- Add any new issues discovered during MVP
- Keep format consistent

---

### Story 7.4: Review Documentation for AI-Agent Accessibility

As an AI coding agent,
I want documentation optimized for AI comprehension,
So that I can work effectively with the codebase.

**Acceptance Criteria:**

**Given** MVP documentation is complete
**When** I review all documentation
**Then** I verify:
  - CLAUDE.md is up to date with current patterns
  - Critical rules are clearly marked
  - File paths are accurate
  - No outdated information

**And** documentation passes "AI readability" check (structured, explicit, findable)

**Prerequisites:** Stories 7.1-7.3 complete

**Technical Notes:**
- Run through CLAUDE.md with fresh perspective
- Verify memory system references are current
- Check that architecture decisions reflect current state

---

# Phase 2: Task App PoC Epics

> **Phase 2 validates the template** by building a real application on it.
> The Task App demonstrates CRUD operations, authentication, and cross-platform functionality.

---

## Epic 8: Task Data Model & CRUD

**User Value Statement:** Users can create and manage tasks with full type safety from database to UI, proving the template's data flow patterns work for real features.

**PRD Coverage:** FR23, FR25

**Technical Context from Architecture:**
- Prisma for database model (tasks table)
- Zod schemas for validation
- REST+OpenAPI endpoints with type generation
- API client regeneration after schema changes

**Dependencies:** Phase 1 MVP complete (all infrastructure in place)

### Story 8.1: Create Task Database Model

As a backend developer,
I want a Task model in the database,
So that I can persist task data.

**Acceptance Criteria:**

**Given** the Prisma schema exists
**When** I add the Task model
**Then** model includes fields:
  - `id` (UUID, primary key)
  - `title` (String, required)
  - `description` (String, optional)
  - `status` (Enum: pending/in_progress/completed)
  - `userId` (UUID, foreign key to future users table)
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)

**And** migration is created and applied: `pnpm exec nx run database:migrate-dev`
**And** Prisma client is regenerated
**And** table exists in Supabase dashboard

**Prerequisites:** None

**Technical Notes:**
- Follow naming conventions (snake_case table name via `@@map`)
- Use `@db.Timestamptz` for timestamps
- userId is not enforced yet (no users table) - just store the value

---

### Story 8.2: Create Task Zod Schemas

As a full-stack developer,
I want Zod schemas for task operations,
So that I have validated, type-safe task data.

**Acceptance Criteria:**

**Given** the Task model exists
**When** I create schemas in `packages/schemas/src/task.ts`
**Then** I have schemas for:
  - `createTaskSchema` (title required, description optional)
  - `updateTaskSchema` (partial, at least one field)
  - `taskStatusSchema` (enum validation)
  - `taskSchema` (full task response)

**And** types are exported: `CreateTaskInput`, `UpdateTaskInput`, `Task`
**And** unit tests validate schema behavior
**And** tests pass: `pnpm exec nx run schemas:test`

**Prerequisites:** Story 8.1 complete

**Technical Notes:**
- Follow existing pattern in `packages/schemas/src/health.ts`
- Export via barrel in `packages/schemas/src/index.ts`
- TDD: write tests first, then implement

---

### Story 8.3: Create Task Database Queries

As a backend developer,
I want type-safe database queries for tasks,
So that I can perform CRUD operations on tasks.

**Acceptance Criteria:**

**Given** Task model and schemas exist
**When** I create query functions in `packages/database/src/tasks.ts`
**Then** I have functions:
  - `getTasks(userId?)` - get all tasks, optionally filtered by user
  - `getTask(id)` - get single task by ID
  - `createTask(data)` - create new task
  - `updateTask(id, data)` - update existing task
  - `deleteTask(id)` - delete task

**And** functions use Prisma client with proper typing
**And** unit tests cover all functions (with mocked Prisma)
**And** tests pass: `pnpm exec nx run database:test`

**Prerequisites:** Story 8.2 complete

**Technical Notes:**
- Export via barrel in `packages/database/src/index.ts`
- Consider error handling for not-found cases
- TDD: write tests first

---

### Story 8.4: Create Task REST Endpoints

As a backend developer,
I want REST endpoints for task operations,
So that clients can manage tasks via API.

**Acceptance Criteria:**

**Given** database queries exist
**When** I create endpoints in `apps/server/src/routes/tasks.ts`
**Then** endpoints exist:
  - `GET /api/tasks` - list all tasks (with userId filter query param)
  - `GET /api/tasks/:id` - get single task
  - `POST /api/tasks` - create task
  - `PATCH /api/tasks/:id` - update task
  - `DELETE /api/tasks/:id` - delete task

**And** endpoints use Zod validation from `@nx-monorepo/schemas`
**And** OpenAPI spec is updated with task endpoints
**And** integration tests cover all endpoints
**And** tests pass: `pnpm exec nx run server:test`

**Prerequisites:** Story 8.3 complete

**Technical Notes:**
- Follow pattern from health check routes
- Include proper error responses (400, 404, 500)
- Auth will be added in Epic 9 (endpoints public for now)

---

### Story 8.5: Regenerate API Client Types

As a frontend developer,
I want updated API client types for task endpoints,
So that I can make type-safe task API calls.

**Acceptance Criteria:**

**Given** task endpoints exist with OpenAPI spec
**When** I regenerate types: `pnpm exec nx run api-client:generate-types`
**Then** TypeScript types include task operations

**And** autocomplete works for `/tasks` endpoints in IDE
**And** api-client builds successfully
**And** type safety is verified (compile-time errors for wrong types)

**Prerequisites:** Story 8.4 complete

**Technical Notes:**
- May need to run `server:spec-write` first
- Verify generated types in `packages/api-client/src/gen/`
- Test autocomplete in VSCode

---

## Epic 9: User Authentication Flows

**User Value Statement:** Users can sign up, log in, and have their identity protected, enabling personalized task management.

**PRD Coverage:** FR24

**Technical Context from Architecture:**
- Supabase Auth for identity
- JWT tokens for API authentication
- Server middleware from Epic 4
- Client-side auth state from Epic 4

**Dependencies:** Epic 4 complete (auth infrastructure), Epic 8 complete (task endpoints to protect)

### Story 9.1: Create Web Signup Page

As a new user,
I want to create an account,
So that I can access the task application.

**Acceptance Criteria:**

**Given** I navigate to `/signup`
**When** I enter email and password
**Then** account is created in Supabase Auth

**And** form validates email format and password strength
**And** success redirects to `/tasks` (or verification notice)
**And** errors display clearly (email taken, weak password, etc.)
**And** page is styled consistently with application

**Prerequisites:** None

**Technical Notes:**
- Create `apps/web/src/app/signup/page.tsx`
- Use Supabase client from `@nx-monorepo/supabase-client`
- Consider email verification flow

---

### Story 9.2: Create Web Login Page

As a returning user,
I want to log into my account,
So that I can access my tasks.

**Acceptance Criteria:**

**Given** I navigate to `/login`
**When** I enter valid credentials
**Then** I am authenticated and redirected to `/tasks`

**And** invalid credentials show error message
**And** "Forgot password" link exists (can be placeholder)
**And** "Sign up" link navigates to signup page

**Prerequisites:** Story 9.1 complete

**Technical Notes:**
- Create `apps/web/src/app/login/page.tsx`
- Store session appropriately for SSR
- Consider "remember me" functionality

---

### Story 9.3: Implement Session Persistence

As an authenticated user,
I want my session to persist,
So that I don't have to log in repeatedly.

**Acceptance Criteria:**

**Given** I am logged in
**When** I close and reopen the browser
**Then** I remain logged in (session persists)

**And** session expires after appropriate timeout
**And** token refresh happens automatically
**And** logout clears session completely

**Prerequisites:** Story 9.2 complete

**Technical Notes:**
- Configure Supabase session settings
- Implement auth state listener
- Handle token refresh errors gracefully

---

### Story 9.4: Protect Task Routes (Web)

As a security-conscious user,
I want task pages protected by authentication,
So that only I can see my tasks.

**Acceptance Criteria:**

**Given** I am not logged in
**When** I navigate to `/tasks`
**Then** I am redirected to `/login`

**Given** I am logged in
**When** I navigate to `/tasks`
**Then** page loads successfully

**And** middleware pattern is reusable for future protected routes
**And** redirect includes return URL for post-login navigation

**Prerequisites:** Story 9.3 complete

**Technical Notes:**
- Use Next.js middleware or route guards
- Consider Server Component vs Client Component auth checks
- Document pattern for other routes

---

### Story 9.5: Protect Task API Endpoints

As a backend developer,
I want task endpoints protected by authentication,
So that users can only access their own data.

**Acceptance Criteria:**

**Given** a request without valid JWT
**When** hitting any `/api/tasks/*` endpoint
**Then** return 401 Unauthorized

**Given** a request with valid JWT
**When** hitting task endpoints
**Then** userId is extracted from token and used for queries

**And** users can only see/modify their own tasks
**And** middleware from Epic 4 is applied to task routes

**Prerequisites:** Epic 4 complete, Story 8.4 complete

**Technical Notes:**
- Apply `requireAuth` middleware from `apps/server/src/middleware/auth.ts`
- Extract userId from JWT claims
- Filter tasks by userId in database queries

---

## Epic 10: Web Task Management

**User Value Statement:** Users can manage their tasks through a complete web interface with smooth interactions.

**PRD Coverage:** FR23 (web aspect)

**Technical Context from Architecture:**
- Next.js App Router for pages
- API client for data fetching
- React state management (useState/useReducer or context)
- Tailwind CSS for styling

**Dependencies:** Epic 8 complete (task CRUD), Epic 9 complete (authentication)

### Story 10.1: Create Task List Page

As a user,
I want to see all my tasks,
So that I can track what needs to be done.

**Acceptance Criteria:**

**Given** I am logged in
**When** I navigate to `/tasks`
**Then** I see a list of my tasks

**And** tasks show title, status, and created date
**And** empty state is shown when no tasks exist
**And** loading state is shown while fetching
**And** error state is shown if fetch fails

**Prerequisites:** Stories 8.5, 9.4 complete

**Technical Notes:**
- Create `apps/web/src/app/tasks/page.tsx`
- Use API client for data fetching
- Consider Server Components for initial load

---

### Story 10.2: Create Task Form

As a user,
I want to create new tasks,
So that I can add things to my list.

**Acceptance Criteria:**

**Given** I am on the tasks page
**When** I click "Add Task" and fill the form
**Then** a new task is created and appears in the list

**And** form validates title is required
**And** form has fields for title, description, status
**And** submit button shows loading state
**And** success shows confirmation (toast or inline)

**Prerequisites:** Story 10.1 complete

**Technical Notes:**
- Modal or separate page - decide based on UX preference
- Use Zod schema for client-side validation
- Optimistic update optional for MVP

---

### Story 10.3: Edit Task Functionality

As a user,
I want to edit existing tasks,
So that I can update task details.

**Acceptance Criteria:**

**Given** I click on a task or edit button
**When** I modify the form and save
**Then** task is updated in database and UI

**And** form pre-fills with existing data
**And** validation prevents invalid updates
**And** cancel button discards changes

**Prerequisites:** Story 10.2 complete

**Technical Notes:**
- Reuse form component from Story 10.2
- Consider inline editing vs modal
- Handle concurrent edit conflicts gracefully

---

### Story 10.4: Delete Task Functionality

As a user,
I want to delete tasks,
So that I can remove completed or unwanted items.

**Acceptance Criteria:**

**Given** I click delete on a task
**When** I confirm the deletion
**Then** task is removed from database and UI

**And** confirmation dialog prevents accidental deletion
**And** undo option is available briefly (nice to have)
**And** deleted task disappears from list immediately

**Prerequisites:** Story 10.1 complete

**Technical Notes:**
- Confirm dialog before delete
- Optimistic removal with rollback on error
- Consider soft delete vs hard delete

---

### Story 10.5: Task Status Updates

As a user,
I want to quickly change task status,
So that I can track progress easily.

**Acceptance Criteria:**

**Given** I see a task in the list
**When** I click status toggle/dropdown
**Then** status updates immediately

**And** status options: pending, in_progress, completed
**And** visual distinction between statuses (colors/icons)
**And** completed tasks can be filtered or sorted differently

**Prerequisites:** Story 10.1 complete

**Technical Notes:**
- Quick action without opening edit form
- Consider drag-and-drop between status columns (Kanban style) as enhancement
- Optimistic update for responsiveness

---

## Epic 11: Mobile Task Management

**User Value Statement:** Users can manage tasks on mobile with the same functionality as web, proving cross-platform parity.

**PRD Coverage:** FR20, FR23 (mobile aspect)

**Technical Context from Architecture:**
- React Native with Expo
- Shared API client and schemas
- Native navigation patterns
- Secure token storage

**Dependencies:** Epic 6 complete (mobile walking skeleton), Epic 9 complete (auth), Epic 10 complete (web task management as reference)

### Story 11.1: Create Mobile Task List Screen

As a mobile user,
I want to see my tasks on mobile,
So that I can manage tasks on the go.

**Acceptance Criteria:**

**Given** I am logged in on mobile
**When** I navigate to the tasks screen
**Then** I see my tasks in a scrollable list

**And** list uses native FlatList for performance
**And** pull-to-refresh updates the list
**And** empty and loading states are handled

**Prerequisites:** Epic 6 mobile app exists

**Technical Notes:**
- Create screen in `apps/mobile/src/screens/TasksScreen.tsx`
- Use same API client as web
- Follow React Native patterns

---

### Story 11.2: Create Mobile Auth Screens

As a mobile user,
I want to sign up and log in on mobile,
So that I can access my tasks securely.

**Acceptance Criteria:**

**Given** I open the mobile app
**When** I am not logged in
**Then** I see login/signup screens

**And** forms work with mobile keyboard
**And** secure storage is used for tokens
**And** biometric auth is optional enhancement

**Prerequisites:** Story 11.1 complete

**Technical Notes:**
- Use Expo SecureStore for token storage
- Handle deep linking for auth callbacks if needed
- Test on both iOS and Android

---

### Story 11.3: Mobile Task CRUD

As a mobile user,
I want to create, edit, and delete tasks on mobile,
So that I have full task management capability.

**Acceptance Criteria:**

**Given** I am logged in on mobile
**When** I use task management features
**Then** I can create, edit, and delete tasks

**And** forms use mobile-appropriate inputs
**And** gestures work (swipe to delete optional)
**And** changes sync with server (visible on web)

**Prerequisites:** Story 11.2 complete

**Technical Notes:**
- Mirror web functionality
- Use bottom sheets or modals for forms
- Test cross-platform sync thoroughly

---

### Story 11.4: Validate Cross-Platform Task Sync

As a user with multiple devices,
I want tasks to sync between web and mobile,
So that I see the same data everywhere.

**Acceptance Criteria:**

**Given** I create a task on web
**When** I refresh mobile
**Then** the task appears

**Given** I complete a task on mobile
**When** I refresh web
**Then** the status change is visible

**And** validation is documented with evidence
**And** any sync limitations are documented

**Prerequisites:** Stories 11.1-11.3 complete

**Technical Notes:**
- Manual validation with documentation
- Test create, update, delete operations
- Note any real-time sync considerations (future enhancement)

---

## Epic 12: Quality Gate Enforcement

**User Value Statement:** Code quality is enforced automatically, preventing regressions and maintaining high standards.

**PRD Coverage:** FR27

**Technical Context:**
- Jest for test coverage measurement
- Coverage thresholds in Jest config
- Pre-commit hooks for early feedback
- CI pipeline for blocking merges

**Dependencies:** Epics 8-11 complete (code exists to measure coverage)

### Story 12.1: Review Current Coverage

As a quality engineer,
I want to understand current coverage levels,
So that I can plan coverage improvements.

**Acceptance Criteria:**

**Given** all PoC code is written
**When** I run coverage report: `pnpm exec nx run-many -t test --coverage`
**Then** I have coverage metrics for all projects

**And** report identifies gaps (uncovered functions, branches)
**And** low-coverage areas are prioritized for improvement

**Prerequisites:** Epics 8-11 complete

**Technical Notes:**
- Generate HTML coverage report for visual review
- Focus on packages and apps with business logic
- Document baseline coverage before improvements

---

### Story 12.2: Fill Coverage Gaps

As a developer,
I want to add tests for uncovered code,
So that we reach 80% coverage target.

**Acceptance Criteria:**

**Given** coverage gaps are identified
**When** I write targeted tests
**Then** coverage reaches ≥80% across:
  - `packages/database`
  - `packages/schemas`
  - `packages/api-client`
  - `apps/server`
  - `apps/web` (components and utilities)

**And** tests are meaningful, not just coverage padding
**And** all tests pass

**Prerequisites:** Story 12.1 complete

**Technical Notes:**
- Prioritize critical paths and business logic
- Don't test framework code or trivial getters
- Consider integration tests for complex flows

---

### Story 12.3: Enable Coverage Enforcement

As a team lead,
I want coverage thresholds enforced on merge,
So that coverage cannot decrease.

**Acceptance Criteria:**

**Given** coverage reaches 80%
**When** I update Jest configuration
**Then** coverage thresholds are set to 80%

**And** pre-commit hooks warn on low coverage
**And** CI pipeline fails if coverage drops below threshold
**And** configuration is documented

**Prerequisites:** Story 12.2 complete

**Technical Notes:**
- Update Jest configs with global thresholds
- Consider per-project thresholds if needed
- Document how to handle coverage in new features

---

## Epic 13: Production Deployment

**User Value Statement:** The application is deployed to production platforms, accessible to real users.

**PRD Coverage:** FR19, FR26

**Technical Context from Architecture:**
- Docker for consistent deployment
- Multiple platform support (portability)
- Environment-specific configuration
- Health check endpoints for validation

**Dependencies:** All PoC features complete, Epic 12 complete (quality gates)

### Story 13.1: Select Production Platforms

As a DevOps engineer,
I want to select two production platforms,
So that we demonstrate deployment portability.

**Acceptance Criteria:**

**Given** project requirements (Next.js + Express + PostgreSQL)
**When** I evaluate production hosting options
**Then** I select two platforms with rationale

**And** options evaluated: Railway, Render, Fly.io, Vercel + separate API host
**And** decision documented in `docs/architecture-decisions.md`
**And** cost considerations noted

**Prerequisites:** None

**Technical Notes:**
- Consider: managed PostgreSQL or Supabase connection
- Evaluate DX, pricing, scaling capabilities
- Document why two platforms matter (portability proof)

---

### Story 13.2: Deploy to Platform 1

As a DevOps engineer,
I want to deploy to the first production platform,
So that the application is accessible in production.

**Acceptance Criteria:**

**Given** platform 1 is selected
**When** I configure deployment
**Then** application is deployed and accessible

**And** CI/CD pipeline triggers production deployment
**And** Environment secrets are configured securely
**And** Health check validates deployment success
**And** Deployment process is documented

**Prerequisites:** Story 13.1 complete

**Technical Notes:**
- Create production GitHub Actions workflow
- Configure environment protection rules
- Verify database connection and auth work

---

### Story 13.3: Deploy to Platform 2

As a DevOps engineer,
I want to deploy to the second production platform,
So that we prove deployment portability.

**Acceptance Criteria:**

**Given** platform 2 is selected
**When** I configure deployment
**Then** application is deployed and accessible

**And** Same features work as on Platform 1
**And** Deployment process documented separately
**And** Differences between platforms noted

**Prerequisites:** Story 13.2 complete

**Technical Notes:**
- May require different Docker or build configuration
- Document any platform-specific quirks
- Verify both deployments periodically

---

### Story 13.4: Document Rollback Procedures

As an operations engineer,
I want documented rollback procedures,
So that I can recover from failed deployments.

**Acceptance Criteria:**

**Given** deployments are configured
**When** I document rollback procedures
**Then** documentation covers:
  - How to identify failed deployment
  - Steps to rollback to previous version
  - Database migration rollback considerations
  - Communication/incident response

**And** procedure is tested at least once
**And** documentation is in `docs/operations/` or similar

**Prerequisites:** Stories 13.2, 13.3 complete

**Technical Notes:**
- Platform-specific rollback commands
- Consider blue-green or canary deployments as enhancement
- Test rollback in staging first

---

## Epic 14: Production Observability

**User Value Statement:** Operations team has visibility into production health, enabling proactive issue resolution.

**PRD Coverage:** FR28

**Technical Context:**
- Sentry for error tracking (from Epic 3)
- Production-specific dashboards
- Alerting for critical issues
- Performance monitoring

**Dependencies:** Epic 13 complete (production exists to monitor)

### Story 14.1: Configure Production Sentry

As an operations engineer,
I want Sentry configured for production,
So that production errors are tracked separately.

**Acceptance Criteria:**

**Given** staging Sentry is working
**When** I configure production environment
**Then** production errors are tagged correctly

**And** production DSN is separate (or environment tagged)
**And** Source maps work in production builds
**And** Sensitive data is scrubbed

**Prerequisites:** Epic 3 complete

**Technical Notes:**
- May use same Sentry project with environment filter
- Or separate project for production
- Configure release tracking for deployment correlation

---

### Story 14.2: Create PoC-Specific Dashboards

As an operations engineer,
I want dashboards for Task App flows,
So that I can monitor key functionality.

**Acceptance Criteria:**

**Given** production is deployed
**When** I create Sentry dashboards
**Then** dashboards show:
  - Authentication success/failure rates
  - Task CRUD error rates
  - API response times
  - Error trends over time

**And** dashboards are accessible to team
**And** dashboard screenshots are documented

**Prerequisites:** Story 14.1 complete

**Technical Notes:**
- Use Sentry's built-in dashboard features
- Focus on actionable metrics
- Consider Discover queries for custom insights

---

### Story 14.3: Configure Alerting

As an operations engineer,
I want alerts for critical issues,
So that problems are addressed quickly.

**Acceptance Criteria:**

**Given** dashboards exist
**When** I configure alerting rules
**Then** alerts trigger for:
  - High error rate (> X errors/minute)
  - Authentication failures spike
  - API latency exceeds threshold
  - New error types

**And** alerts go to appropriate channels (email, Slack, etc.)
**And** alert fatigue is minimized (reasonable thresholds)

**Prerequisites:** Story 14.2 complete

**Technical Notes:**
- Start with conservative thresholds
- Document escalation process
- Consider PagerDuty integration for critical alerts

---

### Story 14.4: Validate Production Observability

As a team lead,
I want to verify observability works in production,
So that we're ready for real user traffic.

**Acceptance Criteria:**

**Given** observability is configured
**When** I trigger test scenarios
**Then** I can observe:
  - Intentional errors appear in dashboard
  - Performance metrics are accurate
  - Alerts fire correctly
  - Can trace a request across services

**And** validation is documented
**And** any gaps are noted for future improvement

**Prerequisites:** Stories 14.1-14.3 complete

**Technical Notes:**
- Create test scenarios (error endpoint, slow request)
- Document smoke test procedure
- Schedule periodic observability review

---

## FR Coverage Matrix

| FR | Description | Epic | Stories |
|----|-------------|------|---------|
| FR1 | Nx workspace configuration | Epic 1 | ✅ Complete |
| FR2 | Walking skeleton executes after clone | Epic 1 | ✅ Complete |
| FR3 | Unidirectional dependency flow | Epic 1 | ✅ Complete |
| FR4 | TypeScript strict mode | Epic 1 | ✅ Complete |
| FR5 | Documentation synchronized | Epic 7 | 7.1, 7.2, 7.3, 7.4 |
| FR6 | Workspace-level scripts | Epic 1 | ✅ Complete |
| FR7 | Zod schemas as source of truth | Epic 1, 8 | ✅ Complete, 8.2 |
| FR8 | Prisma schema manages Supabase | Epic 1, 8 | ✅ Complete, 8.1 |
| FR9 | Type-safe API client | Epic 1, 8 | ✅ Complete, 8.5 |
| FR10 | Supabase client factories | Epic 1, 4 | ✅ Complete, 4.1-4.4 |
| FR11 | Environment validation at startup | Epic 1 | ✅ Complete |
| FR12 | Husky and lint-staged | Epic 1 | ✅ Complete |
| FR13 | CI pipeline with Nx caching | Epic 2 | 2.3, 2.4 |
| FR14 | TDD with co-located tests | Epic 1, 2, 12 | ✅ Complete, 2.3, 12.1-12.3 |
| FR15 | Nx Cloud integration | Epic 2 | 2.4 |
| FR16 | GitHub Actions secrets and staging deploy | Epic 5 | 5.2, 5.3, 5.4 |
| FR17 | Observability platform | Epic 3 | 3.1, 3.2, 3.3, 3.4 |
| FR18 | Docker containerization | Epic 5 | 5.3 |
| FR19 | CI/CD to production platforms | Epic 13 | 13.1, 13.2, 13.3 |
| FR20 | Mobile shares API client and patterns | Epic 6, 11 | 6.2, 11.1-11.4 |
| FR21 | Mobile walking skeleton mirrors web | Epic 6 | 6.3, 6.4 |
| FR22 | Mobile development documentation | Epic 6 | 6.5 |
| FR23 | Task CRUD with validation | Epic 8, 10, 11 | 8.1-8.5, 10.1-10.5, 11.1-11.4 |
| FR24 | Authenticated sessions gate routes | Epic 9 | 9.1-9.5 |
| FR25 | PoC uses shared packages correctly | Epic 8 | 8.2, 8.3, 8.5 |
| FR26 | Production deployments with rollback | Epic 13 | 13.2, 13.3, 13.4 |
| FR27 | Test coverage ≥80% | Epic 12 | 12.1, 12.2, 12.3 |
| FR28 | Observability dashboards for PoC | Epic 14 | 14.1, 14.2, 14.3, 14.4 |

---

## Summary

### Epic Overview

| Epic | Title | Phase | Stories | Status |
|------|-------|-------|---------|--------|
| 1 | Foundation & Walking Skeleton | MVP | - | ✅ Complete |
| 2 | E2E Testing & Quality Gates | MVP | 4 | Pending |
| 3 | Observability Baseline | MVP | 4 | ✅ Complete |
| 4 | Authentication Infrastructure | MVP | 4 | ✅ Complete |
| 5 | CI/CD Multi-Platform Deployment | MVP | 10 | In Progress |
| 6 | Mobile Walking Skeleton | MVP | 7 | Pending |
| 7 | MVP Documentation | MVP | 4 | Pending |
| 8 | Task Data Model & CRUD | PoC | 5 | Pending |
| 9 | User Authentication Flows | PoC | 5 | Pending |
| 10 | Web Task Management | PoC | 5 | Pending |
| 11 | Mobile Task Management | PoC | 4 | Pending |
| 12 | Quality Gate Enforcement | PoC | 3 | Pending |
| 13 | Production Deployment | PoC | 4 | Pending |
| 14 | Production Observability | PoC | 4 | Pending |

### Totals

- **Phase 1 MVP:** 7 Epics, 33 Stories (Epics 1, 3, 4 complete; Epic 5 in progress)
- **Phase 2 PoC:** 7 Epics, 30 Stories
- **Total:** 14 Epics, 63 Stories

### Key Milestones

1. **MVP Complete:** All Epics 1-7 done - template is production-ready
2. **PoC Core Features:** Epics 8-11 done - Task app fully functional
3. **Quality Certified:** Epic 12 done - 80% coverage enforced
4. **Production Ready:** Epics 13-14 done - deployed and monitored

---

_For implementation: Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown._

_This document will be updated as stories are implemented and new requirements emerge._

