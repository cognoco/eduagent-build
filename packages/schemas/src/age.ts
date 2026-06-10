/**
 * WI-570 (data-model.md §2A.5): 'child' added for the 13+ v1 launch floor and
 * the future v1.1 sub-13 ungating path.
 *   - 'child'      — under 13 (sub-COPPA threshold; currently blocked by birthYearSchema)
 *   - 'adolescent' — 13–17 inclusive
 *   - 'adult'      — 18 and above
 */
export type AgeBracket = 'child' | 'adolescent' | 'adult';

/**
 * The active-profile role discriminator. Mirrors
 * `ActiveProfileRole` in apps/mobile/src/hooks/use-active-profile-role.ts —
 * kept here as the canonical type so server-side ageing logic and mobile
 * gating share a single source.
 *
 * - 'owner':              adult/parent on their OWN profile (no parent in scope)
 * - 'child':              child profile signed in directly (rare — app is 11+)
 * - 'impersonated-child': parent acting AS a child via the proxy banner
 */
export type AgeGateRole = 'owner' | 'child' | 'impersonated-child';

export interface AgeGateProfile {
  /**
   * [BUG-208] Narrowed from `string | null` to the discriminated union so
   * exhaustive `switch` / `if` checks compile-error when a new role is
   * added. `null` means "unknown / not loaded yet"; `undefined` means the
   * caller relied on the older `isOwner` flag.
   */
  role?: AgeGateRole | null;
  isOwner?: boolean | null;
  birthYear?: number | null;
}

/**
 * Computes an age bracket from birthYear for consent gating and voice selection.
 *
 * WI-570 (data-model.md §2A.5): three-way model with the v1 13+ launch floor.
 * The API boundary (birthYearSchema) enforces the 13-floor, so 'child' cannot
 * be produced by any current API call — it exists for the v1.1 sub-13 ungating
 * path and for the policy engine's age-band evaluation.
 *   - 'child'      — under 13
 *   - 'adolescent' — 13–17 inclusive
 *   - 'adult'      — 18 and above
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
