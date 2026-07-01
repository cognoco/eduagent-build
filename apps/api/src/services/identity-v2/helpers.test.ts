// ---------------------------------------------------------------------------
// [WI-367] getPersonAgeBracket — exact-date safety-preamble bracket.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { getPersonAgeBracket } from './helpers';

function makeDb(birthDate: string | undefined): Database {
  return {
    query: {
      person: {
        findFirst: jest
          .fn()
          .mockResolvedValue(birthDate ? { birthDate } : undefined),
      },
    },
  } as unknown as Database;
}

describe('getPersonAgeBracket', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // [WI-367 / SECURITY] Year-only math (currentYear - birthYear) overestimates
  // age by up to 11 months. A person born June 15 of (currentYear - 18) reads
  // as 18 (adult) by year-only math on March 1, but is still 17 (adolescent)
  // for all of the current year until their birthday. The LLM safety-preamble
  // bracket must use the exact birth date. Red-green-revert: swap
  // computeAgeBracketFromDate back to computeAgeBracket(birthYear) in
  // helpers.ts and this stops returning 'adolescent' (returns 'adult').
  it('[WI-367] uses the exact birth date to catch a still-17 person that year-only would read as adult', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const db = makeDb('2008-06-15');

    await expect(getPersonAgeBracket(db, 'person-1')).resolves.toBe(
      'adolescent',
    );
  });

  it('returns adult for an unambiguously adult exact birth date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const db = makeDb('1990-01-01');

    await expect(getPersonAgeBracket(db, 'person-1')).resolves.toBe('adult');
  });

  it('returns adult (conservative default) when the person is absent', async () => {
    const db = makeDb(undefined);

    await expect(getPersonAgeBracket(db, 'missing')).resolves.toBe('adult');
  });
});
