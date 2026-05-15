// ---------------------------------------------------------------------------
// Database Middleware — per-request Database instance from env
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import {
  closeDatabase,
  createDatabase,
  type Database,
} from '@eduagent/database';

export type DatabaseEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: { db: Database };
};

async function closeDatabaseWithFallback(
  c: Context<DatabaseEnv>,
  db: Database,
): Promise<void> {
  const closePromise = closeDatabase(db);
  try {
    c.executionCtx.waitUntil(closePromise);
  } catch {
    await closePromise;
  }
}

function wrapStreamingResponseForDatabaseClose(
  c: Context<DatabaseEnv>,
  db: Database,
): boolean {
  const response = c.res;
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('text/event-stream')) return false;
  if (!response.body) return false;

  const reader = response.body.getReader();
  let closePromise: Promise<void> | undefined;
  const closeOnce = () => {
    closePromise ??= closeDatabase(db);
    return closePromise;
  };

  const wrappedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await closeOnce();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        await closeOnce().catch(() => undefined);
        controller.error(err);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await closeOnce();
      }
    },
  });

  c.res = new Response(wrappedBody, response);
  return true;
}

export const databaseMiddleware = createMiddleware<DatabaseEnv>(
  async (c, next) => {
    const url = c.env?.DATABASE_URL;
    let db: Database | undefined;
    if (url) {
      // Phase 0.0 (RLS plan 2026-04-27): neon-serverless WS driver — real ACID
      // transactions; onTransactionFallback is no longer needed.
      db = createDatabase(url);
      c.set('db', db);
    }
    try {
      await next();
    } finally {
      if (db) {
        if (!wrapStreamingResponseForDatabaseClose(c, db)) {
          await closeDatabaseWithFallback(c, db);
        }
      }
    }
  },
);
