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
const PROTECTED_LABEL = /(^|[._-])(stg|staging|prd|prod|production)([._-]|$)/i;

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

function assertPinnedPnpm() {
  const expected = pinnedPnpmVersion();
  const result = spawnSync('corepack', ['pnpm', '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    refuse(
      `Corepack could not resolve the repository-pinned pnpm ${expected}. ` +
        'Install/enable Corepack and retry the canonical command.',
    );
  }
  const actual = result.stdout.trim();
  if (actual !== expected) {
    refuse(
      `package.json requires pnpm ${expected}, but Corepack resolved ${actual}.`,
    );
  }
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

  if (dopplerProject && dopplerProject !== 'mentomate') {
    refuse(
      `Doppler project "${dopplerProject}" is refused; expected "mentomate".`,
    );
  }
  if (dopplerConfig && dopplerConfig !== 'integration') {
    refuse(
      `Doppler config "${dopplerConfig}" is refused; expected "integration".`,
    );
  }
  if (dopplerEnvironment && dopplerEnvironment !== 'dev') {
    refuse(
      `Doppler environment "${dopplerEnvironment}" is refused; expected "dev".`,
    );
  }

  if (LOCAL_HOSTS.has(host)) {
    if (!/(test|integration)/i.test(databaseName)) {
      refuse(
        `local database metadata "${databaseName}" is not explicitly test/integration-scoped.`,
      );
    }
    return;
  }

  requiredEnv('DOPPLER_PROJECT');
  requiredEnv('DOPPLER_ENVIRONMENT');
  if (dopplerConfig !== 'integration') {
    refuse('DOPPLER_CONFIG=integration is required for a remote database.');
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
}

function main() {
  const [mode, ...forwardedArgs] = process.argv.slice(2);

  if (mode === '--jest') {
    assertDatabaseContract();
    assertPinnedPnpm();
    return run('corepack', [
      'pnpm',
      'exec',
      'jest',
      '--config',
      'apps/api/jest.integration.config.cjs',
      '--forceExit',
      ...forwardedArgs,
    ]);
  }

  if (mode === '--nx') {
    assertDatabaseContract();
    assertPinnedPnpm();
    return run('corepack', [
      'pnpm',
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
    'integration',
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
