# WI-2994 red / green / production-revert / exact-restore evidence

Date: 2026-08-01
Landed implementation: `31afdb4501e266a87214af613d3db45217401742`
Production-revert baseline: `b6f8965a74dbd401fdedc4f8e3e018a6b864153e`
Runtime: Node `22.16.0`
Database: disposable local `postgresql://vetinari@localhost:5432/tests_v2`

## Focused command

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/inngest/functions/account-deletion.test.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.test.ts
```

## File hashes

| File | Production baseline SHA-256 | Candidate SHA-256 |
| --- | --- | --- |
| `apps/api/src/inngest/functions/account-deletion.ts` | `d38d6bda661eb1f875d51bcd453e174e48b9470c3f00c841f519a030677b7071` | `b19f22378678e2b6095d325d0a8d63c4712f3f11d758f20993aa535521bde610` |
| `apps/api/src/inngest/functions/account-deletion.test.ts` | `5d50a63765f2f5271cb1a3e330b11b955a1f0e952ba38c3c9a91f4ec5c5826d9` | `bad01c1a3971e76d67e8aebf91062aea9015dfc52a234ccd7db14b20a3abb226` |
| `apps/api/src/inngest/functions/billing-subscription-store-teardown.ts` | `b99ec3c6168edf658f013242be7676ecaff29f84ed2b792d40dac38a2a927aea` | `4ee676176de52b087edd67b3c20a62c0a9c0915b02ea81b5423d173542b98fcd` |
| `apps/api/src/inngest/functions/billing-subscription-store-teardown.test.ts` | `bef565ccedff7e3abd76b13fc3056c3bf022411aa00e5439d958b90b905a0416` | `d98c3e3685d1dd0eca157d8ca7b710d519081752a1e7e91d3f635a6e7b505f56` |

## Test-first RED

The tests required both failure handlers to use awaited durable steps, propagate
an immediate step rejection, await late resolution or rejection without a
second send, reuse a stable step key on replay, and preserve both minimized
event payloads. Against production source:

- Exit code: `1`
- Suites: 2 failed / 2 total
- Cases: 8 failed, 34 passed / 42 total
- Failure class: expected behavioral assertions only; no setup, import,
  database, or syntax failure.

## Candidate GREEN

After replacing the two raw `safeSend` calls with stable, awaited
`step.sendEvent` operations:

- Exit code: `0`
- Suites: 2 passed / 2 total
- Cases: 42 passed / 42 total

## Production-only REVERT RED

Only the two production handlers were restored to their exact baseline hashes
while the candidate tests remained. The focused command reproduced the initial
RED mutation sensitivity:

```sh
git restore --source=b6f8965a74dbd401fdedc4f8e3e018a6b864153e -- \
  apps/api/src/inngest/functions/account-deletion.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.ts
shasum -a 256 \
  apps/api/src/inngest/functions/account-deletion.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.ts
```

- Exit code: `1`
- Suites: 2 failed / 2 total
- Cases: 10 failed, 34 passed / 44 total
- Restored baseline hashes: `d38d6bda661eb1f875d51bcd453e174e48b9470c3f00c841f519a030677b7071`
  and `b99ec3c6168edf658f013242be7676ecaff29f84ed2b792d40dac38a2a927aea`

## Exact RESTORE GREEN

The two production handlers were restored to their landed hashes:

```sh
git restore --source=HEAD -- \
  apps/api/src/inngest/functions/account-deletion.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.ts
shasum -a 256 \
  apps/api/src/inngest/functions/account-deletion.ts \
  apps/api/src/inngest/functions/billing-subscription-store-teardown.ts
```

The focused command returned exit code `0`, 2 / 2 suites, and 44 / 44 cases
passing. The restored hashes were
`b19f22378678e2b6095d325d0a8d63c4712f3f11d758f20993aa535521bde610`
and `4ee676176de52b087edd67b3c20a62c0a9c0915b02ea81b5423d173542b98fcd`.
No schema, migration, database record, staging environment, provider console,
or alert rule was touched.

## Exact-head review rework parity

The mandatory review requested explicit billing-handler parity for rejection
propagation and stable replay memoization. With those two tests added, the
focused two-suite command returned 44 / 44. Restoring only
`billing-subscription-store-teardown.ts` to `origin/main` made the billing suite
fail as expected: the new rejection test resolved instead of rejecting and the
new replay test observed zero durable step calls. Restoring the candidate
handler returned the billing suite to 9 / 9 and the combined focused run to
44 / 44.
