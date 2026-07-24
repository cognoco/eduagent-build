import { eq, and, inArray } from 'drizzle-orm';
import {
  sessionEvents,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
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
 *  - Verified mastery requires at least two genuinely non-equivalent probes.
 *    Equivalent paraphrases cannot manufacture breadth from repeated evidence.
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

export type MasteryOutcome =
  | 'verified'
  | 'partial'
  | 'reteach'
  | 'insufficient_breadth'
  | 'invalid';

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

const REQUIRED_DISTINCT_PROBES = 2;

function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function questionsAreEquivalent(
  left: ChallengeRoundEvaluationItem,
  right: ChallengeRoundEvaluationItem,
): boolean {
  const leftIdentity = left.questionIdentity;
  const rightIdentity = right.questionIdentity;
  if (!leftIdentity || !rightIdentity) return false;

  if (
    normalizeIdentityPart(leftIdentity.questionText) ===
    normalizeIdentityPart(rightIdentity.questionText)
  ) {
    return true;
  }

  return (
    normalizeIdentityPart(leftIdentity.minimalLearningClaim) ===
      normalizeIdentityPart(rightIdentity.minimalLearningClaim) &&
    leftIdentity.cognitiveOperation === rightIdentity.cognitiveOperation &&
    normalizeIdentityPart(leftIdentity.materialContext) ===
      normalizeIdentityPart(rightIdentity.materialContext)
  );
}

function countDistinctProbes(evals: ChallengeRoundEvaluationItem[]): number {
  const identified = evals.filter((evaluation) => evaluation.questionIdentity);
  const visited = new Set<number>();
  let classCount = 0;

  for (let index = 0; index < identified.length; index += 1) {
    if (visited.has(index)) continue;
    classCount += 1;
    visited.add(index);

    const pending = [index];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (let candidate = 0; candidate < identified.length; candidate += 1) {
        if (
          !visited.has(candidate) &&
          questionsAreEquivalent(identified[current]!, identified[candidate]!)
        ) {
          visited.add(candidate);
          pending.push(candidate);
        }
      }
    }
  }

  return classCount;
}

/**
 * [#477] Validate that every `answerEventId` in the LLM-produced evaluation
 * items belongs to this session, is owned by this profile, and has
 * `eventType = 'user_message'`.  Returns a validated copy where
 * `learnerQuote` is replaced with the actual event `content` so that
 * `validateNoteDraft` operates against real learner text, not LLM-supplied
 * text.
 *
 * Strict mode: if ANY item fails the check, the whole evaluation is rejected
 * and an error is thrown.  Callers MUST treat a thrown error as
 * `outcome: 'invalid'` and MUST NOT mark mastery.
 *
 * Uses `createScopedRepository(profileId)` so the DB query is automatically
 * scoped to the owner — cross-profile reads cannot succeed even on a buggy
 * call.
 */
export async function validateEvaluationEventIds(
  db: Database,
  profileId: string,
  sessionId: string,
  evals: ChallengeRoundEvaluationItem[],
): Promise<ChallengeRoundEvaluationItem[]> {
  if (evals.length === 0) return [];

  const ids = evals.map((e) => e.answerEventId);
  const repo = createScopedRepository(db, profileId);

  // Fetch all candidate rows in one query, already scoped by profileId.
  const rows = await repo.sessionEvents.findMany(
    and(
      inArray(sessionEvents.id, ids),
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.eventType, 'user_message'),
    ),
  );

  const rowMap = new Map<string, string>(rows.map((r) => [r.id, r.content]));

  // Strict: every id must resolve — a missing or mismatched id is a rejection.
  const missing = ids.filter((id) => !rowMap.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[#477] challenge_round_evaluation rejected: ${missing.length} answerEventId(s) not found in session ${sessionId} for profileId ${profileId}: ${missing.join(', ')}`,
    );
  }

  // Replace learnerQuote with the verified event content.
  return evals.map((e) => {
    const learnerQuote = rowMap.get(e.answerEventId);
    if (learnerQuote === undefined) {
      throw new Error(
        `[#477] challenge_round_evaluation rejected: answerEventId ${e.answerEventId} not found in session ${sessionId} for profileId ${profileId}`,
      );
    }

    return {
      ...e,
      learnerQuote,
    };
  });
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
    if (countDistinctProbes(solidItems) < REQUIRED_DISTINCT_PROBES) {
      return {
        outcome: 'insufficient_breadth',
        markMasteryVerified: false,
        solidConcepts,
        solidAnswerQuotes,
        reviewTargets: [],
      };
    }

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
