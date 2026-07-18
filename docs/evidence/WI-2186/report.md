# WI-2186 Reports empty-state timing evidence

This report preserves the executed red/green/revert/restore proof for **WI-2186 — Align Reports empty-state timing with weekly and monthly delivery**. The implementation branch started from `origin/main` revision `1c11fa4a8e74ef28bedf7781c898243ec3ce4778`; the response-contract correction began from the exact pushed candidate `062bf4dd8a6647b1efa4e3fde43f5150fcf0d809`.

## Reported defect cases

1. **Wednesday before a weekly run:** at 2026-06-03 12:00 UTC, the child Reports surface promised the monthly 2026-07-01 run even though the weekly schedule could deliver on Monday 2026-06-08 (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:672`).
2. **Organization-timezone Monday:** at 2026-06-08 10:00 UTC, an America/Los_Angeles guardian was told the next weekly delivery was 2026-06-15 09:00 UTC even though the canonical job would run that day at 16:00 UTC (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:644`).
3. **Cold first load/deep link:** when both report endpoints had already settled empty but child detail was still loading, the screen formatted the unresolved timezone as UTC and flashed June 15 before the canonical America/Los_Angeles response changed the date to June 8 (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:177`).
4. **Failed timezone provenance:** a child-detail failure was also treated as a successful UTC fallback and rendered a dated empty state with no path to retry the missing provenance (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:257`).
5. **Journal combined empty state:** after both report queries settled empty, Journal rendered the truthful combined weekly/monthly message and a second fixed month-end promise (`apps/mobile/src/components/journal/JournalTabView.test.tsx:544`).
6. **Settled endpoint error:** an empty array returned alongside a query error was rendered as no report activity instead of the error state (`apps/mobile/src/components/journal/JournalTabView.test.tsx:563`).

The schedule matrix also covers the UTC weekly boundary, monthly-earlier selection, same-day monthly before 10:00 UTC, post-monthly weekly, short-month weekly, and year-boundary weekly cases (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:656`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:680`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:688`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:694`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:712`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:718`).

## Root cause and implementation

`apps/mobile/src/components/progress/ReportsList.tsx:230` owned a fixed month-end translation even though the component renders both weekly and monthly reports. Journal composed that list beneath its own combined expectation. The child helper calculated Monday 09:00 in UTC rather than using the organization-timezone filter that gates the production weekly job (`apps/api/src/inngest/functions/weekly-progress-push.ts:123`). The first corrective candidate then read the canonical timezone value but discarded the child-detail query's loading and error provenance, so `undefined` was indistinguishable from a successfully resolved nullable timezone during an empty first load (`apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:173`).

The candidate:

- centralizes the weekly job's IANA-timezone normalization, local-09 predicate, and next-run search in a shared pure seam (`packages/schemas/src/report-schedule.ts:5`, `packages/schemas/src/report-schedule.ts:18`, `packages/schemas/src/report-schedule.ts:31`);
- keeps `weekly-progress-push` on that same predicate (`apps/api/src/inngest/functions/weekly-progress-push.ts:123`) and preserves its existing null/invalid UTC fallback matrix (`apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`);
- reads the guardian's canonical organization timezone through the existing identity helper and exposes it on child detail (`apps/api/src/services/dashboard.ts:1126`, `apps/api/src/services/dashboard.ts:1296`), proven against the real database path (`apps/api/src/services/dashboard.integration.test.ts:1227`);
- chooses the earlier upcoming organization-timezone weekly run or UTC monthly run and displays the selected run's calendar date (`apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:46`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:383`);
- waits for child-detail loading provenance before constructing a dated empty expectation, routes failed provenance through the existing retryable error state, and preserves the successfully resolved `null` UTC fallback (`apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:173`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:205`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:313`);
- gives the shared list the combined weekly/monthly copy while Journal retains a single owner for that expectation (`apps/mobile/src/components/progress/ReportsList.tsx:230`, `apps/mobile/src/components/journal/JournalTabView.tsx:208`);
- keeps error, loading, weekly-only, monthly-only, and mixed states distinct (`apps/mobile/src/components/journal/JournalTabView.tsx:167`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`);
- exposes empty expectations as untruncated accessibility summaries (`apps/mobile/src/components/progress/ReportsList.tsx:233`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:384`);
- uses one complete localized sentence in all seven locale files (`apps/mobile/src/i18n/locales/en.json:2731`, `apps/mobile/src/i18n/locales/de.json:2633`, `apps/mobile/src/i18n/locales/es.json:2633`, `apps/mobile/src/i18n/locales/ja.json:2633`, `apps/mobile/src/i18n/locales/nb.json:2633`, `apps/mobile/src/i18n/locales/pl.json:2788`, `apps/mobile/src/i18n/locales/pt.json:2660`).

## Response-contract correction

