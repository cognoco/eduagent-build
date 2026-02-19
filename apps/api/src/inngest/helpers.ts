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

// ---------------------------------------------------------------------------
// Module-level VOYAGE_API_KEY — set by Inngest middleware on CF Workers,
// falls back to process.env for Node.js test environments.
// ---------------------------------------------------------------------------

let _voyageApiKey: string | undefined;

/** Called by Inngest middleware to inject the VOYAGE_API_KEY binding. */
export function setVoyageApiKey(key: string): void {
  _voyageApiKey = key;
}

/** Reset the injected key — for test cleanup only. */
export function resetVoyageApiKey(): void {
  _voyageApiKey = undefined;
}

/**
 * Returns the Voyage API key for use within Inngest step functions.
 *
 * Prefers the key injected via {@link setVoyageApiKey} (set by middleware on
 * CF Workers). Falls back to `process.env['VOYAGE_API_KEY']` so tests running
 * in Node.js keep working without middleware.
 */
export function getStepVoyageApiKey(): string {
  const key = _voyageApiKey ?? process.env['VOYAGE_API_KEY'];
  if (!key) {
    throw new Error(
      'VOYAGE_API_KEY not available — ensure Inngest middleware provides env bindings'
    );
  }
  return key;
}
