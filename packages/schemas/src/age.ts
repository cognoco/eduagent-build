export type AgeBracket = 'child' | 'adolescent' | 'adult';

/**
 * Computes an age bracket from birthYear for consent gating and voice tone.
 *
 * Uses `currentYear - birthYear`, which can overestimate by up to 11 months.
 * Callers that need conservative safety gating (consent, minimum-age checks)
 * should use `<=` thresholds to compensate.
 *
 * @see personaFromBirthYear in apps/mobile/src/lib/profile.ts — mobile-only
 *   UI theme variant with different labels ('teen' | 'learner' | 'parent').
 *   Same thresholds, different purpose. Do not unify.
 */
export function computeAgeBracket(
  birthYear: number,
  currentYear?: number
): AgeBracket {
  const year = currentYear ?? new Date().getFullYear();
  const age = year - birthYear;

  if (age < 13) return 'child';
  if (age < 18) return 'adolescent';
  return 'adult';
}
