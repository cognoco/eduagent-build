# WI-2994 durable deletion dead-letter dispatch evidence

Date: 2026-08-01

## Mechanism

The two terminal handlers now upsert their existing PII-minimized payload into
the first-party `terminal_deletion_failure_outbox` before attempting direct
transport. `safeSendConfirmed` distinguishes a confirmed send from immediate
rejection or timeout; only confirmation acknowledges the row. The generic
function-failure observer independently upserts and replays the same signal with
five retries, while a five-minute recovery sweep drains stranded rows. Every
path uses the deterministic row id as the Inngest event id, making late direct
resolution/rejection and repeated recovery duplicate-safe.

Migration `0164_wi2994_terminal_deletion_failure_outbox` was generated through
Drizzle and is committed for the deploy migrator. It was not applied anywhere.
No provider-console, environment, or alert-routing mutation was made.

## Acceptance evidence

1. Immediate transport rejection is covered by `safe-non-core.test.ts` and both
   terminal handler suites; an unconfirmed send leaves the outbox row.
2. Timeout followed by late resolution and timeout followed by late rejection
   are covered by `safe-non-core.test.ts`. Timeout stops waiting; it does not
   cancel the underlying promise.
3. Account-deletion and subscription-store replay, stable event ids, bounded
   error classification, self-failure loop prevention, scheduled recovery, and
   Inngest registration are covered by `inngest-function-failed-observe.test.ts`,
   `terminal-deletion-failure-recovery.test.ts`,
   `account-deletion.test.ts`, and
   `billing-subscription-store-teardown.test.ts`.
4. The durable row contains only deterministic signal id, bounded event/error
   names, existing account/run ids, and occurrence timestamp. Other original
   event fields, provider responses, credentials, and raw error text are not
   copied.
5. The retention evidence and launch-health runbook now distinguish timeout
   from cancellation and assign dispatch durability to WI-2994; WI-1916 remains
   responsible only for downstream chat/pager and production-console routing.

## Red / green / production-revert / restore

Exact commands, exit codes, counts, variants, and pre/post SHA-256 hashes are in
`.workitem-artifacts/WI-2994/red-green-revert.md`.

## Additional verification

- Focused Jest — 6 suites / 64 tests, exit 0 after exact restore.
- Database package — 33 suites / 320 tests, exit 0 with a non-routable URL.
- Scoped API type build — exit 0.
- Migration immutability, enum safety, rollback, journal, and snapshot gates —
  exit 0.
- Repository change-class fast route — 7 gates passed, including 508 API suites
  / 10,149 passing tests (11 skipped); forbidden schema-push steps remained
  skipped.
- Guarded disposable deletion-v2 integration — 1 suite / 10 tests, exit 0.
- Full lint — exit 0 with baseline warnings and no errors; changed-file Prettier
  check — exit 0.

The broad integration attempt exited 1 for two unrelated harness/environment
reasons: a Neon WebSocket disconnect during cleanup in pre-existing suites and
the loopback-only curriculum dedup repair suite correctly refusing the remote
disposable host. The deletion-v2 suite passed both within that attempt and in
the isolated guarded rerun recorded above.
