# Mock Fix Plan

> Date: 2026-04-04
> Goal: map where tests replace real implementation with mocks, explain why, and identify the highest-leverage path to real-code coverage.
> Audit scope: `tests/integration`, `apps/api/src`, `apps/mobile/src`, `packages/database/src`
> Method: searched `jest.mock()` across the test tree, then inspected representative files that use hand-rolled fakes such as `createMockDb`, fake fetch clients, mock JWT helpers, and mock providers.

## Progress Update

### 2026-04-05

Launch billing direction update:

- Mobile launch path is Apple App Store + Google Play billing first, via RevenueCat.
- Existing Stripe code and the converted Stripe webhook coverage remain useful as dormant coverage for a future web / direct-billing path, but Stripe is not the primary launch-critical billing track.
- Billing-related integration priority should therefore shift from Stripe-first to RevenueCat-first.

Completed in this pass:

- Updated `tests/integration/setup.ts` to load `DATABASE_URL` for real integration runs and clarified that the suite should keep app/database code real by default.
- Added `tests/integration/helpers.ts` to centralize integration env setup and DB cleanup for seeded test accounts.
- Updated `packages/test-utils/src/lib/load-database-env.ts` so integration runs fall back from `.env.test.local` to `.env.development.local` in local development.
- Converted these suites to use the real app path with app-owned internals left real:
  - `tests/integration/health-cors.integration.test.ts`
  - `tests/integration/auth-chain.integration.test.ts`
  - `tests/integration/subject-management.integration.test.ts`
- Verified the converted suites with:
  - `pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/health-cors.integration.test.ts tests/integration/auth-chain.integration.test.ts tests/integration/subject-management.integration.test.ts`

Completed in a follow-up pass:

- Converted `tests/integration/stripe-webhook.integration.test.ts` to use the real public webhook route, real billing writes, real quota updates, and real KV payload generation.
- Converted `tests/integration/learning-session.integration.test.ts` to use the real session lifecycle, real metering/quota decrement, real summary persistence, real interleaved topic selection, and real recall-bridge generation.
- Reduced the remaining mocked seams in these converted suites to external boundaries only:
  - Stripe signature verification
  - Inngest transport bootstrapping / send
  - JWT verification for authenticated session coverage
- Corrected a stale mock-only expectation in the old learning-session suite:
  - `POST /v1/sessions/interleaved` returns `{ sessionId, topics }`, not `body.session`
- Verified the additional converted suites with:
  - `pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/stripe-webhook.integration.test.ts tests/integration/learning-session.integration.test.ts`

Completed in the 2026-04-05 afternoon pass:

- Converted `tests/integration/account-deletion.integration.test.ts` to real deletion scheduling, cancellation, and data export against the real DB.
  - Mocked seams: JWT verification, Inngest transport (for event dispatch assertions).
  - 8 tests: deletion scheduling (gracePeriodEnds, DB row verification, Inngest event payload), cancellation (DB row verification, timestamp ordering), export (profile data), and 401 auth checks.
- Converted `tests/integration/parent-dashboard.integration.test.ts` to real dashboard aggregation queries against the real DB.
  - Mocked seams: JWT verification only.
  - Seeds parent/child profiles via routes, family links + sessions + session events via direct DB inserts.
  - 11 tests: children list with real aggregation (sessions, subjects, trend), empty children, child detail, child sessions list, session transcript with escalation rungs, demo endpoint, family-link access control (null when no link), and 401 auth checks.
- Converted `tests/integration/retention-lifecycle.integration.test.ts` to real SM-2 retention flow against the real DB.
  - Mocked seams: JWT verification only. LLM evaluation handled by the mock provider registered in `setup.ts` (falls back to length-based heuristic: >100 chars → quality 4, >20 chars → quality 3, else → quality 2).
  - Seeds curriculum/topics/retention cards via direct DB inserts.
  - 18 tests: subject retention cards with review-due counting, topic retention card lookup, recall test pass/fail via answer length, remediation after 3+ failures (FR52-58), relearn with SM-2 reset (DB-verified), needs-deepening after relearn, teaching preference full CRUD with analogy domain (FR134-137), topic stability with 5+ consecutive successes (FR93), validation (400), and 401 auth checks.
