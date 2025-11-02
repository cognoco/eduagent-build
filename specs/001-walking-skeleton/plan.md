# Implementation Plan: Walking Skeleton Health Check

**Branch**: `P1-S5-SK2` | **Date**: 2025-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/P1-S5-SK2/spec.md`

**Note**: This is Phase 1 Stage 5 - Infrastructure validation via minimal end-to-end feature (throwaway code).

## Summary

Implement a minimal health check feature (HTTP endpoints: GET /api/health, POST /api/health/ping) that flows through the entire technology stack to validate infrastructure before POC development. The feature exercises Web UI → API Client → Server → Prisma → Supabase with trivial business logic to surface integration issues early. OpenAPI spec defines paths `/health` and `/health/ping` with `servers: [{ url: '/api' }]`.

**Primary Requirement**: Prove end-to-end type safety and data persistence work correctly across all layers.

**Technical Approach**: TDD implementation across 5 layers (database, schemas, server, api-client, web) with co-located tests achieving ≥60% coverage. Walking skeleton code marked for deletion after validation complete.

## Technical Context

**Language/Version**: TypeScript 5.9.2, Node.js 20.19.9+
**Primary Dependencies**:
- Web: Next.js 15.2.4, React 19.0.0, Tailwind CSS 3.4.3 (upgrade to 4.1.x recommended)
- Server: Express 4.21.2, @asteasolutions/zod-to-openapi 8.1.0
- Database: Prisma 6.17.1, Supabase PostgreSQL 15+
- Testing: Jest 30.2.0, MSW 2.0.0, Playwright 1.56.1
**Storage**: Supabase PostgreSQL with Prisma ORM
**Testing**: Jest (unit/integration, co-located in src/), Playwright (E2E in web-e2e/)
**Target Platform**: Web (Next.js App Router), API server (Express)
**Project Type**: Nx monorepo (2 apps: web, server; 4 packages: database, schemas, api-client, supabase-client)
**Performance Goals**: <2s page load, <1s API responses (infrastructure validation - no optimization needed)
**Constraints**: Phase 1 walking skeleton only - basic error handling, no pagination, 60% test coverage minimum
**Scale/Scope**: Single health check model (3 fields), 2 REST endpoints, throwaway validation code

## Research Validation

**Status**: ✅ **Complete**

**MCP Servers Used**:
- [x] Context7 (official documentation: Prisma, Jest, MSW, openapi-typescript, Next.js, Express)
- [x] Exa (production code examples for all technology areas)
- [x] Supabase MCP (RLS strategy, connection pooling best practices)
- [x] Perplexity/Web Search (React 19 readiness, version compatibility, 2025 best practices)

**Material Changes Validated**:
- [x] New external libraries/frameworks (Prisma 6, MSW 2.0, openapi-fetch)
- [x] Cross-project architecture/build/test/config (REST+OpenAPI, Nx dependencies)
- [x] Public API contracts (OpenAPI 3.1.0 spec generation)
- [x] Database schema or ORM configuration (Prisma + Supabase integration)

**Research Summary** (5 agents dispatched in parallel):

1. **Prisma 6 + Supabase PostgreSQL** - ✅ **IMPLEMENTED** (2 changes applied 2025-10-30)
   - Sources: Context7 (Prisma docs), Supabase MCP, Exa
   - Findings: UUID, timestamps, table naming, singleton all validated. RLS strategy and connection pooling updated per 2025 Supabase guidance.
   - **Implementation**: 12 files updated (Supavisor dual-connection + RLS enabled for API path; Prisma bypass via SQL role)

2. **Jest 30 + MSW 2.0** - ✅ **IMPLEMENTED** (Documentation updated 2025-10-30)
   - Sources: Context7 (Testing Library, MSW), Exa
   - Findings: jest-dom, user-event, query priority all correct. MSW 2.0 breaking changes documented with code examples.
   - **Implementation**: 4 files updated (Pattern 10, testing-enhancements.md, testing-reference.md, research-validation.md)

3. **REST+OpenAPI Tooling** - ✅ VALIDATED (all tools gold-standard)
   - Sources: Context7 (all tool docs), Exa, Perplexity
   - Findings: Runtime spec generation, build-time types, openapi-fetch all optimal for 2025.

4. **Next.js 15.2 + React 19** - ✅ VALIDATED (Tailwind upgrade rejected by user)
   - Sources: Context7 (Next.js + React docs), Exa, Perplexity
   - Findings: All patterns validated. React 19 production-ready since Dec 2024. Tailwind 3.4.3 retained (user decision 2025-10-30).

5. **Express 4.21.2 Path-Agnostic Routing** - ✅ VALIDATED (gold standard architecture)
   - Sources: Context7 (Express docs), Exa, Perplexity
   - Findings: All patterns match official Express best practices.

**Research Recommendations Implemented** (2025-10-30):
- ✅ Prisma connection pooling: Supavisor with directUrl (transaction mode 6543 + session mode 5432)
- ✅ RLS: Enabled for defense-in-depth on API path (service_role applies to PostgREST). Prisma bypass via SQL role (superuser in Phase 1).
- ✅ MSW 2.0: Comprehensive code examples added to Pattern 10 with migration table
- ❌ Tailwind CSS: Upgrade to 4.1.x rejected by user (3.4.3 retained)

**Validated Patterns** (22 patterns confirmed as 2025 best practice):
- Prisma: UUID generation, timestamps, table naming, singleton pattern
- Testing: jest-dom setup, user-event standard, semantic queries
- OpenAPI: Runtime spec generation, build-time types, openapi-fetch, Nx orchestration, gitignore strategy
- Next.js: Version pinning, App Router, co-located tests, TypeScript config
- Express: Path-agnostic routers, three-layer architecture, directory structure

**Research Document**: See `specs/P1-S5-SK2/research-validation.md` for complete validation report with evidence and recommendations.

**Gate Status**:
- [x] ✅ External validation complete - Ready for implementation (95% confidence in infrastructure choices)

## Constitution Check

*GATE: Passed before Phase 0 research.*

**Constitutional Requirements Applied**:
- ✅ **Test-Driven Development (Principle III)**: 5 TDD cycles planned (database → schemas → server → api-client → web)
- ✅ **Verification Before Completion (Principle IV)**: Comprehensive verification checklist in spec.md
- ✅ **External Validation Mandatory (Principle X)**: Phase 0 MCP research completed with research-validation.md
- ✅ **Governance Alignment Mandatory (Principle XI)**: Phase -1 internal alignment gate passed

**No violations detected** - walking skeleton aligns with all constitutional principles.

## Governance Alignment

**Status**: ✅ **Aligned** (Internal alignment gate passed with 0 violations)

**Documents Checked**:
- [x] docs/architecture-decisions.md
- [x] docs/memories/adopted-patterns.md
- [x] docs/tech-stack.md
- [x] docs/P1-plan.md

**Alignment Summary**:
1. **Architecture Decisions**: ✅ Aligned
   - Checked: REST+OpenAPI architecture (Decision: Stage 4.1), Supabase+Prisma strategy (Decision: Stage 4.2)
   - Conflicts: None

2. **Adopted Patterns**: ✅ Aligned
   - Checked: All 10 patterns (test location, module resolution, Jest config, TypeScript config, Express routing, OpenAPI patterns, Prisma conventions, testing enhancements)
   - Conflicts: None - research validated all patterns as current best practice

3. **Tech Stack Constraints**: ✅ Aligned
   - Checked: Pinned versions (Next.js ~15.2.4, React 19.0.0, Prisma ^6.17.1, Jest 30.2.0, Nx 21.6.5)
   - Conflicts: None - all versions validated as production-stable

4. **Phase/Stage Requirements**: ✅ Aligned
   - Checked: Phase 1 Stage 5 requirements (walking skeleton, throwaway code, 60% coverage, TDD cycles)
   - Conflicts: None

**Gate Status**: ✅ Ready for Phase 1 Design & Contracts (governance validated, research complete)

## Phase 1: Design & Contracts

**Status**: ✅ **Complete**

**Artifacts Generated**:
- [x] `data-model.md` - Database schema and domain model for HealthCheck entity
- [x] `contracts/` - OpenAPI 3.1.0 specifications for paths `/health` (GET) and `/health/ping` (POST) with `servers: [{ url: '/api' }]`
- [x] `contracts/README.md` - Contract documentation and toolchain integration guide
- [x] `quickstart.md` - Developer onboarding guide with step-by-step setup instructions
- [x] Agent context updated - `CLAUDE.md` updated with walking skeleton technology stack

**Post-Research Refinements** (2025-10-30):
After Phase 0 research validation, 3 of 4 recommendations were approved and implemented:
- ✅ Supavisor connection pooler with dual-connection strategy (12 files updated)
- ✅ Enable RLS for API path (service_role), Prisma bypass via SQL role (5 files updated)
- ✅ MSW 2.0 documentation with comprehensive code examples (4 files updated)
- ❌ Tailwind 4.x upgrade rejected by user (3.4.3 retained)

Total: 18 files updated across canonical docs (`docs/`) and Spec-Kit documentation (`specs/001-walking-skeleton/`).

**Gate Status**: ✅ Phase 1 complete - Ready for implementation (Phase 2: tasks.md generation via `/speckit.tasks`)

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

This is an Nx monorepo with 2 applications and 4 shared packages. The walking skeleton touches all layers:

```text
apps/
  web/                          # Next.js 15 web application
    src/
      app/
        health/
          page.tsx              # WALKING SKELETON: Health check list + ping button
          page.spec.tsx         # WALKING SKELETON: Component tests (optional P1)
      components/               # Shared React components (none for walking skeleton)
    project.json
    jest.config.ts              # Jest configuration for web
    tsconfig.json
    next.config.js

  server/                       # Express API server
    src/
      main.ts                   # Server entry point
      routes/
        health.routes.ts        # WALKING SKELETON: Health check router
        health.routes.spec.ts   # WALKING SKELETON: Integration tests
      index.ts                  # API aggregator (registers all routes)
    project.json
    jest.config.ts              # Jest configuration for server
    tsconfig.json

