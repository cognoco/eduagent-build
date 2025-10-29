# Implementation Plan: Walking Skeleton - Infrastructure Validation

**Branch**: `001-walking-skeleton` | **Date**: 2025-10-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-walking-skeleton/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

The walking skeleton is a temporary infrastructure validation feature that exercises the entire monorepo stack end-to-end. It creates a minimal health check system (database table, REST API endpoints, web UI) to prove that all components communicate correctly: web app → API client → Express server → Prisma → Supabase PostgreSQL.

**Primary Requirement**: Validate that data can flow from user interaction in the browser through all infrastructure layers to persistent database storage and back.

**Technical Approach**: Use existing infrastructure (no new packages), implement direct Prisma queries (no abstractions), follow established patterns (co-located tests, modular routes, code-first OpenAPI), and achieve 60% test coverage minimum.

## Technical Context

**Language/Version**: TypeScript 5.9
**Primary Dependencies**:
- **Backend**: Express 4.21, Prisma 6.17.1/6.18.0, @asteasolutions/zod-to-openapi 8.1.0, swagger-ui-express 5.0.1
- **Frontend**: Next.js 15.2, React 19
- **Shared**: Zod 4.1, openapi-fetch 0.14.0, openapi-typescript 7.10.1
- **Database**: Supabase PostgreSQL (cloud) via Prisma

**Storage**: Supabase PostgreSQL (cloud-hosted) with Prisma ORM

**Testing**: Jest 30 (unit/integration), Playwright (E2E), @testing-library/react 16.1, @testing-library/jest-dom (to be installed), @testing-library/user-event (to be installed), MSW (optional - not required for Phase 1)

**Target Platform**:
- **Server**: Node.js 22+ (Linux, Windows, macOS)
- **Web**: Next.js 15 (SSR + Client Components, modern browsers)

**Project Type**: Nx monorepo with multiple apps (server, web) and buildable packages (database, schemas, api-client, supabase-client)

**Performance Goals**:
- Health check list load: <2 seconds (from spec SC-001)
- Health check create: <1 second (from spec SC-002)
- API endpoint latency: <100ms (GET), <150ms (POST)

**Constraints**:
- Minimum 60% test coverage (Phase 1 requirement)
- Zero configuration after clone (except environment variables and migrations)
- All infrastructure components must work together
- Co-located tests in `src/` directory (adopted pattern)
- TypeScript `moduleResolution: nodenext` (adopted pattern)

**Scale/Scope**:
- Phase 1 walking skeleton (temporary feature, will be deleted)
- Expected ~50-100 test health check records
- No pagination (display all records for Phase 1)
- Single HealthCheck entity, 2 REST endpoints, 1 UI page

**CRITICAL Research Findings** ⚠️:

After retrospective validation using MCP servers (Context7, Exa, web search), the following critical changes were identified:

1. **REST Error Format** - Anti-pattern discovered:
   - ❌ Original: `{success: boolean, error, details}` format duplicates HTTP status codes
   - ✅ Corrected: Stripe-style format with direct data returns and `{error: {code, message, errors}}` structure
   - **Impact**: All response schemas and controllers require updates

2. **Prisma Configuration** - Missing Supabase requirements:
   - ❌ Missing: `?pgbouncer=true&connection_limit=1&pool_timeout=30` in DATABASE_URL
   - ❌ Missing: `directUrl = env("DIRECT_URL")` in schema.prisma
   - ✅ Required: Both pooled (port 6543) and direct (port 5432) connection strings
   - **Impact**: Without these, connection errors and migration failures occur

3. **Prisma Error Handling** - Production requirement:
   - ❌ Missing: Error handling middleware for Prisma errors (P2002, P2025, P2003)
   - ✅ Required: Map Prisma error codes to HTTP status codes (409, 404, 400)
   - **Impact**: Generic 500 errors instead of proper status codes

**Validated Patterns** (no changes needed):
- ✅ OpenAPI generation (runtime with per-feature registration) - Official standard
- ✅ Express routing (modular per-resource) - Industry best practice
- ✅ Direct Prisma queries (no repository abstraction) - Appropriate for walking skeleton
- ✅ TDD workflow (RED-GREEN-REFACTOR) - Constitutional requirement

**Research Source**: 5 parallel agents using Context7 MCP (official docs), Exa MCP (production examples), and web search (industry standards). See `research-validation.md` for complete findings.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Check (Pre-Research)

✅ **PASS - Simplicity First**
- Single Prisma model (HealthCheck) with 3 fields
- Two REST endpoints (GET, POST)
- Direct Prisma queries in controllers (no repository abstraction)
- Inline error handling (no custom error classes)
- No unnecessary layers or patterns

✅ **PASS - Test-Driven Development**
- Plan includes tests for every layer (database, schemas, server, API client, web UI, E2E)
- TDD workflow specified: RED (write failing test) → GREEN (minimal code) → REFACTOR
- 60% coverage target (elevated from constitutional 10% Phase 1 minimum)
  - **Rationale**: Walking skeleton serves as reference implementation for all future features
  - Higher quality bar justified for template code that demonstrates best practices
  - Still below Phase 2+ production standard (80%) but provides meaningful validation
  - Constitutional Principle I allows scope-appropriate cycles; this is infrastructure validation, not production feature

✅ **PASS - Memory System Adherence**
- Using adopted patterns: co-located tests in `src/`, `moduleResolution: nodenext`
- Following post-generation-checklist.md for any Nx generators used
- Research phase verifies existing patterns before implementation

✅ **PASS - Quality Gates**
- 60% test coverage minimum (Phase 1)
- All tests must pass
- TypeScript compilation must succeed
- Linting must pass

