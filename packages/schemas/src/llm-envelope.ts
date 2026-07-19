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

// Non-critical provenance must degrade gracefully:
// - the `>1 → /100` percentage-drift normalization applies to the NUMBER path
//   too (a bare `91` is coerced like the string `'91'`/'91%'), and
// - the schema terminates in `.catch(undefined)` so an irrecoverable value
//   (e.g. 250 → 2.5, or a negative) drops ONLY this field — never the whole
//   envelope, which would discard the valid reply and every state signal.
//   Mirrors sibling `privateReliedOnSchema`'s `.catch([])`.
const privateFactualConfidenceSchema = z.preprocess((value) => {
  if (typeof value === 'number') {
    return value > 1 ? value / 100 : value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/%$/, '');
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return value.trim().endsWith('%') || parsed > 1 ? parsed / 100 : parsed;
}, z.number().min(0).max(1).optional().catch(undefined));

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
      factual_confidence: privateFactualConfidenceSchema,
    })
    .optional(),
);

// ---------------------------------------------------------------------------
// Discrete evaluation outputs
//
// These are not conversational exchange envelopes: their prompts ask for a
// single JSON object that directly scores a learner artifact. They still drive
// state, so callers must validate with strict booleans/numbers instead of
// coercing stringified LLM output.
// ---------------------------------------------------------------------------

export const llmSummaryEvaluationSchema = z
  .object({
    feedback: z.string().trim().min(1).max(2000),
    hasUnderstandingGaps: z.boolean(),
    gapAreas: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    isAccepted: z.boolean(),
  })
  .strict()
  .refine(
    (evaluation) => !(evaluation.hasUnderstandingGaps && evaluation.isAccepted),
    {
      message: 'Accepted summaries cannot have understanding gaps',
      path: ['isAccepted'],
    },
  );
export type LlmSummaryEvaluation = z.infer<typeof llmSummaryEvaluationSchema>;

export const LLM_ASSESSMENT_PASS_THRESHOLD = 0.7;

export const llmAssessmentEvaluationSchema = z
  .object({
    feedback: z.string().trim().min(1).max(2000).optional(),
    reply: z.string().trim().min(1).max(2000).optional(),
    rawScore: z.number().min(0).max(1),
    qualityRating: z.number().int().min(0).max(5),
    passed: z.boolean(),
    shouldEscalateDepth: z.boolean(),
    weakAreas: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  })
  .strict()
  .refine((evaluation) => evaluation.feedback ?? evaluation.reply, {
    message: 'Assessment evaluation requires feedback or reply',
    path: ['feedback'],
  })
  .refine(
    (evaluation) => {
      return (
        evaluation.passed ===
        evaluation.rawScore >= LLM_ASSESSMENT_PASS_THRESHOLD
      );
    },
    {
      message: 'Assessment pass state must match raw score threshold',
      path: ['passed'],
    },
  );
export type LlmAssessmentEvaluation = z.infer<
  typeof llmAssessmentEvaluationSchema
>;

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
 * Verdict returned by the teach-back grader judge (WI-1155 B2 — server-side
 * fallback for the Feynman teach-back rubric).
 *
 * Mirrors `challengeRoundGraderVerdictSchema`: a server-side judge is invoked
 * when `verificationType==='teach_back'` AND the tutor model dropped
 * `signals.teach_back_assessment` (proven to happen 4/4 on the live model even
 * with mandatory-rubric prompt hardening). The four scores are REQUIRED here —
 * unlike the tutor-emitted `teachBackAssessmentSignalSchema` where every field
 * is optional — because the whole point of the fallback is to guarantee a
 * numeric rubric. This is the envelope rule's server-side hard cap: the signal
 * is produced deterministically even when the LLM never emits it.
 */
