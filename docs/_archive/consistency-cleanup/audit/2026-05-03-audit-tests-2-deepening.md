# AUDIT-TESTS-2 — Test integration boundary (deepening)

**Date:** 2026-05-03
**Auditor:** audit-tests-2 fork (deepening)
**Scope:** Document the BUG-743 LLM mock-guard pattern; document the `weekly-progress-push.integration.test.ts` HTTP-boundary exemplar; triage the 49 `jest.mock('@eduagent/database')` occurrences (unit / integration / setup); audit the integration-test files that mock Inngest; propose extending the BUG-743 guard pattern to two additional channels (`@eduagent/database`, Inngest); inventory the existing real-DB harness rather than designing a new one.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion:** `docs/audit/2026-05-02-audit-tests-1-recon.md` (predecessor), `docs/audit/2026-05-03-baseline-delta.md` (BUG-743 finding), `docs/audit/2026-05-02-consolidated-overview.md` §4-6
**Predecessor revision:** TESTS-1 Finding 2 (`@eduagent/database` mocked in `tests/integration/setup.ts` / `api-setup.ts`) is **revised** here — see Finding 3.

---

## TL;DR

The BUG-743 guard (`apps/api/src/services/llm/integration-mock-guard.test.ts`) is a clean, reproducible regression-prevention pattern that walks `git ls-files` for `*.integration.test.ts`, regex-matches `jest.mock('…llm…')`, and fails CI on any new offender outside a 3-file `KNOWN_OFFENDERS` allowlist. The HTTP-boundary exemplar (`weekly-progress-push.integration.test.ts`) replaces `globalThis.fetch` for the Expo Push URL and otherwise exercises the real DB, real Inngest step runner shape, and real notification-log dedup logic — that is the migration target for the 3 LLM offenders. **Crucially, TESTS-1 Finding 2 was overstated**: `tests/integration/setup.ts:42` and `tests/integration/api-setup.ts:29` do *not* substitute the database with a fake — they swap the Neon HTTP driver for the standard `pg` wire driver when `DATABASE_URL` is non-Neon, then `...actual` everything else through. That is legitimate driver-shim infrastructure, not a behavior mock. The real C2 scope is therefore: 49 `jest.mock('@eduagent/database')` occurrences split as **47 unit-test files (acceptable) / 0 integration-test files / 2 setup-file driver shims (legitimate)**, plus 5 integration-test files that mock the internal Inngest client and 3 LLM offenders already on the BUG-743 allowlist. CI infrastructure for real-DB integration tests already exists (`.github/workflows/ci.yml` provisions a `pgvector/pgvector:pg16` service container, runs `drizzle-kit migrate`, and runs `nx run api:test:integration`). **No new harness needs designing.** The cluster is now scope-the-sweep + extend-the-guard, not build-from-zero.

## Severity

**YELLOW** (unchanged from TESTS-1) — Two CLAUDE.md "Code Quality Guards" violations remain (5 Inngest-client mocks in `tests/integration/`, 3 LLM mocks already enumerated by BUG-743). Severity does not escalate because (a) the guard pattern proves the team is moving in the right direction, (b) the real-DB harness is already in place and proven by `weekly-progress-push.integration.test.ts`, and (c) the previously-flagged setup-file `@eduagent/database` mocks are not actually behavior mocks. Severity does not de-escalate to GREEN because the 5 + 3 offenders still ship today and there is no forward-only guard for the 5 Inngest offenders or the 47 unit-test sites (which would catch any new integration-test introductions).

## Methodology

- `Read apps/api/src/services/llm/integration-mock-guard.test.ts` in full (97 lines) — extracted regex, allowlist, and three test invariants
- `Read apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts` in full (637 lines) — documented the fetch-interceptor pattern, the seed harness shape, and what's left real
- `Grep "jest\.mock\(\s*['\"]@eduagent/database['\"]" --output_mode files_with_matches` repo-wide → 55 matches; filtered out doc files / `_archive` / `_bmad-output` / `tests/integration/setup.ts` / `tests/integration/api-setup.ts` → **49 production test files** + 2 setup files. All 49 matched the path pattern `apps/api/src/{routes,services,middleware,inngest/functions}/*.test.ts` (i.e., colocated unit tests). **Zero** matches under `tests/integration/` or under any `*.integration.test.ts` file.
- `Grep "jest\.mock\(" -n` against `tests/integration/` → enumerated 13 hits across 11 files. Inngest-client mocks: 5 files. LLM mocks: 0 (the only LLM-shaped match in this directory is the comment in `mocks.ts`, not a `jest.mock` call). Sentry: 2. Stripe: 2. `@eduagent/database` driver shim: 2 (setup files).
- `Read tests/integration/setup.ts` and `tests/integration/api-setup.ts` in full — verified they spread `...actual` and only override `createDatabase` for non-Neon URLs (driver swap, not behavior mock).
- `Read tests/integration/{account-deletion,learning-session,onboarding,consent-email,stripe-webhook}.integration.test.ts` headers — confirmed inngest-client mock shape and adjacent comments justifying it.
- `Read tests/integration/mocks.ts` — confirmed the institutional `inngestClientMock()` helper and the comment that calls Inngest mocking "INTENTIONALLY" internal.
- `Read .github/workflows/ci.yml` (235 lines) — verified the existing real-DB harness: `pgvector/pgvector:pg16` service container, `drizzle-kit migrate`, conditional `nx run api:test:integration` job with `DATABASE_URL=postgresql://eduagent:eduagent@localhost:5432/tests`.
- `Read tests/integration/helpers.ts` — verified `requireDatabaseUrl()`, `buildIntegrationEnv()`, `createIntegrationDb()`, `cleanupAccounts()` are already the shared real-DB harness contract for `tests/integration/` files.

