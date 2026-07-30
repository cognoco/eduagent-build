# WI-2232 round-four RED/GREEN evidence

## Scope

- Starting PR head: `40133274fd5492b59e8a4bc1885d9a8f9ca045eb`
- Regression: supporter Journal weekly-report list and exact artifact link used a
  supporter-scoped repository even though production self-report rows persist
  both `profileId` and `childProfileId` as the supportee.
- Test data shape: `profileId = supporteePersonId` and
  `childProfileId = supporteePersonId`.
- Harness: API unit Jest only. `DATABASE_URL` was an explicit loopback dummy
  (`127.0.0.1`) required by the test environment guard; the test uses a mocked
  `Database` and made no database connection.

## Command

```text
DATABASE_URL=postgresql://unit:unit@127.0.0.1:5432/unit pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/shared-record-read-model.test.ts --runInBand --no-coverage
```

## RED — test first, production reader unchanged

```text
FAIL @eduagent/api apps/api/src/services/shared-record-read-model.test.ts
  readSharedRecordForSupportee
    ✕ projects real report, recap, and milestone facts without raw artifacts
    ✕ loads a production-shaped weekly report through its exact Journal link

Expected: "Emma has 3 shareable updates."
Received: "Emma has 2 shareable updates."

NotFoundError: Journal artifact not found

Test Suites: 1 failed, 1 total
Tests:       2 failed, 6 passed, 8 total
```

This proves both failure modes against production-shaped data:

1. The supporter Journal list omitted the weekly report.
2. The exact weekly-report link resolved to the service's not-found path.

## GREEN — weekly-report reads aligned to supportee repository

```text
PASS @eduagent/api apps/api/src/services/shared-record-read-model.test.ts
  readSharedRecordForSupportee
    ✓ projects real report, recap, and milestone facts without raw artifacts
    ✓ keeps every durable report and accepted recap discoverable in the Journal
    ✓ loads a production-shaped weekly report through its exact Journal link
    ✓ does not read artifacts when accepted visibility is absent in the transaction snapshot
    ✓ loads an older weekly report by id without depending on the capped Journal projection
    ✓ surfaces schema drift when an existing weekly report cannot be projected
    ✓ loads an older accepted recap by session id without depending on list ordering
    ✓ does not expose an accepted summary whose durable recap was never produced

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

The accepted-supportership negative path remained green, and both weekly-report
queries now require `weekly_reports.profile_id = supporteePersonId` through the
scoped repository plus the existing
`weekly_reports.child_profile_id = supporteePersonId` predicate.

## Authoritative Node 22 verification

The complete API unit suite was run after the fix with the repository-required
Node 22 runtime. The live Jest process resolved to
`/home/vetinari/.local/node22/bin/node`.

```text
rtk env PATH=/home/vetinari/.local/node22/bin:/usr/local/bin:/usr/bin:/bin DATABASE_URL=postgresql://unit:unit@127.0.0.1:5432/unit pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage .

Test Suites: 497 passed, 497 total
Tests:       9 skipped, 9963 passed, 9972 total
Snapshots:   3 passed, 3 total
Time:        445.115 s
Ran all test suites matching ..
```
