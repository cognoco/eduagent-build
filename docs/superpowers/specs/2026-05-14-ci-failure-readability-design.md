# CI Failure Readability — Design

**Date:** 2026-05-14
**Status:** Approved, in implementation
**Owner:** Coordinator

## Problem

CI logs are dominated by noise from passing tests. Audit of the most recent failing CI run on this repo (`run 25811886313`, branch `i18n-module`, 2026-05-13):

- **Total log lines:** 29,294
- **Real test failures:** 4 assertions in `drizzle-meta-coverage.test.ts` + `rls-coverage.test.ts` at lines 668–773 (~100 lines, **0.35 % of log**)
- **Bulk noise:** ~28,000 lines of `at Object.warn/error (apps/api/src/services/logger.ts:66:25)` stack traces emitted from **passing tests** in `billing.test.ts` and `session-completed.test.ts` — these tests deliberately exercise error paths, and Jest renders the captured `logger.error/warn` callsites
- **Final exit-code marker:** line 29,294 (`##[error]Process completed with exit code 1`)

Anyone scanning the log from the bottom (the natural place — that's where the failure indicator lives) wades through 28K lines of garbage before realising the real failures are near the top. PR repair time is dominated by scrolling.

## Goal

For a failed CI run, surface the actual failing files + assertion lines:

1. As **GitHub Actions annotations** on the PR diff (inline, no scrolling).
2. In the **GitHub Actions step summary** at the top of the run page.
3. As a compact **end-of-log block** so anyone who does scroll to the bottom sees the failures, not just the exit code.

For passing tests: stop dumping captured `console.warn/error` callsites — they are 99 % noise.

## Non-goals

- No new npm dependency.
- No CI workflow restructure.
- No JUnit XML / nx-cloud / external dashboard.
- Not changing what tests run, only how their results are presented.
- Not changing local-iteration behaviour — only `CI=true` runs are affected.

## Approach

Two changes, both gated on `process.env.CI`:

### 1. `silent: true` (CI only) — kills passing-test console noise

Built-in Jest option. Suppresses the `console.log/warn/error` output that Jest captures during test execution. The `expect(...).toBe(...)` diff and stack trace for failing tests are untouched.

**Trade-off:** when a test does fail, you can't see `console.log` calls that happened during the test. Acceptable — debugging captured-console output is a local-iteration concern; the assertion diff is what matters for triage. Locally (`CI` unset), behaviour is unchanged.

### 2. In-tree custom Jest reporter — `scripts/jest-ci-reporter.cjs`

~80 LOC. No dependencies. Implements the [Jest reporter interface](https://jestjs.io/docs/configuration#custom-reporters) (`onTestResult`, `onRunComplete`).

For every failing test result:

- Emits a GitHub Actions annotation: `::error file=<rel-path>,line=<N>,col=<M>::<title>%0A<message>` so the failure shows inline on the PR diff.
- Collects the file, test name, first assertion line, and a 1-line failure message into a buffer.

On `onRunComplete`:

- Appends a **markdown summary** to `$GITHUB_STEP_SUMMARY` (if set): one row per failed file with collapsed details.
- Prints a **compact final block** to stdout:

  ```
  ─── CI failures ─────────────────────────────────────
  ✕ packages/database/src/drizzle-meta-coverage.test.ts:127
      enum coverage › detects un-mapped enum
      Expected length: 1, Received length: 4
  ✕ packages/database/src/rls-coverage.test.ts:113
      coverage matrix › every table has explicit RLS policy
      Expected: true, Received: false
  ─────────────────────────────────────────────────────
  ```

The reporter coexists with `default` (so the per-test PASS/FAIL stream is preserved). Activated only when `process.env.CI` is set.

## File changes

| File | Change | Lines |
|---|---|---|
| `scripts/jest-ci-reporter.cjs` | NEW — custom reporter | ~80 |
| `jest.preset.js` | Inject `silent` + `reporters` under `CI=true` | +6 |
| `apps/api/jest.config.cjs` | Same injection (does not use preset) | +5 |
| `apps/mobile/jest.config.cjs` | Same injection (does not use preset) | +5 |
| `scripts/jest.config.cjs` | Same injection | +5 |

The four packages under `packages/*` (`schemas`, `database`, `retention`, `test-utils`) already extend `jest.preset.js`, so they pick up the change automatically.

## Verification

1. Local: `CI=true pnpm exec nx run @eduagent/database:test` against a deliberately-failing test → confirm the final summary block appears, and that `console.warn/error` from a known-noisy test (e.g. `billing.test.ts`) is suppressed.
2. Local: `pnpm exec nx run @eduagent/database:test` (no CI) → behaviour unchanged.
3. Push to a branch with one failing test, observe:
   - GitHub Actions annotation appears on the PR diff.
   - Step summary shows the failed file at the top of the run page.
   - End-of-log block lists the failure cleanly.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Reporter throws | Bug in reporter code | Default reporter still runs (Jest isolates each reporter) | Fix reporter; CI still reports failure via default reporter and exit code |
| `$GITHUB_STEP_SUMMARY` not set | Local `CI=true` run | No summary file, end-of-log block still printed | None — by design |
| Test crashes before assertion | Module-load error | Jest emits a single FAIL with the load error; reporter formats it the same way | None — captured |
| Snapshot failure | `toMatchSnapshot` mismatch | Reporter formats the snapshot-name + first-diff-line | None — captured |

## Rollback

Trivial — revert the commit. No schema, no migration, no data. The custom reporter is additive and has no side effects beyond stdout / step-summary file.

## Out of scope (for a follow-up)

- Per-test timing summary (slowest 10) — useful for perf regressions, not for failure readability.
- JUnit XML output for CI dashboards.
- Splitting test logs into separate workflow steps per package — would also help readability but requires workflow restructure.