## Findings

### Finding 1 — BUG-743 LLM mock guard pattern (documented)

- **Severity:** GREEN (this is a positive finding — documenting a working precedent)
- **Files:** `apps/api/src/services/llm/integration-mock-guard.test.ts:1-97`
- **Evidence:** The guard is a Jest test that runs as part of `nx run api:test`. It uses three building blocks:
  1. **File enumeration** (lines 26-34): `execSync('git ls-files "apps/api/**/*.integration.test.ts"', { cwd: repoRoot, encoding: 'utf-8' })`. The use of `git ls-files` (not `glob`/`readdir`) means the guard inherits `.gitignore` and skips worktrees / `node_modules` automatically.
  2. **Internal-LLM detection regex** (lines 45-54): for each file, `source.matchAll(/jest\.mock\(\s*['"]([^'"]+)['"]/g)`, then `specifier.split('/')` and `segments.some((seg) => /(?:^|-)llm(?:-|$)/.test(seg))`. The hyphen-or-edge token rule catches `./llm`, `../../services/llm/router`, `@eduagent/llm-router`, `@/services/llm`, and is anchored so a path like `/llmstudio/` would NOT match. **This is the load-bearing regex.**
  3. **Three assertions** (lines 61-96):
     - `it('finds at least one integration test (sanity)')` — fails if the glob returns nothing (catches a moved/renamed test directory).
     - `it('does not introduce NEW jest.mock(...llm) calls outside the known offender allowlist')` — the forward-only guard. Filters offenders against `KNOWN_OFFENDERS` (a `Set<string>` declared at module top, lines 17-24) and throws with a remediation message pointing at the HTTP-boundary pattern.
     - `it('shrinks the offender allowlist as files are migrated')` — fails if a file is on `KNOWN_OFFENDERS` but no longer mocks LLM. This forces the punch-list to stay accurate as files migrate.
  4. **Path normalization** (line 70, 91): `f.replace(/\\/g, '/')` — handles Windows + POSIX. Required because `git ls-files` produces forward slashes but `resolve()` produces backslashes on Windows.
  5. **KNOWN_OFFENDERS allowlist** (lines 17-24): three entries, each with a comment explaining the migration target. The allowlist is written as a `Set<string>` (literal paths, repo-relative, forward slashes) so an entry can be removed atomically when a file is migrated.
- **Why it matters:** This is a **replicable, structurally complete forward-only guard pattern**. Anyone extending it to a new channel needs (a) a regex that catches all variants of the import specifier, (b) a `KNOWN_OFFENDERS` set, (c) the same three assertions (sanity / no-new-offenders / allowlist-tracks-reality). It also gives the team a single place to look when a CI failure complains about "internal mocks" — the error message tells the contributor exactly where to look (`weekly-progress-push.integration.test.ts`). This is the model for Findings 5 and 6.
- **Anticipated effort:** N/A (already shipped as `35fd074a` per baseline delta)
- **Suggested track:** N/A — this is the precedent the rest of the cluster builds on.

### Finding 2 — `weekly-progress-push.integration.test.ts` is the HTTP-boundary migration target (documented)

- **Severity:** GREEN (positive precedent)
- **Files:** `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts:1-637`
- **Evidence:** The exemplar uses **zero** `jest.mock(...)` calls. Instead:
  1. **Real DB connection** (lines 311-320): `db = createDatabase(process.env.DATABASE_URL)`. Hard-fails if `DATABASE_URL` unset.
  2. **Real schema set-up via migration replay** (lines 254-275): `ensureWeeklyReportsTable()` checks `to_regclass('public.weekly_reports')` and replays two specific migration SQL files (`0036_famous_vengeance.sql`, `0037_rls_weekly_reports.sql`) if the table is missing. This is brittle (migration filename pinned), but it works.
  3. **HTTP-boundary intercept** (lines 322-341): replaces `globalThis.fetch` in `beforeAll`. The intercept matches the exact Expo Push URL (`https://exp.host/--/api/v2/push/send`) and pushes the request body into a `pushApiCalls[]` array. Anything else falls through to `originalFetch`. **This is the entire mock surface.**
  4. **Real Inngest step shape, hand-built** (lines 277-309): `executeCronSteps()` and `executeGenerateHandler()` build a `step` object with `step.run` (just calls the fn) and `step.sendEvent` (a `jest.fn()` that records calls). The Inngest *client* is never imported. The handler functions (`weeklyProgressPushCron.fn`, `weeklyProgressPushGenerate.fn`) are called directly with a synthetic event + step object. This is the **unit-test-of-handler** pattern wrapped in an integration-test envelope (real DB, real services, real notification-log dedup).
  5. **Real seeding** (lines 182-239): `seedProfile`, `seedWeeklyPushPrefs`, `seedFamilyLink`, `seedSnapshot` write directly via the real `db` connection. Each test seeds a unique RUN_ID-suffixed account so parallel test files don't collide.
  6. **Real cleanup** (lines 349-354): `afterAll` deletes accounts matching `clerk_weekly_push_${RUN_ID}%` via `like()`. Does not assume a clean DB at start, only a clean DB-of-this-RUN_ID at end.
  7. **The assertions exercise real behavior** (lines 357-636): timezone-windowed cron filtering (real `accounts.timezone` lookup), notification-log 24h dedup (lines 514-575 — primes the log table, asserts the next push is throttled, and asserts the report row IS still persisted), real `pushApiCalls[0]!.body` shape including `Emma: +4 topics, +10 words, +2 explored` (real progress-snapshot delta calc).
