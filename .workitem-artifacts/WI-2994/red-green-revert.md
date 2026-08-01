# WI-2994 red → green → production-revert red → exact-restore green

Date: 2026-08-01

Final focused command:

```sh
pnpm exec jest \
  apps/api/src/services/safe-non-core.test.ts \
  apps/api/src/services/terminal-deletion-failure-outbox.test.ts \
  apps/api/src/inngest/functions/account-deletion.test.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.test.ts \
  apps/api/src/inngest/functions/inngest-function-failed-observe.test.ts \
  apps/api/src/inngest/functions/terminal-deletion-failure-recovery.test.ts \
  --runInBand
```

## 1. Test-first red

The outbox/recovery modules and confirmation-returning send API did not exist.
The first focused command used the same list except the not-yet-added outbox
service suite.

- Exit: `1`
- Suites: 5 failed / 5 total
- Tests: 6 failed, 3 passed / 9 total
- Expected causes: four imports could not resolve; six confirmation assertions
  received `undefined` instead of `true`/`false`

## 2. Candidate green

After implementing the outbox, handlers, observer replay, recovery sweep, and
confirmation API:

- Exit: `0`
- Suites: 6 passed / 6 total
- Tests: 64 passed / 64 total
- Snapshots: 0

The four required variants map to these focused assertions:

1. Immediate rejection: `safe-non-core.test.ts` reports `false`; both terminal
   handler suites prove the durable row remains unacknowledged.
2. Timeout then late resolution: `safe-non-core.test.ts` proves timeout returns
   `false`, late resolution is tolerated, and no second failure is emitted.
3. Timeout then late rejection: `safe-non-core.test.ts` proves timeout returns
   `false` and the orphaned rejection is captured without an unhandled promise.
4. Recovery/replay without duplicate remediation:
   `inngest-function-failed-observe.test.ts` proves repeated replay uses one
   deterministic event id; `terminal-deletion-failure-recovery.test.ts` proves
   acknowledgement happens only after confirmed `step.sendEvent`.

## 3. Production-revert red

Tests were left unchanged. A surgical production-only patch disabled both
terminal-handler outbox writes, changed observer retries from five to zero, and
disabled its two deletion replay branches. The outbox service and recovery
suite remained present so this tested the missing durability behavior rather
than a compile failure.

- Exit: `1`
- Suites: 3 failed, 3 passed / 6 total
- Tests: 9 failed, 55 passed / 64 total
- Expected failures: missing account/billing durable writes, missing five-retry
  observer behavior, missing account/billing replay, missing bounded replay
  classification, and no stable repeated replay identity

## 4. Exact restore green

The inverse patch restored the production files. SHA-256 hashes were identical
before the production revert and after restoration:

| File | SHA-256 before and after |
| --- | --- |
| `apps/api/src/inngest/functions/account-deletion.ts` | `eb22578c7a3b3ff8132c40c6b528f8ade2bca7a7efe7269d3eb3d62a3bf4083c` |
| `apps/api/src/inngest/functions/billing-subscription-store-teardown.ts` | `82dc8a1782150c96e608d4c0ed719ba5cc6712bcc72f0f06195fd1aedb0547d5` |
| `apps/api/src/inngest/functions/inngest-function-failed-observe.ts` | `7d44f5f9885d651530ae8ebec8181da9777ee9da7b1dbf0f01f98188133a3930` |
| `apps/api/src/inngest/functions/terminal-deletion-failure-recovery.ts` | `55277bd23753fa0b44fad804c5c93cdbe2496c519d400141d6cb6dcd01366ab0` |
| `apps/api/src/services/safe-non-core.ts` | `076184817b1b569bac40889e17182865398ed9955af651df0537c739bd837fa3` |
| `apps/api/src/services/terminal-deletion-failure-outbox.ts` | `dd414f00e53e425eb6ccb2e4beac14c04a9b89018e445793d188e5cbc50a1ee4` |
| `packages/database/src/schema/terminal-deletion-failure-outbox.ts` | `ab6741ff782f8542f97da1fe945f2a1bb7ff4a1d6097a7b758acd85d9cbdc88e` |
| `apps/api/drizzle/0164_wi2994_terminal_deletion_failure_outbox.sql` | `bc265fa24e0c579d71d495ca97e0003c13b1d02262253699f0f6b2fb28e606d9` |

- Exit: `0`
- Suites: 6 passed / 6 total
- Tests: 64 passed / 64 total
- Snapshots: 0

## Additional gates recorded before final delivery

- `pnpm exec tsc --build apps/api/tsconfig.app.json --pretty false` — exit `0`.
- Migration immutability, enum-idempotency, rollback, journal, and snapshot
  guards — exit `0`.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm exec nx run @eduagent/database:test`
  — exit `0`; 33 suites / 320 tests. The URL is non-routable and no database
  operation occurred.
- An earlier database-suite invocation without explicit `DATABASE_URL` exited
  before test collection because the safety guard refused a shared `stg`
  Doppler fallback. It is not counted as test evidence and made no connection.
- Migration `0164_wi2994_terminal_deletion_failure_outbox` was generated offline
  through Drizzle. It was not applied to dev, staging, or production.
- After the broad API ratchets required explicit out-of-band-dispatch comments,
  the production-revert red and exact-restore green cycle above was repeated
  against the final production bytes; the counts stayed identical.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline bash scripts/check-change-class.sh --run --fast`
  — exit `0`; 7 executed change-class gates, including 508 API suites / 10,149
  passed tests (11 skipped), with the forbidden/slow schema-push and integration
  entries left skipped.
- `pnpm lint` — exit `0` (repository baseline warnings, zero errors).
- Prettier check over every changed or untracked TypeScript, JSON, and Markdown
  file — exit `0`.
- Guarded targeted deletion integration via `dev_integration` — exit `0`; 1
  suite / 10 tests. The launcher verified the disposable environment identity
  before Jest.
- The earlier full integration attempt exited `1` outside this change: a Neon
  WebSocket cleanup disconnect affected pre-existing suites, and
  `curriculum-dedup-index-repair.integration.test.ts` intentionally refused the
  remote disposable host because it is loopback-only. The deletion-v2 suite
  passed in that run and in the isolated rerun above.
