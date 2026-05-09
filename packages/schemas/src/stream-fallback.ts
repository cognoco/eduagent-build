import { z } from 'zod';

// ---------------------------------------------------------------------------
// Stream fallback contract — emitted as an SSE frame BEFORE the `done` frame
// when the LLM produced a malformed/empty/orphan-marker response that would
// otherwise dead-end the user with an empty bubble + feedback chips.
//
// Three distinct reason buckets so triage can separate LLM format drift
// (malformed_envelope) from widget-trigger-without-handler (orphan_marker)
// from LLM-refused-to-answer (empty_reply). Do NOT collapse to one reason —
// the buckets drive different remediation work (prompt tuning vs. handler
// wiring vs. eval-harness coverage).
// ---------------------------------------------------------------------------

export const exchangeFallbackReasonSchema = z.enum([
  'empty_reply',
  'malformed_envelope',
  'orphan_marker',
]);
export type ExchangeFallbackReason = z.infer<
  typeof exchangeFallbackReasonSchema
>;

export const streamFallbackFrameSchema = z.object({
  type: z.literal('fallback'),
  reason: exchangeFallbackReasonSchema,
  /** User-visible text for the reconnect-prompt bubble. Server-authored. */
  fallbackText: z.string().min(1),
});
export type StreamFallbackFrame = z.infer<typeof streamFallbackFrameSchema>;

export const streamErrorFrameSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
});
export type StreamErrorFrame = z.infer<typeof streamErrorFrameSchema>;

export const exchangeFallbackSchema = z.object({
  reason: exchangeFallbackReasonSchema,
  fallbackText: z.string().min(1),
});
export type ExchangeFallback = z.infer<typeof exchangeFallbackSchema>;