- Verified all 37 tests across the three suites with:
  - `pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/account-deletion.integration.test.ts tests/integration/parent-dashboard.integration.test.ts tests/integration/retention-lifecycle.integration.test.ts`

Completed in the 2026-04-05 evening pass:

- Converted `tests/integration/onboarding.integration.test.ts` to real onboarding draft + curriculum route coverage against the real app and DB.
  - Mocked seams: JWT verification, LLM transport only.
  - Covers in-progress draft persistence, resumable state, completed interview flow, curriculum persistence, SSE onboarding stream completion, and 401 auth checks.
- Converted `tests/integration/billing-lifecycle.integration.test.ts` to real billing route coverage against real account/subscription/quota rows.
  - Mocked seams: JWT verification, Stripe SDK wrapper only.
  - Covers free-default account state, real subscription reads, checkout customer linking, cancellation with DB verification, usage reads, portal session creation, and 401 auth checks.
- Converted `tests/integration/inngest-quota-reset.integration.test.ts` to invoke the real Inngest function against the real DB.
  - Covers daily quota reset, expired monthly cycle reset, tier-based limit restoration, and step order assertions.
- Converted `tests/integration/inngest-trial-expiry.integration.test.ts` to invoke the real Inngest function against the real DB.
  - Mocked seam: push delivery only.
  - Covers just-expired trial transition, extended-trial downgrade, owner-profile notification fanout, and step order assertions.
- Converted `tests/integration/test-seed.integration.test.ts` to real `/__test/*` route coverage against the real DB.
  - Covers real seeding, production guard, real scenario listing from `VALID_SCENARIOS`, and reset semantics that delete seed-created accounts while leaving non-seed accounts alone.
- Verified the five converted suites with:
  - `pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/onboarding.integration.test.ts tests/integration/billing-lifecycle.integration.test.ts tests/integration/inngest-quota-reset.integration.test.ts tests/integration/inngest-trial-expiry.integration.test.ts tests/integration/test-seed.integration.test.ts`
- Verified the primary cleanup rule with:
  - `rg -n "jest\\.mock\\('@eduagent/database'\\)" tests/integration`
  - Result: no matches

Observation from this pass:

- The consent middleware (GDPR-everywhere) blocks non-exempt routes for profiles with PENDING consent status. Dashboard tests initially used birthYear 2015 (age ~11) for the child profile, which triggered consent enforcement on `/v1/subjects`. Fixed by using birthYear 2004 (age 22) — family links work regardless of age.

Completed in the previous pass:

- Converted `tests/integration/profile-isolation.integration.test.ts` to real profile-scope middleware + real DB ownership checks with JWT as the only mocked seam.
- Converted `tests/integration/homework.integration.test.ts` to real homework session creation + real DB persistence, with OCR faked only through the OCR provider DI seam.
- Converted `tests/integration/session-completed-chain.integration.test.ts` to a DB-backed Inngest chain test with real retention, summaries, streaks, XP, learning-mode updates, and coaching-card cache writes.
- Reduced the remaining mocked seams in the new chain coverage to true external boundaries only:
  - Voyage embedding transport
  - Sentry reporting
- Verified the new conversions with:
  - `pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/profile-isolation.integration.test.ts tests/integration/homework.integration.test.ts tests/integration/session-completed-chain.integration.test.ts`

Second real issue surfaced by the conversion:

- The session-completed chain was calling `db.transaction(...)` through the `neon-http` Drizzle client returned by `createDatabase()`.
- In real execution, that caused the `write-coaching-card`, `update-dashboard`, and `queue-celebrations` steps to fail with `No transactions support in neon-http driver`.
- Production fix applied: `packages/database/src/client.ts` now falls back to executing the transaction callback directly when the driver does not support multi-statement transactions, so these steps degrade gracefully instead of failing outright.
- Important nuance: this is a pragmatic compatibility fix, not full transactional semantics. It restores the broken path on the current driver, but true row-locking/atomicity still depends on using a transaction-capable driver.

Additional non-breaking observation:

- `POST /v1/profiles` still logs `[findOwnerProfile] No owner profile ... falling back to oldest profile` on first-profile creation.
- This is middleware noise, not a failing flow: profile-scope runs before the first profile exists, then the route creates that owner profile successfully.

First real issue surfaced by the conversion:

- Local/dev database schema drift. The real subject-management flow initially failed because the database was missing the `subjects.pedagogy_mode` column expected by the current Drizzle schema.
- Local fix applied: `pnpm run db:push:dev`
- Important nuance: this fixed the local/dev database used for verification. Production/staging are only fixed if their database schema has the same change applied.

Plan impact:

- Phase 0 is partially complete: misleading comments/harness expectations were corrected in the converted integration path.
- Phase 1 is now established for the first converted suites: real DB, real middleware, real routes, with mocks limited to true external seams.
- Phase 2 is complete for the existing suites in `tests/integration`:
  - Converted: `auth-chain`, `health-cors`, `subject-management`, `stripe-webhook`, `learning-session`, `profile-isolation`, `homework`, `session-completed-chain`, `account-deletion`, `parent-dashboard`, `retention-lifecycle`, `onboarding`, `billing-lifecycle`, `inngest-quota-reset`, `inngest-trial-expiry`, `test-seed`
  - `revenuecat-webhook` remains the next launch-critical billing target once RevenueCat setup is available
  - No pre-existing suite in `tests/integration` still mocks `@eduagent/database`

Third real issue surfaced by the conversion:

- The real `quota-reset` cron path failed in Postgres with `column "monthly_limit" is of type integer but expression is of type text`.
- Production fix applied: `apps/api/src/services/billing.ts` now casts the tier CASE values in `resetExpiredQuotaCycles(...)` to `integer`, so the nightly reset works on the real DB path instead of failing at runtime.

## Snapshot

Historical note: the counts below are the original audit snapshot from 2026-04-04/05, not a live post-conversion recount.

- 215 test/setup files scanned.
- 147 files use `jest.mock()`.
- 653 `jest.mock()` calls total.
- 540 mock calls target our own code (`@eduagent/*` or relative app modules).
- 113 mock calls target third-party or platform code.
- No HTTP-level mock harness like `msw`, `nock`, or Axios `MockAdapter` is present.
- `@eduagent/database` is the single most replaced seam (57 `jest.mock()` calls).
- The next repeated seams are auth/account/profile/billing/session/llm on the API side and `api-client`/`profile`/navigation on the mobile side.

## What counts as a problem for this cleanup

High priority to remove:

- Mocks of our own services, middleware, routes, repositories, and DB package in tests that claim to be integration or route coverage.
- Hand-built fake Drizzle chains in persistence-heavy service tests where query shape, transactions, row mapping, or race behavior matter.
- Screen tests that replace most hooks and only assert rendering against invented hook state.

Lower priority, often still reasonable:

- Native/platform shims required for Jest to render Expo or React Native code at all.
- Wrapper tests around third-party SDKs where the wrapper itself is the unit under test.
- Deterministic edge helpers such as mocking UUID/time at an adapter boundary.

## Area Summary

| Area | Files scanned | Files with `jest.mock()` | Mock calls | What is mostly being replaced |
| --- | ---: | ---: | ---: | --- |
| `tests/integration` | 16 | 16 | 154 | Entire API composition, DB, JWT, Inngest, and feature services |
| `apps/api/src/routes` | 27 | 25 | 152 | Auth/db/profile stack plus the route-specific service |
| `apps/api/src/services` | 54 | 27 | 51 | Collaborator services and DB adapters; many more manual fake DBs than `jest.mock()` shows |
| `apps/api/src/inngest/functions` | 9 | 8 | 36 | Step helpers plus all downstream services in a chain |
| `apps/api/src/middleware` | 11 | 7 | 15 | JWT, DB, account/profile services, env config |
| `apps/mobile/src/app` | 30 | 27 | 143 | Navigation, hooks, profile/api clients, native adapters, child components |
| `apps/mobile/src/hooks` | 23 | 21 | 53 | `api-client`, profile, auth, native SDKs |
| `apps/mobile/src/components` | 26 | 10 | 32 | Theme, hooks, icons, native wrappers |
| `apps/mobile/src/lib` | 10 | 4 | 5 | Native SDK wrappers |
| `apps/mobile/src/test-setup.ts` | 1 | 1 | 11 | Global Expo/React Native Jest shims |
| `packages/database/src` | 4 | 1 | 1 | Deterministic helper (`uuid`) |

