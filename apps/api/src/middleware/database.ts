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
      const db = createDatabase(url);
      c.set('db', db);
    }
    await next();
  }
);
