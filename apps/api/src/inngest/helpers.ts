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

  // Phase 0.0 (RLS plan 2026-04-27): neon-serverless WS driver — real ACID
  // transactions; onTransactionFallback is no longer needed.
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

// ---------------------------------------------------------------------------
// Module-level APP_URL — set by Inngest middleware on CF Workers,
// falls back to process.env for Node.js test environments.
// ---------------------------------------------------------------------------

let _appUrl: string | undefined;

/** Called by Inngest middleware to inject the APP_URL binding. */
export function setAppUrl(url: string): void {
  _appUrl = url;
}

/** Reset the injected URL — for test cleanup only. */
export function resetAppUrl(): void {
  _appUrl = undefined;
}

/**
 * Returns the public app URL for use within Inngest step functions.
 *
 * Prefers the URL injected via {@link setAppUrl} (set by middleware on
 * CF Workers). Falls back to `process.env['APP_URL']` then the canonical
 * production domain.
 */
export function getStepAppUrl(): string {
  return _appUrl ?? process.env['APP_URL'] ?? 'https://www.mentomate.com';
}

// ---------------------------------------------------------------------------
// Module-level RESEND_API_KEY — set by Inngest middleware on CF Workers,
// falls back to process.env for Node.js test environments.
// ---------------------------------------------------------------------------

let _resendApiKey: string | undefined;
let _emailFrom: string | undefined;

/** Called by Inngest middleware to inject the RESEND_API_KEY binding. */
export function setResendApiKey(key: string): void {
  _resendApiKey = key;
}

/** Called by Inngest middleware to inject the EMAIL_FROM binding. */
export function setEmailFrom(from: string): void {
  _emailFrom = from;
}

/** Reset the injected keys — for test cleanup only. */
export function resetResendConfig(): void {
  _resendApiKey = undefined;
  _emailFrom = undefined;
}

/**
 * Returns the Resend API key for use within Inngest step functions.
 *
 * Returns undefined if not configured — callers should degrade gracefully.
 */
export function getStepResendApiKey(): string | undefined {
  return _resendApiKey ?? process.env['RESEND_API_KEY'];
}

/**
 * Returns the EMAIL_FROM address for use within Inngest step functions.
 */
export function getStepEmailFrom(): string {
  return _emailFrom ?? process.env['EMAIL_FROM'] ?? 'noreply@mentomate.com';
}

// ---------------------------------------------------------------------------
// Module-level SUPPORT_EMAIL — set by Inngest middleware on CF Workers,
// falls back to process.env for Node.js test environments.
// ---------------------------------------------------------------------------

let _supportEmail: string | undefined;
let _retentionPurgeEnabled: string | undefined;

/** Called by Inngest middleware to inject the SUPPORT_EMAIL binding. */
export function setSupportEmail(email: string): void {
  _supportEmail = email;
}

/** Reset the injected email — for test cleanup only. */
export function resetSupportEmail(): void {
  _supportEmail = undefined;
}

/**
 * Returns the support email address for use within Inngest step functions.
 *
 * Prefers the value injected via {@link setSupportEmail} (set by middleware on
 * CF Workers). Falls back to process.env['SUPPORT_EMAIL'] then the canonical
 * default.
 */
export function getStepSupportEmail(): string {
  return (
    _supportEmail ?? process.env['SUPPORT_EMAIL'] ?? 'support@mentomate.com'
  );
}

/** Called by Inngest middleware to inject RETENTION_PURGE_ENABLED. */
export function setRetentionPurgeEnabled(value: string): void {
  _retentionPurgeEnabled = value;
}

/** Reset the injected flag — for test cleanup only. */
export function resetRetentionPurgeEnabled(): void {
  _retentionPurgeEnabled = undefined;
}

export function getStepRetentionPurgeEnabled(): boolean {
  return (
    (_retentionPurgeEnabled ?? process.env['RETENTION_PURGE_ENABLED']) ===
    'true'
  );
}
