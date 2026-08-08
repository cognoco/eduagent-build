# WI-2232 round-five RED/GREEN evidence

## Scope

- Starting PR head: `c53874c32f38685f81d8a4a5d84ec6a37717dc5e`
- Findings addressed: Codex P1 `PRRT_kwDORREiyc6VQrfN` (include supporter-owned
  weekly digests) and P2 `PRRT_kwDORREiyc6VQrfR` (surface schema drift in the
  Journal list). P2 is applied under the operator's reframe: an invalid row must
  not silently disappear, but one malformed row must not break the list.
- Harness: API + mobile unit Jest only. No integration or E2E. `DATABASE_URL`
  was an explicit loopback dummy on the sanctioned test DB name; every test uses
  a mocked `Database` and made no database connection.

## The two authorized ownership shapes

`weekly_reports` has a unique index on `(profile_id, child_profile_id,
report_week)`, and two production writers populate it differently:

| Shape | Writer | `profileId` | `childProfileId` | Applies to |
|---|---|---|---|---|
| A — self report | `apps/api/src/inngest/functions/weekly-self-reports.ts:346-352` | supportee | supportee | non-guardian supportees |
| B — delivered digest | `apps/api/src/services/weekly-digest.ts:168-175` | supporter | supportee | linked children |

The two are near-disjoint by construction: `weekly-self-reports.ts:245-253`
skips linked children outright, so a guardian's supportee only ever has shape B
while a non-guardian supportee only has shape A. Reading a single shape strands
one whole population — which is the P1 defect.

Authorization is `childProfileId = supportee` (the row is about this supportee)
AND `profileId ∈ {supportee, supporter}`. A third party's digest about the same
supportee is NOT authorized and stays excluded by the profileId scope.

## Commands

```text
cd apps/api && DATABASE_URL='postgres://localhost:5432/mentomate_test' \
  pnpm exec jest --no-coverage src/services/shared-record-read-model.test.ts

cd apps/mobile && DATABASE_URL='postgres://localhost:5432/mentomate_test' \
  pnpm exec jest --no-coverage src/components/visibility/
```

## RED — tests first, readers unchanged

```text
PASS (12) FAIL (3)

1. lists self-owned reports and supporter-owned delivered digests together
   - Expected  - 1
   + Received  + 0
     Array [
       "00000000-0000-4000-8000-000000000004",
   -   "00000000-0000-4000-8000-000000000011",
     ]

2. loads a supporter-owned delivered digest through its exact Journal link
   NotFoundError: Journal artifact not found
       at projectSharedArtifactForSupportee (shared-record-read-model.ts:226:11)

3. keeps the Journal list usable when one weekly report cannot be projected
   Expected: 1
   Received: undefined
```

Mobile, same cycle:

```text
1. marks durable updates that could not be loaded
   Unable to find an element with testID: visibility-shared-record-unavailable
```

This proves all three failure modes against production-shaped data:

1. The Journal list omitted the supporter-owned delivered digest entirely.
2. The exact link to that digest returned 404.
3. A drifted row vanished with no count for the UI to surface.

## GREEN — after the fix

```text
apps/api   PASS (45) FAIL (0)   # read-model + projector + visibility routes
apps/mobile PASS (79) FAIL (0)  # visibility + support components
```

Full workspace typecheck:

```text
pnpm exec tsc --build
TypeScript: No errors found
```

## What changed

- `projectSharedRecordForSupportee` reads BOTH shapes through two separately
  scoped repositories (`supporteeRepo` + `supporterRepo`), each pinned with
  `childProfileId = supportee`. This stays inside the `createScopedRepository`
  rule — no direct `db.select()` deviation was needed.
- Merged rows are deduped **strictly by report identity (`row.id`)**, never by
  week, then sorted `reportWeek` desc with an `id` tiebreak so concatenating two
  `desc(reportWeek)` lists stays deterministic.
- `projectSharedArtifactForSupportee` resolves the exact link through the same
  two shapes. `weeklyReports.id` is the primary key, so at most one lookup can
  match — there is no precedence question on that path.
- `projectWeeklyReportFact` now captures to Sentry **before** the mode branch, so
  the list path logs the drift it previously swallowed. The caller counts skipped
  rows into `unavailableFactCount`, emitted only when non-zero, and
  `SharedRecordView` renders a marker from it. The exact-read path still throws
  `SchemaDriftError` — silently returning nothing for a directly requested
  artifact would be a lie.

## Negative-path coverage

- `excludes a third party digest about the same supportee from the list`
- `refuses an exact link to a third party digest about the same supportee`

Both seed `{profileId: stranger, childProfileId: supportee}` — same
`childProfileId` as the authorized shapes, so only the `profileId` scope keeps it
out. These prove the widening did not over-widen.

The mock dispatches on the scoped `profileId` (`params[0]`) rather than returning
one fixture for every call, so each shape is genuinely proven rather than passing
by construction.

## Open product decision — NOT taken here

The unique index permits a shape-A row and a shape-B row for the SAME
`report_week` (different `profile_id`, so different rows, different ids). Dedupe
by identity keeps both visible; fact ids stay distinct and render equivalence
still holds. Whether one should take precedence over the other for a given week
is a product decision that has not been ruled, so no precedence rule was
invented and no fixture asserts that behavior — the two seeded rows use distinct
weeks deliberately.

## Exact-head CI repair

PR head `c53874c32f38685f81d8a4a5d84ec6a37717dc5e` exposed three independent
failures after the round-five patch was prepared:

- The two Flag-ON integration failures seeded accepted `session_summaries`
  without the durable `learnerRecap` field required by the Journal projection.
  The production gate remains unchanged; both supporter-seed recaps and the
  visibility-route fixture now include persisted learner recaps.
- The mobile navigation audit did not recognize `navigateBackToJournal()`, even
  though the helper provides the sanctioned `router.back()` with Journal
  `router.replace()` fallback. The audit now credits that named helper.
- Merge completeness found main-only WI-2636 evidence drift. That serial-tail
  condition is outside this code correction and remains a remote merge gate.

The screen-navigation test reproduced RED locally (90 passed, 1 failed), then
passed after the audit correction (91 passed). The integration failures are the
authoritative RED evidence; integration and E2E were not run locally under the
database boundary.

## Locale parity

`visibility.sharedRecord.unavailable_one/_other` now exists in all maintained
locales (en/de/es/ja/nb/pl/pt). `pnpm check:i18n` and
`pnpm check:i18n:orphans` both pass without invoking an external translation
service. Polish also carries the required `_few` and `_many` categories enforced
by `manual-plural-guard.test.ts`.
