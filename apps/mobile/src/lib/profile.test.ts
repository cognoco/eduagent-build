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
