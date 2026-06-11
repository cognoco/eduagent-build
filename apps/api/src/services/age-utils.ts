// ---------------------------------------------------------------------------
// Age utilities — pure, no service imports
//
// Extracted from consent.ts (WI-572: break the 4-node SCC). Keeping these
// as a standalone module means family-access.ts and other callers do not
// transitively depend on the consent→notifications edge.
// ---------------------------------------------------------------------------

/**
 * Approximate age from birth year using the current UTC calendar year.
 *
 * Uses getUTCFullYear() (not getFullYear()) so the computed age is
 * independent of the host process timezone — important for tests running
 * on developer machines outside UTC and for environments that don't run in
 * UTC (Cloudflare Workers do, but this contract should not depend on that).
 */
export function calculateAge(birthYear: number): number {
  return new Date().getUTCFullYear() - birthYear;
}

/**
 * Minimum age to use the platform.
 * WI-570 (data-model.md §2A.5): v1 launch floor is 13+ (was 11+, per "Ages 6-10 Out of Scope"
 * from PRD line 386). Updated in lockstep with birthYearSchema floor in @eduagent/schemas.
 */
export const MINIMUM_AGE = 13;

/**
 * Calculates exact age from a full birth date (year, month 1-based, day) and
 * the current UTC date.
 *
 * Subtracts 1 if today is before this year's birthday — i.e., the child has
 * not yet had their birthday this calendar year.
 *
 * Month is 1-based (January = 1). When month or day are not supplied, falls
 * back to the same year-only approximation as calculateAge().
 */
export function calculateAgeFromParts(
  birthYear: number,
  birthMonth?: number,
  birthDay?: number,
): number {
  const now = new Date();
  const yearDiff = now.getUTCFullYear() - birthYear;
  if (birthMonth == null || birthDay == null) {
    return yearDiff;
  }
  // 1-based month → 0-based for Date constructor
  const birthdayThisYear = new Date(
    Date.UTC(now.getUTCFullYear(), birthMonth - 1, birthDay),
  );
  return now < birthdayThisYear ? yearDiff - 1 : yearDiff;
}
