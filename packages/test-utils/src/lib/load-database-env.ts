/**
 * Load Database Environment Variables
 *
 * Resolution order:
 * 1. DATABASE_URL already in env (CI, Docker, `doppler run --`)  → use it
 * 2. .env.test.local / .env.development.local file exists        → load it
 * 3. Doppler CLI available (`C:/Tools/doppler/doppler.exe`)      → fetch from Doppler
 *
 * This guarantees integration tests get DATABASE_URL regardless of how
 * Jest is invoked (NX target, direct jest, pnpm script, etc.).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const DOPPLER_CLI = 'C:/Tools/doppler/doppler.exe';

const DOPPLER_SECRETS = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'TEST_SEED_SECRET',
] as const;

function loadFromDoppler(): boolean {
  if (!existsSync(DOPPLER_CLI)) {
    return false;
  }

  try {
    const json = execSync(
      `"${DOPPLER_CLI}" secrets download --no-file --format json`,
      {
        encoding: 'utf-8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );

    const secrets = JSON.parse(json) as Record<string, string>;

    for (const key of DOPPLER_SECRETS) {
      if (secrets[key] && !process.env[key]) {
        process.env[key] = secrets[key];
      }
    }

    if (process.env.DATABASE_URL) {
      console.log('✅ Loaded test secrets from Doppler CLI');
      return true;
    }
  } catch {
    // Doppler CLI failed (not logged in, network issue) — fall through
  }

  return false;
}

export function loadDatabaseEnv(workspaceRoot: string): void {
  if (process.env.DATABASE_URL) {
    return;
  }

  // Try .env files first (fast, no subprocess)
  const env = process.env.NODE_ENV || 'development';
  const envFiles =
    env === 'test'
      ? ['.env.test.local', '.env.development.local']
      : [`.env.${env}.local`];

  for (const envFile of envFiles) {
    const envPath = resolve(workspaceRoot, envFile);
    if (!existsSync(envPath)) {
      continue;
    }

    config({ path: envPath });
    if (process.env.DATABASE_URL) {
      return;
    }
  }

  // Fallback: fetch directly from Doppler
  if (loadFromDoppler()) {
    return;
  }

  console.warn(
    `⚠️  DATABASE_URL is unset and Doppler CLI unavailable.\n` +
      `   Integration tests requiring a real database will fail.\n` +
      `   Fix: run tests via \`pnpm test\` or ensure Doppler is configured.`,
  );
}
