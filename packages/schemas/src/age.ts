export type AgeBracket = 'child' | 'adolescent' | 'adult';

export function computeAgeBracket(
  birthYear: number,
  currentYear = new Date().getFullYear()
): AgeBracket {
  const age = currentYear - birthYear;

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
