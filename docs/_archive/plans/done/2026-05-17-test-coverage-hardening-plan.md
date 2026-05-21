# Test Coverage Hardening Plan

Audit date: 17.5.2026

## Goal

Improve test coverage where it protects the product most: API integration behavior, shared contracts, profile scoping, database persistence, mobile user-facing states, and a small reliable E2E smoke set.

This plan is not about chasing a single global percentage. The goal is to catch important regressions before release, especially in core learner and parent flows.

## Current Snapshot

The audit on 17.5.2026 found broad test coverage across the repo, with several important weak spots.

- API unit tests passed: 233 suites, 4060 tests.
- Mobile tests were mostly passing: the broad run found one My Notes uppercase style guard failure, which was fixed.
- API integration tests were red: 4 failed suites out of 38.
- E2E inventory is broad: 174 Maestro flows.
- E2E was not run locally during the audit because the mobile runtime preconditions were not available: no emulator/device and no Metro server.
- Schemas and database package tests passed, but their coverage thresholds failed.

Coverage snapshot:

| Area | Lines | Branches | Functions | Notes |
| --- | ---: | ---: | ---: | --- |
| API unit | 74.5% | 59.0% | 71.6% | Routes and service branches are the main weak spots. |
| Mobile | 73.8% | 68.0% | 65.6% | App screens and hooks are weaker than components/lib. |
| Schemas | 57.4% | 75.3% | 30.1% | Shared contracts need more direct validation tests. |
| Database | 70.8% | 51.4% | 52.9% | Branch/upsert/isolation coverage needs work. |
| Retention | 100% | 94.1% | 100% | Strong coverage. |
| Test utils | 96.3% | 60.0% | 100% | Strong enough for now. |

## Phase 0: Clean The Test Harness

Purpose: make failures and coverage numbers trustworthy.

Tasks:

- Fix duplicate Jest mock warnings caused by `.worktrees` being scanned.
- Document official coverage commands for API unit, API integration, mobile, schemas, database, retention, and test-utils.
- Make local and CI test grouping consistent.
- Decide which package coverage thresholds are hard release gates and which are temporary targets.

Done when:

- Test output is readable.
- Coverage reports are reproducible.
- `.worktrees` warnings no longer pollute runs.

## Phase 1: Fix Red API Integration Tests

Purpose: get the database-backed safety net green before expanding coverage.

Current failing integration areas:

- `apps/api/src/inngest/functions/session-completed.integration.test.ts`
  - Relearn retention reset does not advance the card.
  - Parent push on struggle detection is not firing.
  - `waitForEvent` timeout is not captured by Sentry.
- `apps/api/src/services/dashboard.integration.test.ts`
  - Session ordering/expected recap mismatch.
- `apps/api/src/services/filing.integration.test.ts`
  - Concurrent shelf creation can resolve to different shelf IDs.
- `apps/api/src/services/dictation/result.integration.test.ts`
  - Dictation result upsert fails because the expected unique/exclusion constraint is missing.

Done when:

- API integration suite is green.
- Each fix has a regression test that fails before the fix.
- Any database schema change has a migration or explicit dev/staging plan.

## Phase 2: Strengthen Shared Contracts

Purpose: catch API/mobile contract drift before it reaches screens.

Priority schema files:

- `packages/schemas/src/notes.ts`
- `packages/schemas/src/progress.ts`
- `packages/schemas/src/bookmarks.ts`
- `packages/schemas/src/subjects.ts`
- `packages/schemas/src/billing.ts`
- `packages/schemas/src/dictation.ts`
- `packages/schemas/src/language.ts`

Test cases to add:

- Valid responses for archive-style endpoints.
- Empty pages.
- Pagination cursors and limits.
- Nullable topic/session/subject links.
- Invalid enum values.
- Invalid dates.
- Invalid or missing required fields.
- Backward compatibility for fields consumed by mobile.

Done when:

- Schemas package coverage passes its threshold.
- New notes, sessions, and bookmarks contracts have direct schema tests.
- Invalid payloads fail clearly.

## Phase 3: API Negative-Path Coverage

Purpose: protect profile scoping, validation, and user-facing error behavior.

Priority route files:

- `apps/api/src/routes/progress.ts`
- `apps/api/src/routes/notes.ts`
- `apps/api/src/routes/bookmarks.ts`
- `apps/api/src/routes/curriculum.ts`
- `apps/api/src/routes/onboarding.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/api/src/routes/assessments.ts`
- `apps/api/src/routes/settings.ts`
- `apps/api/src/routes/subjects.ts`

