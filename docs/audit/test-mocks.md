# Test Mock Audit

**Date**: 2026-05-12
**Scope**: `apps/api`, `apps/mobile`, `tests/integration`, `packages/*`

---

## Summary

225 of 460 test files (49%) contain internal `jest.mock()` calls — mocking modules within the same repo rather than external boundaries. There are 649 internal mock call sites total (319 API, 330 mobile). An additional 42 integration test suites exist with proper boundary-only mocking, but they cover only ~290 test cases vs. ~5,860 in the mock-heavy unit suites.

The GC1 lint ratchet (`gov/no-internal-jest-mock`) prevents new internal mocks but does not reduce the existing 618 warning sites. 104 `gc1-allow` exemptions have already been granted, most in mobile component tests.

---

## Findings

### F1: Half the test suite mocks its own code

| Metric | Count |
|--------|-------|
| Total test files | 460 |
| Files with internal mocks | 225 (49%) |
| Internal mock call sites — API | 319 |
| Internal mock call sites — mobile | 330 |
| Integration test suites (boundary-only) | 42 |
| `gc1-allow` exemptions granted | 104 |

### F2: Most-mocked internal modules

**API** — the top 5 mocked modules account for 97 call sites:

| Module | Mock sites | What it does |
|--------|-----------|--------------|
| `../client` (Inngest) | 24 | Background job dispatch |
| `../services/account` | 22 | Account CRUD |
| `../helpers` | 19 | Shared route helpers |
| `../services/profile` | 18 | Profile lookup/scoping |
| `../services/sentry` | 14 | Error reporting |

**Mobile** — the top 5 mocked modules account for 113 call sites:

| Module (various relative paths) | Mock sites | What it does |
|--------------------------------|-----------|--------------|
| `lib/theme` | 45 | Design tokens / theme context |
| `lib/profile` | 42 | Profile state / `computeAgeBracket` |
| `lib/api-client` | 37 | Fetch wrapper for API calls |
| `lib/navigation` | 9 | Router helpers |
| `hooks/use-quiz` | 5 | Quiz flow state |

### F3: 54 API test files mock the database

19 route tests and 35 service tests use `createMockDb()` or `jest.mock('@eduagent/database')`. These tests construct a recursive proxy that returns empty arrays by default, then override specific methods per test. The proxy does not enforce schema shape, column types, or query semantics — any call returns whatever the test author provides.

### F4: Integration tests still mock some internals

5 integration test files mock the Inngest client (`jest.mock('../../apps/api/src/inngest/client')`). These are annotated with `gc1-allow` and justified as external-boundary mocks (Inngest is an async transport). The Stripe integration test also mocks the Stripe service module. These are defensible but represent a boundary definition the team should make explicit.

### F5: Mobile theme/profile mocks are structural

The 87 combined mock sites for `lib/theme` and `lib/profile` exist because these modules depend on React context providers (theme provider, auth/profile provider) that are difficult to set up in isolation. This is a test infrastructure gap, not a design choice — a shared `TestWrapper` that provides real theme and profile context would eliminate these.

---

## Risk Assessment

### What the mocks hide

1. **Contract drift between routes and services.** When a route test mocks `../services/billing`, the mock's return shape is whatever the test author wrote at authoring time. If the real service's return type changes, the mock doesn't break — the test keeps passing against a stale contract.

2. **Query correctness.** The 54 tests mocking the database cannot catch: wrong WHERE clauses, missing JOINs, incorrect column references, RLS violations, or transaction isolation bugs. These are the bugs that cause production incidents.

3. **Profile scoping bypasses.** 18 API tests mock `../services/profile`. The scoped repository pattern (`createScopedRepository(profileId)`) is a security-critical boundary — mocking it means tests never verify that data access is actually scoped to the authenticated profile.

4. **Error classification.** Mobile tests mocking `lib/api-client` never exercise real HTTP error responses. The UX resilience rules in CLAUDE.md (error classification at the API client boundary) cannot be validated by tests that replace the client entirely.

### What the mocks don't hide

