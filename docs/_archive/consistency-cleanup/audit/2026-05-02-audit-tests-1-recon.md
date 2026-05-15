# AUDIT-TESTS-1 — Test convention compliance

**Date:** 2026-05-02
**Auditor:** audit-tests-1 fork (worker)
**Scope:** Test density on the three SCHEMA-2 surfaces (`learner-profile.ts`, `sessions.ts`, `dashboard.ts`) with shape-assertion verdicts; `jest.mock` of internal modules in integration tests; `__tests__/` directory violations of the co-location rule.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

Test density on the three SCHEMA-2 route surfaces is healthy in volume (~17 / ~64 / ~38 `it(` blocks), but every file is **PARTIAL** on response-shape assertion — they assert status codes plus field-by-field properties, never against a `@eduagent/schemas` response schema. **5 of 38 integration test files mock the internal Inngest client**, and **2 shared integration setup files mock `@eduagent/database`** (the project's own database package), violating the CLAUDE.md "no internal mocks in integration tests" rule. `__tests__/` directories are **clean** in source — no co-location violations outside `node_modules`. SCHEMA-2 is **not blocked** by these findings, but it is **partially de-risked**: routes will get runtime parsing, but tests won't catch shape mismatches between server and client unless assertion patterns are upgraded in lockstep.

## Severity

**YELLOW** — Two distinct CLAUDE.md "Code Quality Guards" rules are violated. The internal-mock pattern is the highest-impact: 5 integration tests are integration-style in name only, since they substitute the internal Inngest dispatcher with a unit mock — exactly the pattern that "hides real bugs" per the rule.

## Methodology

- `Glob apps/api/src/routes/{learner-profile,sessions,dashboard}.test.ts` — confirmed all three exist
- `Read` each of the three files in full (505 / 2046 / 661 lines respectively); counted `it(` blocks per `describe` and tagged each block on whether it asserts response body shape
- `Glob tests/integration/**/*.ts` — 38 files (32 `*.integration.test.ts` + 6 helper/setup files)
- `Grep "jest\.mock\(" -n` against `tests/integration/` — 13 hits across 11 files; manually classified each as internal vs. external boundary using path heuristic (`@eduagent/*`, `apps/api/src/services/*`, `apps/api/src/inngest/*`, `apps/api/src/middleware/*` = internal; `stripe`, `clerk`, `sentry` = external boundary per CLAUDE.md "external boundaries (Stripe, Clerk JWKS, email providers, push notification services)" enumeration)
- `Glob **/__tests__/**` — only matches `node_modules/.pnpm/*` and `.claude/worktrees/*/node_modules/.pnpm/*`; no source matches
- `Grep "__tests__" -l` excluding node_modules — only docs, plans, CLAUDE.md, and one bmad CSV; confirms no source `__tests__/` directories

## Findings

### Finding 1 — Internal Inngest client mocked in 5 integration tests

- **Severity:** YELLOW
- **Files:**
  - `tests/integration/account-deletion.integration.test.ts:41`
  - `tests/integration/consent-email.integration.test.ts:30`
  - `tests/integration/learning-session.integration.test.ts:61`
  - `tests/integration/onboarding.integration.test.ts:15`
  - `tests/integration/stripe-webhook.integration.test.ts:36`
- **Evidence:** Each of the 5 files contains `jest.mock('../../apps/api/src/inngest/client', ...)`. The Inngest client is internal infrastructure — `apps/api/src/inngest/client.ts` is the project's own dispatcher, and CLAUDE.md "Required Validation" directs integration tests to "Run integration tests when changing... Inngest flows." A test that mocks the dispatcher cannot exercise the dispatch contract; it can only confirm that the route called `inngest.send` with some shape, identical to what a route-unit test does. Note the pattern is encouraged by `tests/integration/mocks.ts:15`, which provides an `inngestClientMock()` helper specifically for this purpose — so this is institutionalized, not accidental.
- **Why it matters:** CLAUDE.md "Code Quality Guards" rule: *"No internal mocks in integration tests. Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs."* These 5 tests have integration-test filenames but route-unit-test mock surfaces. AUDIT-INNGEST-2 (Track B) is shipping observers for orphan Inngest events — a regression in those observers may not be caught by the existing integration tests because the dispatcher is mocked.
- **Anticipated effort:** hours (per file, switch to either an in-memory Inngest test harness or a real `inngest dev` instance) — could be multi-PR if a shared real-Inngest fixture must be authored first
- **Suggested track:** B (paired with AUDIT-INNGEST-2 — same fundamental "Inngest events are observed-but-not-asserted" theme)

### Finding 2 — `@eduagent/database` mocked in shared integration setup files

- **Severity:** YELLOW
- **Files:**
  - `tests/integration/setup.ts:42` — `jest.mock('@eduagent/database', () => { ... })`
  - `tests/integration/api-setup.ts:29` — `jest.mock('@eduagent/database', () => { ... })`
- **Evidence:** Both setup files install a global mock of the project's own database package. `setup.ts` is the standard Jest `setupFilesAfterEach` target, so this mock applies to **every integration test that uses it**. The header comment at `api-setup.ts:7` says *"Unit tests that call `jest.mock('@eduagent/database', ...)` in the test file"* — suggesting `api-setup.ts` is partially intended for unit tests. The naming and placement under `tests/integration/` is misleading either way.
- **Why it matters:** Same CLAUDE.md "no internal mocks" rule. The database is the most-critical internal module to NOT mock in an integration test, since database behavior (transactions, RLS, scoped reads) is exactly what integration tests are supposed to exercise. CLAUDE.md "Required Validation" specifically calls out: *"Run integration tests when changing DB behavior, auth/profile scoping..."* — a mocked DB can't validate either. **Caveat: I could not verify in this 30-min recon whether all 32 `*.integration.test.ts` files actually consume `setup.ts` (some may use a real-DB harness like `pg-mem` or a real Postgres container instead).** The audit signal is "this mock exists in a path called `tests/integration/`" — execution should validate which tests actually load it before remediating.
- **Anticipated effort:** hours-to-days (depends on whether a real-DB integration harness already exists for some subset of tests; if not, authoring one is the gating cost)
- **Suggested track:** B (high-value but cross-cutting — likely needs a small infrastructure plan first)

### Finding 3 — Three SCHEMA-2 surface tests are PARTIAL on response-shape assertion

- **Severity:** YELLOW
- **Files:**
  - `apps/api/src/routes/learner-profile.test.ts` — ~17 `it(` blocks, **PARTIAL**
  - `apps/api/src/routes/sessions.test.ts` — ~64 `it(` blocks, **PARTIAL**
  - `apps/api/src/routes/dashboard.test.ts` — ~38 `it(` blocks, **PARTIAL** (best of the three)
- **Evidence:**
  - **learner-profile.test.ts**: Most tests assert status code + that a service mock was called with correct args. Only 2 tests inspect response body (`body.profile.profileId` at L280; `body.text` at L312). No use of `@eduagent/schemas` response schemas as parse targets.
  - **sessions.test.ts**: Many tests check named body fields (e.g., L419-427 check `session.subjectId, sessionType, status, escalationRung, exchangeCount, startedAt, endedAt, durationSeconds` individually). The SSE tests use `toContain` pattern matching against raw text. The `[BUG-941]` and `[M-3]` fallback-frame tests do check stable JSON-substring patterns (`"type":"fallback"`, `"reason":"malformed_envelope"`), which is closer to schema enforcement but still string-based. The `[BUG-91]` test asserts `body.code === 'EXCHANGE_LIMIT_EXCEEDED'`, which is exactly the kind of shape SCHEMA-2's typed envelope would lock down.
  - **dashboard.test.ts**: Strongest of the three. The `[BUG-830]` test block (L592-659) asserts `body.toEqual({ code: 'NOT_FOUND', message: 'Session not found' })` — exact-shape match against the canonical error envelope. This is the pattern SCHEMA-2 wants everywhere. The `[BUG-744]` and `[BUG-834]` IDOR tests assert status only, not body shape.
- **Why it matters:** SCHEMA-2 plans to wrap `c.json` with runtime parsing against `@eduagent/schemas`. If the schemas drift from what tests expect, the tests will pass (their field-by-field assertions still match) but the runtime parser will throw, surfacing a regression at request time rather than at test time. Tests that parse the response body via the schema would catch the same drift at CI time. The dashboard `[BUG-830]` exact-envelope pattern is the model — it caught the original issue and would catch any future schema regression.
- **Anticipated effort:** multi-PR — these are pervasive low-risk changes; pair them with the SCHEMA-2 file-by-file rollout (one per migrated route)
- **Suggested track:** B (paired with SCHEMA-2 — should not be a separate initiative)

### Finding 4 — `__tests__/` directory rule: clean

- **Severity:** GREEN
- **Files:** None in source. All `__tests__/` directory matches are inside `node_modules/.pnpm/*` (third-party packages) or `.claude/worktrees/*/node_modules/*` (worktree-local installs).
- **Evidence:** `Glob **/__tests__/**` returned only `node_modules`-rooted paths. `Grep "__tests__" -l` excluding `node_modules` returned only documentation and CLAUDE.md (the rule itself), `_bmad/.../documentation-requirements.csv`, and one historical plan — no test code violates the co-location rule.
- **Why it matters:** Co-location is the dominant convention; this finding confirms the rule is being followed and no remediation is needed. (Documenting "no findings" explicitly so the next auditor doesn't redo this scan.)

## Cross-coupling notes

- **TYPES-1**: TYPES-1 will inventory `@eduagent/schemas` response-schema completeness. **TESTS-1 confirms tests are not currently consuming whatever schemas exist** — even where they assert exact envelopes (dashboard `[BUG-830]`), they hand-write the literal `{ code, message }` rather than parse with `apiErrorEnvelopeSchema.parse(body)`. So TYPES-1's "we have ~50 schemas, only `bookmarks.ts` uses them" finding (per the punch list) is mirrored on the test side: the schemas aren't used by tests either. Any TYPES-1 plan to ship missing schemas should include a checkbox for "tests of routes using this schema parse the response body through the schema."
- **MOBILE-1**: Out of scope for this audit — I did not read mobile tests. The CLAUDE.md "no internal mocks" rule is written about API integration tests; mobile may have its own conventions. **MOBILE-1 should not assume the same patterns apply** without confirming whether mobile has integration tests at all.
- **PACKAGE-SCRIPTS-1**: I did not see test-script orphans in the test files I read, and I did not scan `package.json` files. PACKAGE-SCRIPTS-1 should specifically check whether `pnpm test:integration` (or the equivalent) actually runs the files in `tests/integration/` and whether `pnpm test:e2e:web:smoke` (referenced in CLAUDE.md "Handy Commands") still resolves — but those are PACKAGE-SCRIPTS-1 questions, not TESTS-1.

## Out of scope / not checked

- I did **not** verify which integration tests actually load `setup.ts` vs. a different setup harness (Finding 2's caveat). Execution must verify before remediating.
- I did **not** read the bodies of the 5 integration tests that mock Inngest — they may have meaningful integration coverage of *non-Inngest* surfaces. The finding is "integration filename + internal mock" not "test is worthless."
- I did **not** count tests in unrelated route files. SCHEMA-2 will eventually wrap 35 other route files; their test density may be lower or higher than the three sampled.
- I did **not** verify whether Stripe-service mocks (`tests/integration/billing-lifecycle.integration.test.ts:28`, `stripe-webhook.integration.test.ts:32`) are pure SDK wrappers or contain meaningful internal logic. They are tagged GREY and not flagged as findings — the wrapper-vs-logic distinction matters, but is out of recon scope. Sentry mocks (2 occurrences) are external-boundary-clear and not flagged.
- I did **not** verify the actual `expect()` count per test — `it(` block count is the unit. A test with 10 expects is one block; a test with one expect is also one block.

## Recommended punch-list entries

```markdown
- **AUDIT-TESTS-2** Replace internal Inngest client mocks in integration tests with a real-Inngest harness
  - Severity: YELLOW (CLAUDE.md "no internal mocks" rule)
  - Effort: hours-to-multi-PR (depends on whether a shared harness exists; if not, author one first)
  - Files: `tests/integration/{account-deletion,consent-email,learning-session,onboarding,stripe-webhook}.integration.test.ts`; `tests/integration/mocks.ts` (deprecate `inngestClientMock()`)
  - Why it matters: 5 integration tests have integration filenames but route-unit-test mock surfaces. AUDIT-INNGEST-2 (Track B) is shipping observer functions for orphan events; regressions there may slip past these tests because the dispatcher is mocked. Pair this with AUDIT-INNGEST-2 — same theme.

- **AUDIT-TESTS-3** Remove `jest.mock('@eduagent/database', ...)` from `tests/integration/setup.ts` and `api-setup.ts`
  - Severity: YELLOW (CLAUDE.md "no internal mocks" rule + "Required Validation" mandate to run integration tests on DB changes)
  - Effort: hours-to-days (needs a real-DB integration harness — `pg-mem`, Testcontainers, or a shared Postgres fixture)
  - Files: `tests/integration/setup.ts:42`, `tests/integration/api-setup.ts:29`; downstream every test currently relying on the global database mock
  - Why it matters: a mocked database in integration tests cannot validate transactions, RLS, or scoped reads — exactly the behaviors integration tests are meant to exercise. Caveat: verify which tests actually load `setup.ts` before remediating; some files may already use a real-DB harness.

- **AUDIT-TESTS-4** Migrate route tests from field-by-field body assertions to `@eduagent/schemas` parse-and-assert
  - Severity: YELLOW (paired with SCHEMA-2; not standalone-shippable)
  - Effort: multi-PR — one tranche per SCHEMA-2 route migration
  - Files: every `apps/api/src/routes/*.test.ts` that asserts response body fields; start with `learner-profile.test.ts`, `sessions.test.ts`, `dashboard.test.ts` (modeled on `dashboard.test.ts:592-659` `[BUG-830]` exact-envelope pattern)
  - Why it matters: SCHEMA-2 will introduce runtime parsing of `c.json` arguments. Without paired test-side parsing, schema drift becomes a request-time error in production rather than a CI failure. Make this a checkbox on each SCHEMA-2 PR rather than a separate initiative.
```

## Audit honesty disclosures

- **Sampling:** I read all 3 SCHEMA-2 surface test files in full. I read the **grep output** of `jest.mock(` matches across `tests/integration/` (13 hits across 11 files) but did **not** read each integration test in full — finding 1's classification rests on the import path, not on inspecting what each test actually does. A subsequent execution session must verify the integration nature of each tagged file before refactoring.
- **`it(` block counts are approximate (~17 / ~64 / ~38).** I counted by reading the files visually (no line-count grep for `it(`). Jest-reported totals may differ slightly because `it.each(...)` expansion produces multiple test cases per `it(` block (sessions.test.ts:545-562 has a 12-fixture `it.each`-style for-loop in dashboard.test.ts:545-562 that produces 12 cases from 1 `for` loop). Treat counts as order-of-magnitude.
- **Stripe service mocks (`tests/integration/billing-lifecycle.integration.test.ts:28`, `stripe-webhook.integration.test.ts:32`) are not flagged.** CLAUDE.md explicitly enumerates "Stripe" as an external-boundary-OK mock. The `services/stripe.ts` wrapper may contain internal logic that *should* be exercised, but I did not read it; the path-based heuristic gave the benefit of the doubt to the rule's letter.
- **Sentry mocks (2 occurrences) are not flagged.** Sentry is external by definition (error-reporting SaaS), so mocking it is fine per CLAUDE.md spirit.
- **`api-setup.ts:7` comment is ambiguous.** The header says it's for "Unit tests that call `jest.mock('@eduagent/database', ...)` in the test file" — this might mean `api-setup.ts` itself is unit-test scaffolding parked in the integration directory. If true, the file should move out of `tests/integration/`; if false, the rule violation stands. Either way, the location is misleading and worth fixing as part of remediation.
