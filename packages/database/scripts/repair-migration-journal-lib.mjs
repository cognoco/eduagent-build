import crypto from 'node:crypto';

import { reconcileMigrationJournal } from './verify-migration-journal-lib.mjs';

export const EXPECTED_ORPHANED_ROWS = Object.freeze([
  Object.freeze({
    id: 136,
    hash: 'b6a276ed19c7bd42c38c770cbf06b527a4898e5d1e6a46dbbe55111e1ae49502',
    created_at: 1783727368926,
  }),
  Object.freeze({
    id: 137,
    hash: 'da0c1cc26bc36d266a01eece64242855a3b4e070df232f899904a495fcc49c33',
    created_at: 1783727429477,
  }),
]);

const APPLY_CONFIRMATION = 'WI-1628:DELETE:136,137';
const UNRECOVERED_EFFECTS_ACK =
  'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS';
const CONNECTION_OVERRIDE_PARAMETERS = new Set([
  'database',
  'dbname',
  'host',
  'hostaddr',
  'password',
  'port',
  'service',
  'user',
]);

function parsedPostgresUrl(value, label) {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a parseable PostgreSQL URL`);
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`${label} must use postgres or postgresql`);
  }
  const connectionOverrides = [...parsed.searchParams.keys()].filter((key) =>
    CONNECTION_OVERRIDE_PARAMETERS.has(key.toLowerCase()),
  );
  if (connectionOverrides.length > 0) {
    throw new Error(
      `${label} must not override connection identity in query parameters: ` +
        connectionOverrides.join(', '),
    );
  }
  return parsed;
}

export function parseRepairRequest(argv, env) {
  if (
    argv.length !== 1 ||
    !['--dry-run', '--apply', '--verify-applied'].includes(argv[0])
  ) {
    throw new Error(
      'expected exactly one argument: --dry-run, --apply, or --verify-applied',
    );
  }
  if (env.DEPLOY_ENV !== 'staging') {
    throw new Error('WI-1628 repair requires DEPLOY_ENV=staging');
  }

  const databaseUrl = env.DATABASE_URL;
  const baselineDatabaseUrl = env.BASELINE_DATABASE_URL;
  const target = parsedPostgresUrl(databaseUrl, 'DATABASE_URL');
  const baseline = parsedPostgresUrl(
    baselineDatabaseUrl,
    'BASELINE_DATABASE_URL',
  );
  const stagingHost = env.DATABASE_URL_STAGING_HOST?.trim();
  const productionHost = env.DATABASE_URL_PRODUCTION_HOST?.trim();

  if (!stagingHost || !target.host.includes(stagingHost)) {
    throw new Error('DATABASE_URL does not match the staging host guard');
  }
  if (productionHost && target.host.includes(productionHost)) {
    throw new Error('DATABASE_URL matches the production host guard');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(baseline.hostname)) {
    throw new Error('The migration-0166 baseline database must be local');
  }
  if (
    argv[0] === '--apply' &&
    env.WI1628_REPAIR_CONFIRM !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply requires WI1628_REPAIR_CONFIRM=${APPLY_CONFIRMATION}`,
    );
  }
  if (
    argv[0] === '--apply' &&
    env.WI1628_UNRECOVERED_EFFECTS_ACK !== UNRECOVERED_EFFECTS_ACK
  ) {
    throw new Error(
      'Apply requires WI1628_UNRECOVERED_EFFECTS_ACK=' +
        UNRECOVERED_EFFECTS_ACK,
    );
  }
  if (
    argv[0] === '--apply' &&
    !/^\d+$/.test(env.WI1628_REVIEWED_DRY_RUN_ID ?? '')
  ) {
    throw new Error('Apply requires a numeric WI1628_REVIEWED_DRY_RUN_ID');
  }
  if (argv[0] === '--apply' && !env.WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH) {
    throw new Error('Apply requires WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH');
  }

  return {
    mode:
      argv[0] === '--apply'
        ? 'apply'
        : argv[0] === '--verify-applied'
          ? 'verify-applied'
          : 'dry-run',
    databaseUrl,
    baselineDatabaseUrl,
    ...(argv[0] === '--apply'
      ? {
          reviewedDryRunId: env.WI1628_REVIEWED_DRY_RUN_ID,
          reviewedDryRunReceiptPath: env.WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH,
        }
      : {}),
  };
}

export function databaseTargetFingerprint(databaseUrl) {
  const parsed = parsedPostgresUrl(databaseUrl, 'DATABASE_URL');
  const identity = `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}${parsed.pathname}`;
  return crypto.createHash('sha256').update(identity).digest('hex');
}

