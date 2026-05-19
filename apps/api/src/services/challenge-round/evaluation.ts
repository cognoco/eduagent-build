import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';

/**
 * Per-answer evaluation outcomes and mastery decision for a finished
 * Challenge Round.
 *
 * Server-owned, conservative gating over structured LLM evidence
 * (HIGH-8): the LLM scores each concept as `solid|partial|missing|
 * misconception` via the envelope; this module decides what reaches the
 * note drafter, the weak-spot persistence path, and the mastery axis.
 *
 * Invariants:
 *  - An empty evaluation array → `outcome: 'invalid'` and NEVER
 *    `markMasteryVerified` (CRIT-9: `0 === 0` would otherwise pass a
 *    naive "all solid" check).
 *  - A single `partial` or `misconception` is sufficient to block
 *    `markMasteryVerified` regardless of how many concepts were solid.
 *  - `solidConcepts` / `solidAnswerQuotes` only ever contain items
 *    whose `result === 'solid'`. The note drafter must source quotes
 *    from `solidAnswerQuotes` alone — never the full transcript and
 *    never partial/misconception quotes (HIGH-6).
 *  - `reviewTargets` cover `partial` and `misconception` items only;
 *    `missing` items are not durable weak spots (no learner-emitted
 *    text to attach).
 *  - `outcome: 'reteach'` is reserved for the case where every
 *    evaluated concept is `missing` (the learner could not produce any
 *    answer at all). It does not draft a note and does not mark
 *    mastery.
 *
 * Reviewed in `docs/plans/2026-05-18-challenge-round-into-note.md`
 * (Task 5).
 */

export interface ReviewTarget {
  concept: string;
  answerEventId: string;
  misconception?: string;
  correction?: string;
  source: 'challenge_round';
}

export type MasteryOutcome = 'verified' | 'partial' | 'reteach' | 'invalid';

export interface MasteryDecision {
  outcome: MasteryOutcome;
  markMasteryVerified: boolean;
  solidConcepts: string[];
  solidAnswerQuotes: string[];
  reviewTargets: ReviewTarget[];
}

export interface EvaluationSummary {
  solid: number;
  partial: number;
  missing: number;
  misconception: number;
  total: number;
}

export function decideMasteryAndReview(
  evals: ChallengeRoundEvaluationItem[],
): MasteryDecision {
  if (evals.length === 0) {
    return {
      outcome: 'invalid',
      markMasteryVerified: false,
      solidConcepts: [],
      solidAnswerQuotes: [],
      reviewTargets: [],
    };
  }

  const solidItems = evals.filter((e) => e.result === 'solid');
  const solidConcepts = solidItems.map((e) => e.concept);
  const solidAnswerQuotes = solidItems.map((e) => e.learnerQuote);

  const hasMisconception = evals.some((e) => e.result === 'misconception');
  const hasPartial = evals.some((e) => e.result === 'partial');
  const allMissing = evals.every((e) => e.result === 'missing');

  const reviewTargets: ReviewTarget[] = evals
    .filter((e) => e.result === 'partial' || e.result === 'misconception')
    .map((e) => ({
      concept: e.concept,
      answerEventId: e.answerEventId,
      misconception: e.result === 'misconception' ? e.evidence : undefined,
      correction: e.correction,
      source: 'challenge_round' as const,
    }));

  if (allMissing) {
    return {
      outcome: 'reteach',
      markMasteryVerified: false,
      solidConcepts: [],
      solidAnswerQuotes: [],
      reviewTargets,
    };
  }

  if (solidItems.length === evals.length && !hasMisconception && !hasPartial) {
    return {
      outcome: 'verified',
      markMasteryVerified: true,
      solidConcepts,
      solidAnswerQuotes,
      reviewTargets: [],
    };
  }

  return {
    outcome: 'partial',
    markMasteryVerified: false,
    solidConcepts,
    solidAnswerQuotes,
    reviewTargets,
  };
}

export function summarizeEvaluation(
  evals: ChallengeRoundEvaluationItem[],
): EvaluationSummary {
  let solid = 0;
  let partial = 0;
  let missing = 0;
  let misconception = 0;
  for (const e of evals) {
    switch (e.result) {
      case 'solid':
        solid++;
        break;
      case 'partial':
        partial++;
        break;
      case 'missing':
        missing++;
        break;
      case 'misconception':
        misconception++;
        break;
    }
  }
  return { solid, partial, missing, misconception, total: evals.length };
}
