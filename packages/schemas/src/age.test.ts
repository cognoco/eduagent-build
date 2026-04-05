import { birthYearFromDateLike, computeAgeBracket } from './age.js';

describe('computeAgeBracket', () => {
  it('returns child for ages under 13 (year-only)', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('child');
  });

  it('returns adolescent for ages 13 through 17 (year-only)', () => {
    expect(computeAgeBracket(2012, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2009, 2026)).toBe('adolescent');
  });

  it('returns adult for ages 18 and above (year-only)', () => {
    expect(computeAgeBracket(2008, 2026)).toBe('adult');
  });

  it('computes exact age from birthDate string', () => {
    // Someone born Dec 15 2013 — on Jan 1 2026 they are still 12 (child)
    // but year-only would say 2026-2013 = 13 (adolescent)
    const now = new Date();
    const thisYear = now.getFullYear();
    // Build a birthDate in the future month this year to guarantee birthday hasn't passed
    const futureMonth = now.getMonth() + 2; // 2 months from now
    if (futureMonth <= 11) {
      // Only test when we can construct a future birthday this year
      const birthDate = `${thisYear - 13}-${String(futureMonth + 1).padStart(
        2,
        '0'
      )}-15`;
      // Year-only says 13 → adolescent, but exact age is still 12 → child
      expect(computeAgeBracket(thisYear - 13, birthDate)).toBe('child');
    }
  });

  it('computes exact age from birthDate Date object', () => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const futureMonth = now.getMonth() + 2;
    if (futureMonth <= 11) {
      const birthDate = new Date(thisYear - 13, futureMonth, 15);
      expect(computeAgeBracket(thisYear - 13, birthDate)).toBe('child');
    }
  });

  it('falls back to year-only when second arg is a number', () => {
    // Passing a number uses the old currentYear behavior
    expect(computeAgeBracket(2013, 2026)).toBe('adolescent');
  });
});

describe('birthYearFromDateLike', () => {
  it('extracts the year from an ISO date string', () => {
    expect(birthYearFromDateLike('2014-06-15')).toBe(2014);
  });

  it('extracts the year from a Date instance', () => {
    expect(birthYearFromDateLike(new Date('1990-01-01T00:00:00.000Z'))).toBe(
      1990
    );
  });

  it('returns null for nullish and invalid values', () => {
    expect(birthYearFromDateLike(null)).toBeNull();
    expect(birthYearFromDateLike(undefined)).toBeNull();
    expect(birthYearFromDateLike('not-a-date')).toBeNull();
  });
});
