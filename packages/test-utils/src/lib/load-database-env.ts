/**
 * Load Database Environment Variables
 *
 * Resolution order:
 * 1. DATABASE_URL already in env (CI, Docker, `doppler run --`)  → use it
 * 2. .env.test.local / .env.development.local file exists        → load it if local
 * 3. Doppler CLI available (DOPPLER_CLI, fixed paths, or PATH)   → fetch from a dev config
 *
 * This guarantees integration tests get DATABASE_URL regardless of how
 * Jest is invoked without silently targeting a shared Doppler environment.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execFileSync, execSync } from 'child_process';

const DOPPLER_CLI_CANDIDATES = [
  'C:/Tools/doppler/doppler.exe',
  '/opt/homebrew/bin/doppler',
  '/usr/local/bin/doppler',
  `${process.env.HOME ?? ''}/.local/bin/doppler`,
].filter(Boolean);

const DOPPLER_SECRETS = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'TEST_SEED_SECRET',
] as const;

interface DopplerSource {
  project: string;
  config: string;
  environment: string;
}

function readDopplerSource(
  values: Record<string, string | undefined>,
): DopplerSource | undefined {
  const project = values.DOPPLER_PROJECT?.trim();
  const dopplerConfig = values.DOPPLER_CONFIG?.trim();
  const environment = values.DOPPLER_ENVIRONMENT?.trim();

  if (!project && !dopplerConfig && !environment) {
    return undefined;
  }

  if (!project || !dopplerConfig || !environment) {
    throw new Error(
      'Refusing Doppler database fallback for tests because its project, config, or environment could not be resolved.',
    );
  }

  return { project, config: dopplerConfig, environment };
}

function assertLocalDopplerSource(source: DopplerSource): void {
  if (source.environment !== 'dev') {
    throw new Error(
      `Refusing Doppler database fallback for tests: project=${source.project}, config=${source.config}, environment=${source.environment} is shared/non-local. Set DATABASE_URL explicitly or select a development Doppler config.`,
    );
  }
}

function findDopplerCliCandidates(): string[] {
  const candidates: string[] = [];

  if (process.env.DOPPLER_CLI) {
    candidates.push(process.env.DOPPLER_CLI);
  }

  try {
    const command =
      process.platform === 'win32' ? 'where doppler' : 'command -v doppler';
    const found = execSync(command, {
      encoding: 'utf-8',
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    candidates.push(...found);
  } catch {
    // PATH lookup failed — fixed candidates may still work.
  }

  for (const candidate of DOPPLER_CLI_CANDIDATES) {
    if (existsSync(candidate)) {
      candidates.push(candidate);
    }
  }

  candidates.push('doppler');

  return [...new Set(candidates)];
}

function loadFromDoppler(): boolean {
  for (const dopplerCli of findDopplerCliCandidates()) {
    let secrets: Record<string, string>;

    try {
      const json = execFileSync(
        dopplerCli,
        ['secrets', 'download', '--no-file', '--format', 'json'],
        {
          encoding: 'utf-8',
          timeout: 15_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );

      secrets = JSON.parse(json) as Record<string, string>;
    } catch {
      // Try the next candidate (not logged in, stale PATH entry, network issue).
      continue;
    }

    const source = readDopplerSource(secrets);
    if (!source) {
      throw new Error(
        'Refusing Doppler database fallback for tests because its project, config, or environment could not be resolved.',
      );
    }
    assertLocalDopplerSource(source);

    for (const key of DOPPLER_SECRETS) {
      if (secrets[key] && !process.env[key]) {
        process.env[key] = secrets[key];
      }
    }

    if (process.env.DATABASE_URL) {
      console.log(
        `✅ Loaded test secrets from Doppler CLI (project=${source.project}, config=${source.config}, environment=${source.environment})`,
      );
      return true;
    }
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

    const fileEnv: Record<string, string> = {};
    config({ path: envPath, processEnv: fileEnv });
    if (fileEnv.DATABASE_URL) {
      const source = readDopplerSource(fileEnv);
      if (source) {
        assertLocalDopplerSource(source);
      }
    }

    for (const [key, value] of Object.entries(fileEnv)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

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
