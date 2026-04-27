import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index';

// ---------------------------------------------------------------------------
// WebSocket constructor — Node.js vs Cloudflare Workers
//
// @neondatabase/serverless uses WebSockets for interactive transactions.
// - Cloudflare Workers: `WebSocket` is a global — no configuration needed.
// - Node.js (tests, local scripts): no global `WebSocket`; inject the `ws`
//   package so the Pool can open the WebSocket tunnel to Neon.
//
// We detect Node.js by checking `typeof WebSocket === 'undefined'`, which is
// false inside Workers (where the runtime provides a native WebSocket) and
// true inside Jest / Node.js processes.
//
// Ref: docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md — Phase 0.0
// ---------------------------------------------------------------------------
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = require('ws');
}

/**
 * Options accepted by createDatabase. Currently unused — kept for backward
 * compatibility with callers that pass an empty options object.
 */
export type CreateDatabaseOptions = Record<string, never>;

// [BUG-MIGRATE-0014 / RLS-PHASE-0] CI runs integration tests against a vanilla
// Postgres container at localhost:5432 (cheap, fast, in-job). Production runs
// against Neon, which requires a WebSocket tunnel. @neondatabase/serverless's
// Pool only speaks Neon's WebSocket protocol, so it errors with "Received
// network error or non-101 status code" against vanilla Postgres.
//
// Pick the driver based on the URL: Neon's serverless Pool for *.neon.tech (or
// any URL that has explicit `sslmode=require` flagging a managed Neon-style
// endpoint), and node-postgres's plain TCP Pool for everything else. Both
// drizzle wrappers expose the same PgDatabase interface, so callers see
// identical typings — only the runtime transport differs.
function looksLikeNeon(url: string): boolean {
  return /\.neon\.tech\b/.test(url) || /\bneon(\.tech)?\b/.test(url);
}

/**
 * Create a Drizzle database client. Production (Neon) gets the WebSocket-based
 * neon-serverless driver; non-Neon URLs (CI's localhost Postgres, local dev
 * docker) get the plain pg driver. Both support real ACID interactive
 * transactions — `db.transaction(async (tx) => { ... })` opens a genuine
 * Postgres BEGIN/COMMIT and guarantees atomicity and rollback.
 *
 * Phase 0.0 of the RLS preparatory plan switched the production driver from
 * neon-http to neon-serverless so transactions are no longer silently
 * non-atomic. The silent non-atomic fallback that was present in the old
 * client has been removed — if `db.transaction` throws, the error propagates
 * to the caller.
 */
export function createDatabase(
  databaseUrl: string,
  // options parameter kept for backward-compatibility; currently unused
  _options: CreateDatabaseOptions = {}
) {
  if (looksLikeNeon(databaseUrl)) {
    const pool = new NeonPool({ connectionString: databaseUrl });
    return drizzleNeon(pool, { schema });
  }
  const pool = new PgPool({ connectionString: databaseUrl });
  // drizzle-orm/node-postgres accepts a Pool through its config-object
  // overload (`{ client: pool }`); the positional `drizzle(pool, options)`
  // form expects `NodePgClient` and pg's Pool does not satisfy that overload.
  return drizzlePg({ client: pool, schema }) as unknown as ReturnType<
    typeof drizzleNeon<typeof schema>
  >;
}

export type Database = ReturnType<typeof createDatabase>;