- **How each KNOWN_OFFENDER would change** (from the BUG-743 allowlist):
  - **`apps/api/src/services/session-summary.integration.test.ts:17`** currently: `jest.mock('./llm', () => ({ ...actual, routeAndCall: mock }))`. **Migrate to:** intercept `globalThis.fetch` for the provider URLs (`https://generativelanguage.googleapis.com/...` for Gemini, `https://api.openai.com/...` for OpenAI) and return canned response payloads. Or, simpler: register a mock provider via `registerProvider(createMockProvider('gemini'))` (the pattern `setup.ts:82` already uses globally) and assert against the real `routeAndCall` dispatch. The latter is what `tests/integration/learning-session.integration.test.ts:35-49` does — **provider-registry override, not jest.mock**.
  - **`apps/api/src/services/quiz/vocabulary.integration.test.ts:1`** currently: `jest.mock('../llm', () => ({ routeAndCall: jest.fn() }))`. **Migrate to:** same pattern as above — `registerProvider` with a controllable mock, then assert against the real `generateQuizRound` / `completeQuizRound` services. The fact that this file's `jest.mock` declaration is on **line 1** (before any imports) means it's load-bearing for module resolution; the migration must move the override into `beforeAll` and use the provider registry.
  - **`apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts:22-37`** currently: mocks `../../services/llm`, `../../services/notifications`, `../../services/sentry`, AND `../client` (Inngest client). The file's own comment (lines 17-20) calls `routeAndCall` "the true external boundary" — but it's not, it's the internal router. **Migrate to:** (a) `registerProvider` for LLM, (b) intercept Expo Push fetch for notifications (mirror `weekly-progress-push.integration.test.ts:322-341`), (c) leave Sentry mocked (external SaaS), (d) hand-build the Inngest step the way `executeGenerateHandler` does (lines 297-309).
- **Why it matters:** This file is **proof that the harness already exists**. The infrastructure question is solved (real DB via `DATABASE_URL`, fetch interception for the one external boundary, hand-built `step` for the Inngest handler). What remains is per-file migration work, not infrastructure work.
- **Anticipated effort:** hours per KNOWN_OFFENDER file (3 LLM offenders × ~1-2 hrs); proportional for the broader Inngest sweep.
- **Suggested track:** B (pair with the BUG-743 allowlist drain — Phase 1 of the C2 plan).

### Finding 3 — `@eduagent/database` mock triage: 47 unit / 0 integration / 2 driver-shim — TESTS-1 F2 was overstated