export const teachBackGraderVerdictSchema = z.object({
  completeness: z.number().int().min(0).max(5),
  accuracy: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  overall_quality: z.number().int().min(0).max(5),
  weakest_area: teachBackWeakestAreaSchema,
  // Collapsed to `.nullable()` only (no `.optional()`): the preprocess coerces
  // absent / non-string / empty → null, so the field is always present as a
  // string-or-null. Aligns with challengeRoundGraderVerdictSchema (no
  // `.nullable().optional()` field) — no AGENTS.md Known-Exception needed.
  gap_identified: z.preprocess((value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(1000).nullable()),
});
export type TeachBackGraderVerdict = z.infer<
  typeof teachBackGraderVerdictSchema
>;

/**
 * Payload for the `app/teach-back.grader_degraded` Inngest observability event
 * emitted via `safeSend` when `runTeachBackGrader` fails open. Opaque ids +
 * reason code ONLY — no learner text (same privacy rule as the challenge-round
 * grader degraded event above).
 *
 * `profileId` is required: the grader fires mid-session where a profile
 * unambiguously exists, so the account-level carve-out (events that fire
 * before any profile exists) does not apply — payloads always carry profileId.
 */
export const teachBackGraderDegradedEventSchema = z.object({
  profileId: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.string(),
  reason: z.enum(['route_error', 'no_json', 'parse_error', 'schema_invalid']),
});
export type TeachBackGraderDegradedEvent = z.infer<
  typeof teachBackGraderDegradedEventSchema
>;

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
  answerEventId: z.string().uuid(),
  learnerQuote: z.string().min(1).max(500),
  correction: z.string().min(1).max(500).optional(),
});
export type ChallengeRoundEvaluationItem = z.infer<
  typeof challengeRoundEvaluationItemSchema
>;

/**
 * Verdict returned by the challenge-round grader judge (T1 — 2026-06-26 plan).
 *
 * The grader model returns only judgment fields; the server-owned `answerEventId`
 * is injected by `runChallengeRoundGrader` after parsing so the model cannot
 * supply or fabricate it. Hence `.omit({ answerEventId: true })`.
 *
 * At least one item is required (`min(1)`) — an empty array is the exact
 * gpt-oss failure mode this grader path exists to eliminate (see memory
 * `project_gptoss_drops_challenge_eval_signal`).
 */
export const challengeRoundGraderVerdictSchema = z.object({
  items: z
    .array(challengeRoundEvaluationItemSchema.omit({ answerEventId: true }))
    .min(1)
    .max(10),
});
export type ChallengeRoundGraderVerdict = z.infer<
  typeof challengeRoundGraderVerdictSchema
>;

/**
 * Payload for the `app/challenge-round.grader_degraded` Inngest observability
 * event emitted via `safeSend` when `runChallengeRoundGrader` fails open.
 *
 * Privacy: opaque ids + a reason code ONLY — no learner text, quotes, or
 * answer content. The Inngest event store is a third-party service and must
 * never receive minor-learner content (same rule as filing retry events).
 *
 * Convention note: established Inngest event payload schemas live in
 * `inngest-events.ts`. This schema is placed in `llm-envelope.ts` because it
 * is a direct companion to the grader-verdict schema (both are defined in the
 * same T1 implementation task) and the plan explicitly co-locates them here.
 * Future grader-related event schemas should follow this file's pattern.
 */
export const challengeRoundGraderDegradedEventSchema = z.object({
  // profileId is required: the grader fires mid-session where a profile
  // unambiguously exists (WI-1155 — closed the same gap flagged on the
  // teach-back mirror). The account-level carve-out does not apply here.
  profileId: z.string(),
  sessionId: z.string().optional(),
  answerEventId: z.string().optional(),
  timestamp: z.string(),
  reason: z.enum(['route_error', 'no_json', 'parse_error', 'schema_invalid']),
});
export type ChallengeRoundGraderDegradedEvent = z.infer<
  typeof challengeRoundGraderDegradedEventSchema
>;

export const noticedGapSignalSchema = z.object({
  concept: z.string().min(1).max(200),
  correctionHint: z.string().min(1).max(500).optional(),
  answerEventId: z.string().uuid(),
  learnerQuote: z.string().min(1).max(500),
});
export type NoticedGapSignal = z.infer<typeof noticedGapSignalSchema>;

function normalizeNoticedGapDecision(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  if (input['observed'] === false) return null;
  if (input['observed'] !== true) return value;

  const { observed: _observed, ...evidence } = input;
  return evidence;
}

