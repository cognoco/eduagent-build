import { MIN_LEXICAL_OVERLAP_NOTE_DRAFT } from './caps';

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

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'as',
  'by',
  'at',
  'it',
  'its',
  'this',
  'that',
  'be',
  'was',
  'were',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'i',
  'you',
  'they',
  'we',
  'he',
  'she',
]);

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

function characterNgrams(text: string, n = 2): Set<string> {
  const chars = Array.from(normalize(text).replace(/[^\p{L}\p{N}]/gu, ''));
  const grams = new Set<string>();
  for (let i = 0; i <= chars.length - n; i += 1) {
    grams.add(chars.slice(i, i + n).join(''));
  }
  return grams;
}

function tokenize(text: string): Set<string> {
  const wordTokens = new Set(
    normalize(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
  return wordTokens.size > 1 ? wordTokens : characterNgrams(text);
}

export type DraftValidationReason =
  | 'empty'
  | 'no_content_tokens'
  | 'low_lexical_overlap';

export interface DraftValidationResult {
  ok: boolean;
  overlapRatio: number;
  reason?: DraftValidationReason;
}

export function validateNoteDraft(
  draft: string,
  solidLearnerQuotes: string[],
): DraftValidationResult {
  if (!draft.trim()) {
    return { ok: false, overlapRatio: 0, reason: 'empty' };
  }
  const draftTokens = tokenize(draft);
  if (draftTokens.size === 0) {
    return { ok: false, overlapRatio: 0, reason: 'no_content_tokens' };
  }
  const learnerTokens = tokenize(solidLearnerQuotes.join(' '));

  let overlap = 0;
  for (const tok of draftTokens) {
    if (learnerTokens.has(tok)) overlap += 1;
  }
  const ratio = overlap / draftTokens.size;
  if (ratio < MIN_LEXICAL_OVERLAP_NOTE_DRAFT) {
    return { ok: false, overlapRatio: ratio, reason: 'low_lexical_overlap' };
  }
  return { ok: true, overlapRatio: ratio };
}
