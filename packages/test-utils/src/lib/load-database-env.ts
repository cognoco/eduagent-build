/**
 * Load Database Environment Variables
 *
 * Loads environment-specific .env files to ensure tests have access to:
 * - DATABASE_URL (Supabase connection string)
 * - DIRECT_URL (Direct Prisma connection)
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Environment file loaded depends on NODE_ENV:
 * - NODE_ENV=test → .env.test.local (connects to STAGING Supabase)
 * - NODE_ENV=development → .env.development.local (connects to DEV Supabase)
 *
 * Note: File names follow NODE_ENV convention, not database naming.
 * The "test" in .env.test.local refers to the execution context (running tests),
 * not the database environment (which is STAGING).
 *
 * @param workspaceRoot - Absolute path to workspace root. Callers MUST use
 *                        resolve(__dirname, '../..') to compute this from their
 *                        location, NOT process.cwd() which varies based on which
 *                        project runs tests.
 *
 * @throws {Error} If environment file doesn't exist
 * @see docs/project-config/supabase.md for environment configuration
 * @see docs/memories/testing-reference.md for testing guidelines
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
          `See: docs/project-config/supabase.md`
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
    console.error('See: docs/project-config/supabase.md\n');
    process.exit(1);
  }
}
