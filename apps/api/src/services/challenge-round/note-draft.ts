import { MIN_LEXICAL_OVERLAP_NOTE_DRAFT } from './caps';
import {
  validateEvidenceOverlap,
  type EvidenceOverlapReason,
  type EvidenceOverlapResult,
} from '../evidence-overlap';

/**
 * Lexical-overlap guard for Challenge Round note drafts.
 *
 * Scope (HIGH-1): this guard catches *topic drift* — the LLM produced a draft
 * whose vocabulary does not overlap meaningfully with the learner's own
 * answers (e.g. switched from photosynthesis to the Krebs cycle). It does
 * NOT catch *value substitution* within shared vocabulary (e.g. swapping
 * "chloroplast" for "mitochondria") because both tokens are in the
 * learner's vocabulary and overlap stays high.
 *
 * Value-substitution defense lives upstream: callers must pass ONLY
 * `decision.solidAnswerQuotes` from `decideMasteryAndReview` — never the
 * full transcript and never partial/misconception text. The drafter must
 * also be prompted only on `solid` concepts (HIGH-6). If
 * `solidAnswerQuotes.length === 0`, do not call the drafter and do not
 * emit `ui_hints.note_draft`.
 *
 * Tokenization (MED-10): Unicode-aware word tokenization first, with a
 * character-bigram fallback when the input does not split on whitespace
 * (e.g. Japanese) or yields only a single content word. NFKC normalization
 * + lowercase + a small English stopword set. Tokens shorter than 3
 * characters are dropped to avoid trivial-token noise.
 *
 * Calibration (MED-3): the 0.4 threshold in `caps.ts` is an initial guess.
 * Plan Task 6 Step 4 calls for re-tuning after the eval harness produces
 * an overlap-ratio histogram across the drafting scenarios.
 */

export type DraftValidationReason = EvidenceOverlapReason;
export type DraftValidationResult = EvidenceOverlapResult;

/**
 * [BUG-483 / WI-1056] `validateNoteDraft` requires a `verifiedEventContents`
 * argument.  The lexical-overlap guard tokenizes the VERIFIED event content
 * (real learner text from the database, as retrieved by
 * `validateEvaluationEventIds`) instead of `solidLearnerQuotes` (the LLM's
 * paraphrase).  This closes the last-mile attack surface where the LLM could
 * supply a paraphrase that overlaps with its own draft (~1.0 overlap), making
 * the guard a no-op for value-substitution within shared vocabulary.
 *
 * Pass an empty array (`[]`) only when no verified event content is available
 * for a given concept; the guard then falls back to tokenizing
 * `solidLearnerQuotes`.  Callers in the challenge-round pipeline MUST pass
 * `verifiedEventContents` sourced from `validateEvaluationEventIds` output.
 * The parameter is now required (not optional) to force compile-time
 * enforcement at every call site (WI-1056).
 */
export function validateNoteDraft(
  draft: string,
  solidLearnerQuotes: string[],
  verifiedEventContents: string[],
): DraftValidationResult {
  // [BUG-483] Use verified event content for tokenization when available.
  // If verifiedEventContents is supplied, the guard measures overlap against
  // actual learner words from the DB — not the LLM's own paraphrase.
  const sourceForTokenization =
    verifiedEventContents != null && verifiedEventContents.length > 0
      ? verifiedEventContents
      : solidLearnerQuotes;
  return validateEvidenceOverlap(
    draft,
    sourceForTokenization.join(' '),
    MIN_LEXICAL_OVERLAP_NOTE_DRAFT,
  );
}
