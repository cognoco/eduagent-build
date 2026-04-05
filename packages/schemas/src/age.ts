export type AgeBracket = 'child' | 'adolescent' | 'adult';

/**
 * Computes an age bracket for consent gating, persona inference, and voice tone.
 *
 * When `birthDate` is provided, exact age is computed using month/day comparison.
 * When only `birthYear` is available, age is approximated as `currentYear - birthYear`,
 * which can overestimate by up to 11 months (±1 year tolerance). Callers that need
 * conservative safety gating (consent, minimum-age checks) should use `<=` thresholds
 * to compensate for the approximation.
 */
export function computeAgeBracket(
  birthYear: number,
  birthDateOrCurrentYear?: string | Date | number
): AgeBracket {
  let age: number;

  if (
    birthDateOrCurrentYear != null &&
    typeof birthDateOrCurrentYear !== 'number'
  ) {
    // Exact age from full birth date
    const now = new Date();
    const bd = new Date(birthDateOrCurrentYear);
    age = now.getFullYear() - bd.getFullYear();
    if (
      now.getMonth() < bd.getMonth() ||
      (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())
    ) {
      age--;
    }
  } else {
    // Year-only approximation (±1 year tolerance)
    const currentYear =
      typeof birthDateOrCurrentYear === 'number'
        ? birthDateOrCurrentYear
        : new Date().getFullYear();
    age = currentYear - birthYear;
  }

  if (age < 13) return 'child';
  if (age < 18) return 'adolescent';
  return 'adult';
}

export function birthYearFromDateLike(
  value: string | Date | null | undefined
): number | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
    if (match) {
      return Number(match[1]);
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getUTCFullYear();
}

export function birthDateFromBirthYear(birthYear: number): Date {
  return new Date(Date.UTC(birthYear, 0, 1));
}
