import { birthYearFromDateLike, computeAgeBracket } from './age';

describe('computeAgeBracket', () => {
  it('returns child for ages under 13', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('child');
  });

  it('returns adolescent for ages 13 through 17', () => {
    expect(computeAgeBracket(2012, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2009, 2026)).toBe('adolescent');
  });

  it('returns adult for ages 18 and above', () => {
    expect(computeAgeBracket(2008, 2026)).toBe('adult');
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
