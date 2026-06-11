// ---------------------------------------------------------------------------
// PII Scrubber — canonical home for the W3 PII-egress scrub helpers
// (identity-foundation bundle: WP-W3-pii-error-logging / -event-payloads /
// -step-state / IT-W3-pii-llm-provider).
//
// [F-018 / WI-579] Error/observability paths must never emit raw,
// unvalidated payloads (which can carry a minor's transcript, name, or
// freeform input) via `logger.*` or `captureException` extras. On a
// schema-drift path the payload is by definition unknown, so the only safe
// diagnostic is its *shape* — type, field names absent, field count — never
// its values. Pattern lifted from ask-gate-observe.ts, which pioneered it.
// Forward-only guard: pii-scrub.guard.test.ts bans `rawData: event.data`
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
export function summarizeRawPayload(rawData: unknown) {
  if (!isRecord(rawData)) {
    return { payloadType: Array.isArray(rawData) ? 'array' : typeof rawData };
  }

  return {
    payloadType: 'object',
    fieldCount: Object.keys(rawData).length,
  };
}