✅ **PASS - No New Infrastructure**
- Uses existing packages: database, schemas, api-client, supabase-client
- Uses existing apps: server, web, web-e2e
- No new packages created
- No architectural changes

**Gate Status**: ✅ **ALL GATES PASSED** - Proceed to Phase 0 research

### Post-Design Re-Check

✅ **PASS - Simplicity Maintained**
- Data model: Single entity (HealthCheck) with 3 attributes
- API: 2 endpoints following REST conventions
- Controllers: Direct Prisma queries, no abstraction layer
- No new patterns introduced

✅ **PASS - Test Coverage Plan**
- Unit tests: Zod schemas, individual functions
- Integration tests: Server endpoints with supertest
- Component tests: React components with Testing Library
- E2E tests: Playwright full user journeys
- Coverage target: 60% minimum

✅ **PASS - Pattern Consistency** (with critical corrections after MCP validation)
- OpenAPI generation: Runtime in apps/server/src/openapi/ - **Validated by external research** ✅
- Routing: Modular per-resource (routes/health.ts) - **Validated by external research** ✅
- Error format: ~~`{success, error, details}`~~ → **Corrected to Stripe-style after MCP validation** ⚠️
- Database config: **Added Supabase connection parameters after MCP validation** ⚠️
- Prisma error handling: **Added error code mapping after MCP validation** ⚠️
- Test libraries: jest-dom, user-event (modern API), MSW optional - **Validated by Context7** ✅

**Critical Changes Applied**:
1. Response format changed to return data directly (no `{success, data}` wrapper)
2. Error format changed to `{error: {code, message, errors}}` (Stripe-style)
3. DATABASE_URL requires `?pgbouncer=true&connection_limit=1&pool_timeout=30`
4. schema.prisma requires `directUrl = env("DIRECT_URL")` for migrations
5. Controllers require Prisma error handling (P2002→409, P2025→404)

**Final Gate Status**: ✅ **ALL GATES PASSED** - Ready for implementation (with corrected patterns from MCP research)

## Project Structure

### Documentation (this feature)

```text
specs/001-walking-skeleton/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (COMPLETE)
├── data-model.md        # Phase 1 output (COMPLETE)
├── quickstart.md        # Phase 1 output (COMPLETE)
├── contracts/           # Phase 1 output (COMPLETE)
│   └── health-endpoints.md
├── checklists/          # Quality validation
│   └── requirements.md  # Spec quality checklist (COMPLETE)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT YET CREATED)
```

### Source Code (repository root)

**Nx Monorepo Structure** - Multi-app + buildable packages:

```text
apps/
├── server/                      # Express API (EXISTING - ADD TO)
│   └── src/
│       ├── routes/
│       │   ├── index.ts         # Router aggregator (UPDATE: mount health endpoints)
│       │   ├── health.ts        # Health routes (UPDATE: add POST /ping)
│       │   └── health.openapi.ts # OpenAPI registration (UPDATE: add POST)
│       ├── controllers/
│       │   └── health.controller.ts # Request handlers (UPDATE: add ping method)
│       ├── middleware/
│       │   └── validate.middleware.ts # Zod validation (REUSE existing)
│       └── openapi/
│           ├── registry.ts      # OpenAPI registry (REUSE existing)
│           └── register.ts      # Feature registration (UPDATE: import health.openapi)
│
├── web/                         # Next.js web app (EXISTING - ADD TO)
│   └── src/
│       ├── app/
│       │   └── health/         # NEW: Health check page
│       │       ├── page.tsx    # NEW: /health route
│       │       └── page.spec.tsx # NEW: Component tests
│       └── components/         # NEW: Health check components
│           ├── HealthCheckList.tsx
│           ├── HealthCheckList.spec.tsx
│           ├── PingButton.tsx
│           └── PingButton.spec.tsx
│
└── web-e2e/                     # Playwright tests (EXISTING - ADD TO)
    └── src/
        └── health.spec.ts       # NEW: E2E tests for health check feature

packages/
├── database/                    # Prisma client (EXISTING - ADD TO)
│   ├── prisma/
│   │   ├── schema.prisma       # UPDATE: Add HealthCheck model
│   │   └── migrations/         # NEW: Migration for health_checks table
│   └── src/
│       └── lib/
│           └── database.spec.ts # UPDATE: Add HealthCheck query tests
│
├── schemas/                     # Zod schemas (EXISTING - ADD TO)
│   └── src/
│       └── lib/
│           ├── health.schema.ts # UPDATE: Add HealthCheck schemas
│           └── health.schema.spec.ts # NEW: Schema validation tests
│
├── api-client/                  # REST client (EXISTING - ADD TO)
│   └── src/
│       ├── generated/          # Generated TypeScript types
│       │   └── api.d.ts        # REGENERATE: After OpenAPI spec update
│       ├── lib/
│       │   ├── health.ts       # NEW: Health check API client functions
│       │   └── health.spec.ts  # NEW: API client tests
│       └── index.ts            # UPDATE: Export health client
│
└── supabase-client/             # Supabase auth (EXISTING - NO CHANGES)
    └── (no changes needed)
```

**Structure Decision**: Nx monorepo with multiple applications and buildable packages. This is **Option 2: Web application** adapted to Nx monorepo conventions where backend=apps/server and frontend=apps/web. The walking skeleton exercises all existing infrastructure without creating new packages or apps.

## Complexity Tracking

> **No violations** - Constitution Check passed with zero complexity violations.

This section is intentionally empty because the walking skeleton introduces no complexity:
- ✅ Uses existing infrastructure (no new packages/apps)
- ✅ Direct Prisma queries (no repository pattern)
- ✅ Inline error handling (no custom error classes)
- ✅ Follows established patterns (no new conventions)
