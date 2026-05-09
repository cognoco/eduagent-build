export type AgeBracket = 'adolescent' | 'adult';

export interface AgeGateProfile {
  role?: 'owner' | 'child' | 'impersonated-child' | string | null;
  isOwner?: boolean | null;
  birthYear?: number | null;
}

/**
 * Computes an age bracket from birthYear for voice tone selection.
 *
 * Product is 11+ only — there is no 'child' bracket. Ages below 18 collapse
 * to 'adolescent'; users below 11 should be filtered out at the consent /
 * onboarding boundary, not here.
 *
 * Uses `currentYear - birthYear`, which can overestimate by up to 11 months.
 * Callers that need conservative safety gating (minimum-age checks) should
 * use `<=` thresholds to compensate.
 *
 * @see personaFromBirthYear in apps/mobile/src/lib/profile.ts — mobile-only
 *   UI theme variant with different labels ('teen' | 'learner' | 'parent').
 *   Same thresholds, different purpose. Do not unify.
 */
export function computeAgeBracket(
  birthYear: number,
  currentYear?: number,
): AgeBracket {
  const year = currentYear ?? new Date().getFullYear();
  const age = year - birthYear;

  if (age < 18) return 'adolescent';
  return 'adult';
}

export function isAdultOwner(
  profile: AgeGateProfile | null | undefined,
  currentYear?: number,
): boolean {
  if (!profile) return false;
  if (profile.role !== undefined && profile.role !== 'owner') return false;
  if (profile.role === undefined && profile.isOwner !== true) return false;
  if (profile.birthYear == null) return false;

  const year = currentYear ?? new Date().getFullYear();
  return year - profile.birthYear >= 18;
}
