/**
 * Integration test setup.
 *
 * Direction of travel for this suite:
 * - keep the app, middleware, routes, and database package real
 * - fake only true external boundaries like JWT verification or third-party HTTP
 *
 * DATABASE_URL is loaded from `.env.test.local` when present, otherwise
 * `.env.development.local` for local development convenience.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '../../packages/test-utils/src';

loadDatabaseEnv(resolve(__dirname, '../..'));

// ---------------------------------------------------------------------------
// Database driver override for CI / local PostgreSQL
//
// The production @eduagent/database client uses @neondatabase/serverless's
// HTTP driver (fetch-based). That driver can't connect to a standard
// PostgreSQL container on localhost because it speaks Neon's HTTP protocol,
// not the PostgreSQL wire protocol.
//
// CI runs a plain PostgreSQL 16 service container. We detect non-Neon URLs
// and swap in the standard `pg` driver so integration tests hit real SQL
// without changing any production code.
// ---------------------------------------------------------------------------

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

// Shared pool — reused across all createDatabase() calls within a test run.

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
    await (_pool as any).end();
    _pool = null;
  }
});

import {
  registerProvider,
  createMockProvider,
} from '../../apps/api/src/services/llm';

// Register mock LLM provider for all integration tests
// Real Gemini/OpenAI calls would be flaky and expensive in CI/local runs
registerProvider(createMockProvider('gemini'));

// ---------------------------------------------------------------------------
// Global fetch interceptor + JWKS mock
//
// Direction of travel: once all test files are migrated to composable
// interceptors, remove `passthrough: true` so unmatched URLs throw.
// ---------------------------------------------------------------------------

import { installFetchInterceptor, restoreFetch } from './fetch-interceptor';
import { mockClerkJWKS } from './external-mocks';
import { clearJWKSCache } from '../../apps/api/src/middleware/jwt';

// Passthrough mode: unmatched URLs fall through to real fetch so tests
// that still use the old jest.mock('jwt') pattern continue to work.
// TODO [INT-MIGRATION]: Remove passthrough once remaining legacy test files are
// migrated off jest.mock('../../apps/api/src/middleware/jwt'). Remaining files:
// account-deletion, and any others using the old jwt-mock pattern.
// Once all files are migrated, flip to passthrough: false so stray external
// HTTP calls fail loudly in CI.
installFetchInterceptor({ passthrough: true });
mockClerkJWKS();

// Clear the in-memory JWKS cache between test files to prevent stale keys
beforeEach(() => {
  clearJWKSCache();
});

afterAll(() => {
  restoreFetch();
});

// Set a generous timeout for integration tests
jest.setTimeout(30_000);
