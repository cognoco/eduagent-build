/**
 * Load Database Environment Variables
 *
 * Loads environment-specific .env files to ensure tests have access to:
 * - DATABASE_URL (Neon PostgreSQL connection string)
 *
 * Environment file loaded depends on NODE_ENV:
 * - NODE_ENV=test → .env.test.local
 * - NODE_ENV=development → .env.development.local
 *
 * When the env file is missing, a warning is logged but execution continues.
 * Tests using mocks will run normally; tests requiring a real database will
 * fail at connection time with a clear error.
 *
 * @param workspaceRoot - Absolute path to workspace root. Callers MUST use
 *                        resolve(__dirname, '../..') to compute this from their
 *                        location, NOT process.cwd() which varies based on which
 *                        project runs tests.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

export function loadDatabaseEnv(workspaceRoot: string): void {
  // If DATABASE_URL already exists (CI, Docker, cloud platforms), skip file loading
  if (process.env.DATABASE_URL) {
    console.log(
      '✅ DATABASE_URL already set (CI or pre-configured environment)'
    );
    return;
  }

  // Otherwise, load from .env file (local development)
  const env = process.env.NODE_ENV || 'development';
  const envFile = `.env.${env}.local`;
  const envPath = resolve(workspaceRoot, envFile);

  if (!existsSync(envPath)) {
    console.warn(
      `⚠️  ${envFile} not found — DATABASE_URL is unset.\n` +
        `   Tests requiring a real database connection will fail.\n` +
        `   See .env.example for required variables.`
    );
    return;
  }

  config({ path: envPath });
  console.log(`✅ Loaded environment variables from: ${envFile}`);
}
