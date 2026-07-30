# WI-1628 migration-ledger and database-credential guards

## Scope

This evidence covers two durable controls:

1. A read-only deployment preflight that reconciles the live Drizzle journal
   with committed migration hashes/timestamps and catalog-probes DDL effects
   belonging to pending migrations before `drizzle-kit migrate`. It covers
   relation/type/policy/column/constraint/enum effects plus column nullability,
   row-level security, and extensions; an unrecognized non-idempotent pending
   DDL statement fails closed until a catalog probe is added.
2. A protected-credential split that verifies lane-visible staging access is
   read-only, routes DB-writing LLM harnesses to the disposable integration
   database, and prevents Doppler's lane URL from reaching staging/production
   Workers.

No migration, database-role change, secret rotation, or shared-database write
was performed while producing this evidence.

## RED → GREEN

### Migration-ledger guard

- Initial RED: `node --test
  packages/database/scripts/verify-migration-journal.test.mjs` failed because
  the journal reconciliation/probe module and deploy wiring did not exist.
- GREEN: the same command passed 6/6 tests after the reconciliation library,
  catalog-only verifier, and workflow preflight were implemented.
- Phase-4 RED: real snippets from `0014_young_ravenous.sql`,
  `0027_enable_rls.sql`, and `0047_mean_la_nuit.sql` exposed three missing
  effect classes (column nullability, RLS state, and extensions).
- Phase-4 GREEN: the final suite passed 10/10 after those catalog probes and a
  conservative unsupported-pending-DDL refusal were added. An idempotent effect
  remains detectable when it is otherwise unknown, while an identical
  `IF NOT EXISTS` repair already established by an applied journaled migration
  is suppressed to avoid false drift (real 0047/0048/0053 → 0056 case).

### Credential guard

- Initial RED: `node --test
  packages/database/scripts/verify-db-read-only.test.mjs` failed before the
  capability classifier, local env verifier, and disposable-harness wiring
  existed.
- GREEN: the initial focused slice passed 9/9 tests.
- Credential-split RED: `pnpm exec jest --config scripts/jest.config.cjs
  scripts/sync-secrets.test.ts --runInBand --no-coverage` passed 12 and failed
  5 while `prepareWorkerSecrets` was absent.
- Credential-split GREEN: the same Jest command passed 17/17 after protected
  syncs excluded Doppler `DATABASE_URL`, required `WORKER_DATABASE_URL`, and
  preserved the existing dev behavior.
- Workflow RED: the DB guard suite passed 9 and failed 1 before the new Worker
  application-role secrets were wired into deployment workflows.
- Workflow GREEN: the suite passed 10/10 after deployment, scheduled sync, and
  deletion-rollback paths received the separate application credential.

## REVERT → RED → RESTORE → GREEN

The persistent tests were retained while only production wiring was
temporarily removed:

| Arm | Temporary production revert | RED | Restored GREEN |
|-----|-----------------------------|-----|----------------|
| Detect | Removed `Verify live migration journal before migrate` from `deploy.yml` | migration suite: 5 pass, 1 fail | migration suite: 6/6 |
| Prevent | Removed `WORKER_DATABASE_URL` from the protected deploy sync step | DB guard suite: 9 pass, 1 fail | DB guard suite: 10/10 |

The final working tree contains both restored production paths.

## Two-key activation hold

The code path is intentionally fail-closed. Before merge, an approved operator
must:

1. Provision least-privilege Worker application roles and store their URLs as
   GitHub `DATABASE_URL_STAGING_APP` and
   `DATABASE_URL_PRODUCTION_APP`.
2. Rotate Doppler `stg` / `prd` `DATABASE_URL` to roles limited to connect,
   schema usage, and reads.

The Worker role cannot be treated as a routine non-owner role without an RLS
decision: current migrations enable RLS before the complete policy/scoped-GUC
path exists. The operator must either approve a temporary, explicitly reviewed
`BYPASSRLS` application role with no ownership/DDL/admin capability, or defer
the Worker swap until scoped RLS is complete. Staging catalog evidence,
authenticated read/write smoke, and a negative cross-profile check are required
before production activation.

GitHub `DATABASE_URL_STAGING` / `DATABASE_URL_PRODUCTION` remain deploy-only
migration-owner credentials. The external role and secret changes are not
authorized by this code PR and were not attempted.
