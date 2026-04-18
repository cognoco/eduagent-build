import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/**
 * Execute a callback inside a real Postgres transaction with
 * `app.current_profile_id` set via `SET LOCAL`. This is the
 * foundation for Row-Level Security: RLS policies can reference
 * `current_setting('app.current_profile_id')` to enforce
 * tenant isolation at the database level.
 *
 * The SET LOCAL value is scoped to the transaction — it is
 * automatically cleared on commit or rollback and never leaks
 * to other requests.
 */
export async function withProfileScope<T>(
  db: Database,
  profileId: string,
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_profile_id = ${profileId}`);
    return fn(tx as unknown as Database);
  });
}
