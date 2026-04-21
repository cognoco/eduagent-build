import path from 'node:path';
import { randomBytes } from 'node:crypto';

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
  process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8787'
);

export const appBaseUrl = trimTrailingSlash(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:19006'
);

export function buildSeedEmail(alias: string): string {
  return `${seedEmailPrefix}${alias}@example.com`;
}

export function buildTestSeedHeaders(): Record<string, string> {
  const secret =
    process.env.PLAYWRIGHT_TEST_SEED_SECRET ?? process.env.TEST_SEED_SECRET;

  return secret ? { 'X-Test-Secret': secret } : {};
}
