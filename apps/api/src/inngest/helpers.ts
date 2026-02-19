import { createDatabase, type Database } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Module-level DATABASE_URL — set by Inngest middleware on CF Workers,
// falls back to process.env for Node.js test environments.
// ---------------------------------------------------------------------------

let _databaseUrl: string | undefined;
let _cachedDb: ReturnType<typeof createDatabase> | null = null;
let _cachedDbUrl: string | null = null;

/** Called by Inngest middleware to inject the DATABASE_URL binding. */
export function setDatabaseUrl(url: string): void {
  _databaseUrl = url;
}

/** Reset the injected URL — for test cleanup only. */
export function resetDatabaseUrl(): void {
  _databaseUrl = undefined;
  _cachedDb = null;
  _cachedDbUrl = null;
}

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * Prefers the URL injected via {@link setDatabaseUrl} (set by middleware on
 * CF Workers). Falls back to `process.env['DATABASE_URL']` so tests running
 * in Node.js keep working without middleware.
 *
 * Caches the Drizzle instance per URL so multiple calls within a single
 * Inngest function execution reuse the same connection.
 */
export function getStepDatabase(): Database {
  const url = _databaseUrl ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL not available — ensure Inngest middleware provides env bindings'
    );
  }

  // Reuse existing instance if URL hasn't changed
  if (_cachedDb && _cachedDbUrl === url) {
    return _cachedDb;
  }

  _cachedDb = createDatabase(url);
  _cachedDbUrl = url;
  return _cachedDb;
}
