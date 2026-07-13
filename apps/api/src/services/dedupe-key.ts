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

/**
 * Stripe idempotency key for the per-account / per-organization
 * "create customer" call. Stable so concurrent billing requests dedupe to a
 * single Stripe customer instead of orphaning a duplicate (BUG-827). Owner IDs
 * are UUIDs, so encoding is identity; the helper keeps the key construction in
 * this file as the dedupe-key guard requires.
 */
export function buildStripeCustomerCreateKey(ownerId: string): string {
  return joinDedupeKey(['customer-create', encodeDedupeSegment(ownerId)], '-');
}

/**
 * Resend idempotency key for the WI-1753 family-join store-cancel nudge. Keyed
 * on the teen alone: one nudge per teen who joined a family while still carrying
 * their own store subscription, however many times the event is retried.
 */
export function buildFamilyJoinStoreCancelKey(teenPersonId: string): string {
  return joinDedupeKey(
    ['family-join-store-cancel', encodeDedupeSegment(teenPersonId)],
    ':',
  );
}
