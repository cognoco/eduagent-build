import {
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundSessionState,
} from '@eduagent/schemas';
import { MAX_CHALLENGE_QUESTIONS, enforceChallengeQuestionCap } from './caps';

/**
 * Challenge Round state machine.
 *
 * Pure function — given the current `ChallengeRoundSessionState` (or
 * `undefined` for "no round yet this session") and a transition event,
 * returns the next state or throws `Error` on an illegal transition.
 * No DB access, no clocks beyond `Date.now()` for `startedAt`, no Inngest
 * dispatches. Callers persist the result via `persistSessionMetadata`.
 *
 * State graph (see `docs/plans/2026-05-18-challenge-round-into-note.md`
 * Task 2 + Task 4):
 *
 *   undefined ──offer──▶ offered ──accept──▶ accepted ──start──▶ active
 *                              └─decline──▶ declined
 *   active ──answer_complete──▶ active (more questions)
 *                            └─▶ drafting (last question answered)
 *   drafting ──draft_ready──▶ drafting   (idempotent acknowledgement)
 *            └─complete──▶ complete
 *   active   ──complete──▶ complete       (early-finish path)
 *   any       ──abort──▶ aborted
 *   complete | aborted ──offer──▶ offered (new round same session — counts up)
 */

export type ChallengeStateTransition =
  | { type: 'offer'; topicId: string }
  | { type: 'accept' }
  | { type: 'decline'; dontAskAgain: boolean }
  | { type: 'start'; totalQuestions: number }
  | { type: 'answer_complete'; evaluation: ChallengeRoundEvaluationItem[] }
  | { type: 'draft_ready' }
  | { type: 'complete' }
  | { type: 'abort' };

const REOFFERABLE_STATES = new Set<ChallengeRoundSessionState['state']>([
  'complete',
  'aborted',
]);

export function transitionChallengeState(
  prev: ChallengeRoundSessionState | undefined,
  event: ChallengeStateTransition,
): ChallengeRoundSessionState | undefined {
  switch (event.type) {
    case 'offer': {
      if (prev && !REOFFERABLE_STATES.has(prev.state)) {
        throw new Error(
          `illegal challenge-round transition: cannot offer from state=${prev.state}`,
        );
      }
      return {
        state: 'offered',
        offerCount: (prev?.offerCount ?? 0) + 1,
        topicId: event.topicId,
        declinedDontAskAgain: false,
        evaluations: [],
      };
    }

    case 'accept': {
      if (prev?.state !== 'offered') {
        throw new Error(
          `illegal challenge-round transition: accept requires state=offered (got ${prev?.state ?? 'undefined'})`,
        );
      }
      return { ...prev, state: 'accepted' };
    }

    case 'decline': {
      if (prev?.state !== 'offered') {
        throw new Error(
          `illegal challenge-round transition: decline requires state=offered (got ${prev?.state ?? 'undefined'})`,
        );
      }
      return {
        ...prev,
        state: 'declined',
        declinedDontAskAgain: event.dontAskAgain,
      };
    }

    case 'start': {
      if (prev?.state !== 'accepted') {
        throw new Error(
          `illegal challenge-round transition: start requires state=accepted (got ${prev?.state ?? 'undefined'})`,
        );
      }
      return {
        ...prev,
        state: 'active',
        questionIndex: 0,
        totalQuestions: enforceChallengeQuestionCap(event.totalQuestions),
        startedAt: new Date().toISOString(),
      };
    }

    case 'answer_complete': {
      if (prev?.state !== 'active') {
        throw new Error(
          `illegal challenge-round transition: answer_complete requires state=active (got ${prev?.state ?? 'undefined'})`,
        );
      }
      const evaluations = [...prev.evaluations, ...event.evaluation];
      // [FCR-2026-05-23-L1.C1.15] questionIndex and totalQuestions are set
      // together by the `start` transition, so a live `active` state always
      // has both. If one is missing, the state was partially deserialized
      // (e.g. a metadata blob persisted before `start` wrote both fields, or a
      // truncated/legacy row). Two independent `??` fallbacks on these fields
      // can diverge — one defaults while the other is a real value — so the
      // `nextIndex >= total` terminal condition may never be reached and the
      // round loops in `active` forever. Resolve both atomically and fail
      // safe: derive a coherent (index, total) pair, clamp the total to the
      // hard cap, and guarantee the terminal condition is reachable by routing
      // a corrupt/over-cap state straight to `drafting` rather than looping.
      const total = enforceChallengeQuestionCap(
        prev.totalQuestions ?? MAX_CHALLENGE_QUESTIONS,
      );
      const currentIndex = prev.questionIndex ?? total;
      const nextIndex = currentIndex + 1;
      // A partially deserialized state where either field was absent (or the
      // index already met/exceeded the total) must terminate, not continue:
      // there is no trustworthy remaining-question count to keep asking from.
      const stateIsConsistent =
        prev.questionIndex !== undefined &&
        prev.totalQuestions !== undefined &&
        currentIndex < total;
      if (!stateIsConsistent || nextIndex >= total) {
        return {
          ...prev,
          state: 'drafting',
          totalQuestions: total,
          evaluations,
        };
      }
      return {
        ...prev,
        questionIndex: nextIndex,
        totalQuestions: total,
        evaluations,
      };
    }

    case 'draft_ready': {
      if (prev?.state !== 'drafting') {
        throw new Error(
          `illegal challenge-round transition: draft_ready requires state=drafting (got ${prev?.state ?? 'undefined'})`,
        );
      }
      return prev;
    }

    case 'complete': {
      if (prev?.state !== 'drafting' && prev?.state !== 'active') {
        throw new Error(
          `illegal challenge-round transition: complete requires state=drafting|active (got ${prev?.state ?? 'undefined'})`,
        );
      }
      return { ...prev, state: 'complete' };
    }

    case 'abort': {
      if (!prev) return undefined;
      return { ...prev, state: 'aborted' };
    }
  }
}

/**
 * T9 grader-stall terminal guard (plan 2026-06-26-challenge-round-grader-judge §T9).
 *
 * Problem: `answer_complete` only fires when `challengeRoundEvaluation.length > 0`.
 * When the grader fail-opens to `[]`, no `answer_complete` fires and `questionIndex`
 * never advances — the round stays `active` indefinitely.
 *
 * Fix: track `questionsAsked` independently (incremented every active turn a question
 * is posed, regardless of grading success). When `questionsAsked >= MAX_CHALLENGE_QUESTIONS`
 * AND `evaluations.length < questionsAsked` (some turns went ungraded), terminate
 * the round immediately rather than looping. Always terminates to `complete` so
 * mastery is never verified from incomplete grader data.
 *
 * Returns the terminal `ChallengeRoundSessionState` to persist, or `undefined`
 * when the guard does not apply. The caller is responsible for persisting.
 *
 * Satisfies AGENTS.md: "every envelope signal must have a server-side hard cap so
 * the flow terminates even if the LLM never emits the signal."
 */
export function resolveGraderStallTermination(
  current: ChallengeRoundSessionState,
): ChallengeRoundSessionState | undefined {
  if (current.state !== 'active') return undefined;
  const questionsAsked = current.questionsAsked ?? 0;
  if (questionsAsked < MAX_CHALLENGE_QUESTIONS) return undefined;
  // All questions have been asked — check for the stall condition.
  if (current.evaluations.length >= questionsAsked) return undefined;

  // Guard fires: grader stalled on ≥1 turn. Always route to `complete` (no mastery)
  // rather than `drafting` — we cannot verify mastery from incomplete grader evidence.
  return { ...current, state: 'complete' };
}
