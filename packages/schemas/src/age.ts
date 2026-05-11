export type AgeBracket = 'child' | 'adolescent' | 'adult';

export interface AgeGateProfile {
  role?: 'owner' | 'child' | 'impersonated-child' | string | null;
  isOwner?: boolean | null;
  birthYear?: number | null;
}

/**
 * Computes an age bracket from birthYear for voice tone and consent-copy selection.
 *
 * Thresholds: under 13 → 'child', 13–17 → 'adolescent', 18+ → 'adult'.
 *
 * Uses `currentYear - birthYear`, which can overestimate by up to 11 months.
 * Callers that need conservative safety gating (minimum-age checks) should
 * use `<=` thresholds to compensate.
 */
export function computeAgeBracket(
  birthYear: number,
  currentYear?: number,
): AgeBracket {
  const year = currentYear ?? new Date().getFullYear();
  const age = year - birthYear;

  if (age < 13) return 'child';
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
