# WI-1628 migration-ledger and database-credential guards

## Scope

This evidence covers two durable controls:

1. A read-only deployment preflight that reconciles the live Drizzle journal
   with committed migration hashes/timestamps and catalog-probes DDL effects
   belonging to pending migrations before `drizzle-kit migrate`. It covers
   relation/type/policy/column/constraint/enum effects plus column nullability,
   row-level security, extensions, and both quoted and unquoted identifiers;
   SQL comments and literal/dollar-quoted bodies cannot masquerade as top-level
   DDL, and an unrecognized non-idempotent pending DDL statement fails closed
   until a catalog probe is added.
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
- Adversarial RED: an unquoted `CREATE TABLE` followed by a pending unquoted
  `DROP TABLE` was not recognized symmetrically, and DDL-looking text in SQL
  comments or literal/dollar-quoted bodies could be inspected as executable
  DDL.
- Adversarial GREEN: a top-level SQL tokenizer now isolates executable
  statements, accepts quoted and unquoted identifiers, and keeps comments and
  literal bodies out of the probe surface. Unsupported outer DDL such as
  `CREATE FUNCTION` fails closed instead of treating DDL-looking function-body
  text as the migration effect.

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
- Adversarial RED: a login role could pass the direct-attribute checks and then
  use `SET ROLE` to reach an owner/DDL-capable role. The Worker verifier also
  accepted write access to only one table instead of proving the full
  application privilege matrix.
- Adversarial GREEN: catalog evidence now rejects every reachable forbidden
  role plus any reachable role membership carrying `ADMIN OPTION` (which could
  self-enable `SET ROLE`), and requires
  `SELECT`/`INSERT`/`UPDATE`/`DELETE` on every application table plus
  `USAGE`/`UPDATE` on every application sequence. Deployment runs the verifier
  both before and after migrations, so a newly created object without the
  expected default grants stops the deploy before Worker sync.
- Native PostgreSQL proof: the disposable PostgreSQL 16 integration suite
  passes both the catalog matrix and a real `SET ROLE` escalation attempt.

## REVERT → RED → RESTORE → GREEN

The persistent tests were retained while only production wiring was
temporarily removed:

| Arm | Temporary production revert | RED | Restored GREEN |
|-----|-----------------------------|-----|----------------|
| Detect | Removed `Verify live migration journal before migrate` from `deploy.yml` | migration suite: 5 pass, 1 fail | migration suite: 6/6 |
| Prevent | Removed `WORKER_DATABASE_URL` from the protected deploy sync step | DB guard suite: 9 pass, 1 fail | DB guard suite: 10/10 |

The final working tree contains both restored production paths.

## Final verification receipts

- Migration-built disposable PostgreSQL 16 API integration surface: 155 suites
  passed, 1,196 tests passed, 5 suites/55 tests skipped by the existing harness.
- Migration-built disposable PostgreSQL 16 cross-package integration surface:
  74 suites passed, 612 tests passed, 1 test skipped by the existing harness.
- Adversarial guard unit matrix: 57/57 passed across migration-journal,
  read-only-role, Worker-role, workflow-order, and routing controls.
- Native PostgreSQL catalog/escalation proof: 3/3 passed on a fresh disposable
  PostgreSQL 16 instance.
- Package-manager and Doppler launcher contract: canonical package lifecycle
  run passed 20/20; the remaining focused script/workflow suites passed 83/83.
- DB-writing LLM harness launcher contract: 2/2 passed.
- Formatting and whitespace checks are recorded against the final changed-file
  set; no protected database, role, or secret was mutated by these runs.

## Two-key activation hold

The code path is intentionally fail-closed. Activation is ordered because the
pre-overlay scheduled production workflow still forwards Doppler's database
value. An approved operator must:

1. Provision least-privilege Worker application roles and store their URLs as
   GitHub `DATABASE_URL_STAGING_APP` and
   `DATABASE_URL_PRODUCTION_APP`; set the explicitly reviewed
   `WORKER_DATABASE_BYPASSRLS_EXPECTED` repository variable. Grant the complete
   application table/sequence matrix and matching migration-owner default
   privileges; leave no `SET ROLE` path to an owner, DDL-capable, or
   administrative role and no reachable membership with `ADMIN OPTION`.
2. Verify the candidate roles against staging while leaving Doppler unchanged.
3. Land and deploy the overlay code, then prove both Workers are healthy and
   connected through the application roles.
4. Only after that proof, rotate Doppler `stg` / `prd` `DATABASE_URL` to roles
   limited to connect, schema usage, and reads, and verify the lane guard.

The interval between overlay landing and Doppler rotation must be bounded and
lane execution paused. Rotating Doppler first is unsafe: the old scheduled sync
would copy that read-only URL into the production Worker and break writes.
Rollback after rotation leaves Doppler read-only and restores only the last
approved Worker application credential through the protected `*_APP` secret.

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
