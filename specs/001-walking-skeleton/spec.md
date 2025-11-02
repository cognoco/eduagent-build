# Feature Specification: Walking Skeleton Health Check

**Feature Branch**: `001-walking-skeleton`
**Created**: 2025-10-30
**Status**: Draft
**Input**: Phase 1 Stage 5 - Implement minimal end-to-end feature to validate infrastructure

## Purpose

This specification defines a **throwaway validation feature** designed to prove that all infrastructure components work together correctly. The health check feature exercises every layer of the architecture (Web → API Client → Server → Database → Supabase) with trivial business logic, allowing infrastructure issues to surface before POC development begins.

**This is NOT production code** - it will be deleted once infrastructure validation is complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View System Health Status (Priority: P1)

As a developer validating the monorepo infrastructure, I need to see a list of health check records so that I can confirm end-to-end data flow from Supabase through Prisma to the web UI.

**Why this priority**: This is the core read operation that validates the entire data retrieval pipeline. Without this working, we cannot prove that database connections, type generation, API routing, and UI rendering are properly configured.

**Independent Test**: Can be fully tested by navigating to `/health` page and observing that data from the database appears in the browser. Delivers proof that GET endpoints work and type safety is intact from database to UI.

**Acceptance Scenarios**:

1. **Given** the Supabase database contains health check records, **When** I navigate to `http://localhost:3000/health`, **Then** I see a list of health check messages with timestamps displayed on the page
2. **Given** the database is empty, **When** I navigate to `/health`, **Then** I see an empty state message indicating no health checks exist yet
3. **Given** the server is running, **When** the page loads, **Then** the API request completes within 2 seconds and displays results without errors
4. **Given** I am on the `/health` page, **When** I refresh the browser, **Then** the same data is displayed (proving data persistence in Supabase)

---

### User Story 2 - Ping System Health (Priority: P2)

As a developer validating the monorepo infrastructure, I need to create new health check records by clicking a button so that I can confirm end-to-end data writes from the web UI through the API to Supabase.

**Why this priority**: This validates the write operation pipeline, including Zod schema validation, OpenAPI type generation, Prisma mutations, and database persistence. It completes the full CRUD validation cycle.

**Independent Test**: Can be fully tested by clicking the "Ping" button on the `/health` page and observing that a new record appears immediately in the UI and persists in the Supabase database. Delivers proof that POST endpoints work and type safety is maintained for write operations.

**Acceptance Scenarios**:

1. **Given** I am on the `/health` page, **When** I click the "Ping" button, **Then** a new health check record is created with the current timestamp and appears in the list
2. **Given** I create a new health check, **When** I refresh the page, **Then** the new record is still visible (proving database persistence)
3. **Given** I create a new health check, **When** I check the Supabase dashboard, **Then** I see the new record in the `health_checks` table
4. **Given** I am on the `/health` page, **When** I click "Ping" multiple times, **Then** each click creates a distinct new record with unique timestamps

---

### User Story 3 - Handle System Errors Gracefully (Priority: P3)

As a developer validating error handling, I need to see clear error messages when the system fails so that I can confirm error boundaries and validation are working correctly.

**Why this priority**: Error handling is important for infrastructure validation but not critical for proving the happy path works. This can be minimally implemented and enhanced in Phase 2.

**Independent Test**: Can be tested by stopping the server and observing error messages in the web UI. Delivers proof that error boundaries and user feedback mechanisms are functional.

**Acceptance Scenarios**:

1. **Given** the API server is down, **When** I navigate to `/health`, **Then** I see error message: "Unable to connect to server. Please ensure the API server is running."
2. **Given** the database connection fails, **When** I attempt to load health checks, **Then** I see error message: "Database connection error. Unable to load health checks."
3. **Given** I send invalid data to the ping endpoint, **When** the server validates the request, **Then** I receive error message with validation details (e.g., "Validation error: Expected string, received number")

---

### Edge Cases

- What happens when the database contains hundreds of health check records? (Performance is not a concern for this throwaway feature - no pagination needed)
- What happens when multiple users click "Ping" simultaneously? (Each request creates an independent record - no conflict resolution needed)
- What happens when the network is slow? (UI should show loading state - basic implementation acceptable)
- What happens when browser localStorage is disabled? (Not applicable - no client-side storage used)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a list of all health check records from the Supabase database on the `/health` page
- **FR-002**: System MUST allow users to create new health check records by clicking a "Ping" button
- **FR-003**: System MUST persist health check records in the Supabase `health_checks` table
- **FR-004**: System MUST use Prisma ORM for all database operations (queries and mutations)
- **FR-005**: System MUST validate API requests using Zod schemas defined in `@nx-monorepo/schemas`
- **FR-006**: System MUST generate TypeScript types from OpenAPI specification using `openapi-typescript`
- **FR-007**: System MUST provide end-to-end type safety from database schema through API client to web UI
- **FR-008**: System MUST use REST+OpenAPI architecture for all client-server communication
- **FR-009**: Web UI MUST be styled with Tailwind CSS (minimal styling acceptable: Tailwind utility classes only, no custom CSS, unstyled components are acceptable)
- **FR-010**: System MUST include co-located unit tests in `src/` for all packages (database, schemas, api-client)
- **FR-011**: System MUST include integration tests in `src/` for server endpoints
- **FR-012**: System MUST achieve >= 60% test coverage across all shared packages
- **FR-013**: System MUST pass all pre-commit quality gates (lint, typecheck, tests, build)
- **FR-014**: All walking skeleton code MUST be clearly marked for future deletion (comments, file organization)