The review blocker was the shared `DashboardChild` response property `organizationTimezone: z.string().nullable().optional()`. That shape violated the repository rule that response fields are nullable or optional, never both, and allowed a successful child-detail response to omit timezone provenance (`docs/project_context.md:43`, `docs/architecture.md:789`). The minimum correction splits the contracts: aggregate dashboard children remain unchanged and timezone-free, while `DashboardChildDetail` requires `organizationTimezone: string | null` and is the only child-detail response member (`packages/schemas/src/progress.ts:392`, `packages/schemas/src/progress.ts:810`).

The producer and every parsing consumer now carry that detail-only type. `getChildDetail` returns `DashboardChildDetail | null`, resolves the organization timezone concurrently with the person, constructs the required property, and preserves it through consent redaction (`apps/api/src/services/dashboard.ts:306`, `apps/api/src/services/dashboard.ts:1111`, `apps/api/src/services/dashboard.ts:1126`, `apps/api/src/services/dashboard.ts:1293`). The route parses the result before responding, so no successful detail object can omit the field (`apps/api/src/routes/dashboard.ts:117`). Mobile's detail hook parses the same schema and returns `DashboardChildDetail | null`; the aggregate dashboard hook remains on `DashboardData` (`apps/mobile/src/hooks/use-dashboard.ts:150`, `apps/mobile/src/hooks/use-dashboard.ts:160`). Real-hook and screen fixtures now distinguish a successful nullable UTC fallback from an omitted/unresolved property (`apps/mobile/src/hooks/use-dashboard.test.ts:224`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:84`, `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx:280`).

The contract regression was written first. Against `062bf4dd8a6647b1efa4e3fde43f5150fcf0d809`, parsing a successful child detail without `organizationTimezone` unexpectedly returned `success: true`; the focused test failed at `packages/schemas/src/progress.test.ts:1435`. With the split contract, omission is rejected and explicit `null` is accepted (`packages/schemas/src/progress.test.ts:1434`, `packages/schemas/src/progress.test.ts:1437`). The database integration still proves the non-null `America/Los_Angeles` producer path (`apps/api/src/services/dashboard.integration.test.ts:1227`), while the route test proves the redacted explicit-null path (`apps/api/src/routes/dashboard.test.ts:362`, `apps/api/src/routes/dashboard.test.ts:396`).

## Executed red, green, revert, and restore

The focused boundary invocation covered `apps/mobile/src/components/progress/ReportsList.test.tsx:51`, `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:173`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:253`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:640`, and `apps/mobile/src/i18n/index.test.ts:1`.

The original test-first RED reproduced the Wednesday-to-monthly defect, duplicate Journal promise, empty/error conflation, and missing summary semantics. The original production-only revert of `apps/mobile/src/components/progress/ReportsList.tsx:230`, `apps/mobile/src/components/journal/JournalTabView.tsx:167`, and `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29` produced 11 failed and 64 passed tests; restoring those sources produced 75 passed tests.

The corrective timezone RED was then added at `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:644`. Temporarily reverting only the production weekly calculation at `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:21` reproduced the precise defect:

```text
Expected: 2026-06-08T16:00:00.000Z
Received: 2026-06-15T09:00:00.000Z
Test Suites: 1 failed, 3 passed, 4 total
Tests:       1 failed, 76 passed, 77 total
```

The fresh-review regression was added test-first at `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:177`. With reports already settled empty at 2026-06-08 10:00 UTC, the initial render failed by exposing `June 15, 2026` while child detail was unresolved. A second test-first slice at `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:257` failed because child-detail error provenance rendered the dated empty state rather than the existing error card. Temporarily reverting only the production child-detail loading/error/refetch handling while holding all tests fixed reproduced both defects: 2 failed and 27 passed tests in the child Reports suite. Restoring the handling produced 29 passed tests in that suite.

The complete focused restore produced 4 passed suites and 79 passed tests. The sanitized machine-readable result is recorded at `docs/evidence/WI-2186/green-candidate.json:2`; the two new assertions are at `docs/evidence/WI-2186/green-candidate.json:133` and `docs/evidence/WI-2186/green-candidate.json:187`, and its four suite names are repository-relative at `docs/evidence/WI-2186/green-candidate.json:549`, `docs/evidence/WI-2186/green-candidate.json:729`, `docs/evidence/WI-2186/green-candidate.json:1147`, and `docs/evidence/WI-2186/green-candidate.json:1429`.

## Acceptance Criteria evidence

