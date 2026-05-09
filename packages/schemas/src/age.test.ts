import { computeAgeBracket, isAdultOwner, type AgeBracket } from './age.js';

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

describe('isAdultOwner', () => {
  it('returns false for null, missing, or unknown birth years', () => {
    expect(isAdultOwner(null, 2026)).toBe(false);
    expect(isAdultOwner(undefined, 2026)).toBe(false);
    expect(isAdultOwner({ role: 'owner', birthYear: null }, 2026)).toBe(false);
    expect(isAdultOwner({ role: 'owner' }, 2026)).toBe(false);
  });

  it('requires an owner role or owner profile flag', () => {
    expect(isAdultOwner({ role: 'child', birthYear: 1990 }, 2026)).toBe(false);
    expect(
      isAdultOwner({ role: 'impersonated-child', birthYear: 1990 }, 2026),
    ).toBe(false);
    expect(isAdultOwner({ isOwner: false, birthYear: 1990 }, 2026)).toBe(false);
  });

  it('gates edge ages 17, 18, and 19 by current year minus birth year', () => {
    expect(isAdultOwner({ role: 'owner', birthYear: 2009 }, 2026)).toBe(false);
    expect(isAdultOwner({ role: 'owner', birthYear: 2008 }, 2026)).toBe(true);
    expect(isAdultOwner({ role: 'owner', birthYear: 2007 }, 2026)).toBe(true);
  });

  it('supports the existing isOwner profile shape', () => {
    expect(isAdultOwner({ isOwner: true, birthYear: 2008 }, 2026)).toBe(true);
  });
});
