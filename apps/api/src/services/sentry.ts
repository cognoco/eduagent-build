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
 * Matches any double-quoted substring in a free-text Sentry message field.
 * Originally scoped to the literal snippet V8 embeds in a JSON.parse
 * SyntaxError message (e.g. `Unexpected token 'S', "Sure! Here'sthe answer to
 * your..." is not valid JSON`) — [WI-2339 Gate-2 rework] generalized to
 * `event.message` and every `event.exception.values[].value`, per AC-1's
 * requirement to scrub/denylist PII from those two channels. A quoted
 * substring is the highest-risk shape for carrying arbitrary free text
 * (a value, a field, an echoed input) in an otherwise-structural error
 * message; the structural, unquoted part of the message (needed for Sentry
 * issue grouping) is left intact. Single-quoted fragments (e.g. `reading
 * 'foo'`, common in TypeError messages) are NOT matched — those are
 * near-universally property/variable names, not free text, and leaving them
 * intact preserves debuggability for the overwhelming majority of ordinary
 * exceptions.
 */
const QUOTED_SNIPPET_PATTERN = /"[^"]*"/g;

/**
 * Redacts every double-quoted substring in `value`, leaving the structural
 * (unquoted) part of the message intact for Sentry issue grouping. Used for
 * `event.message` and every `event.exception.values[].value` — see
 * `QUOTED_SNIPPET_PATTERN`'s doc comment for the shape/rationale.
 */
function redactQuotedSnippets(value: string): string {
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

/** Marker substituted for a stripped query string / URL query segment. */
const STRIPPED_QUERY_MARKER = '[stripped]';

/**
 * [WI-2339] `@sentry/cloudflare`'s default `requestDataIntegration` copies
 * `event.request.query_string` and the full `event.request.url` (query
 * string included) verbatim — `include.query_string` defaults to `true` and
 * is independent of `sendDefaultPii` (unlike cookies), so it is not covered
 * by the WI-2353 auth-header fix or by `sendDefaultPii: false`. Verified
 * empirically against this repo's real `Sentry.withSentry` pipeline
 * (`@sentry/cloudflare@10.39.0`): a request to `/throws?token=SECRET-abc123`
 * ships `request.query_string: "token=SECRET-abc123&foo=bar"` and the same
 * literal in `request.url` unless scrubbed here.
 *
 * No GET route in this API currently carries free-text or secret query
 * params (see the WI's Risk/Impact note) — this is a forward guard, not a
 * live-leak fix. Wholesale-stripping the query string (rather than
 * pattern-matching known-bad param names, as `.agents/skills/tech/
 * sentry-scrubbing/SKILL.md`'s `stripUrlSecrets` example does) is the
 * allowlist-shaped choice AC5 asks for: a denylist of param names misses the
 * next one added; dropping the whole query string is safe by default and
 * loses nothing since no query param carries diagnostic value today.
 */
function stripQueryString(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1
    ? url
    : `${url.slice(0, queryIndex)}?${STRIPPED_QUERY_MARKER}`;
}

/** Marker substituted for a stripped request body. */
const STRIPPED_BODY_MARKER = '[stripped]';

/**
 * Strips `event.request.query_string`, the query segment of
 * `event.request.url`, and `event.request.data` (the request body) —
 * `.agents/skills/tech/sentry-scrubbing/SKILL.md`'s review checklist
 * requires `beforeSend` to strip request bodies unconditionally ("Is there a
 * `beforeSend` that strips request query strings, `authorization`/`cookie`
 * headers, and **bodies**?"), with no carve-out for "when the body happens
 * to be a plain object with no denylisted keys." Not currently populated by
 * this SDK/runtime for any request shape (see [WI-2339] Risk/Impact) — this
 * is a forward guard, not a live-leak fix.
 *
 * [WI-2339 Gate-2 rework #2] The FIRST rework denylist-scrubbed a plain-
 * object body (reusing the `extra`/`contexts`/breadcrumb-`data` mechanism)
 * and only wholesale-stripped non-object bodies. Gate-2 correctly flagged
 * that this leaves any field NOT on `PII_DENYLIST_KEYS` (the reviewer's
 * repro: a `homeworkAnswer` field) surviving inside an object body — the
 * denylist is a curated list of KNOWN-bad keys, not a guarantee that every
 * field of an arbitrary request body is safe, and SKILL.md's checklist asks
 * for the body to be stripped, not selectively filtered. `event.request.data`
 * is now wholesale-stripped for EVERY truthy shape, object included — no
 * shape-based branching. (This intentionally differs from `event.extra`/
 * `event.contexts`, which stay denylist-scrubbed: those are populated by
 * THIS repo's own `captureException`/`captureMessage` call sites, whose
 * key shapes are known and curated; `event.request.data` is an arbitrary
 * request body whose shape this scrubber has no visibility into.)
 *
 * [Gate-2 fix] `query_string` is typed by the SDK as `string |
 * Record<string, unknown> | Array<[string, string]>` — a `typeof ===
 * 'string'` guard would silently no-op (PII passes through unscrubbed) for
 * the object/array forms, exactly the future-shape this is meant to
 * pre-empt. Strip wholesale on any truthy value regardless of type, rather
 * than trying to parse/preserve the object/array forms — this matches the
 * function's own stated allowlist-shaped intent (nothing kept, so nothing
 * missed next quarter).
 *
 * Mutates `request` in place (mirrors `scrubAuthorizationHeader` above and
 * the `event.extra`/`event.contexts` handling in `scrubSentryEvent` below);
 * `scrubBreadcrumbUrl` returns a new object instead because it runs inside
 * the breadcrumb `.map()`, which is already building a new array.
 */
function scrubRequestUrlFields(
  request: NonNullable<Sentry.ErrorEvent['request']>,
): void {
  if (request.query_string) {
    request.query_string = STRIPPED_QUERY_MARKER;
  }
  if (typeof request.url === 'string') {
    request.url = stripQueryString(request.url);
  }
  if (request.data) {
    request.data = STRIPPED_BODY_MARKER;
  }
}

/**
 * [WI-2339] The `Fetch` integration (active by default on
 * `@sentry/cloudflare`) records outbound `fetch()` calls as breadcrumbs
 * whose `data.url` carries the full request URL, query string included —
 * the same leak vector as `event.request.url` above, but keyed under `url`
 * rather than caught by `PII_DENYLIST_KEYS` (the key itself, `url`, is
 * legitimate breadcrumb data; only the query segment is the risk). Applied
 * after the key-based `scrubKeys` pass in `scrubSentryEvent`'s breadcrumb
 * map so a denylisted key nested under `data.url`'s sibling fields is still
 * caught by the existing mechanism.
 */
function scrubBreadcrumbUrl(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof data.url === 'string') {
    return { ...data, url: stripQueryString(data.url) };
  }
  return data;
}

