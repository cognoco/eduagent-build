import {
  calculateAge,
  calculateAgeFromParts,
  checkConsentRequired,
  checkConsentRequiredFromDate,
  isBelowMinimumAgeAtCreation,
} from './consent';

// Must mirror SUT: calculateAge() uses getUTCFullYear() so tests stay correct
// regardless of host TZ (e.g. running locally in UTC+1 across a year boundary).
const CURRENT_YEAR = new Date().getUTCFullYear();

// ---------------------------------------------------------------------------
// calculateAge — UTC contract (bug 105)
// ---------------------------------------------------------------------------

describe('calculateAge', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the difference between current UTC year and birth year', () => {
    // Pin the wall clock to a UTC instant where local-time year would differ
    // from UTC year for any timezone west of UTC.
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T01:00:00.000Z'));
    expect(calculateAge(2000)).toBe(25);
  });

  it('is timezone-independent across year boundary (regression: bug 105)', () => {
    // 2026-01-01 00:30 UTC. In timezones east of UTC (e.g. CET/UTC+1) this is
    // still 2026; in zones west of UTC (e.g. EST/UTC-5) the LOCAL date is
    // 2025-12-31. getUTCFullYear() must return 2026 either way.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    expect(calculateAge(2010)).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// checkConsentRequired
// ---------------------------------------------------------------------------

describe('checkConsentRequired', () => {
  it('requires GDPR consent for child under 16', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 10);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('requires GDPR consent for someone turning 16 this year', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 16);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('does not require consent for 17-year-old', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 17);

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('does not require consent for adult', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 30);

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('flags belowMinimumAge for child under 13 (WI-570: v1 13+ floor)', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 9);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.belowMinimumAge).toBe(true);
  });

  // [F-029-sem][BREAK] The central age-gate must fail CLOSED when birthYear is
  // unknown (null / undefined / 0). The W0 patch (F-145) closed the
  // assertPronounsSelfEditAllowed path; the central checkConsentRequired must
  // carry the same semantic guarantee so no caller can pass a sentinel value
  // and receive "not required" back.
  //
  // Red→green: checkConsentRequired(null) currently computes age as NaN (from
  // calculateAge(null)) → NaN < 13 is false → NaN <= 16 is false → returns
  // { required: false }. Fix: accept number | null | undefined and fail closed.
  it.each([null, undefined, 0])(
    '[F-029-sem][BREAK] checkConsentRequired(%s) fails closed (required=true, belowMinimumAge=true)',
    (birthYear) => {
      const result = checkConsentRequired(birthYear);
      expect(result.required).toBe(true);
      expect(result.belowMinimumAge).toBe(true);
    },
  );

  // [F-029-sem] checkConsentRequiredFromDate mirrors the fail-closed guarantee.
  it.each([null, undefined, 0])(
    '[F-029-sem] checkConsentRequiredFromDate(%s, ...) fails closed',
    (birthYear) => {
      const result = checkConsentRequiredFromDate(birthYear, 6, 15);
      expect(result.required).toBe(true);
      expect(result.belowMinimumAge).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// WI-297 — calculateAgeFromParts (exact age from full birth date)
// ---------------------------------------------------------------------------

describe('calculateAgeFromParts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns exact age when birthday has already passed this year', () => {
    // Born 2010-01-01; today is 2026-06-15 → exact age 16
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    expect(calculateAgeFromParts(2010, 1, 1)).toBe(16);
  });

  it('returns one less than year-only age when birthday is still to come this year', () => {
    // Born 2015-12-31; today is 2026-05-24 → birthday not yet reached → exact age 10
    // Year-only would give 2026 - 2015 = 11
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2015, 12, 31)).toBe(10);
  });

  it('[boundary] born exactly on today → counts as birthday reached, age = year-diff', () => {
    // Born 2013-05-24; today is 2026-05-24 → exact age 13
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2013, 5, 24)).toBe(13);
  });

  it('falls back to year-only calculation when month and day are not provided', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2013)).toBe(2026 - 2013);
  });
});

// ---------------------------------------------------------------------------
// WI-297 — checkConsentRequiredFromDate (exact consent check)
// ---------------------------------------------------------------------------

describe('checkConsentRequiredFromDate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[break-test] child still 12 by exact date (year-only=13) is flagged belowMinimumAge (WI-570)', () => {
    // WI-570: 13+ floor. birthYear = currentYear - 13, but birthday is Dec 31 → exact age still 12.
    // Year-only says 13 (passes Zod), but full-date catches the 12th birthday hasn't arrived yet.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const birthYear = 2013; // 2026 - 2013 = 13 by year-only, but birthday Dec 31 → exact 12
    const result = checkConsentRequiredFromDate(birthYear, 12, 31);
    expect(result.belowMinimumAge).toBe(true);
    expect(result.required).toBe(true);
    expect(result.age).toBe(12);
  });

  it('child exactly 13 today (birthday today) is allowed with GDPR required (WI-570)', () => {
    // WI-570: 13+ floor. Exactly 13 on their birthday is the minimum allowed age.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2013, 5, 24);
    expect(result.belowMinimumAge).toBeUndefined();
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.age).toBe(13);
  });

  it('child aged 16 with full date is still consent-required', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2010, 1, 1);
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.age).toBe(16);
  });

  it('adult aged 17 is not consent-required', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2009, 1, 1);
    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('falls back to year-only when month/day not supplied (WI-570: 13+ floor)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    // year-only: 2026 - 2013 = 13 → belowMinimumAge is NOT set (age >= MINIMUM_AGE=13)
    // [WI-3019] This documents the calendar-year fallback of THIS function,
    // which still drives consent-type selection. The minimum-age FLOOR no
    // longer relies on it — see isBelowMinimumAgeAtCreation below.
    const result = checkConsentRequiredFromDate(2013);
    expect(result.belowMinimumAge).toBeUndefined();
    expect(result.required).toBe(true);
    expect(result.age).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// [WI-3019] isBelowMinimumAgeAtCreation — fail-closed floor at profile creation
// ---------------------------------------------------------------------------

describe('isBelowMinimumAgeAtCreation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[BREAK] blocks a year-only payload at the floor birth year (may still be 12)', () => {
    // The WI-3019 exposure: 2026 - 2013 = 13 by calendar-year math, so the
    // year-only fallback admitted this payload even though a learner born
    // later in 2013 is still 12. Fail-closed: assume the birthday has not
    // happened yet.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(isBelowMinimumAgeAtCreation(2013)).toBe(true);
  });

  it('blocks the floor birth year when the exact date proves the learner is 12', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(isBelowMinimumAgeAtCreation(2013, 12, 31)).toBe(true);
  });

  it('allows the floor birth year once the exact date proves the learner is 13', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(isBelowMinimumAgeAtCreation(2013, 5, 24)).toBe(false);
  });

  it('allows a year-only payload for an unambiguously older birth year', () => {
    // AC-3: year-only callers above the ambiguous year keep working — even
    // assuming the birthday has not happened yet, 2026 - 2012 - 1 = 13.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(isBelowMinimumAgeAtCreation(2012)).toBe(false);
    expect(isBelowMinimumAgeAtCreation(1990)).toBe(false);
  });

  it.each([null, undefined, 0])(
    '[F-029-sem] fails closed on an unknown birthYear (%s)',
    (birthYear) => {
      expect(isBelowMinimumAgeAtCreation(birthYear)).toBe(true);
    },
  );
});
