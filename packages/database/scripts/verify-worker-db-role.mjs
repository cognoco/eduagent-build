#!/usr/bin/env node

/**
 * Catalog-only preflight for the protected Worker's application credential.
 * It proves target, role separation, and least privilege without attempting a
 * write. Migration-owner credentials stay separate and are used only to read
 * current_user for the identity comparison.
 */

import { neon } from '@neondatabase/serverless';

import {
  CURRENT_DATABASE_ROLE_QUERY,
  DATABASE_ROLE_CAPABILITIES_QUERY,
} from './database-role-capabilities.mjs';
import {
  assertDistinctDatabaseCredentials,
  assertMigratorDatabaseTarget,
  assertWorkerDatabaseCapabilities,
  assertWorkerDatabaseTarget,
  parseExpectedBypassRls,
  parseTemporaryStagingAdminException,
} from './verify-worker-db-role-lib.mjs';

async function main() {
  const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;
  const migratorDatabaseUrl = process.env.MIGRATOR_DATABASE_URL;
  const deployEnv = process.env.DEPLOY_ENV;

  if (!migratorDatabaseUrl) {
    throw new Error('MIGRATOR_DATABASE_URL is required');
  }
  const { host } = assertWorkerDatabaseTarget({
    deployEnv,
    workerDatabaseUrl,
    stagingHost: process.env.DATABASE_URL_STAGING_HOST,
    productionHost: process.env.DATABASE_URL_PRODUCTION_HOST,
  });
  assertMigratorDatabaseTarget({
    workerDatabaseUrl,
    migratorDatabaseUrl,
  });
  assertDistinctDatabaseCredentials({
    workerDatabaseUrl,
    migratorDatabaseUrl,
  });
  const expectedBypassRls = parseExpectedBypassRls(
    process.env.WORKER_DATABASE_BYPASSRLS_EXPECTED,
  );
  const temporaryStagingAdminRole = parseTemporaryStagingAdminException({
    deployEnv,
    value: process.env.STAGING_WORKER_ADMIN_EXCEPTION_ROLE,
  });

  const workerSql = neon(workerDatabaseUrl);
  const migratorSql = neon(migratorDatabaseUrl);
  const [capabilities] = await workerSql(DATABASE_ROLE_CAPABILITIES_QUERY);
  const [migratorIdentity] = await migratorSql(CURRENT_DATABASE_ROLE_QUERY);

  if (!capabilities || !migratorIdentity) {
    throw new Error('Could not resolve PostgreSQL role capabilities');
  }
  assertWorkerDatabaseCapabilities(capabilities, {
    deployEnv,
    expectedBypassRls,
    temporaryStagingAdminRole,
  });
  assertDistinctDatabaseCredentials({
    workerDatabaseUrl,
    migratorDatabaseUrl,
    workerRole: capabilities.role_name,
    migratorRole: migratorIdentity.role_name,
  });
  console.log(
    `✓ Worker database role is catalog-verified for ${deployEnv} host ${host}`,
  );
  if (temporaryStagingAdminRole) {
    console.warn(
      '⚠ Accepted temporary staging_worker Neon managed-admin workaround; removal is launch-blocked by WI-3062',
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
