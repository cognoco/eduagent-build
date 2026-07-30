#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = fileURLToPath(import.meta.url);
const DOPPLER_WRAPPER = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const INTEGRATION_GUARD = join(REPO_ROOT, 'scripts', 'run-api-integration.mjs');
const ALLOWED_HARNESSES = new Set([
  'scripts/enduser-session-pass.ts',
  'scripts/premium-routing-pass.ts',
]);
const PRESERVED_INTEGRATION_ENV = [
  'DATABASE_URL',
  'INTEGRATION_DATABASE_HOST',
  'INTEGRATION_DATABASE_NAME',
  'INTEGRATION_DATABASE_DISPOSABLE',
  'DATABASE_URL_STAGING_HOST',
  'DATABASE_URL_PRODUCTION_HOST',
  'DOPPLER_PROJECT',
  'DOPPLER_CONFIG',
  'DOPPLER_ENVIRONMENT',
];

function refuse(reason) {
  throw new Error(`DB-writing LLM harness refused: ${reason}`);
}

function run(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    refuse(`failed to run ${binary}: ${result.error.message}`);
  }
  return result.status ?? 1;
}

function validateHarness(target) {
  if (!ALLOWED_HARNESSES.has(target)) {
    refuse(`unsupported harness "${target}"`);
  }
  return target;
}

function main() {
  const [modeOrTarget, innerTarget] = process.argv.slice(2);

  if (modeOrTarget === '--inner') {
    const target = validateHarness(innerTarget);
    const guardStatus = run(process.execPath, [
      INTEGRATION_GUARD,
      '--check-only',
    ]);
    if (guardStatus !== 0) {
      return guardStatus;
    }
    return run('corepack', ['pnpm', 'exec', 'tsx', resolve(REPO_ROOT, target)]);
  }

  const target = validateHarness(modeOrTarget);
  return run(process.execPath, [
    DOPPLER_WRAPPER,
    'run',
    '--project',
    'mentomate',
    '--config',
    'integration',
    '--',
    process.execPath,
    DOPPLER_WRAPPER,
    'run',
    '--project',
    'mentomate',
    '--config',
    'stg',
    `--preserve-env=${PRESERVED_INTEGRATION_ENV.join(',')}`,
    '--',
    process.execPath,
    SCRIPT,
    '--inner',
    target,
  ]);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