## Root Causes

- `apps/api/src/index.ts` builds the full app eagerly. Importing `app` pulls in auth, DB, account, profile, consent, metering, LLM, Inngest, and all routes. That is why even `/v1/health` tests end up mocking unrelated modules.
- `tests/integration/mocks.ts` makes full-module mocking easy with `jest.createMockFromModule()`, so suites drift toward mocking whole internal layers instead of stopping at the external boundary.
- `tests/integration/setup.ts` registers a mock LLM provider globally, but most integration suites still mock `services/llm` entirely, so they do not even exercise the real router/provider selection code.
- Mobile screens depend directly on hooks, navigation, and native adapters, so tests replace those hooks instead of exercising real data flow.
- Persistence-heavy services mix branching logic and DB calls. Fake Drizzle builders are easier to stand up than a real Postgres-backed harness, so tests picked the fake path.

## Biggest Confidence Gap (original — now addressed for the existing suites)

- ~~`tests/integration/setup.ts` says integration tests use a real PostgreSQL DB, but every file under `tests/integration` uses `jest.mock('@eduagent/database', ...)`~~ — fixed. `rg -n "jest\\.mock\\('@eduagent/database'\\)" tests/integration` now returns no matches.
- ~~`tests/integration/health-cors.integration.test.ts` says "Only external dependencies are mocked", but it also mocks internal services~~ — fixed; health-cors now runs with JWT as the only mock.

The original unconverted suites (`onboarding`, `billing-lifecycle`, `inngest-quota-reset`, `inngest-trial-expiry`, `test-seed`) have now been converted to real DB-backed coverage. The remaining launch-critical gap is adding `revenuecat-webhook`.

## Top Internal Mock Seams

- `@eduagent/database` - 57 calls
- account/profile/auth/billing/session/llm/inngest - repeated throughout API route and integration suites
- `../lib/api-client` and `../lib/profile` - repeated throughout mobile hook and screen suites

## Map: `tests/integration`

In the table below, "base app chain" means the recurring bundle of mocks for `middleware/jwt`, `@eduagent/database`, `inngest/client`, `services/account`, `services/billing`, `services/settings`, `services/session`, and `services/llm`, plus `services/profile` where ownership resolution is needed.

