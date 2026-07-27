import { isFamilyCapableProfile } from './profile';
import type { Profile } from '@eduagent/schemas';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    displayName: 'Test',
    birthYear: 1985,
    isOwner: true,
    consentStatus: 'CONSENTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    linkCreatedAt: null,
    parentEmail: null,
    ...overrides,
  } as Profile;
}

describe('isFamilyCapableProfile', () => {
  const owner = makeProfile({ id: 'p1', isOwner: true, birthYear: 1985 });
  const child = makeProfile({ id: 'p2', isOwner: false, birthYear: 2015 });

  it('returns true when owner has at least one linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner, child])).toBe(true);
  });

  it('returns false when owner has no linked non-owner', () => {
    expect(isFamilyCapableProfile(owner, [owner])).toBe(false);
  });

  it('returns false for non-owner active profile', () => {
    expect(isFamilyCapableProfile(child, [owner, child])).toBe(false);
  });

  it('returns false when activeProfile is null', () => {
    expect(isFamilyCapableProfile(null, [owner, child])).toBe(false);
  });

  it('returns false for a minor owner with a linked non-owner', () => {
    const minorOwner = makeProfile({
      id: 'p1',
      isOwner: true,
      birthYear: 2015,
    });
    expect(isFamilyCapableProfile(minorOwner, [minorOwner, child])).toBe(false);
  });
});

describe('isFamilyCapableProfile — exact-birth-date parity (WI-1259)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const child = makeProfile({ id: 'p2', isOwner: false, birthYear: 2015 });

  it('uses month/day when present: owner turning 18 later this year is NOT family-capable', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const boundaryOwner = makeProfile({
      id: 'p1',
      isOwner: true,
      birthYear: 2008,
      birthMonth: 12,
      birthDay: 31,
    });
    // Exact age on 2026-07-15 is 17 (birthday Dec 31). The year-only bracket
    // says 18 — the client gate must match the server (WI-367) and deny.
    expect(isFamilyCapableProfile(boundaryOwner, [boundaryOwner, child])).toBe(
      false,
    );
  });

  it('owner whose birthday already passed this year IS family-capable', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const adultOwner = makeProfile({
      id: 'p1',
      isOwner: true,
      birthYear: 2008,
      birthMonth: 1,
      birthDay: 2,
    });
    expect(isFamilyCapableProfile(adultOwner, [adultOwner, child])).toBe(true);
  });

  it('falls back to year-only when month/day are null', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const yearOnlyOwner = makeProfile({
      id: 'p1',
      isOwner: true,
      birthYear: 2008,
      birthMonth: null,
      birthDay: null,
    });
    expect(isFamilyCapableProfile(yearOnlyOwner, [yearOnlyOwner, child])).toBe(
      true,
    );
  });
});
