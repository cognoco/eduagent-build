/**
 * Wagner-Fischer algorithm for Levenshtein (edit) distance.
 * Shared by API and mobile so both sides grade Guess Who the same way.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  if (n > m) {
    return levenshteinDistance(b, a);
  }

  const row = Array.from({ length: n + 1 }, (_, index) => index);

  for (let i = 1; i <= m; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;

    for (let j = 1; j <= n; j += 1) {
      const nextPrevious = row[j] ?? j;
      if (a[i - 1] === b[j - 1]) {
        row[j] = previous;
      } else {
        row[j] = 1 + Math.min(previous, nextPrevious, row[j - 1] ?? j - 1);
      }
      previous = nextPrevious;
    }
  }

  return row[n] ?? n;
}

/**
 * Fuzzy match user input against the canonical name or accepted aliases.
 * Threshold scales with the target name length.
 */
export function isGuessWhoFuzzyMatch(
  input: string,
  canonicalName: string,
  acceptedAliases: string[]
): boolean {
  const normalizedInput = input.trim().toLowerCase();
  if (!normalizedInput) return false;

  return [canonicalName, ...acceptedAliases].some((candidate) => {
    const normalizedCandidate = candidate.trim().toLowerCase();
    if (!normalizedCandidate) return false;
    if (normalizedInput === normalizedCandidate) return true;

    const maxDistance = Math.max(1, Math.floor(normalizedCandidate.length / 4));

    return (
      levenshteinDistance(normalizedInput, normalizedCandidate) <= maxDistance
    );
  });
}