### Key Entities *(include if feature involves data)*

- **HealthCheck**: Represents a single health check record in the system
  - `id` (UUID): Unique identifier, generated by database
  - `message` (String): Descriptive message for the health check (default: "Health check ping")
  - `timestamp` (DateTime): When the health check was created, timezone-aware (PostgreSQL `timestamptz`)
  - Persistence: Stored in Supabase PostgreSQL table `health_checks` (snake_case plural, mapped via Prisma `@@map`)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can clone the repository, run `pnpm install`, and successfully build all projects without errors
- **SC-002**: A developer can start the server (`pnpm exec nx run server:serve`) and web app (`pnpm exec nx run web:dev`) and access the `/health` page at `http://localhost:3000/health`
- **SC-003**: Health check data displays on the `/health` page within 2 seconds of page load
- **SC-004**: Clicking "Ping" creates a new health check record that appears in the UI within 1 second
- **SC-005**: New health check records persist in the Supabase database (verifiable via Supabase dashboard)
- **SC-006**: All TypeScript code compiles without errors across web, server, and shared packages
- **SC-007**: All linting rules pass across all projects (`pnpm exec nx run-many -t lint`)
- **SC-008**: All unit and integration tests pass (`pnpm exec nx run-many -t test`)
- **SC-009**: Test coverage is >= 60% for `packages/database`, `packages/schemas`, and `packages/api-client`
- **SC-010**: All builds complete successfully (`pnpm exec nx run-many -t build`)
- **SC-011**: Nx dependency graph shows clean unidirectional dependencies (verifiable via `pnpm exec nx graph`)
- **SC-012**: Pre-commit hooks pass (lint-staged + affected tests) allowing successful commits
- **SC-013**: TypeScript autocomplete works in VS Code for API client methods (manual verification)
- **SC-014**: OpenAPI specification is generated as a build artifact (not committed)

### Technology Stack Validation

- **SC-015**: Prisma migrations are applied successfully to Supabase database
- **SC-016**: Prisma Client generates TypeScript types matching the database schema
- **SC-017**: Zod schemas validate request/response payloads correctly
- **SC-018**: OpenAPI spec accurately represents all implemented endpoints
- **SC-019**: `openapi-typescript` generates types that match server implementation
- **SC-020**: Next.js 15 App Router renders the `/health` page with React 19
- **SC-021**: Express server routes requests correctly with OpenAPI integration
- **SC-022**: Nx caching works for all build, test, and lint tasks (verifiable by running twice)

### Infrastructure Validation Goals

The walking skeleton proves:
1. **Package compatibility**: All dependencies (Next.js 15, React 19, Prisma 6, Jest 30, Nx 21) work together
2. **Type safety**: TypeScript types flow correctly from database → Prisma → Zod → OpenAPI → API client → Web UI
3. **Build system**: Nx correctly manages dependencies between apps and packages
4. **Testing infrastructure**: Jest configuration works for unit and integration tests with co-located test files
5. **Database connection**: Supabase PostgreSQL connects successfully from server via Prisma
6. **API architecture**: REST+OpenAPI pattern works end-to-end with type generation
7. **Quality gates**: Pre-commit hooks, linting, type checking, and testing all pass

## Technical Implementation Notes

### Phase-Specific Constraints

- **Test Coverage Threshold**: 10% until Stage 5; 60% at Stage 5 (Walking Skeleton); 80% in Phase 2+
- **RLS Policy**: Enabled for defense-in-depth on the API path (PostgREST). Prisma uses a SQL database role (superuser in Phase 1) that bypasses RLS; service_role does not apply to Prisma.
- **Error Handling**: Minimal implementation acceptable (basic try-catch covering: 500 for database errors, 400 for validation errors, connection refused handling in UI)
- **UI Polish**: Basic Tailwind styling acceptable (focus on functionality, not design)
- **Performance**: Not a concern for this throwaway feature (no optimization needed)

### TDD Implementation Strategy

Per constitutional requirement III (Test-Driven Development - AI-Adapted):

1. **Cycle 1 - Database Layer** (5.1):
   - Write unit tests for `getHealthChecks()` and `createHealthCheck(message)` functions
   - Verify tests fail (Red)
   - Implement Prisma query functions
   - Verify tests pass (Green)

