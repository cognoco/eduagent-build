# WI-2186 Reports empty-state timing evidence

This report preserves the executed red/green/revert/restore proof for **WI-2186 — Align Reports empty-state timing with weekly and monthly delivery**. The implementation branch started from `origin/main` revision `1c11fa4a8e74ef28bedf7781c898243ec3ce4778`.

## Reported defect cases

1. **Wednesday before a weekly run:** at 2026-06-03 12:00 UTC, the child Reports surface promised the monthly 2026-07-01 run even though the weekly schedule could deliver on Monday 2026-06-08 (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:586`).
2. **Organization-timezone Monday:** at 2026-06-08 10:00 UTC, an America/Los_Angeles guardian was told the next weekly delivery was 2026-06-15 09:00 UTC even though the canonical job would run that day at 16:00 UTC (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:558`).
3. **Journal combined empty state:** after both report queries settled empty, Journal rendered the truthful combined weekly/monthly message and a second fixed month-end promise (`apps/mobile/src/components/journal/JournalTabView.test.tsx:544`).
4. **Settled endpoint error:** an empty array returned alongside a query error was rendered as no report activity instead of the error state (`apps/mobile/src/components/journal/JournalTabView.test.tsx:563`).

The schedule matrix also covers the UTC weekly boundary, monthly-earlier selection, same-day monthly before 10:00 UTC, post-monthly weekly, short-month weekly, and year-boundary weekly cases (`apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:570`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:594`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:602`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:608`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:626`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:632`).

## Root cause and implementation

`apps/mobile/src/components/progress/ReportsList.tsx:230` owned a fixed month-end translation even though the component renders both weekly and monthly reports. Journal composed that list beneath its own combined expectation. The child helper calculated Monday 09:00 in UTC rather than using the organization-timezone filter that gates the production weekly job (`apps/api/src/inngest/functions/weekly-progress-push.ts:123`).

The candidate:

- centralizes the weekly job's IANA-timezone normalization, local-09 predicate, and next-run search in a shared pure seam (`packages/schemas/src/report-schedule.ts:5`, `packages/schemas/src/report-schedule.ts:18`, `packages/schemas/src/report-schedule.ts:31`);
- keeps `weekly-progress-push` on that same predicate (`apps/api/src/inngest/functions/weekly-progress-push.ts:123`) and preserves its existing null/invalid UTC fallback matrix (`apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`);
- reads the guardian's canonical organization timezone through the existing identity helper and exposes it on child detail (`apps/api/src/services/dashboard.ts:1117`, `packages/schemas/src/progress.ts:356`), proven against the real database path (`apps/api/src/services/dashboard.integration.test.ts:1227`);
- chooses the earlier upcoming organization-timezone weekly run or UTC monthly run and displays the selected run's calendar date (`apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:46`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:379`);
- gives the shared list the combined weekly/monthly copy while Journal retains a single owner for that expectation (`apps/mobile/src/components/progress/ReportsList.tsx:230`, `apps/mobile/src/components/journal/JournalTabView.tsx:208`);
- keeps error, loading, weekly-only, monthly-only, and mixed states distinct (`apps/mobile/src/components/journal/JournalTabView.tsx:167`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`);
- exposes empty expectations as untruncated accessibility summaries (`apps/mobile/src/components/progress/ReportsList.tsx:233`, `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:384`);
- uses one complete localized sentence in all seven locale files (`apps/mobile/src/i18n/locales/en.json:2731`, `apps/mobile/src/i18n/locales/de.json:2633`, `apps/mobile/src/i18n/locales/es.json:2633`, `apps/mobile/src/i18n/locales/ja.json:2633`, `apps/mobile/src/i18n/locales/nb.json:2633`, `apps/mobile/src/i18n/locales/pl.json:2788`, `apps/mobile/src/i18n/locales/pt.json:2660`).

## Executed red, green, revert, and restore

The focused boundary invocation covered `apps/mobile/src/components/progress/ReportsList.test.tsx:51`, `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`, `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:558`, and `apps/mobile/src/i18n/index.test.ts:1`.

The original test-first RED reproduced the Wednesday-to-monthly defect, duplicate Journal promise, empty/error conflation, and missing summary semantics. The original production-only revert of `apps/mobile/src/components/progress/ReportsList.tsx:230`, `apps/mobile/src/components/journal/JournalTabView.tsx:167`, and `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29` produced 11 failed and 64 passed tests; restoring those sources produced 75 passed tests.

The corrective timezone RED was then added at `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:558`. Temporarily reverting only the production weekly calculation at `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29` reproduced the precise defect:

```text
Expected: 2026-06-08T16:00:00.000Z
Received: 2026-06-15T09:00:00.000Z
Test Suites: 1 failed, 3 passed, 4 total
Tests:       1 failed, 76 passed, 77 total
```

Restoring the shared scheduler call produced 4 passed suites and 77 passed tests. The sanitized machine-readable result is recorded at `docs/evidence/WI-2186/green-candidate.json:2`; its four suite names are repository-relative at `docs/evidence/WI-2186/green-candidate.json:513`, `docs/evidence/WI-2186/green-candidate.json:693`, `docs/evidence/WI-2186/green-candidate.json:1111`, and `docs/evidence/WI-2186/green-candidate.json:1393`.

## Acceptance Criteria evidence

| Acceptance Criterion | Executable evidence | Production surface |
| --- | --- | --- |
| Combined surfaces show one truthful earliest-eligible expectation after both queries settle | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:155`; `apps/mobile/src/components/progress/ReportsList.test.tsx:51` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:387`; `apps/mobile/src/components/progress/ReportsList.tsx:230` |
| Weekly timing follows the canonical organization-timezone production schedule with the existing UTC fallback | `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:558`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:570`; `apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`; `apps/api/src/services/dashboard.integration.test.ts:1227` | `packages/schemas/src/report-schedule.ts:18`; `packages/schemas/src/report-schedule.ts:31`; `apps/api/src/inngest/functions/weekly-progress-push.ts:123`; `apps/api/src/services/dashboard.ts:1117`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:29` |
| Journal and the shared list use combined semantics while a consumer can retain separate ownership | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/components/progress/ReportsList.test.tsx:51` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/components/progress/ReportsList.tsx:172` |
| Loading, error, no-activity, weekly-only, monthly-only, and mixed states remain distinct across seven locales | `apps/mobile/src/components/journal/JournalTabView.test.tsx:563`; `apps/mobile/src/components/journal/JournalTabView.test.tsx:579`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:155`; `apps/mobile/src/i18n/index.test.ts:1` | `apps/mobile/src/components/journal/JournalTabView.tsx:167`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:199`; `apps/mobile/src/i18n/locales/en.json:2731` |
| Journal, shared-list, child-schedule, and compact-screen accessibility regressions are cadence-bound | `apps/mobile/src/components/journal/JournalTabView.test.tsx:544`; `apps/mobile/src/components/progress/ReportsList.test.tsx:72`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:558` | `apps/mobile/src/components/journal/JournalTabView.tsx:208`; `apps/mobile/src/components/progress/ReportsList.tsx:233`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:384` |

## GC6 deferral

The focused burn-down would expand into unrelated hook and native-boundary test architecture. Per the `AGENTS.md:418` convention—“The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task”—the corrective commit records `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx:38` with 3 internal mocks and `apps/mobile/src/components/journal/JournalTabView.test.tsx:31` with 7 internal mocks.

## Verification

- Focused restore GREEN: 4 suites, 77 tests, 0 snapshots; sanitized result at `docs/evidence/WI-2186/green-candidate.json:2`.
- Canonical weekly scheduler unit suite: 1 suite, 29 tests, 0 snapshots (`apps/api/src/inngest/functions/weekly-progress-push.test.ts:660`).
- Real-database dashboard integration: 1 suite, 27 tests, 0 snapshots (`apps/api/src/services/dashboard.integration.test.ts:1216`).
- Full schemas: 39 suites, 1,333 tests, 0 snapshots (`packages/schemas/src/progress.test.ts:1406` included).
- Full mobile assertions: 485 suites, 5,851 tests, 0 snapshots; the repository's known open handles remained after the green summary, so the idle process was interrupted after completion (`apps/mobile/jest.config.cjs:1`).
- Full API: 444 suites passed; 8,132 tests passed, 11 skipped; 3 snapshots passed; exit 0 with `--forceExit` after the known open-handle warning (`apps/api/jest.config.cjs:1`).
- No-cache schemas/API/mobile typecheck: passed (`packages/schemas/tsconfig.lib.json:1`, `apps/api/tsconfig.app.json:1`, `apps/mobile/tsconfig.app.json:1`).
- Targeted ESLint over every corrective TypeScript source and test file: exit 0 (`eslint.config.mjs:1`).
- Prettier and `git diff --check`: passed (`.prettierrc:1`).
- The aggregate Nx test wrapper could not enter its API build prerequisite because Corepack selected pnpm 11 while the repository pins pnpm 10.19.0; direct Jest suites above provide the proportional test results (`package.json:1`).

The Jest runs emitted the repository's existing Expo native-module, `EXPO_OS`, React `act`, i18n language-change, and expected open-handle warnings. None changed an assertion result.
