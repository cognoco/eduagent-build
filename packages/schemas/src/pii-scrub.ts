// ---------------------------------------------------------------------------
// Shared PII scrubber for trust-boundary payloads (W3 PII-egress bundle).
//
// Inngest persists event payloads and memoized step returns in its
// third-party event store, readable by anyone with console or vendor-support
// access for the retention window. The estate-wide discipline (identity
// foundation, W3 PII units) is: never place raw minor free-text across that
// boundary — pass an opaque reference (sessionId / event-row id) and
// rehydrate server-side from the scoped repository.
//
// This module is the canonical home of the shared scrubber used by the W3
// PII units (event payloads, memoized step state, the error/observability
// path, and the LLM-provider path). It is a *belt-and-braces* runtime
// ratchet: the primary fix is that dispatch sites no longer construct
// payloads with these fields at all. A scrub firing at runtime therefore
// signals a regression and must be escalated by the caller (see the Inngest
// client middleware in apps/api/src/inngest/client.ts), never swallowed.
// ---------------------------------------------------------------------------

/**
 * Payload keys that must never cross the Inngest trust boundary carrying
 * raw learner content.
 *
 * `learnerMessage` / `topicTitle` (WI-620): the `app/review.calibration.requested`
 * dispatch was converted to the reference-and-rehydrate pattern (it now carries
 * an opaque `learnerMessageEventId` and the consumer rehydrates from the DB
 * scoped by profileId), so these keys no longer have a legitimate carrier.
 * Listing them makes the middleware a runtime ratchet against any future
 * regression that re-introduces the raw fields.
 */
export const INNGEST_PII_PAYLOAD_KEYS: readonly string[] = [
  'sessionTranscript',
  'classifyInput',
  'transcript',
  'exchangeHistory',
  'learnerMessage',
  'topicTitle',
];

/**
 * Step-return keys that must never cross the Inngest trust boundary carrying
 * minor-PII. Memoized step returns are persisted in Inngest's third-party
 * state store just like event payloads; the offending steps now return opaque
 * references (profile/session/notice ids) and the consuming steps rehydrate
 * from the database.
 *
 * Deliberately NOT listed: `parentEmail`. consent-reminders.ts legitimately
 * memoizes `{ parentEmail, freshToken }` in its day-7/day-14 token-mint steps
 * (the mint is non-idempotent and must survive replay); converting that flow
 * is tracked as its own work item, and a denylist hit there would break
 * reminder emails. Add the key once that flow rehydrates the address.
 */
export const INNGEST_PII_STEP_KEYS: readonly string[] = [
  'childName',
  'childDisplayName',
  'childSummaries',
  'struggleLines',
  'struggleTopics',
];

/** Replacement value written over scrubbed payload fields. */
export const PII_SCRUBBED_PLACEHOLDER = '[pii-scrubbed]';

export interface ScrubPiiResult<T> {
  /** Deep copy of the input with denylisted keys replaced. */
  value: T;
  /** Dot-joined paths of every field that was scrubbed (empty = clean). */
  scrubbedPaths: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  // Plain = null prototype (Object.create(null)), Object.prototype, or a
  // cross-realm Object.prototype (whose own prototype is null). Anything
  // else (Date, Map, class instances) is passed through unwalked.
  return (
    proto === null ||
    proto === Object.prototype ||
    Object.getPrototypeOf(proto) === null
  );
}

/**
 * Deep-scrubs denylisted keys from a JSON-ish payload.
 *
 * - Pure: never mutates the input; returns a structural copy.
 * - Cycle-safe: revisiting a seen object returns the already-built copy.
 * - Non-plain objects (Date, class instances) are passed through by
 *   reference — event payloads are JSON-serialized anyway, and recursing
 *   into exotic objects risks surprising behavior.
 */
export function scrubPiiPayload<T>(
  input: T,
  keys: readonly string[] = INNGEST_PII_PAYLOAD_KEYS,
): ScrubPiiResult<T> {
  const denylist = new Set(keys);
  const scrubbedPaths: string[] = [];
  const seen = new Map<object, unknown>();

  function walk(value: unknown, path: string): unknown {
    if (Array.isArray(value)) {
      const cached = seen.get(value);
      if (cached) return cached;
      const copy: unknown[] = [];
      seen.set(value, copy);
      value.forEach((entry, index) => {
        copy.push(walk(entry, path ? `${path}.${index}` : String(index)));
      });
      return copy;
    }
    if (isPlainObject(value)) {
      const cached = seen.get(value);
      if (cached) return cached;
      const copy: Record<string, unknown> = {};
      seen.set(value, copy);
      for (const [key, entry] of Object.entries(value)) {
        const entryPath = path ? `${path}.${key}` : key;
        if (denylist.has(key) && entry !== undefined && entry !== null) {
          copy[key] = PII_SCRUBBED_PLACEHOLDER;
          scrubbedPaths.push(entryPath);
        } else {
          copy[key] = walk(entry, entryPath);
        }
      }
      return copy;
    }
    return value;
  }

  return { value: walk(input, '') as T, scrubbedPaths };
}

// ---------------------------------------------------------------------------
// Error/observability path — shape-only payload summaries.
//
// Error/observability paths must never emit raw, unvalidated payloads (which
// can carry a minor's transcript, name, or freeform input) via `logger.*` or
// `captureException` extras. On a schema-drift path the payload is by
// definition unknown, so the only safe diagnostic is its *shape* — type,
// field count — never its keys or values. Pattern lifted from
// ask-gate-observe.ts, which pioneered it. Forward-only guard:
// apps/api/src/services/pii-scrub.guard.test.ts bans `rawData: event.data`
// (and the legacy content-slice keys) from non-test API source.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shape-only summary of an arbitrary payload, safe for logs and Sentry
 * extras. Never includes keys or values from the input — only its type and,
 * for plain objects, the number of fields.
 */
export interface RawPayloadSummary {
  payloadType: string;
  fieldCount?: number;
}

export function summarizeRawPayload(rawData: unknown): RawPayloadSummary {
  if (!isRecord(rawData)) {
    return { payloadType: Array.isArray(rawData) ? 'array' : typeof rawData };
  }

  return {
    payloadType: 'object',
    fieldCount: Object.keys(rawData).length,
  };
}
