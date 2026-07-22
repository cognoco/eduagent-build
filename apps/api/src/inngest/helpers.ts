import { AsyncLocalStorage } from 'node:async_hooks';
import {
  closeDatabase,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { isMentorNoticePushPostMvpEnabled, isNodeTestEnv } from '../config';
import { captureException } from '../services/sentry';

const stepDatabaseScope = new AsyncLocalStorage<Set<Database>>();

export async function runWithStepDatabaseScope<T>(
  callback: () => Promise<T>,
): Promise<T> {
  return stepDatabaseScope.run(new Set<Database>(), callback);
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
// Per-invocation env bindings — carried through AsyncLocalStorage, set at the
// Inngest HTTP request boundary on CF Workers, falling back to process.env for
// Node.js test environments.
//
// These were previously module-level `let` singletons assigned per invocation
// by the middleware. On Cloudflare Workers one isolate can service overlapping
// Inngest invocations, so a later assignment could overwrite the value a
// concurrent run reads in a subsequent step. AsyncLocalStorage scopes the
// bindings to the invocation's async context instead (same isolation model as
// `stepDatabaseScope` above).
// ---------------------------------------------------------------------------

/** Env values injected per invocation at the Inngest HTTP request boundary. */
export interface EnvBindings {
  databaseUrl?: string;
  voyageApiKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  appUrl?: string;
  supportEmail?: string;
  retentionPurgeEnabled?: string;
  clerkSecretKey?: string;
  stripeSecretKey?: string;
  revenueCatRestApiKey?: string;
  memoryFactsDedupEnabled?: string;
  memoryFactsDedupThreshold?: string;
  maxDedupLlmCallsPerSession?: string;
  memoryFactsDedupRolloutPct?: string;
  mentorNoticeEnabled?: string;
  mentorNoticePushPostMvpEnabled?: string;
}

function readStringBinding(
  env: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = env?.[key];
  return typeof value === 'string' ? value : undefined;
}

function isBindingRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Selects only the Worker bindings used by Inngest functions. */
export function readInngestEnvBindings(env: unknown): EnvBindings {
  const bindings = isBindingRecord(env) ? env : undefined;
  return {
    databaseUrl: readStringBinding(bindings, 'DATABASE_URL'),
    voyageApiKey: readStringBinding(bindings, 'VOYAGE_API_KEY'),
    resendApiKey: readStringBinding(bindings, 'RESEND_API_KEY'),
    emailFrom: readStringBinding(bindings, 'EMAIL_FROM'),
    appUrl: readStringBinding(bindings, 'APP_URL'),
    supportEmail: readStringBinding(bindings, 'SUPPORT_EMAIL'),
    retentionPurgeEnabled: readStringBinding(
      bindings,
      'RETENTION_PURGE_ENABLED',
    ),
    clerkSecretKey: readStringBinding(bindings, 'CLERK_SECRET_KEY'),
    stripeSecretKey: readStringBinding(bindings, 'STRIPE_SECRET_KEY'),
    revenueCatRestApiKey: readStringBinding(
      bindings,
      'REVENUECAT_REST_API_KEY',
    ),
    memoryFactsDedupEnabled: readStringBinding(
      bindings,
      'MEMORY_FACTS_DEDUP_ENABLED',
    ),
    memoryFactsDedupThreshold: readStringBinding(
      bindings,
      'MEMORY_FACTS_DEDUP_THRESHOLD',
    ),
    maxDedupLlmCallsPerSession: readStringBinding(
      bindings,
      'MAX_DEDUP_LLM_CALLS_PER_SESSION',
    ),
    memoryFactsDedupRolloutPct: readStringBinding(
      bindings,
      'MEMORY_FACTS_DEDUP_ROLLOUT_PCT',
    ),
    mentorNoticeEnabled: readStringBinding(bindings, 'MENTOR_NOTICE_ENABLED'),
    mentorNoticePushPostMvpEnabled: readStringBinding(
      bindings,
      'MENTOR_NOTICE_PUSH_POST_MVP_ENABLED',
    ),
  };
}

const envBindings = new AsyncLocalStorage<EnvBindings>();
let nodeTestDatabaseUrl: string | undefined;

/**
 * Runs one complete Inngest HTTP invocation inside request-owned env and
 * database scopes. Cloudflare Workers supports AsyncLocalStorage.run() but
 * intentionally does not implement enterWith(), so the request boundary must
 * establish both stores before the Inngest adapter starts asynchronous work.
 */
export async function runWithInngestRequestContext<T>(
  bindings: EnvBindings,
  callback: () => Promise<T>,
): Promise<T> {
  const databaseScope = new Set<Database>();
  return envBindings.run(bindings, () =>
    stepDatabaseScope.run(databaseScope, async () => {
      try {
        return await callback();
      } finally {
        await closeStepDatabases(databaseScope);
      }
    }),
  );
}

function getEnvBinding<K extends keyof EnvBindings>(
  key: K,
): EnvBindings[K] | undefined {
  return envBindings.getStore()?.[key];
}

/**
 * Emits a structured Sentry warning when a per-invocation binding is absent
 * outside the test environment. In production, absent bindings indicate that
 * the request context is not wired or the AsyncLocalStorage context was lost
 * across a step boundary — neither is an expected runtime state.
 *
 * Called by optional helpers (those that fall back to process.env or a
 * hardcoded default) when `getEnvBinding(key)` returns undefined.
 *
 * Skipped in NODE_ENV=test — tests exercise helpers directly without the
 * request wrapper and rely on process.env / hardcoded defaults.
 */
function warnMissingBinding(bindingKey: keyof EnvBindings): void {
  if (isNodeTestEnv()) return;
  captureException(
    new Error(
      `Inngest env binding absent: ${String(bindingKey)} — request context may not be wired or AsyncLocalStorage context lost`,
    ),
    {
      extra: {
        event: 'inngest.env_binding_absent',
        bindingKey: String(bindingKey),
      },
    },
  );
}

/**
 * Injects the DATABASE_URL binding into the current async context.
 * Node-test helper. Production injection is request-scoped through
 * {@link runWithInngestRequestContext}.
 */
export function setDatabaseUrl(url: string): void {
  nodeTestDatabaseUrl = url;
}

/** Clear the Node-test fallback URL. */
export function resetDatabaseUrl(): void {
  nodeTestDatabaseUrl = undefined;
}

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * Prefers the URL injected by {@link runWithInngestRequestContext} on Workers.
 * Falls back to `process.env['DATABASE_URL']` for Node.js tests.
 *
 * Creates a fresh Drizzle instance with Neon pool caching disabled so Worker
 * request-bound WebSocket I/O is not reused across Inngest executions.
 */
export function getStepDatabase(): Database {
  const url =
    getEnvBinding('databaseUrl') ??
    nodeTestDatabaseUrl ??
    process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL not available — ensure the Inngest request context provides env bindings',
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
  // Warn once per call if the primary binding bundle is absent — a missing
  // memoryFactsDedupEnabled binding is a reliable proxy for the whole
  // dedup-config bundle being unpopulated.
  if (getEnvBinding('memoryFactsDedupEnabled') === undefined) {
    warnMissingBinding('memoryFactsDedupEnabled');
  }
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
 * Prefers the key injected by {@link runWithInngestRequestContext} on Workers.
 * Falls back to `process.env['VOYAGE_API_KEY']` for Node.js tests.
 */
export function getStepVoyageApiKey(): string {
  const key = getEnvBinding('voyageApiKey') ?? process.env['VOYAGE_API_KEY'];
  if (!key) {
    throw new Error(
      'VOYAGE_API_KEY not available — ensure the Inngest request context provides env bindings',
    );
  }
  return key;
}

/**
 * Returns the public app URL for use within Inngest step functions.
 *
 * Prefers the URL injected by {@link runWithInngestRequestContext} on Workers.
 * Falls back to `process.env['APP_URL']` then the canonical production domain.
 */
export function getStepAppUrl(): string {
  const bound = getEnvBinding('appUrl');
  if (bound === undefined) {
    warnMissingBinding('appUrl');
  }
  return bound ?? process.env['APP_URL'] ?? 'https://www.mentomate.com';
}

/**
 * Returns the Resend API key for use within Inngest step functions.
 *
 * Returns undefined if not configured — callers should degrade gracefully.
 */
export function getStepResendApiKey(): string | undefined {
  const bound = getEnvBinding('resendApiKey');
  if (bound === undefined) {
    warnMissingBinding('resendApiKey');
  }
  return bound ?? process.env['RESEND_API_KEY'];
}

/**
 * Returns the EMAIL_FROM address for use within Inngest step functions.
 */
export function getStepEmailFrom(): string {
  const bound = getEnvBinding('emailFrom');
  if (bound === undefined) {
    warnMissingBinding('emailFrom');
  }
  return bound ?? process.env['EMAIL_FROM'] ?? 'noreply@mentomate.com';
}

/**
 * Returns the support email address for use within Inngest step functions.
 *
 * Prefers the value injected by {@link runWithInngestRequestContext} on
 * Workers. Falls back to process.env['SUPPORT_EMAIL'] then the canonical
 * default.
 */
export function getStepSupportEmail(): string {
  const bound = getEnvBinding('supportEmail');
  if (bound === undefined) {
    warnMissingBinding('supportEmail');
  }
  return bound ?? process.env['SUPPORT_EMAIL'] ?? 'support@mentomate.com';
}

export function getStepRetentionPurgeEnabled(): boolean {
  const bound = getEnvBinding('retentionPurgeEnabled');
  if (bound === undefined) {
    warnMissingBinding('retentionPurgeEnabled');
  }
  return (bound ?? process.env['RETENTION_PURGE_ENABLED']) === 'true';
}

export function getStepMentorNoticeEnabled(): boolean {
  const bound = getEnvBinding('mentorNoticeEnabled');
  if (bound === undefined) warnMissingBinding('mentorNoticeEnabled');
  return (bound ?? process.env['MENTOR_NOTICE_ENABLED']) === 'true';
}

/**
 * [WI-2573] THE mentor-notice push containment seam (MMT-ADR-0036 §3.1).
 *
 * Reads the dedicated MENTOR_NOTICE_PUSH_POST_MVP_ENABLED binding — never the
 * in-app MENTOR_NOTICE_ENABLED flag and never a learner notification
 * preference. Deliberately does NOT call warnMissingBinding: the binding is
 * absent by design in every MVP deployment, so a missing value is the normal
 * state, not an operational warning.
 *
 * Default-closed. The two mentor-notice nudge functions consult this before
 * any database read, event fan-out, slot reservation, notification-log write,
 * or Expo send — so with the boundary off they are structurally incapable of
 * delivery while remaining registered (and therefore reversible by flipping
 * one binding, with no redeploy of removed code).
 */
export function getStepMentorNoticePushPostMvpEnabled(): boolean {
  const bound = getEnvBinding('mentorNoticePushPostMvpEnabled');
  return isMentorNoticePushPostMvpEnabled(
    bound ?? process.env['MENTOR_NOTICE_PUSH_POST_MVP_ENABLED'],
  );
}

// [R1] CLERK_SECRET_KEY is used by the scheduled-deletion job to erase the
// Clerk login identity (GDPR Art 17).
export function getStepClerkSecretKey(): string | undefined {
  const bound = getEnvBinding('clerkSecretKey');
  if (bound === undefined) {
    warnMissingBinding('clerkSecretKey');
  }
  return bound ?? process.env['CLERK_SECRET_KEY'];
}

// [WI-885] STRIPE_SECRET_KEY is used by the subscription store teardown worker
// to cancel Stripe subscriptions after whole-org erasure commits.
export function getStepStripeSecretKey(): string | undefined {
  const bound = getEnvBinding('stripeSecretKey');
  if (bound === undefined) {
    warnMissingBinding('stripeSecretKey');
  }
  return bound ?? process.env['STRIPE_SECRET_KEY'];
}

// [WI-885] RevenueCat REST API access is used by the subscription store
// teardown worker to delete the customer/entitlement record after erasure.
export function getStepRevenueCatRestApiKey(): string | undefined {
  const bound = getEnvBinding('revenueCatRestApiKey');
  if (bound === undefined) {
    warnMissingBinding('revenueCatRestApiKey');
  }
  return bound ?? process.env['REVENUECAT_REST_API_KEY'];
}
