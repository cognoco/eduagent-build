import { calculateAge, calculateAgeFromParts, MINIMUM_AGE } from './age-utils';
import { PROFILE_MINIMUM_AGE } from '@eduagent/schemas';

describe('calculateAge', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('derives age from the UTC calendar year, not the host-local year (WI-1070)', () => {
    // Regression guard: near a year boundary, the host process can be one
    // calendar year ahead/behind UTC. calculateAge must follow getUTCFullYear()
    // so the result is timezone-independent. If it ever regresses to
    // getFullYear() this assertion flips from 18 to 19.
    jest.spyOn(Date.prototype, 'getUTCFullYear').mockReturnValue(2026);
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2027);

    expect(calculateAge(2008)).toBe(18); // 2026 - 2008 (UTC), NOT 2027 - 2008
  });

  it('returns the plain UTC year difference for a fixed instant', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00Z'));
    try {
      expect(calculateAge(2000)).toBe(26);
      expect(calculateAge(2013)).toBe(13);
    } finally {
      jest.useRealTimers();
    }
  });

  it('MINIMUM_AGE mirrors the schema floor', () => {
    expect(MINIMUM_AGE).toBe(PROFILE_MINIMUM_AGE);
  });
});

describe('calculateAgeFromParts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('subtracts a year before the birthday has occurred this year', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    // Birthday is June 15 — not yet reached on March 1, so still 17.
    expect(calculateAgeFromParts(2008, 6, 15)).toBe(17);
  });

  it('does not subtract once the birthday has passed this year', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00Z'));
    expect(calculateAgeFromParts(2008, 6, 15)).toBe(18);
  });

  it('falls back to the year-only approximation when month/day are absent', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    expect(calculateAgeFromParts(2008)).toBe(18); // 2026 - 2008, no birthday adjustment
  });
});
