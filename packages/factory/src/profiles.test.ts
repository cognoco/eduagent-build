import {
  buildProfile,
  buildProfileList,
  resetProfileCounter,
} from './profiles.js';

describe('buildProfile', () => {
  beforeEach(() => {
    resetProfileCounter();
  });

  it('returns a valid ProfileCreateInput with defaults', () => {
    const profile = buildProfile();

    expect(profile).toEqual({
      displayName: 'Test User 1',
      personaType: 'LEARNER',
    });
  });

  it('increments the counter on each call', () => {
    const first = buildProfile();
    const second = buildProfile();

    expect(first.displayName).toBe('Test User 1');
    expect(second.displayName).toBe('Test User 2');
  });

  it('applies overrides', () => {
    const profile = buildProfile({
      displayName: 'Custom Name',
      personaType: 'TEEN',
    });

    expect(profile.displayName).toBe('Custom Name');
    expect(profile.personaType).toBe('TEEN');
  });

  it('merges partial overrides with defaults', () => {
    const profile = buildProfile({ personaType: 'PARENT' });

    expect(profile.displayName).toBe('Test User 1');
    expect(profile.personaType).toBe('PARENT');
  });
});

describe('buildProfileList', () => {
  beforeEach(() => {
    resetProfileCounter();
  });

  it('returns the requested number of profiles', () => {
    const profiles = buildProfileList(3);

    expect(profiles).toHaveLength(3);
  });

  it('increments counter across all items', () => {
    const profiles = buildProfileList(3);

    expect(profiles[0].displayName).toBe('Test User 1');
    expect(profiles[1].displayName).toBe('Test User 2');
    expect(profiles[2].displayName).toBe('Test User 3');
  });

  it('applies overrides to all items', () => {
    const profiles = buildProfileList(2, { personaType: 'TEEN' });

    expect(profiles[0].personaType).toBe('TEEN');
    expect(profiles[1].personaType).toBe('TEEN');
  });

  it('returns empty array for count 0', () => {
    const profiles = buildProfileList(0);

    expect(profiles).toEqual([]);
  });
});
