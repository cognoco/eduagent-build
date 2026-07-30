# WI-2232 round-four seed-consumer audit

## Seed under review

`seedV2SupporterAccepted()` in
`apps/api/src/services/test-seed-v2-supporter.ts` creates two weekly reports
whose IDs are returned as `weeklyReportId` and `secondWeeklyReportId`.

Before round four, both rows were supporter-shaped
(`profileId = supporter`, `childProfileId = supportee`). Production V2
self-report writers use supportee-shaped rows
(`profileId = supportee`, `childProfileId = supportee`).

## Direct behavior dependencies

1. `apps/api/src/services/test-seed-v2-supporter.integration.test.ts`
   - Seeds `v2-supporter-accepted` against the integration database.
   - Requires both weekly-report IDs.
   - Calls `readSharedRecordForSupportee()` and expects both IDs as
     `weekly_report` artifacts.
   - This is the direct real-database seed/read-model contract and will fail in
     CI if the corrected seed and read scope diverge.

2. `apps/mobile/e2e/flows/v2/v2-supporter-scope-journey.yaml`
   - Seeds `v2-supporter-accepted`.
   - Requires both `journal-artifact-weekly_report-*` test IDs.
   - Repeats both assertions after application relaunch.
   - This is the direct mobile list/relaunch dependency.

## Indirect or weak dependencies

1. `apps/mobile/e2e-web/flows/journeys/j29-supporter-scope-journey.spec.ts`
   - Reuses `v2-supporter-accepted`.
   - Asserts only that `visibility-shared-record` exists; recap or milestone
     facts can keep it green when weekly reports are absent.

2. `apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts`
   - Reuses `v2-supporter-accepted`.
   - Exercises navigation through person Journal but does not assert a weekly
     artifact.

3. `scripts/e2e-ci-injection-and-smoke-gate.test.ts`,
   `apps/mobile/e2e/ci-maestro-manifest.json`, and the scenario registry tests
   - Depend on scenario registration, routing, or injected IDs rather than the
     weekly-report ownership columns.

## Follow-up boundary

Round four changes only the V2 supporter Journal seed and its read-model unit
fixture. A separate item should inventory all weekly-report fixtures and mocks,
classify each as self-report-shaped or supporter-digest-shaped against its
production writer, and strengthen weak consumers so a missing weekly artifact
cannot be masked by another shared-record fact.