/**
 * `beforeSend`/`beforeSendTransaction` scrubber for the API's Sentry init —
 * recursively strips denylisted PII-bearing keys from `event.extra`, every
 * `event.contexts` entry, and every breadcrumb's `data`; redacts quoted
 * substrings from `event.message` and every `event.exception.values[].value`
 * (see `QUOTED_SNIPPET_PATTERN`'s doc comment); strips the `authorization`
 * header from `event.request.headers` [WI-2353]; and [WI-2339] strips
 * `event.request.query_string`, the query segment of `event.request.url`,
 * `event.request.data` (wholesale-stripped for every shape — see
 * `scrubRequestUrlFields`'s doc comment for why this isn't denylist-scrubbed
 * like `extra`/`contexts`), and the query segment of any breadcrumb's
 * `data.url` before the event leaves the process. Defense-in-depth, not a
 * substitute for call-site discipline. [WI-1990]
 *
 * [WI-2353 rework] Wired to BOTH `beforeSend` (error events) AND
 * `beforeSendTransaction` (sampled transaction events) in
 * apps/api/src/index.ts — `requestDataIntegration` attaches the same
 * `request.headers` to transaction events whenever `tracesSampleRate` is
 * non-zero, so `beforeSend` alone leaves the Authorization header
 * unredacted on every sampled transaction. Accepts `Sentry.Event` (the base
 * type both `ErrorEvent` and `TransactionEvent` extend) rather than
 * `Sentry.ErrorEvent` specifically, since every field this function reads
 * or writes (`request`, `extra`, `contexts`, `breadcrumbs`, `exception`,
 * `message`) is declared on the shared base, not on the error-only
 * `type: undefined` discriminant.
 *
 * [WI-1990 rework; WI-2339 Gate-2 rework generalizes scope] `event.message`
 * and `exception.type`/`exception.value` are the two Sentry event surfaces
 * neither the key-based `extra`/`contexts`/breadcrumb scrubbing above nor
 * `dropConsoleBreadcrumb` touches — neither is a keyed field, and neither is
 * a breadcrumb. `event.message` is the raw string passed to
 * `captureMessage()` (all current call sites use static templates — verified
 * — but AC-1 requires the scrubber itself to cover this channel as a forward
 * guard, not rely on that call-site discipline). `JSON.parse(malformedText)`
 * throws a `SyntaxError` whose `.message` embeds a literal snippet of the
 * malformed text (V8: `Unexpected token 'S', "Sure! Here'sthe answer"... is
 * not valid JSON`); passing that error straight to `captureException` — as 5
 * sibling sites did before the original WI-1990 rework (dictation/{prepare-
 * homework,review,generate}.ts, quiz/generate-round.ts x2) — puts a slice of
 * the LLM's raw response (which routinely echoes learner homework/quiz-
 * answer content) directly into `exception.value`, unreachable by a scrubber
 * that only rewrites `extra`/`contexts`/breadcrumb `data`. Those 5 sites were
 * fixed at the source (they now synthesize a content-free `Error` carrying
 * only a length in `cause`, per `services/llm/providers/errors.ts`'s
 * established pattern). The ORIGINAL fix scoped the redaction to only the
 * JSON.parse-SyntaxError message shape; Gate-2 review on WI-2339 correctly
 * flagged that AC-1 requires general `exception.value` coverage, not just
 * that one shape — a future exception type whose `.message` embeds free text
 * (not necessarily JSON.parse-shaped) was still an unredacted gap. Every
 * string `exception.value` (and `event.message`) is now redacted via
 * `redactQuotedSnippets` unconditionally, which is a strict generalization of
 * the prior gate (the JSON.parse case still redacts identically; every other
 * shape now also gets its quoted substrings redacted). Redacting quoted
 * substrings rather than dropping the whole value is also a grouping
 * IMPROVEMENT, not a tradeoff — free-text content is high-cardinality (every
 * distinct value groups as a new issue); the redacted structural message
 * groups correctly.
 *
 * [AC-1 amended 2026-07-20, pm:claude:mentomate ruling] A second Gate-2
 * bounce demanded WHOLESALE-redacting all free text in `event.message`/
 * `exception.value` — rejected by PM: it exceeds `.agents/skills/tech/
 * sentry-scrubbing/SKILL.md`'s own authority (that doc doesn't name
 * message/exception as free-text-redaction targets at all — it prescribes
 * a `beforeSend` → `null` CLASS-drop for "known-noisy or sensitive paths",
 * not per-value redaction) and would gut observability for a channel this
 * WI's own Risk/Impact rates INERT. Amended AC-1 requires: (a) the
 * denylist/targeted-redaction backstop above stays as-is (already
 * conformant — the quoted-substring redaction is targeted, not wholesale),
 * and (b) `beforeSend` → `null` class-dropping for any KNOWN-sensitive event
 * class, grounded in actual analysis rather than invented. Analysis: no
 * known-sensitive event class exists at the `beforeSend` (whole-event)
 * level today. The one identified class-level bypass — `console.*` calls
 * turning into breadcrumbs carrying raw structured-log strings — is ALREADY
 * dropped via `beforeBreadcrumb` → `null` (`dropConsoleBreadcrumb` below);
 * that's the `beforeBreadcrumb`-level instance of the same SKILL.md pattern.
 * No `captureException`/`captureMessage` call site in this API is known to
 * emit a whole EVENT class that should never reach Sentry at all (as
 * opposed to a field within an event that needs scrubbing, which the
 * denylist/redaction backstops above already cover) — grounding a
 * `beforeSend` → `null` drop here would mean inventing a class that
 * doesn't exist. If a genuinely sensitive event class is identified in the
 * future (e.g. a specific error type that should never be reported), add a
 * targeted `return null` branch for it here, following
 * `dropConsoleBreadcrumb`'s pattern.
 */
export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request?.headers) {
    scrubAuthorizationHeader(event.request.headers);
  }
  if (event.request) {
    scrubRequestUrlFields(event.request);
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
      crumb.data
        ? { ...crumb, data: scrubBreadcrumbUrl(scrubKeys(crumb.data)) }
        : crumb,
    );
  }
  if (typeof event.message === 'string') {
    event.message = redactQuotedSnippets(event.message);
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exceptionValue) =>
      typeof exceptionValue.value === 'string'
        ? {
            ...exceptionValue,
            value: redactQuotedSnippets(exceptionValue.value),
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
