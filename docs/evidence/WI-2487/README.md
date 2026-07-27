# WI-2487 — dev identity-v2 FK repoint evidence

This packet records the bounded, development-only catalog repair performed for
WI-2487. It is committed so the pre-mutation restore boundary, exact deletion
set, applied transaction, and post-state remain independently reviewable after
the host-local execution artifacts are gone.

## Scope and target

- Neon project: `lingering-violet-30592106`
- Mutated branch: `br-weathered-silence-agw4on4x` (MentoMate dev)
- Pre-mutation snapshot branch: `br-green-tree-agqa98rt`
- Snapshot parent LSN: `0/285BF988`
- Staging: untouched
- Production: untouched

The snapshot existed before any DML or DDL. Its exact marker is preserved in
[`snapshot-marker.json`](snapshot-marker.json).

## Preflight

The read-only query in [`preflight.sql`](preflight.sql) confirmed the values
preserved in [`preflight-results.json`](preflight-results.json):

- `transaction_read_only = on`
- non-legacy foreign keys targeting `profiles`: 51
- foreign keys targeting `subscriptions`: 4
- non-legacy foreign keys targeting `accounts`: 1
- support-message rows without a `person` twin: exactly 5

The one accounts-target count differed from the older operator packet (one
instead of zero). The live constraint was
`subscriptions_account_id_accounts_id_fk -> accounts(id)`. It was outside the
profiles-only transaction and was explicitly authorized as ancillary at Clacks
event `40401`; it remained untouched.

The full orphan set, ordered by ID, was:

1. `019f1349-8e7d-736e-bfb1-f5e7458530d1`
2. `019f1349-8e7e-7176-9f5b-3929832ec9d3`
3. `019f1349-8fea-7713-acf5-79abd7291606`
4. `019f1349-9214-704c-ba8b-d8a392a3541d`
5. `019f1349-9243-73c1-ac0d-b769666774f1`

## Applied transaction

[`mutation-executed.sql`](mutation-executed.sql) is the byte-exact transaction
executed once against the dev branch. The single transaction:

1. aborted unless the live orphan IDs exactly equalled the five IDs above;
2. aborted unless exactly 51 compatible non-legacy constraints targeted
   `profiles`;
3. deleted exactly the five orphan `support_messages` rows;
4. derived each replacement constraint from the live PostgreSQL catalog,
   preserving its columns and actions while changing the parent from
   `profiles` to `person`; and
5. aborted unless zero compatible non-legacy constraints still targeted
   `profiles`.

The transaction committed. The SQL is convergence-safe after the repair: its
initial exact-orphan-set guard prevents a second mutation from proceeding.

[`mutation.sql`](mutation.sql) is a post-execution replay-hardening derivative.
It adds an in-transaction assertion for the exact Neon project and dev branch
before the first destructive statement. It was not the file executed during
the repair; it exists so a reviewer or operator cannot accidentally point a
replay at the rollback snapshot, staging, or production.

## Post-state

Repeated read-only execution of [`postcheck.sql`](postcheck.sql) returned the
values preserved in
[`postcheck-results.json`](postcheck-results.json):

| Assertion | Result |
| --- | ---: |
| Non-legacy foreign keys still targeting `profiles` | 0 |
| `support_messages` rows without a `person` twin | 0 |
| Deleted IDs still present | 0 |
| Intentionally untouched foreign keys targeting `subscriptions` | 4 |
| Account-deletion test fixture logins still present | 0 |

The repository-level catalog assertion also passed against dev:

```text
$ node scripts/doppler-run.mjs run -c dev -- pnpm db:check-identity-fks
identity FK freshness passed: no non-legacy child targets profiles.id
```

## Verification

The final database-package checker and public runner were implemented
test-first:

```bash
node --test packages/database/scripts/check-identity-fk-drift.test.mjs
```

- Red: 5 tests failed because the database-package checker module did not
  exist.
- Green: all 5 tests passed, covering the exact catalog predicate, missing
  credentials, clean and drift exits, stable diagnostics, query rejection,
  and credential redaction.

The required real-database identity-satellite cross-section passed against dev:

```text
PASS apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts
PASS apps/api/src/services/support/spillover.integration.test.ts
Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

An additional account-deletion suite passed 9 of 12 cases. Its three failing
paths were blocked by the known
`profile_quota_usage_subscription_id_subscriptions_id_fk` legacy
`subscriptions` target owned by **WI-2633 — resolve dev quota-pool subscription
orphans before remaining identity-v2 FK repoints**, not by a `profiles` target.
The postcheck confirmed that run left zero matching fixture logins.

## Reproduction

With an environment-scoped `DATABASE_URL`, the non-mutating checks are:

```bash
pnpm db:check-identity-fks
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/evidence/WI-2487/postcheck.sql
```

The preflight and both mutation SQL files are retained for review. Do not rerun
either mutation: the dev repair is already complete. On the repaired dev
branch, the executed form's exact-set guard will abort; it has no environment
guard and must never be executed against another branch. The hardened
derivative also refuses any target other than the exact dev branch.
