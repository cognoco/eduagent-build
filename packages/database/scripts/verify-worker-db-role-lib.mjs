import {
  extractHost,
  hostMatchesEnvironment,
} from './verify-db-target-lib.mjs';

const FORBIDDEN_CAPABILITIES = [
  ['is_superuser', 'role is a superuser'],
  ['can_create_database', 'role has database CREATE capability'],
  ['can_create_role', 'role has role CREATE capability'],
  ['can_replicate', 'role has replication capability'],
  ['can_create_schema', 'role has schema CREATE capability'],
  ['owns_application_objects', 'role owns application objects'],
  [
    'has_forbidden_set_role_path',
    'role can use SET ROLE to reach forbidden capabilities',
  ],
  [
    'has_role_admin_path',
    'role has a reachable role ADMIN membership that can change SET ROLE options',
  ],
];

const TEMPORARY_NEON_MANAGED_ADMIN_FINGERPRINT = new Map([
  ['can_create_database', true],
  ['can_create_role', true],
  ['can_replicate', true],
  ['can_create_schema', false],
  ['has_forbidden_set_role_path', true],
  ['has_role_admin_path', true],
]);

const REQUIRED_PRIVILEGE_COUNTS = [
  [
    'missing_table_select_count',
    'role lacks SELECT on every application table',
  ],
  [
    'missing_table_insert_count',
    'role lacks INSERT on every application table',
  ],
  [
    'missing_table_update_count',
    'role lacks UPDATE on every application table',
  ],
  [
    'missing_table_delete_count',
    'role lacks DELETE on every application table',
  ],
  [
    'missing_sequence_usage_count',
    'role lacks USAGE on every application sequence',
  ],
  [
    'missing_sequence_update_count',
    'role lacks UPDATE on every application sequence',
  ],
];

export function parseTemporaryStagingAdminException({ deployEnv, value }) {
  if (!value) return null;
  if (deployEnv !== 'staging') {
    throw new Error(
      'STAGING_WORKER_ADMIN_EXCEPTION_ROLE is forbidden outside staging',
    );
  }
  if (value !== 'staging_worker') {
    throw new Error(
      'STAGING_WORKER_ADMIN_EXCEPTION_ROLE must be exactly "staging_worker"',
    );
  }
  return value;
}

export function parseTemporaryProductionAdminException({ deployEnv, value }) {
  if (!value) return null;
  if (deployEnv !== 'production') {
    throw new Error(
      'PRODUCTION_WORKER_ADMIN_EXCEPTION_ROLE is forbidden outside production',
    );
  }
  if (value !== 'production_worker') {
    throw new Error(
      'PRODUCTION_WORKER_ADMIN_EXCEPTION_ROLE must be exactly "production_worker"',
    );
  }
  return value;
}

export function parseExpectedBypassRls(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(
    'WORKER_DATABASE_BYPASSRLS_EXPECTED must explicitly select the approved BYPASSRLS posture as "true" or "false"',
  );
}

export function assertWorkerDatabaseCapabilities(
  capabilities,
  {
    deployEnv,
    expectedBypassRls,
    temporaryStagingAdminRole,
    temporaryProductionAdminRole,
  } = {},
) {
  if (typeof expectedBypassRls !== 'boolean') {
    throw new Error(
      'Worker database BYPASSRLS posture must be explicitly approved',
    );
  }

  const temporaryAdminRole =
    temporaryStagingAdminRole || temporaryProductionAdminRole;
  const temporaryAdminExceptionConfigured = Boolean(temporaryAdminRole);
  const temporaryAdminException =
    ((deployEnv === 'staging' && temporaryAdminRole === 'staging_worker') ||
      (deployEnv === 'production' &&
        temporaryAdminRole === 'production_worker')) &&
    capabilities.role_name === temporaryAdminRole;
  const violations = FORBIDDEN_CAPABILITIES.filter(([property]) => {
    if (!capabilities[property]) return false;
    return !(
      temporaryAdminException &&
      TEMPORARY_NEON_MANAGED_ADMIN_FINGERPRINT.has(property)
    );
  }).map(([, message]) => message);
  if (temporaryAdminExceptionConfigured && !temporaryAdminException) {
    violations.push(
      'configured exception role does not match the live Worker role',
    );
  }
  if (temporaryAdminException) {
    const fingerprintDiffers = [
      ...TEMPORARY_NEON_MANAGED_ADMIN_FINGERPRINT.entries(),
    ].some(
      ([property, expected]) =>
        typeof capabilities[property] !== 'boolean' ||
        capabilities[property] !== expected,
    );
    if (fingerprintDiffers) {
      violations.push(
        `${temporaryAdminRole} Neon managed-admin fingerprint differs from the reviewed workaround`,
      );
    }
  }
  if (capabilities.bypasses_rls !== expectedBypassRls) {
    violations.push('role BYPASSRLS posture differs from the approved posture');
  }
  if (!capabilities.has_table_writes) {
    violations.push('role lacks required application table write privileges');
  }
  if (Number(capabilities.application_table_count) === 0) {
    violations.push('database exposes no application tables to validate');
  }
  for (const [property, message] of REQUIRED_PRIVILEGE_COUNTS) {
    if (Number(capabilities[property]) > 0) {
      violations.push(message);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `WORKER_DATABASE_URL role is not an approved application role: ${violations.join('; ')}`,
    );
  }
}

export function assertDistinctDatabaseCredentials({
  workerDatabaseUrl,
  migratorDatabaseUrl,
  workerRole,
  migratorRole,
}) {
  if (workerDatabaseUrl === migratorDatabaseUrl) {
    throw new Error(
      'Worker and migration database credentials are identical; values were not logged',
    );
  }
  if (workerRole && migratorRole && workerRole === migratorRole) {
    throw new Error(
      'Worker and migration credentials resolve to the same PostgreSQL role',
    );
  }
}

export function assertMigratorDatabaseTarget({
  workerDatabaseUrl,
  migratorDatabaseUrl,
}) {
  let workerTarget;
  let migratorTarget;
  try {
    workerTarget = new URL(workerDatabaseUrl);
    migratorTarget = new URL(migratorDatabaseUrl);
  } catch {
    throw new Error(
      'MIGRATOR_DATABASE_URL must target the same database as WORKER_DATABASE_URL',
    );
  }
  if (
    migratorTarget.host.toLowerCase() !== workerTarget.host.toLowerCase() ||
    migratorTarget.pathname !== workerTarget.pathname
  ) {
    throw new Error(
      'MIGRATOR_DATABASE_URL must target the same database as WORKER_DATABASE_URL',
    );
  }
}

export function assertWorkerDatabaseTarget({
  deployEnv,
  workerDatabaseUrl,
  stagingHost,
  productionHost,
}) {
  if (deployEnv !== 'staging' && deployEnv !== 'production') {
    throw new Error('DEPLOY_ENV must be "staging" or "production"');
  }
  if (!workerDatabaseUrl) {
    throw new Error('WORKER_DATABASE_URL is required');
  }

  const host = extractHost(workerDatabaseUrl);
  if (!host) {
    throw new Error('WORKER_DATABASE_URL is not a parseable URL');
  }
  const expectedSubstring =
    deployEnv === 'staging' ? stagingHost : productionHost;
  const wrongEnvSubstring =
    deployEnv === 'staging' ? productionHost : stagingHost;
  const verdict = hostMatchesEnvironment({
    host,
    expectedSubstring,
    wrongEnvSubstring,
  });

  if (verdict.status !== 'ok') {
    throw new Error(
      `WORKER_DATABASE_URL target is not verified: ${verdict.reason}`,
    );
  }
  return { host };
}
