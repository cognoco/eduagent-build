/**
 * Unbiased Fisher-Yates shuffle.
 *
 * Do NOT use `arr.sort(() => Math.random() - 0.5)` — the comparator returns
 * non-transitive values which violates the sort contract and produces
 * biased distributions. For quiz distractor selection this would cause the
 * same "hard" cities to surface disproportionately often.
 *
 * Returns a new array; does not mutate the input.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}