Test cases to add:

- Invalid cursor and invalid limit.
- Missing or inactive profile.
- Parent/child access boundaries.
- Wrong-profile access attempts.
- Empty result sets.
- Pagination boundaries.
- Service failure mapping.
- Validation errors from malformed payloads.

Done when:

- API route branch coverage improves meaningfully.
- Every archive endpoint has happy, empty, invalid, forbidden, and pagination coverage.
- Route files keep business logic in services.

## Phase 4: Core Service Risk Tests

Purpose: cover the logic most likely to damage learning state.

Priority service areas:

- Session services:
  - `session-crud.ts`
  - `session-exchange.ts`
  - `session-summary.ts`
  - `session-homework.ts`
  - `session-events.ts`
- Dashboard and progress services:
  - ordering
  - mixed homework and learning sessions
  - null recap fields
  - parent/child profile boundaries
- Notes and bookmarks services:
  - cross-topic archive order
  - orphaned topic/session references
  - pagination stability
  - profile isolation
- Filing and concurrency:
  - duplicate shelf prevention
  - simultaneous writes
  - retry and idempotency behavior

Done when:

- Core learning/session service tests cover failure and edge states, not only happy paths.
- Database-backed behavior has integration tests.
- Profile isolation is tested wherever data crosses children, parents, or subjects.

## Phase 5: Mobile Screen Coverage

Purpose: protect what learners and parents actually see.

Priority screens:

- My Notes archive:
  - sessions, notes, bookmarks
  - group by date
  - group by subject
  - search
  - empty state
  - error and retry
  - load more
  - navigation target per item type
- Progress screens:
  - saved
  - vocabulary subject detail
  - reports
  - subject sessions
- Dictation screens:
  - playback
  - review
  - complete error states
- More/settings screens:
  - account
  - privacy
  - notifications
  - help
- Onboarding and practice:
  - pronouns
  - assessment picker
  - assessment start failures

Done when:

- Mobile app route coverage improves, especially branch and function coverage.
- Each user-facing screen has loading, empty, error, and success coverage.
- Navigation tests verify the intended destination.

## Phase 6: Mobile Hook Coverage

Purpose: make async client behavior reliable.

Priority hooks:

- `use-quiz`
- `use-learner-profile`
- `use-library-search`
- `use-book-sessions`
- `use-subject-sessions`
- `use-topic-suggestions`
- `use-celebration`
- `use-shake-detector`

Test cases to add:

- Success.
- API error.
- Disabled or no active profile.
- Retry.
- Pagination where relevant.
- Stale data behavior.
- Navigation side effects where relevant.

Done when:

- Hooks that fetch, mutate, retry, or navigate have clear tests for success and failure.
- API errors remain classified at the client boundary, not parsed inside screens.

## Phase 7: E2E Smoke Set

Purpose: keep E2E meaningful and reliable.

The full Maestro library is broad, so define a smaller release smoke pack:

- Sign in and sign out.
- Learner home loads.
- Start a learning session.
- My Notes opens and shows sessions, notes, and bookmarks.
- Library topic detail opens.
- Progress overview opens.
- Parent dashboard opens.
- Saved bookmark item opens.
- Error or timeout state displays.
- Billing or quota guard displays.

Done when:

- E2E preflight confirms emulator/device, Metro, app build, and seed server.
- My Notes archive E2E is included in the learning smoke group.
- CI or release checklist names the smoke subset clearly.

## Suggested Order

1. Fix red API integration tests.
2. Add schema tests for My Notes, sessions, bookmarks, and progress contracts.
3. Add API route negative-path tests for archive endpoints.
4. Add mobile My Notes error, empty, pagination, search, and grouping coverage.
5. Expand progress, dictation, and mobile hook coverage.
6. Stabilize and document the E2E smoke pack.

## Coverage Targets

Use these as quality targets, not as a reason to write low-value tests.

- API unit: at least 80% lines and 70% branches.
- Mobile: at least 80% lines and 70% branches.
- Schemas: at least 80% lines/functions for exported contracts.
- Database: green integration tests plus targeted schema, upsert, concurrency, and isolation tests.
- E2E: small reliable smoke pack plus broader optional flows.
