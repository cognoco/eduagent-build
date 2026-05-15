import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
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
// Ref: docs/_archive/plans/done/2026-04-15-S06-rls-phase-0-1-preparatory.md — Phase 0.0
// ---------------------------------------------------------------------------
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = require('ws');
}

export interface CreateDatabaseOptions {
  /**
   * Reuse a Neon WebSocket pool across calls for the same connection string.
   * Disable this for per-request Cloudflare Worker clients; workerd treats
   * pooled WebSocket I/O as request-context-bound and can reject later requests.
   */
  cacheNeonPool?: boolean;
}

// Module-level pool cache — survives across requests within the same Cloudflare
// Worker isolate. Without this, every request creates a fresh NeonPool and
// negotiates a new WebSocket to Neon, which compounds cold-start latency when
// Neon auto-suspends the compute (3 parallel library queries × cold WebSocket
// handshake = 3× the wake-up load). Keyed by connection string so different
// environments get isolated pools.
const neonPoolCache = new Map<string, NeonPool>();

// [BUG-MIGRATE-0014 / RLS-PHASE-0] CI runs integration tests against a vanilla
// Postgres container at localhost:5432 (cheap, fast, in-job). Production runs
// against Neon, which requires a WebSocket tunnel. @neondatabase/serverless's
// Pool only speaks Neon's WebSocket protocol, so it errors with "Received
// network error or non-101 status code" against vanilla Postgres.
//
// Pick the driver based on the URL: Neon's serverless Pool for *.neon.tech
// hostnames, and node-postgres's plain TCP Pool for everything else. Both
// drizzle wrappers expose the same PgDatabase interface, so callers see
// identical typings — only the runtime transport differs.
//
// The match is intentionally narrow. A broader `\bneon\b` alternative would
// also match plain Postgres URLs that happen to contain "neon" as a standalone
// token (database named `neon_dev`, username `neon-user`, internal hostnames
// like `neon.internal`), which would route those connections through the
// WebSocket-only driver and fail with "Received network error or non-101
// status code" against vanilla Postgres.
function looksLikeNeon(url: string): boolean {
  return /\.neon\.tech\b/.test(url);
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
  options: CreateDatabaseOptions = {},
) {
  if (looksLikeNeon(databaseUrl)) {
    if (options.cacheNeonPool === false) {
      return drizzleNeon(
        new NeonPool({
          connectionString: databaseUrl,
          connectionTimeoutMillis: 10_000,
        }),
        { schema },
      );
    }

    let pool = neonPoolCache.get(databaseUrl);
    if (!pool) {
      pool = new NeonPool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10_000,
      });
      neonPoolCache.set(databaseUrl, pool);
    }
    return drizzleNeon(pool, { schema });
  }
  // drizzle-orm/node-postgres builds the underlying pg Pool internally when
  // given a connection string via the config-object form, avoiding the need
  // to import pg's Pool just to construct one and cast it to NodePgClient.
  //
  // The `as unknown as` cast below is REQUIRED — and not removable on a
  // drizzle upgrade. NodePgDatabase and NeonHttpDatabase / NeonDatabase are
  // structurally distinct: their transaction signatures, types, and runtime
  // semantics differ (e.g., neon-http's transactions are not interactive,
  // node-postgres's are; the result row prototypes differ). We unify them
  // behind a single Database type so callers don't have to branch on driver,
  // but the type unification is intentionally a cast — TypeScript will not
  // assign one to the other structurally.
  return drizzlePg({
    connection: databaseUrl,
    schema,
  }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}

export type Database = ReturnType<typeof createDatabase>;
