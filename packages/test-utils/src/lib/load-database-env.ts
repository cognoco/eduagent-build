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
 * @param workspaceRoot - Absolute path to workspace root. Callers MUST use
 *                        resolve(__dirname, '../..') to compute this from their
 *                        location, NOT process.cwd() which varies based on which
 *                        project runs tests.
 *
 * @throws {Error} If environment file doesn't exist
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
  try {
    const env = process.env.NODE_ENV || 'development';
    const envFile = `.env.${env}.local`;
    const envPath = resolve(workspaceRoot, envFile);

    if (!existsSync(envPath)) {
      throw new Error(
        `Environment file not found: ${envFile}\n` +
          `Expected location: ${envPath}\n` +
          `See .env.example for required variables`
      );
    }

    config({ path: envPath });
    console.log(`✅ Loaded environment variables from: ${envFile}`);
  } catch (error) {
    console.error('❌ Failed to load environment variables for tests:');
    if (error instanceof Error) {
      console.error(error.message);
    }
    console.error('\nTests cannot run without environment configuration.');
    console.error('See .env.example for required variables\n');
    process.exit(1);
  }
}
