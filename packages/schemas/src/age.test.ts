import { computeAgeBracket, isAdultOwner, type AgeBracket } from './age.js';

describe('computeAgeBracket', () => {
  it('returns child for ages under 13', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('child'); // age 11
    expect(computeAgeBracket(2014, 2026)).toBe('child'); // age 12
  });

  it('returns adolescent for ages 13 to 17 inclusive', () => {
    expect(computeAgeBracket(2013, 2026)).toBe('adolescent'); // age 13
    expect(computeAgeBracket(2012, 2026)).toBe('adolescent'); // age 14
    expect(computeAgeBracket(2009, 2026)).toBe('adolescent'); // age 17
  });

  it('returns adult for ages 18 and above', () => {
    expect(computeAgeBracket(2008, 2026)).toBe('adult'); // age 18
    expect(computeAgeBracket(1990, 2026)).toBe('adult'); // age 36
  });

  it('uses current year when currentYear not provided', () => {
    const thisYear = new Date().getFullYear();
    expect(computeAgeBracket(thisYear - 20)).toBe('adult');
    expect(computeAgeBracket(thisYear - 15)).toBe('adolescent');
    expect(computeAgeBracket(thisYear - 10)).toBe('child');
  });

  it('AgeBracket is the three-way union (D-C4-3)', () => {
    const all: ReadonlyArray<AgeBracket> = ['child', 'adolescent', 'adult'];
    expect(all).toHaveLength(3);
    expect(all).toContain('child');
    expect(all).toContain('adolescent');
    expect(all).toContain('adult');
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