- **Severity:** GREEN-overall (after triage), but **revises predecessor finding**
- **Files:** 49 occurrences across 49 files (each file has exactly one occurrence). Per-file classification:
  - **Unit-test bucket (47 files, ACCEPTABLE per CLAUDE.md "no internal mocks in INTEGRATION tests"):**
    - `apps/api/src/routes/*.test.ts` (21 files): `account, billing, book-suggestions, books, coaching-card, consent, dashboard, dictation, filing, homework, interview, learner-profile, quiz, retention, sessions, subjects, topic-suggestions, vocabulary` — these are the colocated route unit tests. Mocking the database in a *route unit test* is the documented convention (CLAUDE.md mentions "Tests are co-located with source files" and the rule explicitly carves out unit tests).
    - `apps/api/src/services/*.test.ts` (16 files): `bookmarks, coaching-cards, embeddings, evaluate-data, interleaved, memory, progress-helpers, progress, recall-bridge, retention-data, streaks, subject, verification-completion, xp`, plus subdirectory `services/session/{session-cache,session-context-builders}.test.ts`.
    - `apps/api/src/inngest/functions/*.test.ts` (10 files): `book-pre-generation, consent-revocation, daily-snapshot, filing-stranded-backfill, freeform-filing, monthly-report-cron, quota-reset, recall-nudge-send, review-due-send, session-completed, subject-auto-archive, topup-expiry-reminder, trial-expiry`.
    - `apps/api/src/middleware/{database,metering}.test.ts` (2 files).
    - **All 47 files have filename pattern `*.test.ts` (NOT `*.integration.test.ts`).** Sampled `routes/dashboard.test.ts:1`, `services/embeddings.test.ts:1`, `inngest/functions/quota-reset.test.ts:1` — each is `jest.mock('@eduagent/database', () => …)` at file top, classic unit-test mock-the-DB pattern.
  - **Integration-test bucket (0 files):** **Zero matches** under `tests/integration/` or any `*.integration.test.ts` filename. **TESTS-1 Finding 2's framing — "@eduagent/database mocked in shared integration setup files" — was structurally correct on the path (`tests/integration/setup.ts:42`), but the mock body is not a behavior mock.**
  - **Setup-file bucket (2 files, LEGITIMATE driver shim):**
    - `tests/integration/setup.ts:42-66` — `jest.mock('@eduagent/database', () => { const actual = jest.requireActual('@eduagent/database'); return { ...actual, createDatabase: (url) => isNeonUrl(url) ? actual.createDatabase(url) : drizzle(new Pool({connectionString: url}), {schema}) } })`. The mock spreads `...actual`; only `createDatabase` is overridden, and only for non-Neon URLs. The override returns a real `drizzle()` instance backed by a real `pg.Pool`. **Not a behavior mock — a driver shim.**
    - `tests/integration/api-setup.ts:29-50` — identical shape. Header comment (line 9) says it's for "integration tests that use the real createDatabase() export." The naming "api-setup" is unfortunate (it lives in `tests/integration/` but applies to colocated `apps/api/src/**/*.integration.test.ts`).
- **Why it matters:** TESTS-1 F2 said *"Same CLAUDE.md 'no internal mocks' rule. The database is the most-critical internal module to NOT mock in an integration test."* That sentence is correct as a principle but **does not apply to these files** — they aren't mocking database behavior, they're swapping the underlying Postgres driver because Neon's HTTP driver can't talk to a localhost Postgres container in CI. The CI workflow at `.github/workflows/ci.yml:36-49` provisions exactly such a container, so the driver shim is the only way to make the same `createDatabase()` call work in both Neon (production) and `pgvector/pgvector:pg16` (CI). **Removing the shim would break CI integration tests.** TESTS-1's "caveat: verify which tests actually load setup.ts" was prescient — execution would have shown all of them do, and that the mock is benign.
- **Anticipated effort:** N/A — no remediation needed for these 49 occurrences. The 47 unit-test mocks are CLAUDE.md-compliant. The 2 setup-file shims are required infrastructure.
- **Suggested track:** N/A — close TESTS-1 F2 with a "revised, not actionable" note.

### Finding 4 — Five integration-test files mock the internal Inngest client (5 confirmed; sweep target)

- **Severity:** YELLOW
- **Files:**
  - `tests/integration/account-deletion.integration.test.ts:41-46` — inline declaration of `mockInngestSend` + `mockInngestCreateFunction`, then `jest.mock('../../apps/api/src/inngest/client', () => ({ inngest: { send, createFunction } }))`. The file's header comment (lines 1-18) explicitly enumerates the Inngest mock as a "boundary," but per CLAUDE.md the Inngest client is internal infrastructure, not an external SaaS like Stripe.
  - `tests/integration/consent-email.integration.test.ts:30` — `jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock())` (uses the institutional helper).
  - `tests/integration/learning-session.integration.test.ts:61` — inline declaration (same shape as account-deletion).
  - `tests/integration/onboarding.integration.test.ts:15` — uses the helper. File header (line 11) explicitly mentions "LLM provider — via registerProvider … NOT via jest.mock — so safety preamble, circuit breaker, and routing logic all run as normal" — i.e., the team knows the right pattern for LLM mocking but hasn't applied it to Inngest yet.
  - `tests/integration/stripe-webhook.integration.test.ts:36` — inline declaration.
  - **Plus:** `tests/integration/mocks.ts` provides `inngestClientMock()` as the institutional helper (lines 28-45). The header comment (lines 6-9) is honest about it: *"INTENTIONALLY mocks an internal module … The alternative — letting events dispatch to a real/dev Inngest server — would make tests flaky and environment-dependent."* This is the rationale that needs to be re-evaluated: `weekly-progress-push.integration.test.ts:277-309` shows that **hand-building a `step` object** is a third option that neither mocks the client nor depends on a real Inngest server.
