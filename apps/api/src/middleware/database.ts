// ---------------------------------------------------------------------------
// Database Middleware — per-request Database instance from env
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { createDatabase, type Database } from '@eduagent/database';
import { captureException } from '../services/sentry';

export type DatabaseEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: { db: Database };
};

export const databaseMiddleware = createMiddleware<DatabaseEnv>(
  async (c, next) => {
    const url = c.env?.DATABASE_URL;
    if (url) {
      // [P-6] Pass captureException as onTransactionFallback so the neon-http
      // transaction fallback is reported to Sentry and queryable in production.
      const db = createDatabase(url, {
        onTransactionFallback: (error) => {
          captureException(error, {
            extra: { context: 'neon-http.transaction-fallback' },
          });
        },
      });
      c.set('db', db);
    }
    await next();
  }
);
