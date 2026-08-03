/**
 * WI-1628 fail-closed guard for the protected Worker's application credential.
 *
 * Run with:
 *   node --test packages/database/scripts/verify-worker-db-role.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDistinctDatabaseCredentials,
  assertMigratorDatabaseTarget,
  assertWorkerDatabaseCapabilities,
  assertWorkerDatabaseTarget,
  parseTemporaryStagingAdminException,
} from './verify-worker-db-role-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const dmlOnlyCapabilities = {
  role_name: 'app_user',
  is_superuser: false,
  can_create_database: false,
  can_create_role: false,
  can_replicate: false,
  bypasses_rls: false,
  can_create_schema: false,
  owns_application_objects: false,
  has_table_writes: true,
  has_forbidden_set_role_path: false,
  has_role_admin_path: false,
  application_table_count: 2,
  missing_table_select_count: 0,
  missing_table_insert_count: 0,
  missing_table_update_count: 0,
  missing_table_delete_count: 0,
  application_sequence_count: 1,
  missing_sequence_usage_count: 0,
  missing_sequence_update_count: 0,
};

const neonManagedAdminCapabilities = {
  ...dmlOnlyCapabilities,
  role_name: 'staging_worker',
  can_create_database: true,
  can_create_role: true,
  can_replicate: true,
  bypasses_rls: true,
  can_create_schema: false,
  has_forbidden_set_role_path: true,
  has_role_admin_path: true,
};

test('accepts only the exact staging_worker Neon managed-admin workaround in staging', () => {
  assert.equal(
    parseTemporaryStagingAdminException({
      deployEnv: 'staging',
      value: 'staging_worker',
    }),
    'staging_worker',
  );
  assert.doesNotThrow(() =>
    assertWorkerDatabaseCapabilities(neonManagedAdminCapabilities, {
      deployEnv: 'staging',
      expectedBypassRls: true,
      temporaryStagingAdminRole: 'staging_worker',
    }),
  );
});

test('keeps the staging workaround fail-closed for production, wrong roles, and unapproved capabilities', () => {
  assert.throws(
    () =>
      parseTemporaryStagingAdminException({
        deployEnv: 'production',
        value: 'staging_worker',
      }),
    /forbidden outside staging/i,
  );
  assert.throws(
    () =>
      parseTemporaryStagingAdminException({
        deployEnv: 'staging',
        value: 'some_other_role',
      }),
    /must be exactly "staging_worker"/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(neonManagedAdminCapabilities, {
        deployEnv: 'staging',
        expectedBypassRls: true,
      }),
    /database create/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(dmlOnlyCapabilities, {
        deployEnv: 'staging',
        expectedBypassRls: false,
        temporaryStagingAdminRole: 'staging_worker',
      }),
    /configured exception role does not match the live Worker role/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(
        { ...neonManagedAdminCapabilities, role_name: 'lookalike_worker' },
        {
          deployEnv: 'staging',
          expectedBypassRls: true,
          temporaryStagingAdminRole: 'staging_worker',
        },
      ),
    /database create/i,
  );
  for (const capability of ['is_superuser', 'owns_application_objects']) {
    assert.throws(
      () =>
        assertWorkerDatabaseCapabilities(
          { ...neonManagedAdminCapabilities, [capability]: true },
          {
            deployEnv: 'staging',
            expectedBypassRls: true,
            temporaryStagingAdminRole: 'staging_worker',
          },
        ),
      /not an approved application role/i,
    );
  }
  for (const capability of [
    'can_create_database',
    'can_create_role',
    'can_replicate',
    'has_forbidden_set_role_path',
    'has_role_admin_path',
  ]) {
    assert.throws(
      () =>
        assertWorkerDatabaseCapabilities(
          { ...neonManagedAdminCapabilities, [capability]: false },
          {
            deployEnv: 'staging',
            expectedBypassRls: true,
            temporaryStagingAdminRole: 'staging_worker',
          },
        ),
      /managed-admin fingerprint differs/i,
    );
  }
  const missingFalseCapability = { ...neonManagedAdminCapabilities };
  delete missingFalseCapability.can_create_schema;
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(missingFalseCapability, {
        deployEnv: 'staging',
        expectedBypassRls: true,
        temporaryStagingAdminRole: 'staging_worker',
      }),
    /managed-admin fingerprint differs/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(
        { ...neonManagedAdminCapabilities, can_create_schema: true },
        {
          deployEnv: 'staging',
          expectedBypassRls: true,
          temporaryStagingAdminRole: 'staging_worker',
        },
      ),
    /managed-admin fingerprint differs/i,
  );
});

test('accepts a non-owner DML role under an explicit RLS posture', () => {
  assert.doesNotThrow(() =>
    assertWorkerDatabaseCapabilities(dmlOnlyCapabilities, {
      expectedBypassRls: false,
    }),
  );
  assert.doesNotThrow(() =>
    assertWorkerDatabaseCapabilities(
      { ...dmlOnlyCapabilities, bypasses_rls: true },
      { expectedBypassRls: true },
    ),
  );
});

for (const [capability, message] of [
  ['is_superuser', /superuser/i],
  ['can_create_database', /database create/i],
  ['can_create_role', /role create/i],
  ['can_replicate', /replication/i],
  ['can_create_schema', /schema create/i],
  ['owns_application_objects', /owns application objects/i],
  ['has_forbidden_set_role_path', /SET ROLE/i],
  ['has_role_admin_path', /role ADMIN/i],
]) {
  test(`rejects a Worker role with ${capability}`, () => {
    assert.throws(
      () =>
        assertWorkerDatabaseCapabilities(
          { ...dmlOnlyCapabilities, [capability]: true },
          { expectedBypassRls: false },
        ),
      message,
    );
  });
}

test('requires the RLS bypass posture to be explicit and exact', () => {
  assert.throws(
    () => assertWorkerDatabaseCapabilities(dmlOnlyCapabilities, {}),
    /BYPASSRLS posture/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(
        { ...dmlOnlyCapabilities, bypasses_rls: true },
        { expectedBypassRls: false },
      ),
    /BYPASSRLS posture/i,
  );
});

test('requires application DML privileges', () => {
  assert.throws(
    () =>
      assertWorkerDatabaseCapabilities(
        { ...dmlOnlyCapabilities, has_table_writes: false },
        { expectedBypassRls: false },
      ),
    /table write privileges/i,
  );
});

for (const [capability, message] of [
  ['application_table_count', /no application tables/i],
  ['missing_table_select_count', /SELECT on every application table/i],
  ['missing_table_insert_count', /INSERT on every application table/i],
  ['missing_table_update_count', /UPDATE on every application table/i],
  ['missing_table_delete_count', /DELETE on every application table/i],
  ['missing_sequence_usage_count', /USAGE on every application sequence/i],
  ['missing_sequence_update_count', /UPDATE on every application sequence/i],
]) {
  test(`rejects an incomplete Worker privilege matrix: ${capability}`, () => {
    assert.throws(
      () =>
        assertWorkerDatabaseCapabilities(
          {
            ...dmlOnlyCapabilities,
            [capability]: capability === 'application_table_count' ? 0 : 1,
          },
          { expectedBypassRls: false },
        ),
      message,
    );
  });
}

test('rejects copied or same-role migration credentials without printing values', () => {
  assert.throws(
    () =>
      assertDistinctDatabaseCredentials({
        workerDatabaseUrl: 'postgresql://app-secret@staging.example/db',
        migratorDatabaseUrl: 'postgresql://app-secret@staging.example/db',
        workerRole: 'app',
        migratorRole: 'app',
      }),
    /identical/i,
  );
  assert.throws(
    () =>
      assertDistinctDatabaseCredentials({
        workerDatabaseUrl: 'postgresql://one@staging.example/db',
        migratorDatabaseUrl: 'postgresql://two@staging.example/db',
        workerRole: 'shared_owner',
        migratorRole: 'shared_owner',
      }),
    /same PostgreSQL role/i,
  );
});

test('requires the Worker URL and validates its protected environment host', () => {
  const base = {
    deployEnv: 'staging',
    stagingHost: 'staging.example',
    productionHost: 'production.example',
  };

  assert.throws(
    () => assertWorkerDatabaseTarget({ ...base, workerDatabaseUrl: '' }),
    /WORKER_DATABASE_URL is required/i,
  );
  assert.throws(
    () =>
      assertWorkerDatabaseTarget({
        ...base,
        workerDatabaseUrl: 'postgresql://app@production.example/db',
      }),
    /wrong environment/i,
  );
  assert.doesNotThrow(() =>
    assertWorkerDatabaseTarget({
      ...base,
      workerDatabaseUrl: 'postgresql://app@staging.example/db',
    }),
  );
});

test('requires the migrator credential to target the Worker database', () => {
  assert.doesNotThrow(() =>
    assertMigratorDatabaseTarget({
      workerDatabaseUrl: 'postgresql://app@staging.example/app',
      migratorDatabaseUrl: 'postgresql://owner@staging.example/app',
    }),
  );
  assert.throws(
    () =>
      assertMigratorDatabaseTarget({
        workerDatabaseUrl: 'postgresql://app@staging.example/app',
        migratorDatabaseUrl: 'postgresql://owner@other.example/app',
      }),
    /MIGRATOR_DATABASE_URL.*same database/i,
  );
  assert.throws(
    () =>
      assertMigratorDatabaseTarget({
        workerDatabaseUrl: 'postgresql://app@staging.example/app',
        migratorDatabaseUrl: 'postgresql://owner@staging.example/other',
      }),
    /MIGRATOR_DATABASE_URL.*same database/i,
  );
  assert.throws(
    () =>
      assertMigratorDatabaseTarget({
        workerDatabaseUrl: 'postgresql://app@staging.example:5432/app',
        migratorDatabaseUrl: 'postgresql://owner@staging.example:6543/app',
      }),
    /MIGRATOR_DATABASE_URL.*same database/i,
  );
});

test('protected workflows verify the Worker role before migration or secret sync', () => {
  const deploy = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/deploy.yml'),
    'utf8',
  );
  const productionSync = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/production-secret-sync.yml'),
    'utf8',
  );

  const apiDeployStart = deploy.indexOf('\n  api-deploy:');
  const apiDeployEnd = deploy.indexOf(
    '\n  mobile-confirm-production:',
    apiDeployStart,
  );
  assert.ok(apiDeployStart >= 0, 'api-deploy job is missing');
  assert.ok(
    apiDeployEnd > apiDeployStart,
    'api-deploy job boundary is missing',
  );
  const apiDeploy = deploy.slice(apiDeployStart, apiDeployEnd);

  const deployVerify = apiDeploy.indexOf('verify-worker-db-role.mjs');
  const deployMigrate = apiDeploy.indexOf('drizzle-kit migrate', deployVerify);
  const deployPostMigrateVerify = apiDeploy.indexOf(
    'verify-worker-db-role.mjs',
    deployVerify + 1,
  );
  const deploySync = apiDeploy.indexOf('pnpm secrets:sync "$SYNC_TARGET"');
  assert.ok(deployVerify >= 0, 'deploy Worker-role verifier is missing');
  assert.ok(deployVerify < deployMigrate, 'role verifier must precede migrate');
  assert.ok(
    deployMigrate < deployPostMigrateVerify &&
      deployPostMigrateVerify < deploySync,
    'role verifier must run again after migrate and before secret sync',
  );
  assert.ok(
    deployVerify < deploySync,
    'role verifier must precede secret sync',
  );
  const stagingOnlyExceptionLine =
    "STAGING_WORKER_ADMIN_EXCEPTION_ROLE: ${{ (github.event_name == 'push' || inputs.api_environment == 'staging') && vars.STAGING_WORKER_ADMIN_EXCEPTION_ROLE || '' }}";
  const stagingExceptionOccurrences = apiDeploy
    .split('\n')
    .filter((line) => line.trim() === stagingOnlyExceptionLine);
  assert.equal(
    stagingExceptionOccurrences.length,
    2,
    'the staging-only exception must be passed to both deploy role checks',
  );
  assert.equal(
    apiDeploy.match(/STAGING_WORKER_ADMIN_EXCEPTION_ROLE:/g)?.length,
    stagingExceptionOccurrences.length,
    'every staging exception reference must preserve the complete staging-only predicate',
  );

  const scheduledVerify = productionSync.indexOf('verify-worker-db-role.mjs');
  const scheduledSync = productionSync.indexOf('pnpm secrets:sync prd');
  assert.ok(scheduledVerify >= 0, 'scheduled Worker-role verifier is missing');
  assert.ok(
    scheduledVerify < scheduledSync,
    'scheduled role verifier must precede secret sync',
  );
  assert.doesNotMatch(
    productionSync,
    /STAGING_WORKER_ADMIN_EXCEPTION_ROLE/,
    'production secret sync must never receive the staging exception',
  );
});
