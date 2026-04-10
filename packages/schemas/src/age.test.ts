import { computeAgeBracket } from './age.js';

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

  it('uses current year when currentYear not provided', () => {
    const thisYear = new Date().getFullYear();
    expect(computeAgeBracket(thisYear - 20)).toBe('adult');
    expect(computeAgeBracket(thisYear - 10)).toBe('child');
  });
});