| Acceptance Criterion | Executable evidence | Production surface |
| --- | --- | --- |
| Combined surfaces show one truthful earliest-eligible expectation only after report and timezone provenance settles | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:163`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:177`; `apps/mobile/src/components/progress/ReportsList.test.tsx:51` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:383`; `apps/mobile/src/components/progress/ReportsList.tsx:230` |
| Weekly timing follows the canonical organization-timezone production schedule with the existing UTC fallback and an explicit detail response property | `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:224`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:644`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:656`; `packages/schemas/src/progress.test.ts:1434`; `apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`; `apps/api/src/services/dashboard.integration.test.ts:1227` | `packages/schemas/src/report-schedule.ts:18`; `packages/schemas/src/report-schedule.ts:31`; `packages/schemas/src/progress.ts:392`; `apps/api/src/inngest/functions/weekly-progress-push.ts:123`; `apps/api/src/services/dashboard.ts:1293`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:21` |
| Journal and the shared list use combined semantics while a consumer can retain separate ownership | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/components/progress/ReportsList.test.tsx:51` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/components/progress/ReportsList.tsx:172` |
| Loading, error, no-activity, weekly-only, monthly-only, and mixed states remain distinct across seven locales | `apps/mobile/src/components/journal/JournalTabView.test.tsx:563`; `apps/mobile/src/components/journal/JournalTabView.test.tsx:580`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:177`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:257`; `apps/mobile/src/i18n/index.test.ts:1` | `apps/mobile/src/components/journal/JournalTabView.tsx:167`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:205`; `apps/mobile/src/i18n/locales/en.json:2731` |
| Journal, shared-list, child-schedule, and compact-screen accessibility regressions are cadence-bound | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/components/progress/ReportsList.test.tsx:72`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:177`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:644` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/components/progress/ReportsList.tsx:233`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:383` |

## GC6 deferral

The focused burn-down would expand into unrelated route, hook, native-boundary, and app-provider test architecture. Per the `AGENTS.md:418` convention—“The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task”—the response-contract commit records the edited files and retained internal-mock counts: `apps/api/src/routes/dashboard.test.ts:47` (8), `apps/mobile/src/hooks/use-dashboard.test.ts:19` (1), `apps/mobile/src/app/(app)/child/[profileId]/curriculum.test.tsx:29` (5), `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx:78` (4), `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.test.tsx:39` (1), `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:39` (3), and `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx:66` (2). The schema regression has none. No new internal mock was added.

## Verification

- Response-contract test-first RED: omission unexpectedly parsed on exact pushed `062bf4dd8a6647b1efa4e3fde43f5150fcf0d809`; restored focused schema regression passed, and the full schema suite passed 39 suites / 1,334 tests (`packages/schemas/src/progress.test.ts:1434`).
- Corrected API/mobile boundary matrix: dashboard route 54/54, database-backed dashboard service 27/27, mobile detail hook 13/13, and eight real consumer/schedule suites 147/147 (`apps/api/src/routes/dashboard.test.ts:362`, `apps/api/src/services/dashboard.integration.test.ts:1227`, `apps/mobile/src/hooks/use-dashboard.test.ts:219`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:98`).
- Corrected no-cache Nx typecheck and project lint passed schemas, API, mobile, and four type dependencies; project lint reported only the repository's existing warnings outside the corrective lines. Targeted ESLint was warning-free; Prettier, `git diff --check`, and repository `pnpm prepush` (`tsc --build`) all exited 0 (`packages/schemas/tsconfig.lib.json:1`, `apps/api/tsconfig.app.json:1`, `apps/mobile/tsconfig.app.json:1`, `package.json:32`).
- Fresh-review focused restore GREEN: 4 suites, 79 tests, 0 snapshots; sanitized result at `docs/evidence/WI-2186/green-candidate.json:2`.
- Fresh-review production-source revert: 2 failed and 27 passed child Reports tests; restored source: 29 passed.
- Fresh-review canonical weekly scheduler unit suite: 1 suite, 29 tests, 0 snapshots (`apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`).
- Fresh-review no-cache Nx typecheck: mobile plus six transitive tasks passed; Nx emitted its existing flaky-task advisory for the mobile target after exit 0 (`apps/mobile/project.json:1`).
- Fresh-review targeted ESLint over the child Reports source and test: exit 0 (`eslint.config.mjs:1`).

The earlier candidate-wide verification remains applicable because the fresh-review correction changes only child Reports query-state rendering and its co-located test:

- Real-database dashboard integration: 1 suite, 27 tests, 0 snapshots (`apps/api/src/services/dashboard.integration.test.ts:1193`).
- Full schemas: 39 suites, 1,334 tests, 0 snapshots (`packages/schemas/src/progress.test.ts:1406` included).
- Full mobile assertions: 485 suites, 5,851 tests, 0 snapshots; the repository's known open handles remained after the green summary, so the idle process was interrupted after completion (`apps/mobile/jest.config.cjs:1`).
- Full API: 444 suites passed; 8,132 tests passed, 11 skipped; 3 snapshots passed; exit 0 with `--forceExit` after the known open-handle warning (`apps/api/jest.config.cjs:1`).
- Earlier no-cache schemas/API/mobile typecheck: passed (`packages/schemas/tsconfig.lib.json:1`, `apps/api/tsconfig.app.json:1`, `apps/mobile/tsconfig.app.json:1`).
- Earlier targeted ESLint over every corrective TypeScript source and test file: exit 0 (`eslint.config.mjs:1`).
- Prettier and `git diff --check`: passed (`.prettierrc:1`).
- The aggregate Nx test wrapper could not enter its API build prerequisite because Corepack selected pnpm 11 while the repository pins pnpm 10.19.0; direct Jest suites above provide the proportional test results (`package.json:1`).

The Jest runs emitted the repository's existing Expo native-module, `EXPO_OS`, React `act`, i18n language-change, and expected open-handle warnings. None changed an assertion result.
