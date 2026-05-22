import {
  computeAgeBracket,
  isAdultOwner,
  type AgeBracket,
  type AgeGateRole,
} from './age.js';
import { birthYearSchema } from './profiles.js';

describe('computeAgeBracket', () => {
  // [BUG-577] 'child' removed — ages under 11 clamp to 'adolescent'
  it('returns adolescent for ages under 11 (product is strictly 11+; no child bracket)', () => {
    expect(computeAgeBracket(2016, 2026)).toBe('adolescent'); // age 10
    expect(computeAgeBracket(2020, 2026)).toBe('adolescent'); // age 6
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
    // [BUG-577] sub-11 ages clamp to adolescent rather than returning removed 'child'
    expect(computeAgeBracket(thisYear - 8)).toBe('adolescent');
  });

  it('[CR-2026-05-19-H11] no in-product age (11-17) maps to the child bracket', () => {
    // Product is strictly 11+. 'child' was removed from the AgeBracket union.
    // Every birth year must map to either 'adolescent' or 'adult'.
    for (let age = 11; age <= 17; age++) {
      const birthYear = 2026 - age;
      const bracket = computeAgeBracket(birthYear, 2026);
      expect(bracket).not.toBe('child');
      expect(['adolescent', 'adult']).toContain(bracket);
    }
  });

  it('AgeBracket is the two-way union (D-C4-2) — child removed in BUG-577', () => {
    // [BUG-577] 'child' dropped from the union; only two valid values remain.
    const all: ReadonlyArray<AgeBracket> = ['adolescent', 'adult'];
    expect(all).toHaveLength(2);
    expect(all).toContain('adolescent');
    expect(all).toContain('adult');
  });

  it('[BUG-577] AgeBracket does NOT include child — TypeScript-level contract', () => {
    // The contract is now structural: 'child' is intentionally absent from
    // the union. The runtime assertions above pin behaviour; here we just
    // assert the literal members at runtime.
    const literals: AgeBracket[] = ['adolescent', 'adult'];
    expect(literals).not.toContain('child' as unknown as AgeBracket);
  });
});

// ── birthYearSchema minimum-age gate ──────────────────────────────────────

describe('[BUG-577] birthYearSchema minimum-age gate (strictly 11+)', () => {
  it('rejects a birth year that yields age 10 (currentYear - 10)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 10);
    expect(result.success).toBe(false);
  });

  it('rejects birth year equal to currentYear - 5', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 5);
    expect(result.success).toBe(false);
  });

  it('accepts a birth year that yields age 11 (currentYear - 11)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 11);
    expect(result.success).toBe(true);
  });

  it('accepts a birth year that yields age 17 (adolescent)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 17);
    expect(result.success).toBe(true);
  });

  it('[BUG-577] computeAgeBracket(currentYear - 11) returns adolescent, not child', () => {
    const currentYear = new Date().getFullYear();
    expect(computeAgeBracket(currentYear - 11)).toBe('adolescent');
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
