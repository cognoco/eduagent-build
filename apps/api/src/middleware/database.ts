// ---------------------------------------------------------------------------
// Database Middleware — per-request Database instance from env
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { createDatabase, type Database } from '@eduagent/database';

export type DatabaseEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: { db: Database };
};

export const databaseMiddleware = createMiddleware<DatabaseEnv>(
  async (c, next) => {
    const url = c.env?.DATABASE_URL;
    if (url) {
      // Phase 0.0 (RLS plan 2026-04-27): neon-serverless WS driver — real ACID
      // transactions; onTransactionFallback is no longer needed.
      const db = createDatabase(url);
      c.set('db', db);
    }
    await next();
  }
);
