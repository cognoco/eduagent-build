# Research Validation Report

**Date**: 2025-10-30
**Feature**: Walking Skeleton Health Check
**Branch**: P1-S5-SK2
**Purpose**: External validation of implementation patterns using MCP servers

---

## Executive Summary

Research validated the walking skeleton technology stack across 5 technology areas using Context7, Exa, Supabase, and Perplexity MCPs. The stack is **gold-standard for 2025** with minor recommended updates.

**Key Findings**:
- ✅ 22 patterns validated as correct
- ⚠️ 4 patterns requiring adjustments (Prisma connection pooling, Prisma RLS, MSW 2.0 examples, Tailwind version)
- ❌ 0 anti-patterns discovered

**Overall Verdict**: Infrastructure choices are production-ready. Recommended updates are non-breaking enhancements that align with 2025 best practices.

---

## Research Methodology

**MCP Servers Used**:
- **Context7**: Official documentation for Prisma 6, Jest 30, MSW 2.0, openapi-typescript, Next.js 15, Express 4.21
- **Exa**: Production code examples for all technology areas
- **Supabase MCP**: RLS strategy, connection pooling, migration best practices
- **Perplexity (Web Search)**: Industry standards, version compatibility, breaking changes

**Research Areas**:
1. Prisma 6 + Supabase PostgreSQL (database layer)
2. Jest 30 + MSW 2.0 (testing infrastructure)
3. REST+OpenAPI tooling (@asteasolutions/zod-to-openapi + openapi-typescript + openapi-fetch)
4. Next.js 15.2 + React 19 (web application)
5. Express 4.21.2 path-agnostic routing (API server)

---

## Agent 1: Prisma 6 + Supabase PostgreSQL

**Status**: ✅ **IMPLEMENTED** (All 6 patterns validated, 2 changes applied 2025-10-30)

### Findings

**UUID Strategy**: ✅ VALIDATED
- Pattern: `@default(uuid()) @db.Uuid`
- Evidence: Official Prisma 6 docs confirm client-side generation + PG type validation
- Recommendation: Keep as-is

**Timestamps**: ✅ VALIDATED
- Pattern: `@db.Timestamptz`
- Evidence: Supabase and Prisma docs confirm timezone-aware, DST-safe
- Recommendation: Keep as-is

**Table Naming**: ✅ VALIDATED
- Pattern: `@@map("health_checks")` - snake_case plural
- Evidence: Official Prisma best practice
- Recommendation: Keep as-is

**Singleton Pattern**: ✅ VALIDATED
- Pattern: globalThis singleton for development
- Evidence: Official Prisma + Next.js docs (prevents connection pool exhaustion)
- Recommendation: Keep as-is

