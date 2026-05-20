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

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalBooleanSchema = z.preprocess(
  nullToUndefined,
  z.boolean().optional(),
);

const optionalConfidenceSchema = z.preprocess(
  nullToUndefined,
  z.enum(['low', 'medium', 'high']).optional(),
);

const falseWhenMissingBooleanSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return false;
  return value;
}, z.boolean());

const optionalObjectInput = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;

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

// ---------------------------------------------------------------------------
// EVALUATE assessment signal — Devil's Advocate verification result (FR128-133)
// Replaces the legacy free-text trailing JSON block that violated the envelope
// contract. The LLM emits this inside signals; the learner-visible prose lives
// in `reply` only.
// ---------------------------------------------------------------------------
const evaluateAssessmentSignalSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      challenge_passed: z.preprocess(nullToUndefined, z.boolean()),
      flaw_identified: z.preprocess((value) => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }, z.string().max(1000).optional()),
      quality: z.preprocess((value) => {
        if (typeof value !== 'number') return undefined;
        return Math.max(0, Math.min(5, Math.round(value)));
      }, z.number().int().min(0).max(5).optional()),
    })
    .optional(),
);

// ---------------------------------------------------------------------------
// TEACH_BACK assessment signal — Feynman technique rubric (FR138-143)
// Replaces the legacy free-text trailing JSON block that violated the envelope
// contract.
// ---------------------------------------------------------------------------
const teachBackWeakestAreaSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined;
    const valid = ['completeness', 'accuracy', 'clarity'];
    return valid.includes(value) ? value : undefined;
  },
  z.enum(['completeness', 'accuracy', 'clarity']).optional(),
);

const teachBackScoreSchema = z.preprocess((value) => {
  if (typeof value !== 'number') return undefined;
  return Math.max(0, Math.min(5, Math.round(value)));
}, z.number().int().min(0).max(5).optional());

const teachBackAssessmentSignalSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      completeness: teachBackScoreSchema,
      accuracy: teachBackScoreSchema,
      clarity: teachBackScoreSchema,
      overall_quality: teachBackScoreSchema,
      weakest_area: teachBackWeakestAreaSchema,
      gap_identified: z.preprocess((value) => {
        if (value === null) return null;
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }, z.string().max(1000).nullable().optional()),
    })
    .optional(),
);

/**
 * Per-concept evaluation produced during a Challenge Round. The LLM scores
 * each concept the learner explained back; the server uses these to draft a
 * note from `solid` items only and to persist weak spots for the rest.
 *
 * `answerEventId` + `learnerQuote` are required so the note drafter can
 * synthesise from the learner's exact words (HIGH-6 from the Challenge Round
 * plan). The drafter MUST refuse to use any item where these are missing or
 * where the result is not `solid`.
 */
export const challengeRoundEvaluationItemSchema = z.object({
  concept: z.string().min(1).max(200),
  result: z.enum(['solid', 'partial', 'missing', 'misconception']),
  evidence: z.string().min(1).max(500),
  answerEventId: z.string().min(1).max(120),
  learnerQuote: z.string().min(1).max(500),
  correction: z.string().min(1).max(500).optional(),
});
export type ChallengeRoundEvaluationItem = z.infer<
  typeof challengeRoundEvaluationItemSchema
>;

const signalsSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      /** Interview flow: model believes it has enough to conclude. Ignored by server if exchange < cap. */
      ready_to_finish: optionalBooleanSchema,
      /** Main loop: learner response showed partial understanding — hold escalation. */
      partial_progress: optionalBooleanSchema,
      /** Main loop: rung-5 exit protocol fired — queue topic for remediation. */
      needs_deepening: optionalBooleanSchema,
      /** Main loop: the AI message contains an understanding check. Observational. */
      understanding_check: optionalBooleanSchema,
      /** Continuation opener: delayed score for the learner's retrieval answer. */
      retrieval_score: z.preprocess(
        nullToUndefined,
        z.number().min(0).max(1).optional(),
      ),
      /**
       * EVALUATE (Devil's Advocate) verification result (FR128-133).
       * Present only when the AI turn was an EVALUATE assessment turn.
       * Replaces the legacy free-text trailing JSON block.
       */
      evaluate_assessment: evaluateAssessmentSignalSchema,
      /**
       * TEACH_BACK (Feynman) rubric assessment (FR138-143).
       * Present only when the AI turn was a TEACH_BACK assessment turn.
       * Replaces the legacy free-text trailing JSON block.
       */
      teach_back_assessment: teachBackAssessmentSignalSchema,
      /** Challenge Round: model is proposing a challenge round at this turn. Server gates eligibility. */
      challenge_round_offer: optionalBooleanSchema,
      /** Challenge Round: per-concept evaluation of the learner's explanations. Drives mastery + note + weak-spot persistence. */
      challenge_round_evaluation: z
        .array(challengeRoundEvaluationItemSchema)
        .max(10)
        .optional(),
    })
    .optional(),
);

const notePromptSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      show: falseWhenMissingBooleanSchema,
      post_session: optionalBooleanSchema,
    })
    .optional(),
);

const fluencyDrillScoreSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      correct: z.number().int().min(0),
      total: z.number().int().min(1),
    })
    .optional(),
);

const fluencyDrillSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const input = value as Record<string, unknown>;
    const active = input['active'];
    const normalized: Record<string, unknown> = {
      ...input,
      active: active === null || active === undefined ? false : active,
    };

    if (normalized['score'] === null) {
      delete normalized['score'];
    }

    if (
      normalized['active'] === false &&
      normalized['score'] &&
      typeof normalized['score'] === 'object' &&
      !Array.isArray(normalized['score']) &&
      (normalized['score'] as Record<string, unknown>)['correct'] === 0 &&
      (normalized['score'] as Record<string, unknown>)['total'] === 0
    ) {
      delete normalized['score'];
    }

    if (
      normalized['duration_s'] === null ||
      (normalized['active'] === false && normalized['duration_s'] === 0)
    ) {
      delete normalized['duration_s'];
    }

    return normalized;
  },
  z
    .object({
      active: falseWhenMissingBooleanSchema,
      duration_s: z.preprocess(
        nullToUndefined,
        z.number().int().min(15).max(90).optional(),
      ),
      score: fluencyDrillScoreSchema,
    })
    .optional(),
);

const challengeRoundUiHintSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      active: falseWhenMissingBooleanSchema,
      question_index: z.preprocess(
        nullToUndefined,
        z.number().int().min(0).max(9).optional(),
      ),
      total_questions: z.preprocess(
        nullToUndefined,
        z.number().int().min(1).max(10).optional(),
      ),
    })
    .optional(),
);

const noteDraftUiHintSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      content: z.string().min(1).max(2000),
      source_concepts: z.array(z.string().min(1).max(200)).min(1).max(10),
      source_answer_event_ids: z
        .array(z.string().min(1).max(120))
        .min(1)
        .max(10),
    })
    .optional(),
);

const uiHintsSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      note_prompt: notePromptSchema,
      fluency_drill: fluencyDrillSchema,
      /** Challenge Round in-progress banner state — mobile renders question N of M. */
      challenge_round: challengeRoundUiHintSchema,
      /** Challenge Round drafted note awaiting learner save/edit/skip. */
      note_draft: noteDraftUiHintSchema,
    })
    .optional(),
);

// ---------------------------------------------------------------------------
// [BUG-213] Exhaustive "normalised" signals shape.
//
// `signalsSchema` keeps every field optional at the parse layer — the LLM
// often omits whole sections, and Zod must accept that without rejecting
// the entire envelope. But state-machine consumers want to write exhaustive
// `if`/`switch` ladders without `?.` everywhere. `NormalisedEnvelopeSignals`
// is the typed "after defaults applied" shape, and `normaliseSignals()`
// fills the gaps deterministically. Consumers that want exhaustiveness call
// `normaliseSignals(envelope.signals)` once and branch on the result; legacy
// consumers that still read `envelope.signals?.xxx` are unchanged.
// ---------------------------------------------------------------------------

export interface NormalisedEnvelopeSignals {
  /** Interview flow: model believes it has enough to conclude. */
  ready_to_finish: boolean;
  /** Main loop: learner response showed partial understanding — hold escalation. */
  partial_progress: boolean;
  /** Main loop: rung-5 exit protocol fired — queue topic for remediation. */
  needs_deepening: boolean;
  /** Main loop: the AI message contains an understanding check. Observational. */
  understanding_check: boolean;
  /** Continuation opener: delayed score for the learner's retrieval answer.
   *  null (not undefined) when not scored — distinguishes "no score yet" from
   *  "score of 0". */
  retrieval_score: number | null;
  /** Challenge Round: LLM is proposing a challenge at this turn (server gates). */
  challenge_round_offer: boolean;
  /** Challenge Round: per-concept evaluations. Empty array when not in a round. */
  challenge_round_evaluation: ChallengeRoundEvaluationItem[];
}

export function normaliseSignals(
  signals:
    | z.infer<typeof signalsSchema>
    | NormalisedEnvelopeSignals
    | undefined,
): NormalisedEnvelopeSignals {
  return {
    ready_to_finish: signals?.ready_to_finish ?? false,
    partial_progress: signals?.partial_progress ?? false,
    needs_deepening: signals?.needs_deepening ?? false,
    understanding_check: signals?.understanding_check ?? false,
    retrieval_score: signals?.retrieval_score ?? null,
    challenge_round_offer: signals?.challenge_round_offer ?? false,
    challenge_round_evaluation: signals?.challenge_round_evaluation ?? [],
  };
}

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
  signals: signalsSchema,

  /**
   * Presentation hints — the UI may render a widget based on these, but the
   * learner experience degrades gracefully to "just the reply" if missing.
   * None of these drive control flow on the API side.
   */
  ui_hints: uiHintsSchema,

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
  confidence: optionalConfidenceSchema,
});

export type LlmResponseEnvelope = z.infer<typeof llmResponseEnvelopeSchema>;