2. **Cycle 2 - Schemas Layer** (5.2):
   - Write unit tests for Zod schema validation (`healthPingSchema`)
   - Verify tests fail (Red)
   - Implement Zod schemas with type exports
   - Verify tests pass (Green)

3. **Cycle 3 - Server Endpoints** (5.3):
   - Write integration tests for `GET /api/health` and `POST /api/health/ping` endpoints
   - Verify tests fail (Red)
   - Implement Express endpoints with Zod validation
   - Generate OpenAPI spec (defines paths `/health` and `/health/ping` with `servers: [{ url: '/api' }]`) and TypeScript types
   - Verify tests pass (Green)

4. **Cycle 4 - API Client** (5.4):
   - Write unit tests for `createApiClient(config)` factory
   - Verify tests fail (Red)
   - Implement type-safe HTTP client with generated types
   - Verify tests pass (Green)

5. **Cycle 5 - Web UI** (5.5):
   - Manual testing acceptable for UI layer (E2E tests optional for Phase 1)
   - Focus on visual verification and user interaction

### Walking Skeleton Code Marking

All code related to the health check feature MUST include comments indicating it's throwaway:

```typescript
// WALKING SKELETON: Delete this file when POC development begins
```

This ensures easy cleanup once infrastructure validation is complete.

## Dependencies

This specification depends on completion of:
- **Stage 0**: Current state audit (prerequisites verified, workspace validated)
- **Stage 1**: Server application generated and validated
- **Stage 2**: All shared packages generated (database, schemas, api-client, supabase-client)
- **Stage 3**: QA infrastructure setup (Husky, lint-staged, Jest configuration, coverage thresholds)
- **Stage 4**: Infrastructure configuration complete:
  - REST+OpenAPI integration working
  - Supabase project created with `health_checks` table
  - Prisma schema with `HealthCheck` model defined
  - Database migrations applied
  - Environment variables configured

## Out of Scope

The following are explicitly **out of scope** for the walking skeleton:

- Authentication/authorization (deferred to Phase 2)
- Row Level Security (RLS) policies (deferred to Phase 2); RLS is enabled without policies in Phase 1 for API-path defense-in-depth
- Pagination or infinite scroll (not needed for throwaway feature)
- Real-time subscriptions (not needed for validation)
- Mobile application (deferred to Phase 2)
- Production-grade error handling (minimal implementation acceptable)
- Performance optimization (not a concern for throwaway feature)
- UI/UX polish (basic functionality only)
- Accessibility (WCAG compliance deferred to Phase 2)
- Internationalization (i18n deferred to Phase 2)
- E2E tests with Playwright (optional for Phase 1, required for Phase 2)

## Estimated Implementation Time

**Total: 3-4 hours** (per P1-plan.md Stage 5 estimate)

Breakdown:
- 5.1 Database layer + tests: 30 minutes
- 5.2 Schemas layer + tests: 20 minutes
- 5.3 Server endpoints + tests: 60 minutes
- 5.4 API client + tests: 30 minutes
- 5.5 Web UI: 40 minutes
- 5.6 Manual validation: 20 minutes
- 5.7 Coverage threshold update: 10 minutes

## Verification & Completion Checklist

Per constitutional requirement IV (Verification Before Completion), the following verification notes must be produced:

### Executed Commands
- [ ] `pnpm install` completes without errors
- [ ] `pnpm exec nx run-many -t lint` passes for all projects
- [ ] `pnpm exec nx run-many -t typecheck` passes for all projects
- [ ] `pnpm exec nx run-many -t test` passes with >= 60% coverage
- [ ] `pnpm exec nx run-many -t build` completes successfully
- [ ] `pnpm exec nx run server:serve` starts server without errors
- [ ] `pnpm exec nx run web:dev` starts web app without errors
- [ ] `pnpm exec nx graph` shows clean dependency structure

### Manual Test Scenarios
- [ ] Navigate to `http://localhost:3000/health` - page loads successfully
- [ ] Health check list displays data from Supabase database
- [ ] Click "Ping" button - new record appears in UI immediately
- [ ] Refresh page - new record persists
- [ ] Check Supabase dashboard - new record visible in `health_checks` table
- [ ] Stop server - web UI shows clear error message
- [ ] TypeScript autocomplete works for API client methods in VS Code

### Residual Risks
- [ ] Document any known issues or limitations
- [ ] Document any manual workarounds needed
- [ ] Document any deferred improvements for Phase 2

## Governance Alignment

This specification aligns with:
- **docs/architecture-decisions.md**: Uses REST+OpenAPI, Supabase+Prisma, Nx monorepo structure
- **docs/memories/adopted-patterns.md**: Co-located tests in `src/`, TypeScript module resolution patterns, Jest configuration patterns
- **docs/tech-stack.md**: Uses pinned versions (Next.js 15.2, React 19, Prisma 6, Jest 30, Nx 21)
- **docs/P1-plan.md**: Implements Stage 5 requirements exactly as specified

Any deviations are documented in `specs/exceptions.md` with rationale, scope, and expiry.
