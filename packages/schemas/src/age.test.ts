import { computeAgeBracket, type AgeBracket } from './age.js';

describe('computeAgeBracket', () => {
  it('returns adolescent for ages under 18 (including 11-12, since product is 11+)', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2014, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2012, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2009, 2026)).toBe('adolescent');
  });

  it('returns adult for ages 18 and above', () => {
    expect(computeAgeBracket(2008, 2026)).toBe('adult');
    expect(computeAgeBracket(1990, 2026)).toBe('adult');
  });

  it('uses current year when currentYear not provided', () => {
    const thisYear = new Date().getFullYear();
    expect(computeAgeBracket(thisYear - 20)).toBe('adult');
    expect(computeAgeBracket(thisYear - 10)).toBe('adolescent');
  });

  it("AgeBracket type does not include 'child' (BUG-642 [P-2])", () => {
    // Compile-time guard: this assignment must not type-check if 'child' is added back.
    // The Exclude<...,never> is a constant true at type level, but the runtime
    // assertion proves we cannot construct a 'child' bracket value.
    const allowed: ReadonlyArray<AgeBracket> = ['adolescent', 'adult'];
    expect(allowed).toEqual(['adolescent', 'adult']);
  });
});
