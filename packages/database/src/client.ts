import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
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

/**
 * Create a Drizzle database client backed by @neondatabase/serverless (WebSocket
 * driver). Unlike the previous neon-http driver, this client supports real
 * ACID interactive transactions — `db.transaction(async (tx) => { ... })` opens
 * a genuine Postgres BEGIN/COMMIT and guarantees atomicity and rollback.
 *
 * Phase 0.0 of the RLS preparatory plan switches from neon-http to this driver.
 * The silent non-atomic fallback that was present in the old client has been
 * removed — if `db.transaction` throws, the error propagates to the caller.
 */
export function createDatabase(
  databaseUrl: string,
  // options parameter kept for backward-compatibility; currently unused
  _options: CreateDatabaseOptions = {}
) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
