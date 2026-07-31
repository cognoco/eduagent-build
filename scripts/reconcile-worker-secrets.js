#!/usr/bin/env node

/**
 * Plans and, with explicit approval, applies deletion of production Worker
 * secrets that are both owned by the reviewed manifest and absent from
 * Doppler. Secret values never leave process memory.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  filterSecrets,
  isWranglerAuthenticated,
  syncSecrets,
  WRANGLER_CLI,
} = require('./sync-secrets.js');

const ROOT_DIR = path.join(__dirname, '..');
const API_DIR = path.join(ROOT_DIR, 'apps', 'api');
const MANIFEST_PATH = path.join(
  ROOT_DIR,
  'config',
  'worker-secret-ownership.json',
);
const DOPPLER_CLI =
  process.platform === 'win32' ? 'C:\\Tools\\doppler\\doppler.exe' : 'doppler';
const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;

const PRODUCTION_TARGET = {
  dopplerProject: 'mentomate',
  dopplerConfig: 'prd',
  workerName: 'mentomate-api-prd',
  wranglerEnvironment: 'production',
};

const MANIFEST_KEYS = [
  'schemaVersion',
  'approvalNamespace',
  'reviewedAt',
  'validUntil',
  'target',
  'ownedKeys',
];
const TARGET_KEYS = [
  'dopplerProject',
  'dopplerConfig',
  'workerName',
  'wranglerEnvironment',
];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value, expectedKeys) {
  return (
    isPlainObject(value) &&
    Object.keys(value).sort().join('\0') === [...expectedKeys].sort().join('\0')
  );
}

function parseTimestamp(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`Ownership manifest ${field} must be an ISO timestamp`);
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new Error(
      `Ownership manifest ${field} must be a canonical ISO timestamp`,
    );
  }
  return timestamp;
}

function validateOwnershipManifest(manifest, expectedTarget, now = new Date()) {
  if (!hasExactKeys(manifest, MANIFEST_KEYS)) {
    throw new Error('Ownership manifest is malformed or has unexpected fields');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('Ownership manifest schemaVersion is unsupported');
  }
  if (
    typeof manifest.approvalNamespace !== 'string' ||
    !/^[A-Z][A-Z0-9-]*$/.test(manifest.approvalNamespace)
  ) {
    throw new Error('Ownership manifest approvalNamespace is malformed');
  }
  if (!hasExactKeys(manifest.target, TARGET_KEYS)) {
    throw new Error('Ownership manifest target is malformed');
  }
  for (const key of TARGET_KEYS) {
    if (
      typeof manifest.target[key] !== 'string' ||
      manifest.target[key] !== expectedTarget[key]
    ) {
      throw new Error(`Ownership manifest target mismatch at ${key}`);
    }
  }

  const reviewedAt = parseTimestamp(manifest.reviewedAt, 'reviewedAt');
  const validUntil = parseTimestamp(manifest.validUntil, 'validUntil');
  const nowTimestamp = now.getTime();
  if (reviewedAt > nowTimestamp || validUntil <= reviewedAt) {
    throw new Error('Ownership manifest review window is malformed');
  }
  if (validUntil <= nowTimestamp) {
    throw new Error('Ownership manifest is stale');
  }

  if (!Array.isArray(manifest.ownedKeys) || manifest.ownedKeys.length === 0) {
    throw new Error('Ownership manifest ownedKeys must be non-empty');
  }
  if (
    manifest.ownedKeys.some(
      (key) => typeof key !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(key),
    )
  ) {
    throw new Error('Ownership manifest contains a malformed key name');
  }
  if (new Set(manifest.ownedKeys).size !== manifest.ownedKeys.length) {
    throw new Error('Ownership manifest contains duplicate owned keys');
  }

  return manifest;
}

function buildReconciliationPlan({ dopplerKeys, workerKeys, manifest }) {
  const doppler = new Set(dopplerKeys);
  const worker = new Set(workerKeys);
  const owned = new Set(manifest.ownedKeys);

  const deleteCandidates = manifest.ownedKeys
    .filter((key) => worker.has(key) && !doppler.has(key))
    .sort();
  const preserveKeys = workerKeys
    .filter((key) => !owned.has(key) || doppler.has(key))
    .sort();
  const requiredPresentKeys = manifest.ownedKeys
    .filter((key) => doppler.has(key))
    .sort();

  return { deleteCandidates, preserveKeys, requiredPresentKeys };
}

function formatDryRun(deleteCandidates) {
  return deleteCandidates.length > 0 ? `${deleteCandidates.join('\n')}\n` : '';
}

function expectedApprovalPhrase(manifest, deleteCandidates) {
  const candidateSet = [...new Set(deleteCandidates)].sort();
  return [
    manifest.approvalNamespace,
    'DELETE',
    manifest.target.workerName,
    manifest.target.dopplerConfig,
    `v${manifest.schemaVersion}`,
    candidateSet.length > 0 ? candidateSet.join(',') : 'NONE',
  ].join(':');
}

function applyDeletionPlan({
  plan,
  approval,
  expectedApproval,
  deleteSecret,
  restoreReappearedSecrets,
  listDopplerKeyNames,
  listWorkerSecretNames,
}) {
  if (!approval || approval !== expectedApproval) {
    throw new Error('Exact production deletion approval is required');
  }
  if (typeof deleteSecret !== 'function') {
    throw new Error('Supported Worker secret deletion is unavailable');
  }
  if (typeof listDopplerKeyNames !== 'function') {
    throw new Error('Fresh Doppler key-name verification is unavailable');
  }
  if (typeof listWorkerSecretNames !== 'function') {
    throw new Error('Fresh Worker key-name verification is unavailable');
  }

  const preDeleteDoppler = new Set(listDopplerKeyNames());
  const noLongerAbsent = plan.deleteCandidates.filter((key) =>
    preDeleteDoppler.has(key),
  );
  if (noLongerAbsent.length > 0) {
    throw new Error(
      `Doppler state changed after the dry-run; refusing stale deletion plan: ${noLongerAbsent.join(
        ', ',
      )}`,
    );
  }
  const preDeleteWorker = new Set(listWorkerSecretNames());
  const missingRequiredBeforeDelete = (plan.requiredPresentKeys || []).filter(
    (key) => !preDeleteWorker.has(key),
  );
  const missingPreservedBeforeDelete = plan.preserveKeys.filter(
    (key) => !preDeleteWorker.has(key),
  );
  if (
    missingRequiredBeforeDelete.length > 0 ||
    missingPreservedBeforeDelete.length > 0
  ) {
    throw new Error(
      `Worker state changed after the dry-run (missing required managed: ${
        missingRequiredBeforeDelete.join(', ') || 'none'
      }; missing preserved: ${
        missingPreservedBeforeDelete.join(', ') || 'none'
      })`,
    );
  }

  for (const key of plan.deleteCandidates) {
    const result = deleteSecret(key);
    if (!result || result.success !== true) {
      throw new Error(
        `Worker secret deletion failed for ${key}: ${
          result?.error || 'unsupported deletion'
        }`,
      );
    }
  }

  const postDelete = new Set(listWorkerSecretNames());
  const postDeleteDoppler = new Set(listDopplerKeyNames());
  const stranded = plan.deleteCandidates.filter((key) => postDelete.has(key));
  const lost = plan.preserveKeys.filter((key) => !postDelete.has(key));
  const missingRequired = (plan.requiredPresentKeys || []).filter(
    (key) => !postDelete.has(key),
  );
  const reappeared = plan.deleteCandidates.filter((key) =>
    postDeleteDoppler.has(key),
  );
  if (reappeared.length > 0) {
    if (typeof restoreReappearedSecrets !== 'function') {
      throw new Error(
        `Cannot restore keys that reappeared in Doppler: ${reappeared.join(
          ', ',
        )}`,
      );
    }
    const restoration = restoreReappearedSecrets(reappeared);
    if (!restoration || restoration.success !== true) {
      throw new Error(
        `Failed to restore keys that reappeared in Doppler: ${
          restoration?.error || reappeared.join(', ')
        }`,
      );
    }
    const restoredWorker = new Set(listWorkerSecretNames());
    const missingRestored = reappeared.filter(
      (key) => !restoredWorker.has(key),
    );
    if (missingRestored.length > 0) {
      throw new Error(
        `Restoration did not replace keys that reappeared in Doppler: ${missingRestored.join(
          ', ',
        )}`,
      );
    }
  }
  if (
    stranded.length > 0 ||
    lost.length > 0 ||
    missingRequired.length > 0 ||
    reappeared.length > 0
  ) {
    throw new Error(
      `Post-delete verification failed (stranded: ${
        stranded.join(', ') || 'none'
      }; missing preserved: ${
        lost.join(', ') || 'none'
      }; missing required managed: ${
        missingRequired.join(', ') || 'none'
      }; restored after reappearing in Doppler: ${
        reappeared.join(', ') || 'none'
      })`,
    );
  }
}

function assertWranglerConfig(configPath) {
  if (!configPath) {
    throw new Error(
      'WRANGLER_SYNC_CONFIG is required for production target safety',
    );
  }
}

function wranglerTargetArgs(target, configPath) {
  assertWranglerConfig(configPath);
  // Exact --name selects the deployed Worker directly. The manifest's
  // wranglerEnvironment remains audit metadata and is not a second selector.
  return ['--name', target.workerName, '--config', configPath];
}

function listWorkerSecretNames(target, configPath) {
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER_CLI,
      'secret',
      'list',
      '--format',
      'json',
      ...wranglerTargetArgs(target, configPath),
    ],
    {
      encoding: 'utf-8',
      cwd: API_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not list Worker secret names: ${
        result.stderr || result.stdout || 'unknown Wrangler error'
      }`.trim(),
    );
  }
  let entries;
  try {
    entries = JSON.parse(result.stdout);
  } catch {
    throw new Error('Wrangler secret list returned invalid JSON');
  }
  if (
    !Array.isArray(entries) ||
    entries.some((entry) => !entry || typeof entry.name !== 'string')
  ) {
    throw new Error('Wrangler secret list returned a malformed key-name list');
  }
  return entries.map((entry) => entry.name);
}

function deleteWorkerSecret(key, target, configPath) {
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER_CLI,
      'secret',
      'delete',
      key,
      ...wranglerTargetArgs(target, configPath),
    ],
    {
      encoding: 'utf-8',
      cwd: API_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
    },
  );
  return result.status === 0
    ? { success: true }
    : {
        success: false,
        error: (
          result.stderr ||
          result.stdout ||
          'unknown Wrangler error'
        ).trim(),
      };
}

function downloadDopplerKeyNames(target) {
  const result = spawnSync(
    DOPPLER_CLI,
    [
      'secrets',
      'download',
      '--project',
      target.dopplerProject,
      '--config',
      target.dopplerConfig,
      '--no-file',
      '--format',
      'json',
    ],
    {
      encoding: 'utf-8',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: EXTERNAL_COMMAND_TIMEOUT_MS,
    },
  );
  if (result.status !== 0) {
    throw new Error('Could not read production key names from Doppler');
  }
  let secrets;
  try {
    secrets = JSON.parse(result.stdout);
  } catch {
    throw new Error('Doppler returned malformed JSON');
  }
  return Object.keys(filterSecrets(secrets).filtered);
}

function readManifest() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    throw new Error('Could not read the Worker secret ownership manifest');
  }
  return validateOwnershipManifest(parsed, PRODUCTION_TARGET);
}

function parseCliArgs(args) {
  let environment;
  let mode;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--env') {
      environment = args[index + 1];
      index += 1;
    } else if (arg === '--dry-run' || arg === '--apply') {
      if (mode) throw new Error('Choose exactly one reconciliation mode');
      mode = arg;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }
  if (environment !== 'prd') {
    throw new Error(
      'Worker secret deletion reconciliation supports only --env prd',
    );
  }
  if (!mode) {
    throw new Error('Choose --dry-run or --apply');
  }
  return { mode };
}

function main(args) {
  const { mode } = parseCliArgs(args);
  const manifest = readManifest();
  const configPath = process.env.WRANGLER_SYNC_CONFIG;
  assertWranglerConfig(configPath);
  if (!isWranglerAuthenticated(configPath)) {
    throw new Error(
      'Wrangler authentication is required; refusing reconciliation',
    );
  }

  const dopplerKeys = downloadDopplerKeyNames(PRODUCTION_TARGET);
  const workerKeys = listWorkerSecretNames(PRODUCTION_TARGET, configPath);
  const plan = buildReconciliationPlan({
    dopplerKeys,
    workerKeys,
    manifest,
  });

  if (mode === '--dry-run') {
    process.stdout.write(formatDryRun(plan.deleteCandidates));
    return;
  }

  applyDeletionPlan({
    plan,
    approval: process.env.WORKER_SECRET_RECONCILIATION_APPROVAL || '',
    expectedApproval: expectedApprovalPhrase(manifest, plan.deleteCandidates),
    deleteSecret: (key) =>
      deleteWorkerSecret(key, PRODUCTION_TARGET, configPath),
    restoreReappearedSecrets: () => {
      const result = syncSecrets(['prd']);
      return result.ok
        ? { success: true }
        : {
            success: false,
            error: 'production Doppler-to-Worker bulk sync failed',
          };
    },
    listDopplerKeyNames: () => downloadDopplerKeyNames(PRODUCTION_TARGET),
    listWorkerSecretNames: () =>
      listWorkerSecretNames(PRODUCTION_TARGET, configPath),
  });
}

module.exports = {
  applyDeletionPlan,
  buildReconciliationPlan,
  expectedApprovalPhrase,
  formatDryRun,
  validateOwnershipManifest,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      `[reconcile] ${error instanceof Error ? error.message : 'unknown failure'}`,
    );
    process.exit(1);
  }
}
