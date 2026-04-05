import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema/index';

function isUnsupportedTransactionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('No transactions support in neon-http driver')
  );
}

export function createDatabase(databaseUrl: string) {
  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });
  const originalTransaction = db.transaction.bind(db);

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
          console.warn(
            '[db] neon-http transaction fallback — running without atomicity'
          );
          return fn(db as unknown as Parameters<typeof fn>[0]);
        }
        throw error;
      }
    },
  });
}

export type Database = ReturnType<typeof createDatabase>;
