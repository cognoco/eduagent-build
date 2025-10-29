# Tasks: Walking Skeleton - Infrastructure Validation

**Input**: Design documents from `/specs/001-walking-skeleton/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, contracts/health-endpoints.md, quickstart.md

**Tests**: Included - 60% coverage target for walking skeleton (elevated from constitutional 10% Phase 1 minimum)

**Coverage Rationale**: This walking skeleton serves as reference implementation demonstrating best practices for all future features. The 60% target balances thoroughness (proves infrastructure works) with efficiency (avoids over-testing temporary validation code). This is above the constitutional Phase 1 minimum (10%) but below the Phase 2+ production standard (80%).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Environment Verification)

**Purpose**: Verify environment is ready and install missing dependencies

- [ ] T001 Verify Supabase cloud project exists and is accessible
- [ ] T002 [P] Verify environment variables in `.env` (DATABASE_URL with pgbouncer params, DIRECT_URL)
- [ ] T003 [P] Install missing test libraries: `@testing-library/jest-dom`, `@testing-library/user-event`
- [ ] T004 [P] Create `apps/web/jest.setup.ts` with jest-dom import
- [ ] T005 Update `apps/web/jest.config.ts` to include setupFilesAfterEnv pointing to jest.setup.ts

**Checkpoint**: Environment ready - foundational work can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Layer (packages/database)

- [ ] T006 Update `packages/database/prisma/schema.prisma` to add HealthCheck model per data-model.md
- [ ] T007 Add `directUrl = env("DIRECT_URL")` to datasource configuration in schema.prisma
- [ ] T008 Generate and apply Prisma migration: `pnpm --filter @nx-monorepo/database prisma migrate dev --name create_health_checks`
- [ ] T009 Edit migration file to add `ALTER TABLE "health_checks" DISABLE ROW LEVEL SECURITY;`
- [ ] T010 Verify migration applied successfully and RLS disabled in Supabase dashboard
- [ ] T011 Write unit test for HealthCheck model queries in `packages/database/src/lib/database.spec.ts`

### Schema Layer (packages/schemas)

- [ ] T012 [P] Create `packages/schemas/src/lib/health.schema.ts` with HealthCheckSchema (base entity)
- [ ] T013 [P] Add CreateHealthCheckRequestSchema to health.schema.ts
- [ ] T014 [P] Add HealthCheckResponseSchema and HealthCheckListResponseSchema (Stripe-style, direct data returns)
- [ ] T015 [P] Add ApiErrorSchema with Stripe-style error format (error.code, error.message, error.errors)
- [ ] T016 [P] Add OpenAPI metadata to all schemas using `.openapi()` method
- [ ] T017 [P] Export all schemas and inferred TypeScript types from health.schema.ts
- [ ] T018 Update `packages/schemas/src/index.ts` to export health schemas
- [ ] T019 Write unit tests for schema validation in `packages/schemas/src/lib/health.schema.spec.ts`

### Server Infrastructure Updates (apps/server)

- [ ] T020 Verify `apps/server/src/middleware/validate.middleware.ts` supports CreateHealthCheckRequestSchema
- [ ] T021 Create `apps/server/src/controllers/health.controller.ts` with listChecks and ping methods (empty stubs for now)
- [ ] T022 Add Prisma error handling to health.controller.ts (P2002→409, P2025→404, P2003→400)
- [ ] T023 Create `apps/server/src/routes/health.openapi.ts` with registerHealthOpenApi function (empty stub)
- [ ] T024 Update `apps/server/src/openapi/register.ts` to import and call registerHealthOpenApi()

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View System Health Status (Priority: P1) 🎯 MVP

**Goal**: Display all health check records from database in the web UI to prove read operations work end-to-end

**Independent Test**: Navigate to /health page and see existing health check records displayed in a list

### Tests for User Story 1

> **NOTE: Write these tests FIRST using TDD workflow (RED-GREEN-REFACTOR)**

- [ ] T025 [P] [US1] Write integration test for GET /api/health endpoint in `apps/server/src/routes/health.spec.ts` (should fail initially)
- [ ] T026 [P] [US1] Write component test for HealthCheckList component in `apps/web/src/components/HealthCheckList.spec.tsx` (should fail initially)
- [ ] T027 [P] [US1] Write page test for /health route in `apps/web/src/app/health/page.spec.tsx` (should fail initially)

### Implementation for User Story 1

#### Server Implementation (apps/server)

- [ ] T028 [US1] Implement GET /api/health endpoint logic in `apps/server/src/routes/health.ts`
- [ ] T029 [US1] Implement listChecks method in `apps/server/src/controllers/health.controller.ts` with Prisma query
- [ ] T030 [US1] Register GET /api/health in OpenAPI spec via `apps/server/src/routes/health.openapi.ts`
- [ ] T031 [US1] Verify integration tests for GET endpoint now pass

#### API Client Layer (packages/api-client)

- [ ] T032 [US1] Regenerate TypeScript types from OpenAPI spec: `pnpm --filter @nx-monorepo/api-client run generate:types`
- [ ] T033 [US1] Create `packages/api-client/src/lib/health.ts` with listHealthChecks function
- [ ] T034 [US1] Update `packages/api-client/src/index.ts` to export health client functions
- [ ] T035 [US1] Write unit tests for listHealthChecks in `packages/api-client/src/lib/health.spec.ts`

#### Web UI Layer (apps/web)

- [ ] T036 [P] [US1] Create `apps/web/src/components/HealthCheckList.tsx` component to display health checks
- [ ] T037 [P] [US1] Create `apps/web/src/app/health/page.tsx` with server component fetching health checks
- [ ] T038 [US1] Implement empty state message: **"No health checks yet. Click 'Ping' to create one."** (exact wording per spec.md)
- [ ] T039 [US1] Verify component tests for HealthCheckList now pass
- [ ] T040 [US1] Verify page tests for /health route now pass

**Checkpoint**: At this point, User Story 1 should be fully functional - users can view health check records

---

## Phase 4: User Story 2 - Record Health Check Ping (Priority: P2)

**Goal**: Enable users to create new health check records via a "Ping" button to prove write operations work end-to-end

**Independent Test**: Click "Ping" button and see new health check record appear in list immediately

### Tests for User Story 2

> **NOTE: Write these tests FIRST using TDD workflow (RED-GREEN-REFACTOR)**

- [ ] T041 [P] [US2] Write integration test for POST /api/health/ping endpoint in `apps/server/src/routes/health.spec.ts` (should fail initially)
- [ ] T042 [P] [US2] Write integration test for POST validation errors in `apps/server/src/routes/health.spec.ts` (should fail initially)
- [ ] T043 [P] [US2] Write component test for PingButton component in `apps/web/src/components/PingButton.spec.tsx` (should fail initially)

### Implementation for User Story 2

#### Server Implementation (apps/server)

- [ ] T044 [US2] Implement POST /api/health/ping endpoint logic in `apps/server/src/routes/health.ts` with validateBody middleware
- [ ] T045 [US2] Implement ping method in `apps/server/src/controllers/health.controller.ts` with Prisma create query
- [ ] T046 [US2] Register POST /api/health/ping in OpenAPI spec via `apps/server/src/routes/health.openapi.ts`
- [ ] T047 [US2] Verify integration tests for POST endpoint now pass (success and validation error cases)

#### API Client Layer (packages/api-client)

- [ ] T048 [US2] Regenerate TypeScript types from updated OpenAPI spec: `pnpm --filter @nx-monorepo/api-client run generate:types`
- [ ] T049 [US2] Add createHealthCheckPing function to `packages/api-client/src/lib/health.ts`
- [ ] T050 [US2] Write unit tests for createHealthCheckPing in `packages/api-client/src/lib/health.spec.ts`

#### Web UI Layer (apps/web)

- [ ] T051 [US2] Create `apps/web/src/components/PingButton.tsx` client component with onClick handler
- [ ] T052 [US2] Implement optimistic UI update in PingButton (show new record immediately)
- [ ] T053 [US2] Add error handling and error message display to PingButton component (implements FR-010)
  - Display inline error message (red text) below button when POST fails
  - Show validation errors from Zod schema (e.g., "Message too long (maximum 500 characters)")
  - Show network errors (e.g., "Unable to connect to server. Please try again.")
- [ ] T054 [US2] Update `apps/web/src/app/health/page.tsx` to include PingButton component
- [ ] T055 [US2] Verify component tests for PingButton now pass

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - users can view and create health checks

---

## Phase 5: User Story 3 - Verify Data Persistence (Priority: P3)

**Goal**: Confirm that health check records persist across page refreshes and server restarts

**Independent Test**: Create health checks, refresh page, verify records still exist

### Tests for User Story 3

- [ ] T056 [US3] Write E2E test for data persistence across page refresh in `apps/web-e2e/src/health.spec.ts`
- [ ] T057 [US3] Write E2E test for full user journey (view → ping → refresh → verify) in `apps/web-e2e/src/health.spec.ts`

### Implementation for User Story 3

- [ ] T058 [US3] Implement E2E test scenario: create health check, refresh page, verify persistence
- [ ] T059 [US3] Implement E2E test scenario: multiple rapid pings, verify all recorded without data loss
- [ ] T060 [US3] Verify all E2E tests pass with real database

**Checkpoint**: All user stories should now be independently functional with full persistence validation

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality validation and final touches affecting all user stories

### Code Quality & Coverage

- [ ] T061 [P] Run test coverage across all projects: `pnpm exec nx run-many -t test --coverage`
- [ ] T062 [P] Verify minimum 60% coverage achieved for all projects (web, server, schemas, database, api-client)
- [ ] T063 Address any coverage gaps identified (add missing unit tests if below threshold)

### Documentation & Validation

- [ ] T064 [P] Verify Swagger UI accessible at http://localhost:3001/api/docs
- [ ] T065 [P] Verify OpenAPI spec accurate at http://localhost:3001/api/docs/openapi.json
- [ ] T066 Run full quickstart.md validation (follow all steps as new developer would)

### Build & Quality Gates

- [ ] T067 [P] Run full build: `pnpm exec nx run-many -t build`
- [ ] T068 [P] Run linting: `pnpm exec nx run-many -t lint`
- [ ] T069 [P] Run type checking: `pnpm exec nx run-many -t typecheck`
- [ ] T070 Verify all quality gates pass (build, lint, typecheck, test)

### Performance Validation

- [ ] T071 Verify health check list load time < 2 seconds (SC-001)
- [ ] T072 Verify health check ping creation < 1 second (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories CAN proceed in parallel (if staffed)
  - OR sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on Foundational (Phase 2) - Extends US1 UI but independently testable
- **User Story 3 (P3)**: Depends on US1 and US2 being complete (validates full CRUD cycle)

### Within Each User Story

1. Tests MUST be written FIRST and FAIL before implementation (TDD RED phase)
2. Server implementation (endpoints, controllers, OpenAPI)
3. API client implementation (type generation, client functions)
4. Web UI implementation (components, pages)
5. Verify tests now PASS (TDD GREEN phase)
6. Refactor if needed while keeping tests green (TDD REFACTOR phase)

### Parallel Opportunities

**Setup Phase (Phase 1)**:
- T002, T003 can run in parallel (independent verification and installation tasks)

**Foundational Phase (Phase 2)**:
- T012-T017 (all schema creation tasks) can run in parallel - different schema files

**User Story 1 (Phase 3)**:
- T025-T027 (all tests) can run in parallel - different test files
- T036-T037 (UI components) can run in parallel - different component files

**User Story 2 (Phase 4)**:
- T041-T043 (all tests) can run in parallel - different test files

**Polish Phase (Phase 6)**:
- T061-T062, T064-T065, T067-T069 can run in parallel - independent validation tasks

---

## Parallel Example: User Story 1 Implementation

```bash
# After writing all tests (T025-T027), implement server + client + UI in parallel:

