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

// Integration tests do real Neon HTTP roundtrips; the eslint governance
// selftest spawns 13 ESLint subprocesses (~4.5 s each). Both blow past Jest's
// 5 s default under concurrent load. 30 s leaves headroom without hiding hangs.
jest.setTimeout(30_000);

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

let _pool: InstanceType<typeof import('pg').Pool> | null = null;

// gc1-allow: CI pg-driver shim — @eduagent/database's createDatabase() returns
// a Neon HTTP driver client that cannot speak to the local PostgreSQL container
// CI runs. There is no production code path we could exercise instead; the
// Neon HTTP driver is fundamentally unavailable in the Node test environment.
// We jest.requireActual() the rest of the module and only override
// createDatabase() to swap in a standard `pg` client for non-Neon URLs.
jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  let driverLogged = false;

  return {
    ...actual,
    createDatabase: (databaseUrl: string) => {
      if (isNeonUrl(databaseUrl)) {
        if (!driverLogged) {
          console.log('[api-setup] Using Neon HTTP driver');
          driverLogged = true;
        }
        return actual.createDatabase(databaseUrl);
      }

      // Standard pg driver for CI / local PostgreSQL
      if (!driverLogged) {
        console.log('[api-setup] Using pg wire-protocol driver (local/CI)');
        driverLogged = true;
      }

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

// Pool cleanup is handled by Jest worker process exit.
// Do NOT end the pool in afterAll — the pool is shared across test files
// within the same worker, and ending it here causes "Cannot use a pool
// after calling end" in the next integration test file.
