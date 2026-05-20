import {
  computeAgeBracket,
  isAdultOwner,
  type AgeBracket,
  type AgeGateRole,
} from './age.js';

describe('computeAgeBracket', () => {
  it('returns child only for ages under 11 (defensive fallback; product is 11+)', () => {
    expect(computeAgeBracket(2016, 2026)).toBe('child'); // age 10
    expect(computeAgeBracket(2020, 2026)).toBe('child'); // age 6
  });

  it('returns adolescent for ages 11 to 17 inclusive', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('adolescent'); // age 11
    expect(computeAgeBracket(2014, 2026)).toBe('adolescent'); // age 12
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
    expect(computeAgeBracket(thisYear - 8)).toBe('child');
  });

  it('[CR-2026-05-19-H11] no in-product age (11-17) maps to the child bracket', () => {
    // Product is strictly 11+. 'child' must never be emitted for any real
    // learner birth year, so kid-flavored prompt framing never reaches the LLM.
    for (let age = 11; age <= 17; age++) {
      const birthYear = 2026 - age;
      expect(computeAgeBracket(birthYear, 2026)).not.toBe('child');
    }
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

describe('AgeGateRole [BUG-208] — discriminated union, not free-form string', () => {
  it('AgeGateRole is exactly the three known values', () => {
    const all: ReadonlyArray<AgeGateRole> = [
      'owner',
      'child',
      'impersonated-child',
    ];
    expect(all).toHaveLength(3);
  });

  it('exhaustive switch on AgeGateRole compiles without a default', () => {
    function label(role: AgeGateRole): string {
      switch (role) {
        case 'owner':
          return 'O';
        case 'child':
          return 'C';
        case 'impersonated-child':
          return 'I';
      }
    }
    expect(label('owner')).toBe('O');
    expect(label('child')).toBe('C');
    expect(label('impersonated-child')).toBe('I');
  });
});