# Terminal 1: Server implementation
Task T028: Implement GET /api/health endpoint in routes/health.ts
Task T029: Implement listChecks in controllers/health.controller.ts
Task T030: Register in OpenAPI spec

# Terminal 2: API Client implementation (can start immediately after T030)
Task T032: Regenerate TypeScript types
Task T033: Create listHealthChecks function
Task T035: Write unit tests

# Terminal 3: Web UI implementation (can start immediately after T032)
Task T036: Create HealthCheckList component
Task T037: Create /health page
Task T039-T040: Verify component/page tests pass
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (5 tasks) → ~30 minutes
2. Complete Phase 2: Foundational (19 tasks) → ~4-6 hours
3. Complete Phase 3: User Story 1 (16 tasks) → ~4-6 hours
4. **STOP and VALIDATE**: Test User Story 1 independently via quickstart.md
5. Demo read operations working end-to-end

**Total MVP Effort**: ~1-2 days for experienced developer

### Incremental Delivery

1. **Foundation Complete** (Phases 1-2) → Database + schemas + infrastructure ready
2. **MVP Delivered** (+ Phase 3) → Users can view health checks (read-only demo)
3. **Write Operations Added** (+ Phase 4) → Users can create health checks (full CRUD demo)
4. **Persistence Validated** (+ Phase 5) → E2E tests confirm data integrity
5. **Production Ready** (+ Phase 6) → All quality gates pass, coverage met