export function validateReviewedDryRunReceipt({
  receipt,
  reviewedDryRunId,
  currentHeadSha,
  databaseUrl,
}) {
  if (
    receipt?.schema !== 'zdx.wi1628.staging-journal-repair.v1' ||
    receipt?.mode !== 'dry-run' ||
    receipt?.status !== 'preflight-passed'
  ) {
    throw new Error('Reviewed dry-run receipt has an invalid schema or state');
  }
  if (String(receipt.githubRunId) !== String(reviewedDryRunId)) {
    throw new Error('Reviewed dry-run receipt run ID does not match the input');
  }
  if (!currentHeadSha || receipt.headSha !== currentHeadSha) {
    throw new Error(
      'Reviewed dry-run receipt is not bound to the current commit',
    );
  }
  if (receipt.targetFingerprint !== databaseTargetFingerprint(databaseUrl)) {
    throw new Error('Reviewed dry-run receipt targets a different database');
  }
  const expected = EXPECTED_ORPHANED_ROWS.map(rowIdentity).sort();
  const actual = Array.isArray(receipt.exactRows)
    ? receipt.exactRows.map(rowIdentity).sort()
    : [];
  if (
    actual.length !== expected.length ||
    actual.some((identity, index) => identity !== expected[index])
  ) {
    throw new Error('Reviewed dry-run receipt has the wrong exact-row set');
  }
}

export function verifyJournalRepairApplied({ migrations, appliedRows }) {
  const remainingExpectedRows = appliedRows.filter((row) =>
    EXPECTED_ORPHANED_ROWS.some(
      (expected) => rowIdentity(row) === rowIdentity(expected),
    ),
  );
  if (remainingExpectedRows.length > 0) {
    throw new Error(
      'Expected repaired journal rows are still present; apply is not confirmed',
    );
  }
  return reconcileMigrationJournal({ migrations, appliedRows });
}

export class RepairOutcomeError extends Error {
  constructor(outcome, cause) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'RepairOutcomeError';
    this.outcome = outcome;
  }
}

export async function runCommitBoundary({
  commit,
  onCommitConfirmed,
  afterCommit,
}) {
  try {
    await commit();
  } catch (error) {
    throw new RepairOutcomeError('commit-outcome-unknown', error);
  }

  onCommitConfirmed();
  try {
    return await afterCommit();
  } catch (error) {
    throw new RepairOutcomeError('committed-unverified', error);
  }
}

export function formatRepairFailure(error) {
  const cause = error instanceof Error ? error.message : String(error);
  if (
    error instanceof RepairOutcomeError &&
    error.outcome === 'commit-outcome-unknown'
  ) {
    return (
      'WI-1628 COMMIT OUTCOME UNKNOWN: do not rerun --apply. ' +
      `Run --verify-applied before any further action. Cause: ${cause}`
    );
  }
  if (
    error instanceof RepairOutcomeError &&
    error.outcome === 'committed-unverified'
  ) {
    return (
      'WI-1628 COMMIT SUCCEEDED; post-commit verification is incomplete. ' +
      `Run --verify-applied before any further action. Cause: ${cause}`
    );
  }
  return `WI-1628 repair refused: ${cause}`;
}

function normalizedRow(row) {
  return {
    id: String(row.id),
    hash: String(row.hash),
    created_at: String(row.created_at),
  };
}

function rowIdentity(row) {
  const normalized = normalizedRow(row);
  return `${normalized.id}:${normalized.hash}:${normalized.created_at}`;
}

export function planExactJournalRepair({ migrations, appliedRows }) {
  const committed = new Set(
    migrations.map(
      (migration) => `${migration.hash}:${String(migration.when)}`,
    ),
  );
  const orphanedRows = appliedRows.filter(
    (row) => !committed.has(`${row.hash}:${String(row.created_at)}`),
  );
  const actualIdentities = orphanedRows.map(rowIdentity).sort();
  const expectedIdentities = EXPECTED_ORPHANED_ROWS.map(rowIdentity).sort();

  if (
    actualIdentities.length !== expectedIdentities.length ||
    actualIdentities.some(
      (identity, index) => identity !== expectedIdentities[index],
    )
  ) {
    throw new Error(
      'Live Drizzle journal exact orphaned-row set mismatch; refusing repair. ' +
        `Expected [${expectedIdentities.join(', ')}], found ` +
        `[${actualIdentities.join(', ')}].`,
    );
  }

  const deleteIdentities = new Set(expectedIdentities);
  const cleanedRows = appliedRows.filter(
    (row) => !deleteIdentities.has(rowIdentity(row)),
  );
  const { applied, pending } = reconcileMigrationJournal({
    migrations,
    appliedRows: cleanedRows,
  });

  return {
    deleteRows: EXPECTED_ORPHANED_ROWS,
    cleanedRows,
    applied,
    pending,
  };
}

function inventoryMap(rows) {
  const result = new Map();
  for (const row of rows) {
    const key = String(row.key);
    if (result.has(key)) {
      throw new Error(`Catalog inventory contains duplicate key ${key}`);
    }
    result.set(key, String(row.definition));
  }
  return result;
}

export function assertCatalogInventoriesMatch({ baseline, staging }) {
  const expected = inventoryMap(baseline);
  const actual = inventoryMap(staging);
  const differences = [];

  for (const [key, definition] of expected) {
    if (!actual.has(key)) {
      differences.push(`missing: ${key}`);
    } else if (actual.get(key) !== definition) {
      differences.push(`changed: ${key}`);
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      differences.push(`unexpected: ${key}`);
    }
  }

  if (differences.length > 0) {
    const preview = differences.sort().slice(0, 30);
    const remainder = differences.length - preview.length;
    throw new Error(
      'Staging catalog inventory differs from migration 0166; refusing journal ' +
        `repair:\n- ${preview.join('\n- ')}` +
        (remainder > 0 ? `\n- …and ${remainder} more` : ''),
    );
  }
}
