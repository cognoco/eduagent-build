/**
 * Challenge Round caps and constants used by both the state machine and the
 * note drafter. Keep all hard caps in one place so the trigger evaluator,
 * state-machine helpers, prompt builders, and tests refer to the same values.
 *
 * The drafter-side overlap threshold `MIN_LEXICAL_OVERLAP_NOTE_DRAFT` is
 * intentionally exported here rather than inside `note-draft.ts` so the value
 * is visible to caps-tests and any future calibration script.
 *
 * Source: `docs/plans/2026-05-18-challenge-round-into-note.md` Task 4 + MED-3.
 */

export const MAX_CHALLENGE_QUESTIONS = 3;
export const MAX_CHALLENGE_ANSWER_CHARS = 2000;
export const CHALLENGE_OFFER_COOLDOWN_HOURS = 24;
export const MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4;

export function enforceChallengeQuestionCap(requested: number): number {
  if (requested < 1) return 1;
  if (requested > MAX_CHALLENGE_QUESTIONS) return MAX_CHALLENGE_QUESTIONS;
  return requested;
}
