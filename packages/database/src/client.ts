import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema/index';

function isUnsupportedTransactionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('No transactions support in neon-http driver')
  );
}

export interface CreateDatabaseOptions {
  /**
   * [P-6] Callback invoked when the neon-http transaction fallback fires.
   * Callers should pass their structured telemetry function (e.g. captureException)
   * here so the fallback is queryable in production monitoring.
   * If omitted, a console.warn is emitted (dev/test only behaviour).
   */
  onTransactionFallback?: (error: unknown) => void;
}

export function createDatabase(
  databaseUrl: string,
  options: CreateDatabaseOptions = {}
) {
  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });
  const originalTransaction = db.transaction.bind(db);
  const { onTransactionFallback } = options;

  return Object.assign(db, {
    // Neon HTTP does not support multi-statement transactions.
    // Fall back to executing the callback on the base DB so background
    // pipelines degrade gracefully instead of failing outright.
    async transaction(...args: Parameters<typeof originalTransaction>) {
      try {
        return await originalTransaction(...args);
      } catch (error) {
        const fn = args[0];
        if (isUnsupportedTransactionError(error) && typeof fn === 'function') {
          // Neon HTTP lacks transactions — pass base DB cast as PgTransaction
          // so service functions that accept Database | PgTransaction still work.
          // Statements execute individually; no atomicity or rollback.
          //
          // [P-6] Emit structured telemetry so this is queryable in production.
          // console.warn alone is not queryable — callers inject captureException.
          if (onTransactionFallback) {
            onTransactionFallback(error);
          } else {
            console.warn(
              '[db] neon-http transaction fallback — running without atomicity'
            );
          }
          return fn(db as unknown as Parameters<typeof fn>[0]);
        }
        throw error;
      }
    },
  });
}

export type Database = ReturnType<typeof createDatabase>;