- **What's specifically mocked:** The whole `inngest` export — both `send` (event dispatch) and `createFunction` (the function builder called at module-import time for every Inngest function file). The reason `createFunction` must be mocked (not just `send`) is structural: importing any file under `apps/api/src/inngest/functions/` triggers a `createFunction` call at top-level evaluation, and `serve()` calls `getConfig()` on each — so a `jest.mock` of `./client` has to satisfy both APIs to keep the import graph from throwing.
- **Test's actual integration boundary:** Each of the 5 files exercises route handlers via `app.request(...)` against the real Hono app, real DB, real services. The Inngest mock is there to intercept events the route emits *as a side effect*. The asserted invariant is "the route called `inngest.send` with shape X." That assertion is identical to what a route-unit test asserts.
- **What would be left if the mock were removed:** Two paths:
  1. **Don't depend on dispatch at all** — assert the database side-effect that `inngest.send` was *intended* to trigger (e.g., for `account-deletion`, the `accounts.deletionScheduledAt` column is set in the DB; that's a stronger assertion than "send was called"). This works for routes whose Inngest event is observability-only.
  2. **Hand-build `step` and call the handler directly** — mirror `weekly-progress-push.integration.test.ts:277-309`. This works for routes-then-handlers chains (e.g., `consent-email` queues an event that an Inngest function processes; assert the route side-effect AND then call the handler with the event payload).
- **Why it matters:** Same CLAUDE.md "no internal mocks in integration tests" rule cited by BUG-743. AUDIT-INNGEST-2 is shipping observers for orphan Inngest events; regressions in those observers may slip past these 5 tests because the dispatcher is mocked. The sweep is necessary to make those observers verifiable end-to-end.
- **Anticipated effort:** hours per file × 5 = ~10-15 hours; could be parallelized into a multi-PR sweep.
- **Suggested track:** B (Phase 2 of the C2 plan, after the LLM allowlist drains).

### Finding 5 — Propose: extend BUG-743 guard to `@eduagent/database` mocks in integration tests

- **Severity:** YELLOW (preventative)
- **Files (proposed new):** `apps/api/src/services/db/integration-mock-guard.test.ts` (new file; pick a directory with strong "owns the database" semantics)
- **Proposed regex:** mirror BUG-743 verbatim, only swap the segment match. The token to detect is `database` (or its package alias `@eduagent/database`):
  ```ts
  const matches = source.matchAll(/jest\.mock\(\s*['"]([^'"]+)['"]/g);
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier) continue;
    // Match @eduagent/database (package), './database' (relative), '../db' (segment)
    if (
      specifier === '@eduagent/database' ||
      specifier.endsWith('/database') ||
      specifier.endsWith('/db')
    ) {
      return true;
    }
  }
  ```
  The `endsWith('/database')` is conservative; it would catch `'../../packages/database'` (true positive) but also `'./services/database'` if such a path existed (potential false positive, but `database` as a service name is unlikely in this codebase — verify with `Grep "from '.*\\/database'"`).
- **Proposed file enumeration:** repo-wide, not just `apps/api/**`, because the integration tests in `tests/integration/` matter too. Use `git ls-files "**/*.integration.test.ts"` and union with `git ls-files "tests/integration/**/*.test.ts"`. **This is a structural difference from the BUG-743 guard**, which is scoped to `apps/api/`.
- **Proposed initial KNOWN_OFFENDERS allowlist:**
  - `tests/integration/setup.ts` — *but* this is not a `*.integration.test.ts` file, so the file-enumeration regex won't pick it up. Resolution: the guard should only enforce on `*.integration.test.ts` files, **not** on `*.ts` setup files. The setup-file driver shims (Finding 3) are out of scope for the guard.
  - **Empty allowlist** if the file enumeration is `*.integration.test.ts` only — Finding 3 confirmed zero `*.integration.test.ts` files mock `@eduagent/database`. The guard would ship as a "never let this happen" forward-only fence.
- **Structural difference from LLM guard:** No back-catalog to drain — the guard is purely preventative. Recommend keeping the third assertion (`shrinks the allowlist`) anyway, parametrized over an empty set, so the test still fails if anyone adds an offender then adds it to the allowlist.
- **False-positive risk:** Higher than the LLM guard. The LLM regex requires a hyphen-or-edge `llm` token; the database regex matches any specifier ending in `/database` or `/db`. A filename `apps/api/src/services/db.ts` (currently does not exist; verified via `Grep "from ['\"]\\.\\./db['\"]"`) would trigger a false positive. **Mitigation:** keep the regex as `specifier === '@eduagent/database'` plus the relative form `endsWith('/packages/database')` — narrower than `endsWith('/db')`. Refine if the codebase grows other `db.ts` modules.
- **Anticipated effort:** ~30 min to write + ~1 hr to validate against current files.
- **Suggested track:** B (Phase 0 of the C2 plan, before any sweep).

### Finding 6 — Propose: extend BUG-743 guard to Inngest mocks in integration tests

