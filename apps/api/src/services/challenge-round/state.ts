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
      const nextIndex = (prev.questionIndex ?? 0) + 1;
      const total = prev.totalQuestions ?? MAX_CHALLENGE_QUESTIONS;
      if (nextIndex >= total) {
        return { ...prev, state: 'drafting', evaluations };
      }
      return { ...prev, questionIndex: nextIndex, evaluations };
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
