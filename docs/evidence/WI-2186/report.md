# WI-2186 Reports empty-state timing evidence

This report preserves the executed red/green/revert/restore proof for **WI-2186 — Align Reports empty-state timing with weekly and monthly delivery**. The implementation branch started from `origin/main` revision `1c11fa4a8e74ef28bedf7781c898243ec3ce4778`.

## Reported defect cases

1. **Wednesday before a weekly run:** at 2026-06-03 12:00 UTC, the child Reports surface promised the monthly 2026-07-01 run even though the weekly schedule could deliver on Monday 2026-06-08.
2. **Journal combined empty state:** after both report queries settled empty, Journal rendered the truthful combined weekly/monthly message and a second fixed month-end promise.
3. **Settled endpoint error:** an empty array returned alongside a query error was rendered as no report activity instead of the error state.

The schedule matrix also exercises monthly-earlier, same-day monthly before the 10:00 UTC run, post-monthly weekly, short-month weekly, and year-boundary weekly cases.

## Root cause and implementation

`apps/mobile/src/components/progress/ReportsList.tsx` owned a fixed month-end translation even though the component renders both weekly and monthly reports. Journal composed that list beneath `LatestReportCard`, which already owned the truthful combined empty message. The child Reports helper calculated only the next monthly run, while the screen queried both report cadences.

The candidate:

- gives the shared list the existing truthful combined weekly/monthly empty message and an explicit ownership switch for composed surfaces;
- makes Journal present exactly one combined empty expectation and keeps error, loading, weekly-only, monthly-only, and mixed states distinct;
- makes the child schedule helper choose the earlier upcoming Monday weekly run or day-one monthly run and formats the calendar date in UTC;
- adds a complete localized child expectation in all seven supported locale files without interpolating English sentence fragments;
- removes the three superseded report-expectation keys from all seven locale files and retires the child screen's stale day-difference allowlist exemption;
- exposes empty expectations as untruncated accessibility summaries.

## Executed red, green, revert, and restore

The focused boundary invocation covered these four suites:

- `apps/mobile/src/components/progress/ReportsList.test.tsx`
- `apps/mobile/src/components/journal/JournalTabView.test.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx`
- `apps/mobile/src/i18n/index.test.ts`

The first RED was run after adding the reproducing assertions and before editing production. The exact Wednesday case returned `July 1, 2026` instead of June 8; Journal still exposed the fixed month-end message; the child and list empty messages lacked the summary role; and settled query errors were not distinct.

After the implementation, the focused GREEN passed all four suites and all 75 tests. The machine-readable result is [green-candidate.json](green-candidate.json).

For the mandatory revert proof, only these production deltas were reversed while the tests and seven locale additions remained present:

- `apps/mobile/src/components/progress/ReportsList.tsx`
- `apps/mobile/src/components/journal/JournalTabView.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`

The identical focused invocation then produced the expected revert RED:

```text
Test Suites: 3 failed, 1 passed, 4 total
Tests:       11 failed, 64 passed, 75 total
```

The failures included the exact reported Wednesday case (`July 1, 2026` received instead of June 8), Journal's duplicate month-end promise, Journal's empty/error conflation, the missing accessibility summaries, and the weekly-before-monthly schedule cases.

The three production files were restored byte-for-byte. The identical focused invocation then produced restore GREEN:

```text
Test Suites: 4 passed, 4 total
Tests:       75 passed, 75 total
```

## Acceptance Criteria evidence

| Acceptance Criterion | Executable evidence | Production surface |
| --- | --- | --- |
| Combined surfaces show one truthful earliest-eligible expectation after both queries settle | `apps/mobile/src/components/journal/JournalTabView.test.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx`; `apps/mobile/src/components/progress/ReportsList.test.tsx` | `apps/mobile/src/components/journal/JournalTabView.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`; `apps/mobile/src/components/progress/ReportsList.tsx` |
| Journal and the shared list use combined semantics while a consumer can retain separate ownership | `apps/mobile/src/components/journal/JournalTabView.test.tsx`; `apps/mobile/src/components/progress/ReportsList.test.tsx` | `apps/mobile/src/components/journal/JournalTabView.tsx`; `apps/mobile/src/components/progress/ReportsList.tsx` |
| Loading, error, no-activity, weekly-only, monthly-only, and mixed states remain distinct across seven locales | `apps/mobile/src/components/journal/JournalTabView.test.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx`; `apps/mobile/src/i18n/index.test.ts`; `apps/mobile/src/i18n/locales/en.json`; `apps/mobile/src/i18n/locales/de.json`; `apps/mobile/src/i18n/locales/es.json`; `apps/mobile/src/i18n/locales/ja.json`; `apps/mobile/src/i18n/locales/nb.json`; `apps/mobile/src/i18n/locales/pl.json`; `apps/mobile/src/i18n/locales/pt.json` | `apps/mobile/src/components/journal/JournalTabView.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` |
| Journal, shared-list, child-schedule, and compact-screen accessibility regressions are cadence-bound | `apps/mobile/src/components/journal/JournalTabView.test.tsx`; `apps/mobile/src/components/progress/ReportsList.test.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx` | `apps/mobile/src/components/journal/JournalTabView.tsx`; `apps/mobile/src/components/progress/ReportsList.tsx`; `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` |

All evidence pointers above are repository paths that resolve at the candidate revision.

## Verification

- Focused defect suite after restore: 4 suites passed; 75 tests passed; 0 snapshots.
- Full mobile unit suite after ratchet cleanup: 485 suites passed; 5,849 tests passed; 0 snapshots.
- API unit suite selected by the English-locale cross-package reader: 444 suites passed; 8,132 tests passed; 11 skipped; 3 snapshots passed.
- Mobile typecheck: the mobile target and six dependencies passed.
- Mobile lint: exit 0; 0 errors and the repository's existing 51-warning baseline.
- i18n orphan and staleness checks: no findings; all seven translation files are up to date.
- Time-formatting de-duplication ratchet: 1 suite passed; 5 tests passed.
- Prettier check over every changed TypeScript, test, locale, and evidence file: passed.
- Change-class validation selected the full TypeScript build, mobile unit suite, API unit suite, and i18n checks. Its first aggregate run exposed the two stale ratchets above; each corrected command and the clean full mobile rerun passed before the candidate was committed.

The Jest runs emitted the repository's existing Expo native-module, `EXPO_OS`, React `act`, i18n language-change, and expected test-path logging. None changed an exit status or an assertion.
