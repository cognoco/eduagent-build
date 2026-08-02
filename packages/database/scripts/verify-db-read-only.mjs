#!/usr/bin/env node

/**
 * Catalog-only least-privilege check for lane/developer database credentials.
 * It never attempts a write, even inside a rollback transaction.
 */

import { neon } from '@neondatabase/serverless';

import { DATABASE_ROLE_CAPABILITIES_QUERY } from './database-role-capabilities.mjs';
import { assertReadOnlyCapabilities } from './verify-db-read-only-lib.mjs';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for read-only verification');
  }

  const sql = neon(process.env.DATABASE_URL);
  const [capabilities] = await sql(DATABASE_ROLE_CAPABILITIES_QUERY);

  if (!capabilities) {
    throw new Error('Could not resolve current PostgreSQL role capabilities');
  }

  assertReadOnlyCapabilities(capabilities);
  console.log('✓ DATABASE_URL role is catalog-verified read-only');
}

try {
  await main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
