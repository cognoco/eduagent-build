#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageManagerLaunch } from './package-manager-launch.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = fileURLToPath(import.meta.url);
const DOPPLER_WRAPPER = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const INTEGRATION_GUARD = join(REPO_ROOT, 'scripts', 'run-api-integration.mjs');
const PACKAGE_JSON = join(REPO_ROOT, 'package.json');
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

function assertPinnedPnpm() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const match = /^pnpm@(.+)$/.exec(packageJson.packageManager ?? '');
  if (!match) {
    refuse('package.json must declare packageManager as pnpm@<version>');
  }

  let launch;
  try {
    launch = packageManagerLaunch(process.env.npm_execpath, process.execPath);
  } catch {
    refuse('npm_execpath is required; run the canonical pnpm harness command');
  }
  const version = spawnSync(launch.binary, [...launch.args, '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (
    version.error ||
    version.status !== 0 ||
    version.stdout.trim() !== match[1]
  ) {
    refuse(`npm_execpath must resolve repository-pinned pnpm ${match[1]}`);
  }
  return launch;
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
    const launch = assertPinnedPnpm();
    return run(launch.binary, [
      ...launch.args,
      'exec',
      'tsx',
      resolve(REPO_ROOT, target),
    ]);
  }

  const target = validateHarness(modeOrTarget);
  return run(process.execPath, [
    DOPPLER_WRAPPER,
    'run',
    '--project',
    'mentomate',
    '--config',
    'dev_integration',
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
