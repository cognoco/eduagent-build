// ---------------------------------------------------------------------------
// Sentry Error Tracking — Thin wrapper for @sentry/cloudflare
// Pure service, no Hono imports. Gracefully no-ops when DSN is missing.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/cloudflare';

export interface ErrorContext {
  userId?: string;
  profileId?: string;
  requestPath?: string;
  /** Arbitrary metadata attached as Sentry extras (e.g. sessionId, subjectId). */
  extra?: Record<string, unknown>;
  /** Sentry tags for faceted search (e.g. { surface: 'billing.kv' }). */
  tags?: Record<string, string | number | boolean>;
}

/**
 * Captures an exception in Sentry with optional user/request context.
 *
 * Safe to call even when Sentry is not configured — the SDK no-ops
 * when no DSN was provided to `withSentry()`.
 */
export function captureException(err: unknown, context?: ErrorContext): void {
  Sentry.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.profileId) {
      scope.setTag('profileId', context.profileId);
    }
    if (context?.requestPath) {
      scope.setTag('requestPath', context.requestPath);
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

/**
 * Captures a queryable Sentry message event for operational anomalies that are
 * not exceptions but still need alerting/24h volume checks.
 */
export function captureMessage(
  message: string,
  context?: ErrorContext & { level?: Sentry.SeverityLevel },
): void {
  Sentry.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.profileId) {
      scope.setTag('profileId', context.profileId);
    }
    if (context?.requestPath) {
      scope.setTag('requestPath', context.requestPath);
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureMessage(message, context?.level ?? 'info');
  });
}

/**
 * Denylist of key names known to carry learner free-text (chat messages,
 * homework content, raw/sampled LLM output that can echo learner input) or
 * other identifying data if it slips into a Sentry event's `extra`/
 * `contexts` despite call-site discipline. Call sites must never pass raw
 * learner text to `captureException`'s `extra` in the first place — this is
 * the defense-in-depth backstop `profile-scope.ts`'s documented age-gated
 * PII-scrubbing control refers to [WI-1990].
 *
 * The LLM-output-sample entries (`jsonStrSample`, `rawSnippet`,
 * `responsePreview`, `jsonStr`, `rawResponse`, `chunk`) exist because the
 * codebase's own non-Sentry `logger.warn` call sites already use these exact
 * field names for truncated raw-LLM-response slices (see
 * `services/llm/providers/*.ts`, `services/curriculum.ts`,
 * `services/session-recap.ts`, `services/llm/envelope.ts`,
 * `services/monthly-report.ts`) — if one of those patterns is ever copied
 * into a `captureException`/`captureMessage` call, this denylist makes the
 * new site safe by default rather than relying on the copy-paste being
 * caught in review.
 */
const PII_DENYLIST_KEYS = new Set([
  'rawInput',
  'name',
  'firstName',
  'lastName',
  'birthDate',
  'transcript',
  'messages',
  'content',
  'homeworkText',
  // [WI-1990 rework] LLM-response-sample fields — see class-level rationale
  // above. `jsonStrSample` was the confirmed leak (7 sibling call sites).
  'jsonStrSample',
  'rawSnippet',
  'responsePreview',
  'jsonStr',
  'rawResponse',
  'chunk',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively strips denylisted keys from `obj`, descending into nested
 * plain objects and arrays so a denylisted field is caught no matter how
 * deep it is nested inside `extra`/`contexts` (or a breadcrumb's `data`).
 */
function scrubValue(value: unknown): unknown {
  if (isPlainObject(value)) {
    return scrubKeys(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  return value;
}

function scrubKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!PII_DENYLIST_KEYS.has(key)) {
      scrubbed[key] = scrubValue(value);
    }
  }
  return scrubbed;
}

/**
 * `beforeSend` scrubber for the API's Sentry init — recursively strips
 * denylisted PII-bearing keys from `event.extra`, every `event.contexts`
 * entry, and every breadcrumb's `data` before the event leaves the process.
 * Defense-in-depth, not a substitute for call-site discipline. [WI-1990]
 */
export function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.extra) {
    event.extra = scrubKeys(event.extra);
  }
  if (event.contexts) {
    for (const [key, context] of Object.entries(event.contexts)) {
      if (context) {
        event.contexts[key] = scrubKeys(context);
      }
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) =>
      crumb.data ? { ...crumb, data: scrubKeys(crumb.data) } : crumb,
    );
  }
  return event;
}

/**
 * Adds a breadcrumb to the current Sentry scope.
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  level?: Sentry.SeverityLevel,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: level ?? 'info',
    ...(data ? { data } : {}),
  });
}