| Suite | Internal implementation mocked instead of real code | Why it is mocked today | Real-test target |
| --- | --- | --- | --- |
| `tests/integration/account-deletion.integration.test.ts` | JWT + Inngest transport only | Converted: real deletion scheduling, cancellation, and data export against real DB. 8 tests. | Keep real route coverage; extend later with cascade-deletion verification if needed |
| `tests/integration/auth-chain.integration.test.ts` | JWT only | Converted: real auth middleware + real DB; internal services stay real | Extend later with JWKS rotation and token expiry edge cases |
| `tests/integration/billing-lifecycle.integration.test.ts` | JWT + Stripe SDK wrapper only | Converted: real subscription reads, checkout customer linking, cancellation, usage reads, and portal creation against the real DB | Keep as dormant future web/direct-billing coverage alongside Stripe webhook coverage |
| `tests/integration/health-cors.integration.test.ts` | JWT only | Converted: real app with full dependency graph, CORS + health assertions against real middleware chain | Keep as smoke test baseline |
| `tests/integration/homework.integration.test.ts` | JWT auth seam + OCR provider DI seam only | Converted: homework session creation and persistence now run through the real app + real DB; OCR extraction remains the only faked boundary | Keep real route coverage; optionally add a dedicated OCR-misconfiguration case later |
| `tests/integration/inngest-quota-reset.integration.test.ts` | None | Converted: real cron execution against the real DB with daily + monthly reset assertions and step ordering | Extend later with a fixed-clock helper if exact timestamp pinning becomes important |
| `tests/integration/inngest-trial-expiry.integration.test.ts` | Push delivery only | Converted: real cron execution against the real DB with real subscription/quota transitions and owner-profile notification fanout | Extend later with email coverage if trial-expiry starts sending email in addition to push |
| `tests/integration/learning-session.integration.test.ts` | JWT + Inngest transport (LLM via mock provider) | Converted: real session lifecycle, metering/quota, summary persistence, interleaved topic selection, recall-bridge generation | Extend later with real LLM streaming or Inngest dispatch verification |
| `tests/integration/onboarding.integration.test.ts` | JWT + LLM transport only | Converted: real draft persistence, resumable interview state, curriculum creation, and SSE completion against the real DB | Extend later with draft expiry and curriculum regeneration edge cases |
| `tests/integration/parent-dashboard.integration.test.ts` | JWT only | Converted: real dashboard aggregation (family links, sessions, transcripts, guided metrics) against real DB with seeded data. 11 tests. | Extend later with curriculum/retention-enriched child summaries |
| `tests/integration/profile-isolation.integration.test.ts` | JWT auth seam only | Converted: ownership checks, owner auto-resolution, and scoped subject reads now use the real middleware + real DB | Extend later with consent/parent-child profile edge cases if needed |
| `tests/integration/revenuecat-webhook.integration.test.ts` | Not present yet; route currently covered only by route-level mocks | Launch-critical mobile billing path currently lacks a real app + real DB integration suite | Add real route + test DB coverage; fake only RevenueCat authorization header input and Inngest/KV transport edges as needed |
| `tests/integration/retention-lifecycle.integration.test.ts` | JWT only (LLM via mock provider in setup.ts) | Converted: real SM-2 retention flow — recall tests with length-heuristic fallback, relearn with DB-verified card reset, teaching preferences, stability. 18 tests. | Extend later with real LLM evaluation or language/vocabulary branches |
| `tests/integration/session-completed-chain.integration.test.ts` | Voyage embedding transport + Sentry reporting only | Converted: the chain now runs against a real DB and real downstream services for retention, summaries, streaks, XP, learning modes, and home-surface cache writes | Keep the small orchestration unit test and the new DB-backed chain test together; extend later for language/vocabulary and homework-summary branches |
| `tests/integration/stripe-webhook.integration.test.ts` | Stripe signature verification + Inngest transport | Converted: real billing writes, quota updates, KV-refresh against real DB. Dormant until direct Stripe billing is enabled | Keep as future web/direct-billing coverage |
| `tests/integration/subject-management.integration.test.ts` | JWT only | Converted: real subject CRUD with real DB persistence, including archive/includeInactive filtering | Keep as foundational CRUD coverage |
| `tests/integration/test-seed.integration.test.ts` | None when running without Clerk secret (real service path uses fake `clerk_seed_*` IDs) | Converted: real seed/reset/scenario routes against the real DB, including seed-only deletion semantics | Keep on a dedicated disposable DB if we later enable real Clerk integration in this suite |

### Priority callout

The first hard rule for this cleanup should be:

- No `jest.mock('@eduagent/database')` inside `tests/integration`.

This is now true for the existing `tests/integration` suites and should stay a guardrail.

## Map: API Route Tests

Pattern:

- 25 of 27 route test files use `jest.mock()`.
- Most route tests mock `../middleware/jwt`, `@eduagent/database`, `../services/account`, `../services/profile`, and the route-specific service under test.
- These tests mostly prove request validation, response shape, and handler wiring against invented service outputs.

Representative hotspots:

| File | Real implementation replaced | Why it is mocked today | What should replace it |
| --- | --- | --- | --- |
| `apps/api/src/routes/sessions.test.ts` | auth/db/account/profile/billing/session/settings/interleaved/recall-bridge/Inngest | Large route surface, wants status/body coverage without real persistence or LLM work | Real app + test DB for end-to-end session flows; keep thin schema-only tests here |
| `apps/api/src/routes/books.test.ts` | auth/db/account/profile/curriculum/book-generation/Inngest | Tests route wiring only | Real app + test DB; fake only LLM boundary |
| `apps/api/src/routes/billing.test.ts` | auth/db/account/billing/kv/stripe | Avoids Stripe, KV, and real quota state | Real app + test DB; fake only Stripe/KV adapters |
| `apps/api/src/routes/dashboard.test.ts` | auth/db/account/profile/dashboard | Avoids real aggregation queries | Seeded DB-backed route integration |
| `apps/api/src/routes/homework.test.ts` | auth/db/account/profile/session/ocr/Inngest | Avoids session persistence and OCR | Real route + test DB; fake only OCR/LLM boundary |
| `apps/api/src/routes/subjects.test.ts` | auth/db/account/profile/subject-resolve/subject | Avoids subject persistence and subject resolution | Real route + test DB; fake only LLM subject resolution if needed |

Recommendation:

- Keep route unit tests only for cheap schema and branch coverage.
- Move behavior that depends on real middleware, DB state, transactions, or event dispatch into real app integration tests.

## Map: API Service Tests

Pattern:

- 54 service test files exist; 27 use `jest.mock()`, and many others use hand-rolled DB fakes instead.
- The biggest risk is not the `jest.mock()` count. It is the amount of fake Drizzle behavior created in helper functions such as `createMockDb()`, fake select chains, and fake transaction builders.

Highest-value service files to convert:

| File | Real implementation replaced | Why it is mocked today | What real coverage is missing |
| --- | --- | --- | --- |
| `apps/api/src/services/session.test.ts` | `createScopedRepository`, `exchanges`, `escalation`, `summaries`, `subject`, `prior-learning`, `retention-data`, `retention`, `memory`, `settings`, plus a fake DB | Huge branch surface; easier to fake than seed real data | Real query shape, transaction behavior, row mapping, concurrency/race behavior |
| `apps/api/src/services/billing.test.ts` | Large fake DB/query-builder surface | Complex quota and subscription branches are easier to unit-test against invented rows | Real atomic updates, cycle resets, webhook ordering, and DB constraints |
| `apps/api/src/services/curriculum.test.ts` | Fake DB chains and transaction behavior | Wants curriculum branching without real DB state | Real `sortOrder`, transaction, and row-mapping semantics |
| `apps/api/src/services/coaching-cards.test.ts` | `@eduagent/database` and fake DB queries | Fast card-generation branching tests | Real cache reads/writes and retention-card interaction |
| `apps/api/src/services/consent.test.ts` | `./notifications` plus fake DB chains | Business rules without mail side effects | Real consent row upserts/conflict handling |
| `apps/api/src/services/dashboard.test.ts` | `@eduagent/database`, `./progress` | Aggregation logic in isolation | Real joins, counts, and per-child data access |
| `apps/api/src/services/account.test.ts` | `./billing`, `./trial`, `./subscription` | Avoids cross-service side effects | Real account creation + downstream subscription/trial wiring |

Good split going forward:

- Keep pure logic unit tests where the real DB adds no value.
- Add DB-backed service tests for persistence-heavy services: `session`, `billing`, `retention-data`, `curriculum`, `dashboard`, `coaching-cards`, `consent`.

## Map: API Inngest Function Tests

Pattern:

- 8 of 9 Inngest function tests use `jest.mock()`.
- The tests usually capture the function handler from `inngest.createFunction()` and then replace every downstream service call.

What this gives us:

- Good step-order and error-isolation coverage.

What it does not give us:

- Confidence that the real chain works with real DB state, real repositories, or real event payloads.

Representative files:

- `apps/api/src/inngest/functions/session-completed.test.ts`
- `apps/api/src/inngest/functions/trial-expiry.test.ts`
- `apps/api/src/inngest/functions/quota-reset.test.ts`
- `apps/api/src/inngest/functions/account-deletion.test.ts`

Recommended direction:

- Keep one small orchestration-focused unit test per function if it is cheap.
- Add at least one DB-backed integration per critical chain: `session-completed`, `trial-expiry`, `quota-reset`, and `account-deletion`.

## Map: Mobile Screen and Hook Tests

Pattern:

- `apps/mobile/src/app`: 27 of 30 files use `jest.mock()` and there are 143 mock calls.
- `apps/mobile/src/hooks`: 21 of 23 files use `jest.mock()` and there are 53 mock calls.
- The common move is to replace `useApiClient`, `useProfile`, navigation, and route-specific hooks so the screen renders against invented state rather than real data flow.

Biggest screen hotspots:

| File | What is mocked instead of real behavior | Why it is mocked today | What should replace it |
| --- | --- | --- | --- |
| `apps/mobile/src/app/(learner)/session/index.test.tsx` | 18 mocks: session hooks, subject classification, progress, curriculum, network status, settings, celebration, milestone tracker, recovery, api client, profile, navigation, child components | Tests a very large screen in isolation | Break into smaller units, then add real-hook screen tests and Maestro coverage for end-to-end session behavior |
| `apps/mobile/src/app/(learner)/library.test.tsx` | subjects/progress/books/curriculum hooks, `react-query`, progress/common components, theme, api client, profile, navigation | Wants screen-state rendering without real queries | Real hooks + real `QueryClientProvider`; stub only `fetch` at the HTTP boundary |
| `apps/mobile/src/app/(learner)/_layout.test.tsx` | auth/profile/theme/revenuecat/sentry/navigation | Layout contract only | Keep some adapter mocks, but use real providers where possible |
| `apps/mobile/src/app/session-summary/[sessionId].test.tsx` | session/settings/rating-prompt hooks, theme, sentry, navigation | UI-only assertions | Real hooks for app-owned data; keep native adapter mocks |

Biggest hook hotspots:

| File | What is mocked instead of real behavior | Why it is mocked today | What should replace it |
| --- | --- | --- | --- |
| `apps/mobile/src/hooks/use-dashboard.test.ts` | `../lib/api-client`, `../lib/profile` | Easy way to fake RPC responses | Real `useApiClient` with stubbed `fetch` |
| `apps/mobile/src/hooks/use-curriculum.test.ts` | `../lib/api-client`, `../lib/profile` | Same pattern | Real `useApiClient` with stubbed `fetch` |
| `apps/mobile/src/hooks/use-subjects.test.ts` | `../lib/api-client`, `../lib/profile` | Same pattern | Real `useApiClient` with stubbed `fetch` |
| `apps/mobile/src/hooks/use-settings.test.ts` | `../lib/api-client`, `../lib/profile` | Same pattern | Real `useApiClient` with stubbed `fetch` |
| `apps/mobile/src/hooks/use-interview.test.ts` | `api-client`, auth, `api`, SSE, profile | Avoids auth/network/streaming runtime | Real app-owned hook code plus stubbed fetch/SSE boundary |
| `apps/mobile/src/hooks/use-homework-ocr.test.ts` | auth/profile/api plus native ML Kit/image/file APIs | Mixed business logic and native adapter behavior | Keep native adapter mocks, but move app-owned OCR fallback logic to tests that use a real hook and stub only the native boundary |

## Mobile Mocks That Should Probably Stay

These are not the first targets because they mostly cover platform gaps rather than hiding app business logic:

- `apps/mobile/src/test-setup.ts`
  - Global Expo/React Native shims for icons, reanimated, svg, Clerk, notifications, secure store, and purchases.
- `apps/mobile/src/lib/revenuecat.test.ts`
  - Wrapper-level test around `react-native-purchases`.
- `apps/mobile/src/lib/sentry.test.ts`
  - Wrapper-level test around Sentry SDK behavior.
- `apps/mobile/src/lib/haptics.test.ts`
  - Wrapper-level test around `expo-haptics`.
- `apps/mobile/src/hooks/use-text-to-speech.test.ts`
  - Native SDK seam (`expo-speech`).

## API Mocks That Should Probably Stay

- `apps/api/src/services/stripe.test.ts`
  - This is a wrapper test around the Stripe SDK. Mocking Stripe itself here is appropriate.
- `apps/api/src/middleware/jwt.test.ts`
  - Mocking `fetch` and `crypto.subtle` at this boundary is acceptable for unit coverage, as long as separate end-to-end auth coverage exists elsewhere.
- `packages/database/src/queries/embeddings.test.ts`
  - Mocking UUID generation for deterministic SQL is low-risk.