Internal mocks are harmless when the mocked module is:
- Genuinely stateless and side-effect-free (pure formatting helpers)
- A thin wrapper around an external service already mocked at the fetch boundary
- An IO boundary where the alternative is flaky (filesystem, native APIs)

Some of the 649 sites fall into these categories. The problem is the other ~500 that don't.

---

## Recommended Actions

### A1: Shared test wrappers to eliminate structural mocks (high leverage, low effort)

Create a `TestWrapper` for mobile that provides real `ThemeProvider` and `ProfileProvider` with test defaults. This eliminates the 87 theme + profile mock sites without changing any test logic — wrap the render call, remove the mock.

For API, create a `createTestApp()` helper that returns a real Hono app instance with middleware pre-configured (test JWT, test DB, Inngest spy). The integration test setup already does this; extract and share it.

**Estimated reduction: ~120 mock sites.**

### A2: Replace `createMockDb()` with test transactions (high leverage, medium effort)

The 54 tests mocking the database should use a real database connection wrapped in a transaction that rolls back after each suite. The infrastructure exists:
- CI provisions a pgvector container
- `loadDatabaseEnv()` resolves credentials locally
- `createIntegrationDb()` returns a real Drizzle instance

Add a `withTestTransaction(db, fn)` helper to `test-utils` that begins a transaction, runs the test, and rolls back. Tests get a real `db` object that hits real Postgres. Drizzle queries against local Postgres are single-digit milliseconds — no meaningful speed regression.

**Estimated reduction: ~100 mock sites (54 files × ~2 mocks each).**

### A3: Fetch-level API interception for mobile (medium leverage, medium effort)

Replace `jest.mock('../lib/api-client')` with a fetch interceptor (MSW or a lightweight custom handler). Mobile tests already render real components with real hooks — the last fake layer is the API client. Intercepting at `fetch` means the real `api-client` module runs (URL construction, error classification, header injection) and only the network call is faked.

**Estimated reduction: ~37 mock sites.**

### A4: Opportunistic migration on touch (low effort, ongoing)

When any PR modifies a file that has internal mocks, migrate that file's tests off internal mocks in the same PR. Don't do a big-bang rewrite. The GC1 ratchet prevents new additions; this rule ensures the count trends toward zero.

**Estimated reduction: organic, proportional to code velocity.**

### A5: Audit gc1-allow exemptions (low effort, one-time)

104 exemptions have been granted. Review whether each is still justified. The mobile `family.test.tsx` alone has 7 exemptions — this suggests the test needs a structural rewrite (A1), not 7 individual passes.

---

## Prioritisation

| Action | Mock sites eliminated | Effort | Risk reduced |
|--------|----------------------|--------|-------------|
| A1: Test wrappers | ~120 | 1–2 days | Medium (theme/profile) |
| A2: Test transactions | ~100 | 2–3 days | **High** (DB correctness, scoping) |
| A3: Fetch interception | ~37 | 1–2 days | Medium (error classification) |
| A4: Migrate on touch | Ongoing | Zero marginal | Cumulative |
| A5: Audit gc1-allow | 0 (quality gate) | Half day | Low |

A2 has the highest risk-reduction payoff: the 54 database-mocking test files are where production bugs hide. A1 is the easiest win by volume. A4 costs nothing and should start immediately.

---

## Appendix: What should be mocked

For reference, the complete list of boundaries that legitimately require mocking in this codebase:

| Boundary | Mock strategy | Status |
|----------|--------------|--------|
| Clerk JWKS | Fetch intercept → `TEST_JWKS` | Done (integration tests) |
| Stripe API | Fetch intercept or `stripe-mock` | Partial (mocked at module level) |
| RevenueCat webhooks | Fetch intercept | Done |
| LLM APIs (OpenAI/Anthropic) | Fetch intercept with canned responses | Done (`routeAndCall` mock) |
| Resend (email) | Fetch intercept | Done |
| Push notifications (Expo) | Fetch intercept | Done |
| Inngest transport | Event queue spy | Done |
| `Date.now()` / timers | `jest.useFakeTimers()` | Done where needed |
| React Native modules | Jest module map (`jest.config.cjs`) | Done |
| SecureStore | In-memory map | Done |

Everything not on this list should use its real implementation in tests.
