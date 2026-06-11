import {
  computeAgeBracket,
  isAdultOwner,
  isUnambiguouslyAdult,
  type AgeBracket,
  type AgeGateRole,
} from './age.js';
import { birthYearSchema } from './profiles.js';

describe('computeAgeBracket', () => {
  // WI-570 (data-model.md §2A.5): three-way model; 'child' < 13, 'adolescent' 13–17, 'adult' 18+.

  it('returns child for ages under 13', () => {
    expect(computeAgeBracket(2016, 2026)).toBe('child'); // age 10
    expect(computeAgeBracket(2020, 2026)).toBe('child'); // age 6
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
    expect(computeAgeBracket(thisYear - 8)).toBe('child');
  });

  it('AgeBracket is the three-way union (WI-570 / data-model.md §2A.5)', () => {
    const all: ReadonlyArray<AgeBracket> = ['child', 'adolescent', 'adult'];
    expect(all).toHaveLength(3);
    expect(all).toContain('child');
    expect(all).toContain('adolescent');
    expect(all).toContain('adult');
  });

  it('boundary: age 13 = adolescent, age 12 = child', () => {
    expect(computeAgeBracket(2026 - 13, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2026 - 12, 2026)).toBe('child');
  });

  it('boundary: age 18 = adult, age 17 = adolescent', () => {
    expect(computeAgeBracket(2026 - 18, 2026)).toBe('adult');
    expect(computeAgeBracket(2026 - 17, 2026)).toBe('adolescent');
  });
});

// ── birthYearSchema minimum-age gate ──────────────────────────────────────

describe('birthYearSchema minimum-age gate (v1 13+ launch floor, WI-570)', () => {
  it('rejects a birth year that yields age 12 (currentYear - 12)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 12);
    expect(result.success).toBe(false);
  });

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

  it('accepts a birth year that yields age 13 (currentYear - 13)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 13);
    expect(result.success).toBe(true);
  });

  it('accepts a birth year that yields age 17 (adolescent)', () => {
    const currentYear = new Date().getFullYear();
    const result = birthYearSchema.safeParse(currentYear - 17);
    expect(result.success).toBe(true);
  });

  it('computeAgeBracket(currentYear - 13) returns adolescent (13-floor boundary)', () => {
    const currentYear = new Date().getFullYear();
    expect(computeAgeBracket(currentYear - 13)).toBe('adolescent');
  });

  it('computeAgeBracket(currentYear - 12) returns child (just below 13-floor)', () => {
    const currentYear = new Date().getFullYear();
    expect(computeAgeBracket(currentYear - 12)).toBe('child');
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

describe('isUnambiguouslyAdult', () => {
  it('[WI-580 / F-076] treats the birth-year boundary as minor (may still be 17)', () => {
    // 2026 - 2008 = 18 by year difference, but the learner may not have had
    // their 18th birthday yet — fail-closed for minor-PII gating.
    expect(isUnambiguouslyAdult(2008, 2026)).toBe(false);
  });

  it('returns true only for unambiguously 18+ birth years', () => {
    expect(isUnambiguouslyAdult(2007, 2026)).toBe(true);
    expect(isUnambiguouslyAdult(1990, 2026)).toBe(true);
  });

  it('returns false for clearly minor birth years', () => {
    expect(isUnambiguouslyAdult(2012, 2026)).toBe(false);
  });

  it('is stricter than isAdultOwner at the boundary (the intended divergence)', () => {
    expect(isAdultOwner({ role: 'owner', birthYear: 2008 }, 2026)).toBe(true);
    expect(isUnambiguouslyAdult(2008, 2026)).toBe(false);
  });
});
