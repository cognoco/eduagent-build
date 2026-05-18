import { z } from 'zod';

// ---------------------------------------------------------------------------
// LLM Response Envelope — the single structured-output shape every LLM call
// making state-machine decisions must return.
//
// Replaces the older pattern of smuggling [MARKER] tokens and JSON blobs
// inside free-text prose. See docs/specs/2026-04-18-llm-response-envelope.md.
// ---------------------------------------------------------------------------

const privateReliedOnSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string') return [value];
    return value;
  },
  z.array(z.string().min(1).max(160)).max(12).catch([]),
);

const privateInsufficientSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}, z.boolean().optional());

const privateReasonSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).max(1000).optional());

const privateSourcesSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : undefined,
  z
    .object({
      relied_on: privateReliedOnSchema.optional(),
      insufficient: privateInsufficientSchema.optional(),
      reason: privateReasonSchema.optional(),
    })
    .optional(),
);

export const llmResponseEnvelopeSchema = z.object({
  /**
   * The text the learner actually sees. All prose lives here.
   * Nothing else is rendered — no marker, no JSON, nothing.
   */
  reply: z.string().min(1),

  /**
   * Binary / enum state-machine signals. Each signal has a single
   * interpretation. New signals are added as a new optional field rather than
   * embedded in reply text.
   */
  signals: z
    .object({
      /** Interview flow: model believes it has enough to conclude. Ignored by server if exchange < cap. */
      ready_to_finish: z.boolean().optional(),
      /** Main loop: learner response showed partial understanding — hold escalation. */
      partial_progress: z.boolean().optional(),
      /** Main loop: rung-5 exit protocol fired — queue topic for remediation. */
      needs_deepening: z.boolean().optional(),
      /** Main loop: the AI message contains an understanding check. Observational. */
      understanding_check: z.boolean().optional(),
      /** Continuation opener: delayed score for the learner's retrieval answer. */
      retrieval_score: z.number().min(0).max(1).optional(),
    })
    .optional(),

  /**
   * Presentation hints — the UI may render a widget based on these, but the
   * learner experience degrades gracefully to "just the reply" if missing.
   * None of these drive control flow on the API side.
   */
  ui_hints: z
    .object({
      note_prompt: z
        .object({
          show: z.boolean(),
          post_session: z.boolean().optional(),
        })
        .optional(),
      fluency_drill: z
        .object({
          active: z.boolean(),
          duration_s: z.number().int().min(15).max(90).optional(),
          score: z
            .object({
              correct: z.number().int().min(0),
              total: z.number().int().min(1),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),

  /**
   * Private provenance for complaint review and hallucination audits. This is
   * never rendered to the learner. Values must reference server-provided source
   * IDs from the prompt's source pack; the server cross-checks them before
   * persisting the turn.
   */
  private_sources: privateSourcesSchema.optional(),

  /**
   * Model's self-reported confidence in its decisions. If present, the UI
   * MAY surface an "Is this right?" tap target when confidence < 'high'.
   * Absent = treat as 'medium'.
   */
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});

export type LlmResponseEnvelope = z.infer<typeof llmResponseEnvelopeSchema>;
