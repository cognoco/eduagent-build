import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

import { defaultApiUrl } from './e2e-defaults.js';

const SEED_EMAIL_DOMAIN = 'example.com';
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const SEED_EMAIL_HASH_LENGTH = 8;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const e2eWebDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web');
export const authStateDir = path.join(e2eWebDir, '.auth');

export const runId =
  process.env.PLAYWRIGHT_RUN_ID ??
  `playwright-${Date.now()}-${randomBytes(2).toString('hex')}`;
process.env.PLAYWRIGHT_RUN_ID = runId;

export const seedEmailPrefix =
  process.env.PLAYWRIGHT_EMAIL_PREFIX ?? `pw-${runId}-`;
process.env.PLAYWRIGHT_EMAIL_PREFIX = seedEmailPrefix;

export const apiBaseUrl = trimTrailingSlash(
  process.env.PLAYWRIGHT_API_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    defaultApiUrl,
);

export const appBaseUrl = trimTrailingSlash(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:19006',
);

function resolveTestSeedSecret(): string | undefined {
  const runnerSecret =
    process.env.PLAYWRIGHT_TEST_SEED_SECRET ?? process.env.TEST_SEED_SECRET;

  if (process.env.PLAYWRIGHT_SKIP_LOCAL_API === '1') {
    return runnerSecret;
  }

  let apiSecret: string | undefined;
  try {
    apiSecret = parse(
      readFileSync(
        path.join(process.cwd(), 'apps', 'api', '.dev.vars'),
        'utf8',
      ),
    ).TEST_SEED_SECRET;
  } catch {
    throw new Error(
      '[playwright:seed-secret] Local API TEST_SEED_SECRET is unavailable. Run pnpm env:sync before a local Playwright run.',
    );
  }

  if (!apiSecret) {
    throw new Error(
      '[playwright:seed-secret] Local API TEST_SEED_SECRET is unavailable. Run pnpm env:sync before a local Playwright run.',
    );
  }

  if (runnerSecret !== undefined && runnerSecret !== apiSecret) {
    throw new Error(
      '[playwright:seed-secret] PLAYWRIGHT_TEST_SEED_SECRET or TEST_SEED_SECRET does not match the local API seed secret. Run without a runner override, or regenerate local configuration with pnpm env:sync.',
    );
  }

  return apiSecret;
}

function sanitizeEmailAlias(alias: string): string {
  const normalized = alias
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'seed';
}

function hashEmailAlias(alias: string): string {
  return createHash('sha256')
    .update(alias)
    .digest('hex')
    .slice(0, SEED_EMAIL_HASH_LENGTH);
}

export function buildSeedEmail(alias: string): string {
  const safeAlias = sanitizeEmailAlias(alias);
  const localPart = `${seedEmailPrefix}${safeAlias}`;
  if (localPart.length <= MAX_EMAIL_LOCAL_PART_LENGTH) {
    return `${localPart}@${SEED_EMAIL_DOMAIN}`;
  }

  const hashSuffix = `-${hashEmailAlias(safeAlias)}`;
  const maxAliasLength =
    MAX_EMAIL_LOCAL_PART_LENGTH - seedEmailPrefix.length - hashSuffix.length;

  if (maxAliasLength < 1) {
    throw new Error(
      `PLAYWRIGHT_EMAIL_PREFIX must be shorter than ${MAX_EMAIL_LOCAL_PART_LENGTH - hashSuffix.length} characters`,
    );
  }

  const aliasPrefix =
    safeAlias.slice(0, maxAliasLength).replace(/-+$/g, '') ||
    safeAlias.slice(0, maxAliasLength);
  return `${seedEmailPrefix}${aliasPrefix}${hashSuffix}@${SEED_EMAIL_DOMAIN}`;
}

export function buildTestSeedHeaders(): Record<string, string> {
  const testSeedSecret = resolveTestSeedSecret();
  return testSeedSecret ? { 'X-Test-Secret': testSeedSecret } : {};
}