## Important Hand-Rolled Fakes Not Captured by `jest.mock()` Counts

- `apps/api/src/services/session.test.ts`
  - `createMockDb()`, fake select/update chains, fake scoped repository.
- `apps/api/src/services/billing.test.ts`
  - Extensive fake Drizzle builder chains and transaction behavior.
- `apps/api/src/services/curriculum.test.ts`
  - Fake transaction/query behavior.
- `apps/api/src/services/consent.test.ts`, `assessments.test.ts`, `coaching-cards.test.ts`
  - Same pattern: fake DB rows and builder chains instead of real Postgres behavior.
- `apps/mobile/src/hooks/*`
  - Many tests mock `useApiClient()` and then fake `fetch` responses behind it, which still skips the real API client wiring.

These matter because even after `jest.mock()` count drops, we can still have fake-only coverage if the DB or transport layer is being reimplemented in test helpers.

## Recommended Conversion Order

### Phase 0: Stop the false confidence

- Either rename `tests/integration` to something like `tests/composition` until it is real, or convert suites in place and update the folder comments immediately.
- Fix misleading comments in:
  - `tests/integration/setup.ts`
  - `tests/integration/health-cors.integration.test.ts`

### Phase 1: Build one real API integration harness

- Use a real test Postgres database via `DATABASE_URL`.
- Stop mocking `@eduagent/database`.
- Keep internal services real.
- Fake only true external boundaries:
  - Clerk/JWKS
  - LLM provider HTTP
  - Stripe/RevenueCat
  - email/push providers
  - Inngest transport where dispatch itself is not under test

### Phase 2: Convert the highest-value API flows first

Start here:

- Remaining launch-critical / high-leverage integration:
- `tests/integration/revenuecat-webhook.integration.test.ts` (blocked until RevenueCat setup is available)

Completed from this phase:

- `tests/integration/onboarding.integration.test.ts`
- `tests/integration/retention-lifecycle.integration.test.ts`
- `tests/integration/parent-dashboard.integration.test.ts`
- `tests/integration/account-deletion.integration.test.ts`
- `tests/integration/billing-lifecycle.integration.test.ts`
- `tests/integration/inngest-quota-reset.integration.test.ts`
- `tests/integration/inngest-trial-expiry.integration.test.ts`
- `tests/integration/test-seed.integration.test.ts`

Why these first:

- The already-converted suites now cover the app boot path, auth, subject CRUD, session lifecycle, homework, profile scoping, dormant Stripe coverage, and the biggest post-session orchestration chain.
- The remaining list is now effectively the launch-critical mobile billing webhook path once RevenueCat setup is available.

Secondary billing coverage:

- `tests/integration/stripe-webhook.integration.test.ts`
  - Keep, but treat as future web/direct-billing coverage rather than launch-critical mobile coverage.

### Phase 3: Add DB-backed service tests where mocks are currently hiding the most risk

Start here:

- `apps/api/src/services/session.test.ts`
- `apps/api/src/services/billing.test.ts`
- `apps/api/src/services/retention-data.test.ts`
- `apps/api/src/services/curriculum.test.ts`
- `apps/api/src/services/dashboard.test.ts`
- `apps/api/src/services/coaching-cards.test.ts`

### Phase 4: Rebalance route tests

- Keep light route-unit coverage for schema validation and simple branch handling.
- Delete or shrink route tests once a real app+DB integration test covers the same path.

### Phase 5: Mobile

- Replace mocked-hook screen tests with:
  - real hooks
  - real `QueryClientProvider`
  - real `useApiClient`
  - stubbed `fetch` at the HTTP boundary
- Keep platform/native shims in Jest where necessary.
- Move full navigation/native happy paths to Maestro or equivalent E2E coverage.

## Success Criteria

- No `jest.mock('@eduagent/database')` under `tests/integration`.
- Converted integration suites do not mock app-owned services under test.
- `session` and `billing` each have at least one DB-backed service/integration suite.
- New mobile screen tests stop mocking `../lib/api-client` by default.
- Platform shims remain only at true native/runtime boundaries, not around app business logic.
