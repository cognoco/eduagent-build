import { z } from 'zod';

import {
  challengeRoundSessionStateSchema,
  escalationRungSchema,
} from './sessions.ts';

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

// ---------------------------------------------------------------------------
// Stream `done` frame contract — the terminal SSE frame the mobile client
// consumes after a streamed exchange completes. Previously this payload was
// assembled from a local `interface DoneFrameSource` + `buildDoneFramePayload`
// in `apps/api/src/routes/sessions.ts` with several fields typed `unknown`,
// while the sibling `error` / `fallback` frames were already schematized here
// and `.parse()`d before emission. That left the client-facing `done` contract
// as the only stream frame with no shared Zod schema or runtime validation, so
// a field rename/shape drift could ship silently to the mobile consumer.
//
// This schema is the canonical contract for the `done` frame. The API parses
// every emitted `done` payload through it (matching the error/fallback frames),
// and the mobile `StreamDoneEvent` interface mirrors it field-for-field.
// ---------------------------------------------------------------------------

/** Fluency-drill annotation surfaced on the `done` frame for language sessions. */
export const streamFluencyDrillSchema = z.object({
  active: z.boolean(),
  durationSeconds: z.number().optional(),
  score: z
    .object({
      correct: z.number().int(),
      total: z.number().int(),
    })
    .optional(),
});
export type StreamFluencyDrill = z.infer<typeof streamFluencyDrillSchema>;

/** Server-gated Challenge Round offer pitch. Mobile never parses raw envelope JSON. */
export const streamChallengeOfferSchema = z.object({
  pitch: z.string(),
});
export type StreamChallengeOffer = z.infer<typeof streamChallengeOfferSchema>;

/** Server-validated draft (or fallback composer prompt) for a learner-owned note. */
export const streamDraftedNoteSchema = z.object({
  id: z.string(),
  body: z.string().nullable(),
  sourceAnswerEventIds: z.array(z.string()),
  fallbackPrompt: z.string().optional(),
});
export type StreamDraftedNote = z.infer<typeof streamDraftedNoteSchema>;

export const streamDoneFrameSchema = z.object({
  type: z.literal('done'),
  exchangeCount: z.number().int(),
  escalationRung: escalationRungSchema,
  /**
   * `buildDoneFramePayload` always emits this (defaulting to 0). `0` is outside
   * the 1–20 LLM-estimate range, so the schema accepts the full 0–20 span; the
   * mobile consumer treats 0 as "no estimate".
   */
  expectedResponseMinutes: z.number().int().min(0).max(20).optional(),
  aiEventId: z.string().uuid().optional(),
  notePrompt: z.boolean().optional(),
  notePromptPostSession: z.boolean().optional(),
  fluencyDrill: streamFluencyDrillSchema.optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  readyToFinish: z.boolean().optional(),
  challengeRound: challengeRoundSessionStateSchema.optional(),
  challengeOffer: streamChallengeOfferSchema.optional(),
  draftedNote: streamDraftedNoteSchema.optional(),
});
export type StreamDoneFrame = z.infer<typeof streamDoneFrameSchema>;