packages/
  database/                     # Prisma client + query functions
    src/
      index.ts                  # Barrel exports
      client.ts                 # Prisma singleton instance
      health.ts                 # WALKING SKELETON: getHealthChecks(), createHealthCheck()
      health.spec.ts            # WALKING SKELETON: Database layer unit tests
    prisma/
      schema.prisma             # WALKING SKELETON: HealthCheck model
      migrations/
        YYYYMMDDHHMMSS_create_health_checks/ # WALKING SKELETON: Migration
          migration.sql
    project.json
    jest.config.ts

  schemas/                      # Zod schemas + TypeScript types
    src/
      index.ts                  # Barrel exports
      health.schema.ts          # WALKING SKELETON: healthPingSchema
      health.schema.spec.ts     # WALKING SKELETON: Schema validation tests
    project.json
    jest.config.ts

  api-client/                   # REST API client (openapi-fetch)
    src/
      index.ts                  # WALKING SKELETON: createApiClient() factory
      index.spec.ts             # WALKING SKELETON: Client factory tests
      gen/                      # Generated TypeScript types (gitignored)
        openapi.ts              # Generated from server OpenAPI spec
    project.json
    jest.config.ts

  supabase-client/              # Supabase client configuration
    src/
      index.ts                  # Supabase client factory (not modified for walking skeleton)
    project.json
```

**Structure Decision**: Selected Nx monorepo structure (Option 2 variant) with separate web and server applications. Walking skeleton code is marked with `// WALKING SKELETON:` comments for easy identification and deletion after infrastructure validation. Co-located tests follow adopted Pattern 1 (co-located in `src/` next to source files).

## Complexity Tracking

**No constitutional violations detected** - this section is not applicable for the walking skeleton feature.
