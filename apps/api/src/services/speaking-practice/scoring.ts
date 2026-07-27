// ---------------------------------------------------------------------------
// WI-1777: deterministic, server-side transcript-comparison scoring for
// repeat-after-me/shadowing speaking practice. No LLM self-grading (WI-1549
// AC2) — this is the single source of truth for both the persisted attempt
// score and the feedback the learner sees (see docs/plans/2026-07-11-wi1777-
// speaking-practice.md §4 for the design rationale).
//
// Deliberately NOT built on `tokenizeAnswerTerms`/`evaluatePendingGradedInputAnswer`
// (language-session-engine.ts) — that scorer drops terms under 4 characters,
// drops a stopword list, dedupes, and matches ASCII-only ([a-z0-9]+). Each of
// those is correct for comprehension-answer term-overlap and wrong here:
// dropping short words/stopwords deletes exactly the function words a
// beginner must reproduce verbatim ("a", "is", "el"), dedup breaks a multiset
// diff, and ASCII-only tokenization silently scores a non-Latin transcript as
// a perfect match (nothing to compare). Instead this mirrors
// SpeakingPracticeCard.tsx's `normalizeWords` (Unicode-aware `\p{L}\p{N}`,
// casefold, keep every word and every repeat).
// ---------------------------------------------------------------------------

export interface SpeakingPracticeScore {
  /** matchedCount / targetWordCount; 0 when the target has no words. */
  lexicalMatchScore: number;
  /** Target words with no remaining match in the heard-word multiset. */
  missingWords: string[];
  /** Heard words left over after consuming every target match. */
  extraWords: string[];
  isComplete: boolean;
}

// Diacritics are stripped (NFD + combining-mark strip) on both sides before
// comparing — an explicit leniency decision, not an oversight.
// expo-speech-recognition transcripts typically preserve diacritics, but a
// beginner repeat-after-me exercise should not fail a learner over an accent
// the STT normalized differently than the stored target text; this is not a
// phonetic-precision drill.
function normalizeWords(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Order-insensitive multiset diff between a target sentence and a heard
 * transcript. Word order is deliberately not checked — a reordered
 * transcript scores as a perfect match, the simplest defensible behavior for
 * a repeat-after-me exercise (this is not testing syntax).
 */
export function scoreSpeakingPracticeAttempt(
  targetText: string,
  transcript: string,
): SpeakingPracticeScore {
  const targetWords = normalizeWords(targetText);
  const heard = new Map<string, number>();
  for (const word of normalizeWords(transcript)) {
    heard.set(word, (heard.get(word) ?? 0) + 1);
  }

  const missingWords: string[] = [];
  let matched = 0;
  for (const word of targetWords) {
    const count = heard.get(word) ?? 0;
    if (count > 0) {
      heard.set(word, count - 1);
      matched += 1;
    } else {
      missingWords.push(word);
    }
  }

  const extraWords = [...heard.entries()].flatMap(([word, count]) =>
    Array<string>(count).fill(word),
  );

  return {
    lexicalMatchScore:
      targetWords.length > 0 ? matched / targetWords.length : 0,
    missingWords,
    extraWords,
    isComplete: targetWords.length > 0 && missingWords.length === 0,
  };
}