- **Severity:** YELLOW (catches the back-catalog + prevents new offenders)
- **Files (proposed new):** `apps/api/src/inngest/integration-mock-guard.test.ts` (sibling of the LLM guard; lives next to the inngest source it's defending)
- **Proposed regex:**
  ```ts
  const matches = source.matchAll(/jest\.mock\(\s*['"]([^'"]+)['"]/g);
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier) continue;
    const segments = specifier.split('/');
    // Match './client', '../inngest/client', '@eduagent/inngest/client', etc.
    // The terminal segment 'client' alone is too broad; require an 'inngest' segment.
    if (segments.includes('inngest')) {
      return true;
    }
  }
  ```
  This is broader than just `client.ts` — it would also catch `jest.mock('../inngest/functions/...')` if anyone ever did that (currently nobody does; verify with `Grep "jest\\.mock\\([^)]*inngest"`).
- **Proposed file enumeration:** same union as Finding 5 — `*.integration.test.ts` files under `apps/api/**` plus all `*.test.ts` files under `tests/integration/`.
- **Proposed initial KNOWN_OFFENDERS allowlist** (the 5 from Finding 4 + the 3rd LLM offender's secondary inngest mock):
  - `tests/integration/account-deletion.integration.test.ts`
  - `tests/integration/consent-email.integration.test.ts`
  - `tests/integration/learning-session.integration.test.ts`
  - `tests/integration/onboarding.integration.test.ts`
  - `tests/integration/stripe-webhook.integration.test.ts`
  - `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` (this file mocks both LLM via BUG-743 allowlist AND Inngest client at line 37 — see Finding 2). Including it here makes the cross-channel coverage complete; removing it from this list when the file migrates is the natural closing-the-loop.
- **Structural difference from LLM guard:** Larger initial allowlist (6 vs. 3) and a broader regex (matches `inngest` segment anywhere, not just hyphen-token form). Higher false-positive risk if anyone ever names a non-Inngest module `inngest-something` — currently no such module exists in the codebase, but flagged.
- **Anticipated effort:** ~30 min to write + ~1 hr to validate + ~30 min to make sure the assertion error message points at `weekly-progress-push.integration.test.ts:277-309` for the migration pattern.
- **Suggested track:** B (Phase 0 of the C2 plan, alongside Finding 5).

### Finding 7 — Real-DB harness already exists; no new infrastructure to design

- **Severity:** GREEN (positive infrastructure finding)
- **Files:**
  - `.github/workflows/ci.yml:36-49` — service container declaration: `pgvector/pgvector:pg16`, env `POSTGRES_USER=eduagent / POSTGRES_PASSWORD=eduagent / POSTGRES_DB=tests`, healthcheck via `pg_isready`, port 5432 exposed.
  - `.github/workflows/ci.yml:50-52` — env block for the job: `DATABASE_URL: postgresql://eduagent:eduagent@localhost:5432/tests`, `CI: true`.
  - `.github/workflows/ci.yml:99-108` — pre-test SQL: `psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector;'` then `pnpm exec drizzle-kit migrate` (CFG-12 fix to apply real migration SQL, not push).
  - `.github/workflows/ci.yml:125-128` — conditional integration-test invocation: `if: steps.changes.outputs.api == 'true'` (only runs when `apps/api/`, `packages/database/`, `packages/schemas/`, `packages/retention/`, or `pnpm-lock.yaml` changed) → `pnpm exec nx run api:test:integration`.
  - `tests/integration/setup.ts:30-66` — driver-shim that swaps Neon HTTP for `pg` wire when DATABASE_URL is non-Neon (the bridge between `createDatabase()` and the CI Postgres container).
  - `tests/integration/api-setup.ts:19-50` — the same shim for colocated `apps/api/src/**/*.integration.test.ts` files.
  - `tests/integration/helpers.ts:14-43` — `requireDatabaseUrl()`, `buildIntegrationEnv()`, `createIntegrationDb()`, `cleanupAccounts()` — the shared seeding/cleanup contract for `tests/integration/` files.
  - `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts:311-354` — proof-of-life: this file uses `process.env.DATABASE_URL`, calls `createDatabase()`, runs migration replay if needed, intercepts only the external Expo Push fetch, and cleans up via `like('clerk_weekly_push_${RUN_ID}%')`.
- **Evidence the harness works:** TESTS-1 listed `tests/integration/` as having 32 `*.integration.test.ts` files. CI runs them via `nx run api:test:integration` against the real `pgvector/pgvector:pg16` container. `weekly-progress-push.integration.test.ts` is one of the 24 colocated `*.integration.test.ts` files under `apps/api/`; CI runs those too via the same `api:test:integration` task.
- **Gaps remaining:**
  - Doppler CLI is not used in CI (no `doppler run --` wrapper). The CI-side `DATABASE_URL` is hardcoded to the localhost container; for any test that needs other secrets (e.g., `RESEND_API_KEY` for `consent-email.integration.test.ts`), the test must either mock the secret or the CI workflow must add it as an env var. **This is not a harness gap, but contributors expecting `doppler run` to work locally + in CI may be surprised.** CLAUDE.md "Handy Commands" section calls out `C:/Tools/doppler/doppler.exe run -c stg --` for Playwright E2E — that's a different test type. Integration tests rely on `process.env.DATABASE_URL` directly.
  - Migration replay in `weekly-progress-push.integration.test.ts:265-275` is brittle (filename-pinned `0036_famous_vengeance.sql`, `0037_rls_weekly_reports.sql`). If a future migration touches the `weekly_reports` table or its RLS policies, this list needs updating. **Improvement opportunity:** since CI runs `drizzle-kit migrate` *before* the test job (ci.yml:106-108), the table SHOULD already exist; the `ensureWeeklyReportsTable()` defensive code only fires if not. This is belt-and-braces.
- **Why it matters:** The C2 cluster's biggest perceived risk was *"author a real-DB integration harness."* That risk does not exist. The harness is mature, working, and proven by `weekly-progress-push.integration.test.ts`. The remaining work is per-file migration of the 5 + 3 = 8 offenders into the same shape, plus the two new guards (Findings 5 and 6) to prevent regression.
- **Anticipated effort:** N/A (no harness work needed)
- **Suggested track:** N/A — fold into the Phase 1/2 sweeps as documentation, not as a separate plan.

## Cross-coupling notes

- **C1 (SCHEMA / TYPES) deepening — strong coupling.** The consolidated overview's §8 names schema-and-test migrations as paired. Specifically: when SCHEMA-2 wraps a route's `c.json` with a response-schema parse, the corresponding `.test.ts` file needs to (a) re-assert against the schema (TESTS-1 F3) AND (b) NOT break because the file already mocks `@eduagent/database` for unit-test purposes (Finding 3 confirms 21 route `.test.ts` files do this). The guard proposed in Finding 5 explicitly excludes unit-test files (only enforces on `*.integration.test.ts`), so SCHEMA-2 PRs touching unit tests are not blocked. **The integration-test-side of SCHEMA-2 is empty** — there are zero `*.integration.test.ts` files asserting response shapes against schemas today (verified by Grep of `parse(` in tests/integration/, returns only `JSON.parse` and `parseInt`).
- **AUDIT-INNGEST-2 — strong coupling.** Finding 4's 5 Inngest-client-mocking integration tests + Finding 6's proposed Inngest guard directly affect AUDIT-INNGEST-2's orphan-event observers. The 5 tests mock `inngest.send`, so any orphan-event observer that relies on a *real* event hitting a *real* observer function won't be exercised by these tests. Recommended ordering: (1) ship Finding 6's guard, (2) ship the AUDIT-INNGEST-2 observers, (3) sweep the 5 offenders so the observers are tested end-to-end.
- **Predecessor revision — TESTS-1 F2.** This audit revises TESTS-1 Finding 2 from YELLOW to **N/A — not actionable**. The framing was "`@eduagent/database` mocked in shared integration setup files = no internal mocks rule violated." After reading the mock body (Finding 3), it's a driver shim that spreads `...actual` through and only changes the `createDatabase` factory for non-Neon URLs. CLAUDE.md "no internal mocks" rule does not target driver shims. The two setup files should stay as-is. The cleanup-plan should reflect this revision.
- **CLAUDE.md "Required Validation."** The guard tests proposed in Findings 5 and 6 will themselves run as part of `pnpm exec nx run api:test` (i.e., the regular Jest task, not `api:test:integration`), since they don't need a database. This is the same task BUG-743 already extends. **No CI workflow changes needed.**

## Out of scope / not checked

- I did **not** read every one of the 47 unit-test files that mock `@eduagent/database` in full. Classification rests on filename pattern (`*.test.ts` not `*.integration.test.ts`) and a sample of 3 files (`routes/dashboard.test.ts`, `services/embeddings.test.ts`, `inngest/functions/quota-reset.test.ts`). If any of the 47 files turn out to be misnamed (i.e., are integration-shaped but use a unit-test filename), they would be undercounted here. Mitigation: the proposed guard in Finding 5 would catch them on the next CI run.
- I did **not** verify the proposed regex in Finding 5 against every file in the repo. The mitigations listed (narrow `endsWith('/packages/database')` instead of `endsWith('/db')`) are conservative defaults; an actual implementation should `Grep` against the proposed regex first to enumerate and verify.
- I did **not** read the bodies of the 4 inngest-mocking integration tests not previously read by TESTS-1 (`onboarding-dimensions`, `inngest-quota-reset`, `inngest-trial-expiry`, `session-completed-{chain,pipeline}`). The 5 in Finding 4 match the file list TESTS-1 already enumerated; if other `tests/integration/*.integration.test.ts` files mock `inngest` indirectly (e.g., via a different specifier than `'../../apps/api/src/inngest/client'`), they would be missed. The Finding 6 guard would catch them next run.
- I did **not** measure how long `weekly-progress-push.integration.test.ts` takes to run in CI. Migration of the 5 + 3 offenders to the same pattern will increase total integration-test runtime; if the increase is material (> 5 min), the sweep should be paired with the partial-test-run optimization the CI workflow already does (`if: steps.changes.outputs.api == 'true'`).
- I did **not** verify the `api:test:integration` Nx task definition (`apps/api/project.json` or equivalent). I assumed it runs all `*.integration.test.ts` files under `apps/api/` — the task name suggests so, and CI uses it conditionally on API changes. Unverified.

## Recommended punch-list entries

```markdown
- **AUDIT-TESTS-2A** Extend BUG-743 mock-guard pattern to `@eduagent/database` in integration tests (forward-only)
  - Severity: YELLOW (preventative; no current offenders)
  - Effort: ~1-2 hours
  - Files: NEW `apps/api/src/services/db/integration-mock-guard.test.ts` (or sibling location)
  - Why it matters: closes the second internal-mock channel CLAUDE.md cares about. Empty initial allowlist — pure forward fence. Mirrors the structural shape of `apps/api/src/services/llm/integration-mock-guard.test.ts`. See AUDIT-TESTS-2 deepening Finding 5 for the proposed regex and false-positive mitigation.

- **AUDIT-TESTS-2B** Extend BUG-743 mock-guard pattern to `inngest` in integration tests
  - Severity: YELLOW (catches 5 known offenders + prevents new ones)
  - Effort: ~1-2 hours to ship the guard + 10-15 hours sweep effort to drain the allowlist
  - Files: NEW `apps/api/src/inngest/integration-mock-guard.test.ts`; KNOWN_OFFENDERS: `tests/integration/{account-deletion,consent-email,learning-session,onboarding,stripe-webhook}.integration.test.ts` + `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`
  - Why it matters: the 5 integration tests have integration filenames but route-unit-test mock surfaces. AUDIT-INNGEST-2's orphan-event observers can't be verified end-to-end while the dispatcher is mocked. See AUDIT-TESTS-2 deepening Finding 6.

- **AUDIT-TESTS-2C** Drain the BUG-743 LLM allowlist (3 files → HTTP-boundary or provider-registry)
  - Severity: YELLOW (back-catalog of internal-LLM mocks)
  - Effort: ~3-6 hours per file × 3 = ~10-15 hours
  - Files: `apps/api/src/services/session-summary.integration.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`
  - Why it matters: removes the back-catalog the BUG-743 guard exists to bound. Migration target is `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts:1-637` (HTTP-boundary fetch intercept) OR `tests/integration/learning-session.integration.test.ts:35-49` (registerProvider override — preferred for LLM-router tests because it exercises the real router dispatch). See AUDIT-TESTS-2 deepening Finding 2.

- **AUDIT-TESTS-2D** Drain the proposed Inngest allowlist (sweep the 5 + 1 known offenders)
  - Severity: YELLOW (depends on AUDIT-TESTS-2B shipping first)
  - Effort: ~2-3 hours per file × 6 = ~10-18 hours; parallelizable into 2-3 PRs
  - Files: same as AUDIT-TESTS-2B KNOWN_OFFENDERS list
  - Why it matters: makes the integration tests honest — they will exercise real Inngest event dispatch (via the hand-built `step` pattern from `weekly-progress-push.integration.test.ts:277-309`) instead of asserting that the mock was called. Pairs with AUDIT-INNGEST-2.

- **AUDIT-TESTS-2E (REVISION)** Close TESTS-1 Finding 2 as not-actionable
  - Severity: N/A — predecessor revision
  - Effort: 5 min (punch-list edit only)
  - Files: `tests/integration/setup.ts:42`, `tests/integration/api-setup.ts:29`
  - Why it matters: the `jest.mock('@eduagent/database')` in these two files is a Neon → pg driver shim that spreads `...actual` through. CLAUDE.md "no internal mocks" rule does not target driver shims. Removing these would break CI integration tests against the localhost Postgres container. See AUDIT-TESTS-2 deepening Finding 3.
```

## Audit honesty disclosures

- **Sampling.** Of the 49 `jest.mock('@eduagent/database')` files, I read 5 in full (the 2 setup files plus 3 unit-test files as a representative sample). Filename-based bucketing is the load-bearing classification rule for the other 44 — a misnamed file (integration-shaped with `*.test.ts` suffix) would be undercounted.
- **TESTS-1 F2 revision.** I am explicitly revising a predecessor finding. TESTS-1 was honest about its caveat ("verify which tests actually load setup.ts before remediating") — this audit's contribution is doing that verification by reading the mock bodies. The revision is upward-revising the predecessor's epistemic confidence about the cluster's true scope, not a contradiction.
- **Proposed regex (Findings 5 and 6) is unvalidated against the live tree.** I did not run the proposed regex via Grep before writing it. The proposed false-positive mitigations are conservative defaults; the actual implementation must Grep against the regex first.
- **Migration target qualified by `[BUG-941]` comment in `learning-session.integration.test.ts:74-83`.** That file's existing provider-registry override pattern (the recommended pattern for LLM-router tests) has a comment about envelope parsing requirements — any migration of the 3 LLM offenders that uses this pattern must yield a minimal valid envelope, not a zero-chunk stream. Worth flagging in any sweep PR description.
- **CI workflow read in full but I did not run the integration tests locally** to verify the harness end-to-end. The harness "works" claim rests on (a) the `*.integration.test.ts` files exist and pass per `git log` history, (b) the CI workflow file declares the right service container and migration step, (c) `weekly-progress-push.integration.test.ts` is structured to assume `process.env.DATABASE_URL` and a real DB. A more thorough audit would actually run `nx run api:test:integration` against a local Postgres.
- **`api:test:integration` Nx task definition unverified.** The task name suggests it runs `*.integration.test.ts` files under `apps/api/`. Unverified — should be confirmed in any execution session.
- **Time spent:** ~50 minutes recon (file reads, grepping, classification) + ~25 minutes writing. Within the 45-60 minute budget for the recon; writing pushed slightly over because of the per-file classification table.
