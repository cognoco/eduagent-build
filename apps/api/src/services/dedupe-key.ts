/**
 * Shared dedupe-key encoding primitives.
 *
 * Every dedupe key (DB dedup) and email idempotency key (Resend dedup)
 * MUST use these helpers. Raw template-literal joins are banned —
 * enforced by dedupe-key-guard.test.ts.
 */

export function encodeDedupeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function encodeOptionalDedupeSegment(value?: string | null): string {
  return value == null ? 'null' : `value(${encodeDedupeSegment(value)})`;
}

export function joinDedupeKey(segments: string[], delimiter: string): string {
  return segments.join(delimiter);
}

export function buildEmailIdempotencyKey(
  ...segments: Array<string | null | undefined>
): string {
  return segments.map((s) => encodeOptionalDedupeSegment(s)).join(':');
}

/**
 * @deprecated LEGACY FORMAT ONLY — preserves the pre-PR-243 Resend
 * idempotency key format `(weekly|monthly)-{parentId}-{date}`. Segments are
 * NOT URI-encoded; keys are opaque to Resend and are never parsed back. Do not
 * use for new email types; use buildEmailIdempotencyKey() instead.
 */
export function buildLegacyEmailIdempotencyKey(
  prefix: 'weekly' | 'monthly',
  ...segments: string[]
): string {
  return joinDedupeKey([prefix, ...segments], '-');
}
