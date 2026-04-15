/**
 * Integration test database setup for apps/api.
 *
 * Swaps the Neon HTTP driver for the standard `pg` driver when DATABASE_URL
 * points at a non-Neon PostgreSQL (CI container, local dev pg).
 *
 * Unit tests that call jest.mock('@eduagent/database', ...) in the test file
 * override this mock — so this setup only activates for integration tests
 * that use the real createDatabase() export.
 *
 * Mirrors the logic in tests/integration/setup.ts.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';

loadDatabaseEnv(resolve(__dirname, '../..'));

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

let _pool: InstanceType<typeof import('pg').Pool> | null = null;

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');

  return {
    ...actual,
    createDatabase: (databaseUrl: string) => {
      if (isNeonUrl(databaseUrl)) {
        return actual.createDatabase(databaseUrl);
      }

      // Standard pg driver for CI / local PostgreSQL
      const { Pool } = require('pg');
      const { drizzle } = require('drizzle-orm/node-postgres');
      const schema = require('../../packages/database/src/schema/index');

      if (!_pool) {
        _pool = new Pool({ connectionString: databaseUrl });
      }
      return drizzle(_pool, { schema });
    },
  };
});

afterAll(async () => {
  if (_pool) {
    await (_pool as unknown as { end: () => Promise<void> }).end();
    _pool = null;
  }
});