### Parallel Team Strategy

With 3 developers after Foundational phase completes:

- **Developer A**: User Story 1 (Phase 3) - Focus on read operations
- **Developer B**: User Story 2 (Phase 4) - Focus on write operations (starts after US1 UI done)
- **Developer C**: Testing & Infrastructure (T019, T035, E2E setup)

**Integration Point**: After US1 and US2 complete, Developer B adds PingButton to US1's /health page

---

## Task Summary

**Total Tasks**: 72

**Tasks by Phase**:
- Phase 1 (Setup): 5 tasks
- Phase 2 (Foundational): 19 tasks
- Phase 3 (User Story 1 - P1): 16 tasks
- Phase 4 (User Story 2 - P2): 15 tasks
- Phase 5 (User Story 3 - P3): 5 tasks
- Phase 6 (Polish): 12 tasks

**Tasks by User Story**:
- User Story 1 (View health status): 16 tasks
- User Story 2 (Record ping): 15 tasks
- User Story 3 (Verify persistence): 5 tasks
- Shared/Infrastructure: 36 tasks

**Parallel Opportunities Identified**: 15+ tasks can run concurrently across different files

**Critical Path**: Setup → Foundational → US1 (server → client → UI) → US2 (server → client → UI) → US3 (E2E) → Polish

**Suggested MVP Scope**: Phases 1-3 (User Story 1 only) = 40 tasks = Proof that read operations work end-to-end

---

## Notes

- All tasks follow strict checklist format: `- [ ] [TaskID] [P?] [Story?] Description with file path`
- [P] tasks = different files, no dependencies, safe to parallelize
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- TDD workflow: RED (write failing test) → GREEN (minimal code to pass) → REFACTOR (clean up)
- Tests are included per Phase 1 requirement: minimum 60% coverage
- Critical research findings incorporated: Stripe-style errors, Supabase config params, Prisma error handling
- Stop at any checkpoint to validate story independently before proceeding
