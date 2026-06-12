import { AsyncLocalStorage } from 'node:async_hooks';
import {
  closeDatabase,
  createDatabase,
  type Database,
} from '@eduagent/database';

const stepDatabaseScope = new AsyncLocalStorage<Set<Database>>();

export async function runWithStepDatabaseScope<T>(
  callback: () => Promise<T>,
): Promise<T> {
  return stepDatabaseScope.run(new Set<Database>(), callback);
}

export function beginStepDatabaseScope(scope: Set<Database>): void {
  stepDatabaseScope.enterWith(scope);
}

export async function closeStepDatabases(
  scope = stepDatabaseScope.getStore(),
): Promise<void> {
  if (!scope) return;
  const databases = [...scope];
  scope.clear();
  await Promise.all(databases.map((db) => closeDatabase(db)));
}

// ---------------------------------------------------------------------------
// Per-invocation env bindings — carried through AsyncLocalStorage, set by
// Inngest middleware on CF Workers, falling back to process.env for Node.js
// test environments.
//
// These were previously module-level `let` singletons assigned per invocation
// by the middleware. On Cloudflare Workers one isolate can service overlapping
// Inngest invocations, so a later assignment could overwrite the value a
// concurrent run reads in a subsequent step. AsyncLocalStorage scopes the
// bindings to the invocation's async context instead (same isolation model as
// `stepDatabaseScope` above).
// ---------------------------------------------------------------------------

/** Env values injected per invocation by the Inngest middleware. */
export interface EnvBindings {
  databaseUrl?: string;
  voyageApiKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  appUrl?: string;
  supportEmail?: string;
  retentionPurgeEnabled?: string;
  clerkSecretKey?: string;
  memoryFactsDedupEnabled?: string;
  memoryFactsDedupThreshold?: string;
  maxDedupLlmCallsPerSession?: string;
  memoryFactsDedupRolloutPct?: string;
}

const envBindings = new AsyncLocalStorage<EnvBindings>();

/**
 * Binds the given env values to the current async context (and its
 * continuations). Called by the Inngest middleware per invocation — including
 * step re-entries — alongside {@link beginStepDatabaseScope}.
 */
export function enterWithEnvBindings(bindings: EnvBindings): void {
  envBindings.enterWith(bindings);
}

/** Merge a partial update into the current context's bindings (test helper). */
function mergeEnvBindings(partial: EnvBindings): void {
  envBindings.enterWith({ ...envBindings.getStore(), ...partial });
}

function getEnvBinding<K extends keyof EnvBindings>(
  key: K,
): EnvBindings[K] | undefined {
  return envBindings.getStore()?.[key];
}

/**
 * Injects the DATABASE_URL binding into the current async context.
 * Test helper — production injection goes through
 * {@link enterWithEnvBindings} in the Inngest middleware.
 */
export function setDatabaseUrl(url: string): void {
  mergeEnvBindings({ databaseUrl: url });
}

/** Clear the injected URL in the current async context — for test cleanup only. */
export function resetDatabaseUrl(): void {
  mergeEnvBindings({ databaseUrl: undefined });
}

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * Prefers the URL injected via {@link enterWithEnvBindings} (set by middleware
 * on CF Workers). Falls back to `process.env['DATABASE_URL']` so tests running
 * in Node.js keep working without middleware.
 *
 * Creates a fresh Drizzle instance with Neon pool caching disabled so Worker
 * request-bound WebSocket I/O is not reused across Inngest executions.
 */
export function getStepDatabase(): Database {
  const url = getEnvBinding('databaseUrl') ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL not available — ensure Inngest middleware provides env bindings',
    );
  }

  // Phase 0.0 (RLS plan 2026-04-27): neon-serverless WS driver — real ACID
  // transactions; onTransactionFallback is no longer needed.
  const db = createDatabase(url, { cacheNeonPool: false });
  stepDatabaseScope.getStore()?.add(db);
  return db;
}

export function getStepMemoryFactsDedupConfig(): {
  enabled: string;
  threshold: number;
  maxLlmCalls: number;
  rolloutPct: number;
} {
  return {
    enabled:
      getEnvBinding('memoryFactsDedupEnabled') ??
      process.env['MEMORY_FACTS_DEDUP_ENABLED'] ??
      'false',
    threshold: Number(
      getEnvBinding('memoryFactsDedupThreshold') ??
        process.env['MEMORY_FACTS_DEDUP_THRESHOLD'] ??
        '0.15',
    ),
    maxLlmCalls: Number(
      getEnvBinding('maxDedupLlmCallsPerSession') ??
        process.env['MAX_DEDUP_LLM_CALLS_PER_SESSION'] ??
        '10',
    ),
    rolloutPct: Number(
      getEnvBinding('memoryFactsDedupRolloutPct') ??
        process.env['MEMORY_FACTS_DEDUP_ROLLOUT_PCT'] ??
        '0',
    ),
  };
}

/**
 * Returns the Voyage API key for use within Inngest step functions.
 *
 * Prefers the key injected via {@link enterWithEnvBindings} (set by middleware
 * on CF Workers). Falls back to `process.env['VOYAGE_API_KEY']` so tests
 * running in Node.js keep working without middleware.
 */
export function getStepVoyageApiKey(): string {
  const key = getEnvBinding('voyageApiKey') ?? process.env['VOYAGE_API_KEY'];
  if (!key) {
    throw new Error(
      'VOYAGE_API_KEY not available — ensure Inngest middleware provides env bindings',
    );
  }
  return key;
}

/**
 * Returns the public app URL for use within Inngest step functions.
 *
 * Prefers the URL injected via {@link enterWithEnvBindings} (set by middleware
 * on CF Workers). Falls back to `process.env['APP_URL']` then the canonical
 * production domain.
 */
export function getStepAppUrl(): string {
  return (
    getEnvBinding('appUrl') ??
    process.env['APP_URL'] ??
    'https://www.mentomate.com'
  );
}

/**
 * Returns the Resend API key for use within Inngest step functions.
 *
 * Returns undefined if not configured — callers should degrade gracefully.
 */
export function getStepResendApiKey(): string | undefined {
  return getEnvBinding('resendApiKey') ?? process.env['RESEND_API_KEY'];
}

/**
 * Returns the EMAIL_FROM address for use within Inngest step functions.
 */
export function getStepEmailFrom(): string {
  return (
    getEnvBinding('emailFrom') ??
    process.env['EMAIL_FROM'] ??
    'noreply@mentomate.com'
  );
}

/**
 * Returns the support email address for use within Inngest step functions.
 *
 * Prefers the value injected via {@link enterWithEnvBindings} (set by
 * middleware on CF Workers). Falls back to process.env['SUPPORT_EMAIL'] then
 * the canonical default.
 */
export function getStepSupportEmail(): string {
  return (
    getEnvBinding('supportEmail') ??
    process.env['SUPPORT_EMAIL'] ??
    'support@mentomate.com'
  );
}

export function getStepRetentionPurgeEnabled(): boolean {
  return (
    (getEnvBinding('retentionPurgeEnabled') ??
      process.env['RETENTION_PURGE_ENABLED']) === 'true'
  );
}

// [R1] CLERK_SECRET_KEY is used by the scheduled-deletion job to erase the
// Clerk login identity (GDPR Art 17).
export function getStepClerkSecretKey(): string | undefined {
  return getEnvBinding('clerkSecretKey') ?? process.env['CLERK_SECRET_KEY'];
}