**RLS Strategy**: ✅ **IMPLEMENTED** (Updated 2025-10-30)
- ~~Current: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`~~ **RESOLVED**
- Supabase MCP finding: Enable RLS for private tables and use service_role for PostgREST (API path) as needed
- **Implementation**:
  - Migration SQL: `ALTER TABLE "health_checks" ENABLE ROW LEVEL SECURITY`
  - `docs/architecture-decisions.md` Decision 4: Clarified scope — service_role applies to API path; Prisma bypass via SQL role
  - `docs/memories/adopted-patterns.md` Pattern 8: Clarified RLS scope (API path vs Prisma SQL)
  - `specs/001-walking-skeleton/data-model.md`: Documented RLS defense-in-depth approach
- Defense-in-depth strategy: service_role applies to API path (PostgREST) only; Prisma bypass via SQL role

**Connection Strategy**: ✅ **IMPLEMENTED** (Updated 2025-10-30)
- ~~Current: Direct connection on port 5432~~ **RESOLVED**
- Supabase MCP finding: Official Prisma + Supabase guide now recommends Supavisor connection pooler
- **Implementation**:
  - `packages/database/prisma/schema.prisma`: Added `directUrl = env("DIRECT_URL")` to datasource
  - `.env.example`: Added DATABASE_URL (transaction mode, port 6543) + DIRECT_URL (session mode, port 5432)
  - `docs/architecture-decisions.md` Stage 4.2: Updated connection strategy documentation
  - `docs/memories/adopted-patterns.md` Pattern 8: Updated Prisma conventions with Supavisor strategy
  - `docs/guides/environment-setup.md`: Added dual-connection explanation with usage details
  - `specs/001-walking-skeleton/quickstart.md`: Updated setup instructions with both connection strings
  - `specs/001-walking-skeleton/data-model.md`: Documented connection strategy

**Sources**:
- Context7: Prisma official documentation
- Supabase MCP: Connection pooling guide, RLS best practices
- Exa: Production Prisma + Supabase examples

---

## Agent 2: Jest 30 + MSW 2.0

**Status**: ✅ **IMPLEMENTED** (Documentation updated 2025-10-30)

### Findings

**Mandatory Dependencies**: ✅ VALIDATED
- jest-dom, user-event, MSW all mandatory for UI packages
- Evidence: Testing Library official docs (trust score 9.3)

**Setup Pattern**: ✅ VALIDATED
- jest.setup.ts with `import '@testing-library/jest-dom'`
- Evidence: jest-dom v6.0+ official setup (removed extend-expect export)

**User Interaction Standard**: ✅ VALIDATED
- `await userEvent.click()` mandatory, fireEvent banned
- Evidence: user-event v14.5.0 all methods return Promise<void>

**Query Priority**: ✅ VALIDATED
- getByRole > getByLabelText > getByText > getByTestId
- Evidence: Testing Library official query priority guidance

**API Mocking**: ✅ **IMPLEMENTED**
- ~~Pattern states "MSW for all HTTP mocking" but no code examples~~ **RESOLVED**
- MSW 2.0 breaking changes documented with comprehensive examples
- **Implementation**:
  - `docs/memories/adopted-patterns.md` Pattern 10: Added MSW 2.0 setup examples with GET/POST/error handlers
  - `docs/guides/testing-enhancements.md`: Added MSW 2.0 migration table comparing v1.x vs v2.0 syntax
  - `docs/memories/testing-reference.md`: Added MSW 2.0 version requirement and breaking changes note
- Breaking changes documented:
  - Import: `http, HttpResponse` (not `rest`)
  - Response API: `HttpResponse.json()` (not `res(ctx.json())`)
  - Handler signature: `({ request, params, cookies })` (not `(req, res, ctx)`)
  - Status codes: `{ status: 404 }` options (not `ctx.status(404)`)

**Sources**:
- Context7: Jest 30, Testing Library, MSW 2.0 official docs
- Exa: Production MSW 2.0 + Jest 30 integration examples

**Implementation Date**: 2025-10-30

---

## Agent 3: REST+OpenAPI Tooling Stack

**Status**: ✅ **VALIDATED** (All patterns confirmed as 2025 best practice)

### Findings

**Spec Generation**: ✅ VALIDATED
- Runtime generation using @asteasolutions/zod-to-openapi 8.1.0
- Evidence: Production-ready with per-feature registration pattern
- Recommendation: Confirm approach

**Type Generation**: ✅ VALIDATED
- Build-time using openapi-typescript 7.10.0 with --export-type
- Evidence: Industry standard for OpenAPI → TypeScript conversion
- Recommendation: Confirm approach

**HTTP Client**: ✅ VALIDATED
- openapi-fetch 0.13.7 (5KB bundle, full type safety)
- Evidence: Minimal runtime, Edge-compatible, compile-time verification
- Recommendation: Confirm approach

**Build Dependency Chain**: ✅ VALIDATED
- Nx targets: server:build → server:spec-write → api-client:generate-types
- Evidence: Production-ready orchestration pattern
- Recommendation: Confirm approach

**Gitignore Strategy**: ✅ VALIDATED
- Gitignore generated types (src/gen/ directory)
- Evidence: Industry best practice for reproducible builds
- Recommendation: Confirm approach

**Sources**:
- Context7: Official docs for all three tools
- Exa: Production Next.js + OpenAPI integration examples
- Perplexity: openapi-fetch vs axios comparison, 2025 tooling landscape

---

## Agent 4: Next.js 15.2 + React 19

**Status**: ⚠️ **1 UPDATE RECOMMENDED** (All patterns validated, Tailwind outdated)

### Findings

**Version Pinning**: ✅ VALIDATED
- Next.js ~15.2.4 (tilde), React 19.0.0 (exact)
- Evidence: React 19 stable since Dec 2024, Next.js 15.2 supports React 19
- Recommendation: Confirm strategy

**App Router**: ✅ VALIDATED
- Server Components by default, explicit 'use client' directive
- Evidence: Official Next.js 15 architecture
- Recommendation: Confirm pattern

**Test Location**: ✅ VALIDATED
- Co-located tests in src/ (src/app/page.spec.tsx)
- Evidence: Next.js 15 official testing documentation shows this pattern
- Recommendation: Confirm pattern

**TypeScript Config**: ✅ VALIDATED
- moduleResolution: "bundler", noEmit: true, single tsconfig.json
- Evidence: Next.js 15 recommended configuration
- Recommendation: Confirm pattern

**Tailwind CSS**: ⚠️ **UPDATE RECOMMENDED**
- Current: Tailwind 3.4.3 (Dec 2022)
- Latest: Tailwind 4.1.x (2025)
- Recommendation: Upgrade to 4.1.x for Next.js 15 optimization

**Sources**:
- Context7: Next.js 15 + React 19 official docs
- Exa: Production Next.js 15 App Router examples
- Perplexity: React 19 production readiness, Tailwind version compatibility

---

## Agent 5: Express 4.21.2 Path-Agnostic Routing

**Status**: ✅ **VALIDATED** (All patterns confirmed as gold standard)

### Findings

**Path-Agnostic Routers**: ✅ VALIDATED
- Feature routers use relative paths only (get('/') not get('/api/resource'))
- Evidence: Core Express best practice from official documentation
- Recommendation: Confirm pattern

**Layered Architecture**: ✅ VALIDATED
- Three-layer: Feature routers → API aggregator → Application mount
- Evidence: Production Express apps use this exact pattern
- Recommendation: Confirm pattern

**Directory Structure**: ✅ VALIDATED
- routes/, controllers/, middleware/ separation
- Evidence: Express community standard
- Recommendation: Confirm pattern

**Version Choice**: ✅ VALIDATED
- Express 4.21.2 production-stable, Express 5 still in development
- Evidence: No critical vulnerabilities, mature ecosystem
- Recommendation: Confirm choice

**TypeScript Support**: ✅ VALIDATED
- Excellent official type definitions
- Evidence: Full type safety with explicit Router types
- Recommendation: Confirmed

**Sources**:
- Context7: Express 4.21.2 official documentation
- Exa: Production Express + TypeScript + OpenAPI examples
- Perplexity: Express 4 vs 5 comparison, Fastify alternative analysis

---

## Critical Findings Summary

### Priority 1: RECOMMENDED (Non-Breaking Enhancements)
1. **Prisma Connection Pooling** - Add Supavisor pooler with directUrl for scalability
2. **Prisma RLS Strategy** - Enable RLS + use service_role for defense-in-depth
3. **MSW 2.0 Code Examples** - Add setup examples to Pattern 10 (prevents runtime errors)
4. **Tailwind CSS Upgrade** - Update to 4.1.x for Next.js 15 optimization

### Priority 2: OPTIONAL (Documentation)
5. **OpenAPI Spec Validation** - Add Spectral linting to build pipeline
6. **Express OpenAPI Tooling** - Document openapi-ts-router integration approach

---

## Validated Patterns (No Changes)

1. **Prisma UUID Generation**: @default(uuid()) @db.Uuid - official best practice
2. **Prisma Timestamps**: @db.Timestamptz - timezone-aware, DST-safe
3. **Prisma Table Naming**: @@map("health_checks") - snake_case plural convention
4. **Prisma Singleton**: globalThis pattern prevents connection pool exhaustion
5. **jest-dom Setup**: import '@testing-library/jest-dom' in jest.setup.ts (v6.0+ pattern)
6. **user-event Standard**: await userEvent.click() - all methods async
7. **Testing Library Queries**: Semantic query priority (getByRole first)
8. **OpenAPI Spec Generation**: Runtime generation with @asteasolutions/zod-to-openapi
9. **OpenAPI Type Generation**: Build-time with openapi-typescript --export-type
10. **HTTP Client**: openapi-fetch (minimal bundle, full type safety)
11. **Nx Build Orchestration**: Target dependencies for deterministic build chain
12. **Gitignore Strategy**: Generated types as build artifacts (industry standard)
13. **Next.js Version Pinning**: Tilde for Next.js, exact for React
14. **App Router Architecture**: Server Components by default
15. **Co-located Tests**: src/ directory pattern (Next.js 15 best practice)
16. **TypeScript moduleResolution**: "bundler" for modern Next.js
17. **Express Path-Agnostic Routers**: Relative paths only (official pattern)
18. **Express Three-Layer Architecture**: Feature → Aggregator → Application
19. **Express Directory Structure**: routes/, controllers/, middleware/ separation
20. **Express Version Choice**: 4.21.2 production-stable
21. **Express TypeScript Support**: Excellent official type definitions
22. **React 19 Production Readiness**: Stable since Dec 2024

---

## Action Plan

### Documentation Updates Required
- [ ] Update docs/memories/adopted-patterns.md Pattern 8 (Prisma Schema Conventions) with RLS recommendation
- [ ] Update docs/memories/adopted-patterns.md Pattern 8 (Prisma Schema Conventions) with connection pooling guidance
- [ ] Update docs/memories/adopted-patterns.md Pattern 10 (Testing Enhancement Libraries) with MSW 2.0 code examples
- [ ] Update research.md with all decisions and validated patterns
- [ ] Update plan.md Research Validation section with findings summary

### Implementation Changes Required
- [ ] packages/database/prisma/schema.prisma: Add directUrl configuration (Stage 5.1)
- [ ] .env + .env.example: Add DIRECT_URL environment variable (Stage 5.1)
- [ ] apps/web/package.json: Upgrade tailwindcss to ^4.1.0 (Stage 5.5)
- [ ] Migration SQL: Change DISABLE to ENABLE ROW LEVEL SECURITY (Stage 5.1)

---

## Lessons Learned

**What we validated correctly**:
- All core architectural decisions (REST+OpenAPI, Prisma+Supabase, Next.js 15+React 19, Express)
- Test-driven development infrastructure (Jest 30, Testing Library, Playwright)
- Build orchestration and type safety patterns
- Directory structures and naming conventions

**What we missed initially**:
- Supabase connection pooling evolution (Supavisor now recommended)
- MSW 2.0 breaking changes (import paths, response API)
- Tailwind CSS version lag (3.4.3 vs 4.1.x)

**Why MCP servers matter**:
- **Context7**: Provided authoritative official documentation that prevented following outdated patterns
- **Supabase MCP**: Surfaced production RLS and connection pooling recommendations not in general docs
- **Exa**: Validated patterns with real production code, caught MSW 2.0 breaking changes
- **Perplexity**: Confirmed version compatibility and 2025 best practices

**Impact of research**:
- **Prevented** using direct connection without pooling (would limit scalability)
- **Prevented** disabling RLS without understanding defense-in-depth trade-offs
- **Prevented** implementing MSW v1.x patterns that would fail with MSW 2.0
- **Identified** Tailwind upgrade path before Next.js 15 optimization issues appeared
- **Validated** 22 patterns as correct, giving high confidence in infrastructure