export const noticeRecheckSignalSchema = z.object({
  noticeId: z.string().uuid(),
  verdict: z.enum(['locked_in', 'not_yet', 'dismissed', 'deferred']),
  answerEventId: z.string().uuid(),
  learnerQuote: z.string().min(1).max(500),
});
export type NoticeRecheckSignal = z.infer<typeof noticeRecheckSignalSchema>;

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
      /**
       * Safety: the crisis-redirect rule fired this turn (learner expressed
       * distress, self-harm ideation, bullying, abuse, or another
       * safeguarding concern and the model redirected to a trusted
       * adult/helpline). Observational — drives structured safety logging
       * (H2/H7, 2026-06-05 safety audit), never flow control. The reply text
       * itself is NOT logged.
       */
      crisis_redirect: optionalBooleanSchema,
      /** Challenge Round: model is proposing a challenge round at this turn. Server gates eligibility. */
      challenge_round_offer: optionalBooleanSchema,
      /** Challenge Round: per-concept evaluation of the learner's explanations. Drives mastery + note + weak-spot persistence. */
      challenge_round_evaluation: z
        .array(challengeRoundEvaluationItemSchema)
        .max(10)
        .optional(),
      /** Homework felt moment: proposed learner-safe notice, accepted only after DB-backed evidence checks. */
      noticed_gap: z.preprocess(
        normalizeNoticedGapDecision,
        noticedGapSignalSchema.nullable().optional(),
      ),
      /** Mentor notice re-check verdict, accepted only after DB-backed evidence checks. */
      notice_recheck: noticeRecheckSignalSchema.optional(),
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

    // A 0/0 score is meaningless — no drill has been graded yet. Template-
    // following models (e.g. gpt-oss-120b) emit the response-format template's
    // `score` field even when STARTING a drill (active:true), producing
    // score:{correct:0,total:0}; total:0 then violates score.total >= 1 and
    // fails the whole envelope. Strip an all-zero score regardless of `active`
    // (was previously stripped only when active===false — WI-1823).
    if (
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

export const noteDraftUiHintSchema = z.preprocess(
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
export type ChallengeRoundNoteDraftHint = NonNullable<
  z.infer<typeof noteDraftUiHintSchema>
>;

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
  /** Safety: crisis-redirect rule fired this turn. Observational, drives safety logging only. */
  crisis_redirect: boolean;
  /** Challenge Round: LLM is proposing a challenge at this turn (server gates). */
  challenge_round_offer: boolean;
  /** Challenge Round: per-concept evaluations. Empty array when not in a round. */
  challenge_round_evaluation: ChallengeRoundEvaluationItem[];
  /** Homework felt moment proposal. Null when absent. */
  noticed_gap: NoticedGapSignal | null;
  /** Mentor notice re-check verdict. Null when absent. */
  notice_recheck: NoticeRecheckSignal | null;
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
    crisis_redirect: signals?.crisis_redirect ?? false,
    challenge_round_offer: signals?.challenge_round_offer ?? false,
    challenge_round_evaluation: signals?.challenge_round_evaluation ?? [],
    noticed_gap: signals?.noticed_gap ?? null,
    notice_recheck: signals?.notice_recheck ?? null,
  };
}

export const llmResponseEnvelopeSchema = z.object({
  /**
   * The text the learner actually sees. All prose lives here.
   * Nothing else is rendered — no marker, no JSON, nothing.
   *
   * Guards (Bug #575):
   * - max 10 000 chars — prevents multi-MB LLM regressions from persisting.
   * - no bracketed UPPERCASE tokens like [INTERVIEW_COMPLETE] — legacy marker antipattern.
   * - no JSON-blob prefix (`{` followed by `"signals"`) — envelope must never
   *   embed a nested envelope or signals dict in the reply field.
   */
  reply: z
    .string()
    .min(1)
    .max(10000)
    .refine((val) => !/\[[A-Z_]{2,}\]/.test(val), {
      message:
        'reply must not contain bracketed UPPERCASE marker tokens (e.g. [INTERVIEW_COMPLETE]). Use signals.* fields instead.',
    })
    .refine(
      (val) => {
        const trimmed = val.trimStart();
        // Reject JSON-blob that starts with { and contains "signals" key —
        // a dead giveaway that the LLM embedded the envelope inside reply.
        return !(trimmed.startsWith('{') && trimmed.includes('"signals"'));
      },
      {
        message:
          'reply must not be a JSON blob containing a "signals" key. Use the envelope top-level fields.',
      },
    ),

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
