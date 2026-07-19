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

function wordTokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  );
}

function tokenizePair(
  candidate: string,
  source: string,
): { candidateTokens: Set<string>; sourceTokens: Set<string> } {
  const candidateWords = wordTokens(candidate);
  const sourceWords = wordTokens(source);
  if (candidateWords.size > 1 && sourceWords.size > 1) {
    return { candidateTokens: candidateWords, sourceTokens: sourceWords };
  }
  return {
    candidateTokens: characterNgrams(candidate),
    sourceTokens: characterNgrams(source),
  };
}

export type EvidenceOverlapReason =
  | 'empty'
  | 'no_content_tokens'
  | 'low_lexical_overlap';

export interface EvidenceOverlapResult {
  ok: boolean;
  overlapRatio: number;
  reason?: EvidenceOverlapReason;
}

export function validateEvidenceOverlap(
  candidate: string,
  source: string,
  minimumRatio: number,
): EvidenceOverlapResult {
  if (!candidate.trim()) {
    return { ok: false, overlapRatio: 0, reason: 'empty' };
  }

  const { candidateTokens, sourceTokens } = tokenizePair(candidate, source);
  if (candidateTokens.size === 0) {
    return { ok: false, overlapRatio: 0, reason: 'no_content_tokens' };
  }

  let overlap = 0;
  for (const token of candidateTokens) {
    if (sourceTokens.has(token)) overlap += 1;
  }
  const overlapRatio = overlap / candidateTokens.size;
  if (overlapRatio < minimumRatio) {
    return { ok: false, overlapRatio, reason: 'low_lexical_overlap' };
  }
  return { ok: true, overlapRatio };
}
