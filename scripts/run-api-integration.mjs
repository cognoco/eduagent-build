#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = fileURLToPath(import.meta.url);
const DOPPLER_WRAPPER = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const PACKAGE_JSON = join(REPO_ROOT, 'package.json');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_DATABASE_MARKER = /(^|[_-])(test|tests|integration)([_-]|$)/i;
const PROTECTED_LABEL = /(^|[._-])(stg|staging|prd|prod|production)([._-]|$)/i;
const LOOPBACK_ONLY_REPAIR_SUITE =
  'apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts';
const LOCAL_JEST_CONFIG = 'apps/api/jest.integration.config.cjs';
const REMOTE_JEST_CONFIG = 'apps/api/jest.integration.remote.config.cjs';

function refuse(reason) {
  throw new Error(`API integration launch refused before Jest: ${reason}`);
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) {
    refuse(`failed to run ${binary}: ${result.error.message}`);
  }
  return result.status ?? 1;
}

function pinnedPnpmVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const match = /^pnpm@(.+)$/.exec(pkg.packageManager ?? '');
  if (!match) {
    refuse('package.json must declare packageManager as pnpm@<version>.');
  }
  return match[1];
}

function packageManagerLaunch() {
  const pnpmCli = process.env.npm_execpath?.trim();
  if (!pnpmCli) {
    refuse(
      'npm_execpath is required; run the canonical pnpm test:api:integration command.',
    );
  }
  return /\.(?:c?js)$/i.test(pnpmCli)
    ? {
        binary: process.execPath,
        args: [pnpmCli],
      }
    : {
        binary: pnpmCli,
        args: [],
      };
}

function assertPinnedPnpm() {
  const expected = pinnedPnpmVersion();
  const launch = packageManagerLaunch();
  const result = spawnSync(launch.binary, [...launch.args, '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    refuse(
      `npm_execpath could not resolve the repository-pinned pnpm ${expected}. ` +
        'Retry the canonical pnpm command.',
    );
  }
  const actual = result.stdout.trim();
  if (actual !== expected) {
    refuse(
      `package.json requires pnpm ${expected}, but npm_execpath resolved ${actual}.`,
    );
  }
  return launch;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    refuse(`${name} is required for a remote integration database.`);
  }
  return value;
}

function normalizedHostHint(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/:\d+$/, '');
  }
}

function databaseIdentity() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    refuse(
      'DATABASE_URL is required; no env-file or Doppler fallback is allowed.',
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    refuse('DATABASE_URL is not a parseable URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    refuse('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  const host = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!host || !databaseName) {
    refuse('DATABASE_URL must identify both a host and database name.');
  }
  return { host, databaseName };
}

function assertDatabaseContract() {
  const { host, databaseName } = databaseIdentity();
  const dopplerProject = process.env.DOPPLER_PROJECT?.trim();
  const dopplerConfig = process.env.DOPPLER_CONFIG?.trim();
  const dopplerEnvironment = process.env.DOPPLER_ENVIRONMENT?.trim();
  const normalizedHost =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (dopplerProject && dopplerProject !== 'mentomate') {
    refuse(
      `Doppler project "${dopplerProject}" is refused; expected "mentomate".`,
    );
  }
  if (dopplerConfig && dopplerConfig !== 'dev_integration') {
    refuse(
      `Doppler config "${dopplerConfig}" is refused; expected "dev_integration".`,
    );
  }
  if (dopplerEnvironment && dopplerEnvironment !== 'dev') {
    refuse(
      `Doppler environment "${dopplerEnvironment}" is refused; expected "dev".`,
    );
  }

  if (LOCAL_HOSTS.has(normalizedHost)) {
    if (!LOCAL_DATABASE_MARKER.test(databaseName)) {
      refuse(
        `local database metadata "${databaseName}" is not explicitly test/integration-scoped.`,
      );
    }
    return { isLocal: true };
  }

  requiredEnv('DOPPLER_PROJECT');
  requiredEnv('DOPPLER_ENVIRONMENT');
  if (dopplerConfig !== 'dev_integration') {
    refuse('DOPPLER_CONFIG=dev_integration is required for a remote database.');
  }

  const expectedHost = requiredEnv('INTEGRATION_DATABASE_HOST').toLowerCase();
  const expectedName = requiredEnv('INTEGRATION_DATABASE_NAME');
  if (process.env.INTEGRATION_DATABASE_DISPOSABLE?.trim() !== 'true') {
    refuse('INTEGRATION_DATABASE_DISPOSABLE=true is required.');
  }
  if (host !== expectedHost) {
    refuse('DATABASE_URL endpoint does not match INTEGRATION_DATABASE_HOST.');
  }
  if (databaseName !== expectedName) {
    refuse(
      'DATABASE_URL database metadata does not match INTEGRATION_DATABASE_NAME.',
    );
  }
  if (PROTECTED_LABEL.test(host)) {
    refuse(`endpoint identity "${host}" indicates staging or production.`);
  }
  if (PROTECTED_LABEL.test(databaseName)) {
    refuse(
      `database metadata "${databaseName}" indicates staging or production.`,
    );
  }

  const protectedHosts = [
    ['staging', requiredEnv('DATABASE_URL_STAGING_HOST')],
    ['production', requiredEnv('DATABASE_URL_PRODUCTION_HOST')],
  ];
  for (const [environment, hint] of protectedHosts) {
    if (host === normalizedHostHint(hint)) {
      refuse(
        `endpoint identity matches the protected ${environment} database.`,
      );
    }
  }
  return { isLocal: false };
}

function main() {
  const [mode, ...forwardedArgs] = process.argv.slice(2);

  if (mode === '--jest') {
    const { isLocal } = assertDatabaseContract();
    if (
      !isLocal &&
      forwardedArgs.some(
        (arg) => arg.replaceAll('\\', '/') === LOOPBACK_ONLY_REPAIR_SUITE,
      )
    ) {
      refuse('the curriculum dedup repair suite is loopback-only.');
    }
    const launch = assertPinnedPnpm();
    const jestConfig = isLocal ? LOCAL_JEST_CONFIG : REMOTE_JEST_CONFIG;
    return run(launch.binary, [
      ...launch.args,
      'exec',
      'jest',
      '--config',
      jestConfig,
      '--forceExit',
      ...forwardedArgs,
    ]);
  }

  if (mode === '--nx') {
    if (forwardedArgs.length) {
      refuse('--nx does not accept arguments; use --jest for targeted runs.');
    }
    // Defense in depth: --jest repeats both checks after Nx re-invokes this script.
    assertDatabaseContract();
    const launch = assertPinnedPnpm();
    return run(launch.binary, [
      ...launch.args,
      'exec',
      'nx',
      'run',
      'api:integration-api',
    ]);
  }

  if (mode) {
    refuse(`unknown argument "${mode}".`);
  }

  assertPinnedPnpm();
  return run(process.execPath, [
    DOPPLER_WRAPPER,
    'run',
    '--project',
    'mentomate',
    '--config',
    'dev_integration',
    '--',
    process.execPath,
    SCRIPT,
    '--nx',
  ]);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
