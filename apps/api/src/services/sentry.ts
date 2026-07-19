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
 * Matches the quoted literal snippet V8 embeds in a JSON.parse SyntaxError
 * message once it recognizes the input isn't JSON, e.g.:
 *   Unexpected token 'S', "Sure! Here'sthe answer to your..." is not valid JSON
 * Older/other V8 shapes (`Unexpected token S in JSON at position 0`,
 * `Unexpected end of JSON input`) carry no quoted snippet and are left as-is
 * — only content actually embedded in quotes is redacted.
 */
const QUOTED_SNIPPET_PATTERN = /"[^"]*"/g;

/**
 * Recognizes the message shapes V8's JSON.parse throws for malformed input —
 * the surface this backstop targets. Matched on message content, not
 * `exception.type`, because a call site that already wraps the raw error
 * (`new Error('parse failed', { cause: err })`) or re-throws under a
 * different constructor still carries the same telltale phrase in `.message`.
 */
function isJsonParseSyntaxErrorMessage(value: string): boolean {
  return (
    value.includes('is not valid JSON') ||
    value.includes('Unexpected end of JSON input') ||
    (value.includes('Unexpected token') && value.includes('JSON')) ||
    value.includes('Unexpected non-whitespace character after JSON')
  );
}

/**
 * Redacts the quoted snippet (if any) out of a recognized JSON.parse
 * SyntaxError message, leaving the structural part intact for grouping.
 */
function redactJsonParseSyntaxErrorValue(value: string): string {
  return value.replace(QUOTED_SNIPPET_PATTERN, '"[redacted]"');
}

/**
 * [WI-2353] `@sentry/cloudflare`'s default `requestDataIntegration` copies
 * `event.request.headers` verbatim (see `@sentry/core`'s
 * `httpRequestToRequestData` → `headersToDict`, which lowercases every key
 * via `Headers.forEach`). The SDK only special-cases the `cookie` header
 * (withheld by `include: { cookies: false }` in `sdk.js`'s
 * `getDefaultIntegrations`, gated on `sendDefaultPii`) — `authorization` gets
 * no such treatment, so `Authorization: Bearer <jwt>` reaches Sentry
 * unredacted on every captured event during an authenticated request.
 *
 * Deletes the key rather than replacing it, and matches case-insensitively —
 * `headersToDict` always lowercases in practice, but this does not assume
 * that's the only shape a caller could construct. Scoped to
 * `event.request.headers` only; other `request` fields (url, cookies, data)
 * and every other header are left untouched.
 */
function scrubAuthorizationHeader(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'authorization') {
      delete headers[key];
    }
  }
}

/**
 * `beforeSend` scrubber for the API's Sentry init — recursively strips
 * denylisted PII-bearing keys from `event.extra`, every `event.contexts`
 * entry, and every breadcrumb's `data`; redacts any `JSON.parse`
 * SyntaxError-shaped `exception.value` (see rationale below); and strips the
 * `authorization` header from `event.request.headers` [WI-2353] before the
 * event leaves the process. Defense-in-depth, not a substitute for
 * call-site discipline. [WI-1990]
 *
 * [WI-1990 rework] `exception.type`/`exception.value` is the one Sentry
 * event surface neither the key-based `extra`/`contexts`/breadcrumb
 * scrubbing above nor `dropConsoleBreadcrumb` touches — it's not a keyed
 * field and it's not a breadcrumb. `JSON.parse(malformedText)` throws a
 * `SyntaxError` whose `.message` embeds a literal snippet of the malformed
 * text (V8: `Unexpected token 'S', "Sure! Here'sthe answer"... is not valid
 * JSON`); passing that error straight to `captureException` — as 5 sibling
 * sites did before this rework (dictation/{prepare-homework,review,
 * generate}.ts, quiz/generate-round.ts x2) — puts a slice of the LLM's raw
 * response (which routinely echoes learner homework/quiz-answer content)
 * directly into `exception.value`, unreachable by a scrubber that only
 * rewrites `extra`/`contexts`/breadcrumb `data`. Those 5 sites were fixed at
 * the source (they now synthesize a content-free `Error` carrying only a
 * length in `cause`, per `services/llm/providers/errors.ts`'s established
 * pattern — `cause` is a plain object, not an `Error`, so Sentry's default
 * `linkedErrorsIntegration` — which only chains `cause` when it's itself an
 * `Error` instance — never surfaces it). This redaction is the forward
 * guard: a future 6th site that copies the pre-fix pattern (hands the raw
 * `JSON.parse`/`schema.parse` catch error to `captureException`) is safe by
 * default. Redacting the quoted snippet, rather than dropping the whole
 * value, is also a grouping IMPROVEMENT, not a tradeoff — the raw snippet is
 * high-cardinality (every malformed response groups as a new issue); the
 * redacted structural message groups correctly.
 */
export function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request?.headers) {
    scrubAuthorizationHeader(event.request.headers);
  }
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
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exceptionValue) =>
      typeof exceptionValue.value === 'string' &&
      isJsonParseSyntaxErrorMessage(exceptionValue.value)
        ? {
            ...exceptionValue,
            value: redactJsonParseSyntaxErrorValue(exceptionValue.value),
          }
        : exceptionValue,
    );
  }
  return event;
}

/**
 * `beforeBreadcrumb` hook for the API's Sentry init — drops every breadcrumb
 * the SDK's default `consoleIntegration()` produces from `console.*` calls.
 *
 * [WI-1990 rework] `@sentry/cloudflare`'s default integrations include
 * `consoleIntegration()` (not opted into explicitly — it's on by default
 * because `index.ts`'s `Sentry.withSentry()` init does not override
 * `integrations`). It monkey-patches `console.*` and records every call as a
 * breadcrumb shaped `{ category: 'console', message: <formatted args>,
 * data: { arguments: <raw args>, logger: 'console' } }`. This app's
 * `services/logger.ts` does `console.warn(JSON.stringify(entry))`, so the
 * ENTIRE serialized structured-log entry — including any `rawSnippet`/
 * `responsePreview`/`chunk`-style raw-LLM-output field a `logger.warn` call
 * carries — lands as an opaque STRING inside `breadcrumb.message` and
 * `breadcrumb.data.arguments[0]`. `scrubSentryEvent`'s key-based denylist
 * cannot reach content buried inside a string, so the console breadcrumb is
 * a full bypass of the scrubber — the vector must be killed at the source,
 * not string-matched. Every `console.*` call anywhere in the API becomes a
 * Sentry breadcrumb by default, so this drops the entire category rather
 * than attempting to distinguish "safe" console calls from unsafe ones —
 * the app already has structured logs (`services/logger.ts`, shipped via
 * Cloudflare Workers Logpush) and Sentry events (`captureException`/
 * `captureMessage`) for observability; console breadcrumbs on top of those
 * are not load-bearing.
 */
export function dropConsoleBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  return breadcrumb.category === 'console' ? null : breadcrumb;
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
