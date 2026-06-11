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
 * Deliberately NOT listed (yet): `learnerMessage` / `topicTitle`. The
 * `app/review.calibration.requested` event still legitimately carries them
 * to its consumer (`review-calibration-grade`) — that site is the same
 * leak class but sits outside the event-payload unit's audited finding set
 * and is tracked as its own work item. Add both keys here when that
 * dispatch is converted to the reference-and-rehydrate pattern.
 */
export const INNGEST_PII_PAYLOAD_KEYS: readonly string[] = [
  'sessionTranscript',
  'classifyInput',
  'transcript',
  'exchangeHistory',
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
