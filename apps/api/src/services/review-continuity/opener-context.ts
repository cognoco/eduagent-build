import { z } from 'zod';

// ---------------------------------------------------------------------------
// Review-continuity opener — assembled context
//
// The shape `buildReviewContinuityOpener` consumes. API-internal (NOT an
// @eduagent/schemas contract) but a runtime Zod schema, not a bare interface,
// because one field (`priorRetrieval.learnerAnswerVerbatim`) is learner-owned
// free text that crosses the LLM trust boundary, and a future DB assembler
// will fill this object from `retrieval_events` + `session_summaries.learnerRecap`
// + `memory_facts`. Parse-at-boundary is the repo discipline for any value an
// assembler hydrates from a table. The harness fills it from fixtures today.
//
// Spec: docs/specs/2026-06-08-memory-task-review-continuity.md (EU-1/EU-2/EU-4).
// ---------------------------------------------------------------------------

/**
 * Max characters of verbatim text the opener may carry. Above this the builder
 * truncates with an ellipsis and instructs the model to reference, not recite,
 * the rest — quoting a 400-word teach-back answer back at the learner is absurd
 * and any summarisation of it is itself an EU-1 (non-verbatim) violation.
 */
export const MAX_VERBATIM_CHARS = 240;

/** Hard cap on recap bullets carried into the prompt. A DB/assembler bug that
 *  returned hundreds of rows must not balloon the system prompt. */
export const MAX_RECAP_BULLETS = 10;

export const reviewContinuityContextSchema = z.object({
  topicTitle: z.string().min(1),
  /** False ⇒ opener MUST degrade to the generic calibration question (EU-2). */
  consentGranted: z.boolean(),
  /** Most-recent retrieval_events row for (profileId, topicId), if any. */
  priorRetrieval: z
    .object({
      /**
       * The learner's exact prior words — the ONLY string the opener may
       * quote. Attacker-controlled free text: the builder strips control
       * characters/newlines, entity-encodes it losslessly (escapeXml) so the
       * quoted words survive intact, AND truncates beyond MAX_VERBATIM_CHARS.
       */
      learnerAnswerVerbatim: z.string(),
      verdict: z.enum(['solid', 'partial', 'missing', 'misconception']),
      /** Real elapsed days since that attempt — drives the "last week" claim
       *  (EU-4). Non-negative integer: a negative/fractional value would
       *  produce a nonsensical recency clause ("roughly 3.7 days ago"). */
      daysSince: z.number().int().min(0),
    })
    .optional(),
  /**
   * Count of `solid` verdicts on this topic BEFORE the most-recent row. Lets
   * the builder avoid the recency-bias trap: a learner with a solid streak who
   * stumbled once must NOT be framed as confused (EU-4b applies to the
   * predominant signal, not a one-off). Defaults to 0.
   */
  priorSolidCount: z.number().default(0),
  /**
   * Most-recent non-null learnerRecap for this topic, if any. LLM-generated —
   * the opener may GESTURE at it but MUST NOT put quoted words in the learner's
   * mouth from it (EU-1).
   */
  recapBullets: z.array(z.string()).max(MAX_RECAP_BULLETS).optional(),
});

export type ReviewContinuityContext = z.infer<
  typeof reviewContinuityContextSchema
>;
