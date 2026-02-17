// ---------------------------------------------------------------------------
// Profile Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
} from './profile';

// Stub database — no actual queries are executed in these stubs
const db = {} as Database;

describe('listProfiles', () => {
  it('returns empty array (TODO stub — no DB integration yet)', async () => {
    const result = await listProfiles(db, 'account-123');

    expect(result).toEqual([]);
  });
});

describe('createProfile', () => {
  it('returns profile with all required fields', async () => {
    const result = await createProfile(db, 'account-123', {
      displayName: 'Test User',
      personaType: 'LEARNER',
    });

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('accountId');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('avatarUrl');
    expect(result).toHaveProperty('birthDate');
    expect(result).toHaveProperty('personaType');
    expect(result).toHaveProperty('isOwner');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
  });

  it('sets isOwner when specified', async () => {
    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Owner', personaType: 'PARENT' },
      true
    );

    expect(result.isOwner).toBe(true);
  });

  it('defaults isOwner to false', async () => {
    const result = await createProfile(db, 'account-123', {
      displayName: 'Non-owner',
      personaType: 'LEARNER',
    });

    expect(result.isOwner).toBe(false);
  });

  it('defaults personaType to LEARNER when not specified', async () => {
    const result = await createProfile(db, 'account-123', {
      displayName: 'Default Persona',
    });

    expect(result.personaType).toBe('LEARNER');
  });

  it('returns ISO 8601 timestamps', async () => {
    const result = await createProfile(db, 'account-123', {
      displayName: 'Timestamp Test',
      personaType: 'TEEN',
    });

    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes input fields in returned profile', async () => {
    const result = await createProfile(db, 'acct-1', {
      displayName: 'Custom Name',
      personaType: 'PARENT',
      avatarUrl: 'https://example.com/avatar.png',
      birthDate: '1990-01-15',
    });

    expect(result.displayName).toBe('Custom Name');
    expect(result.personaType).toBe('PARENT');
    expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    expect(result.birthDate).toBe('1990-01-15');
    expect(result.accountId).toBe('acct-1');
  });
});

describe('getProfile', () => {
  it('returns null (TODO stub — no DB integration yet)', async () => {
    const result = await getProfile(db, 'profile-123', 'account-123');

    expect(result).toBeNull();
  });
});

describe('updateProfile', () => {
  it('returns null (TODO stub — no DB integration yet)', async () => {
    const result = await updateProfile(db, 'profile-123', 'account-123', {
      displayName: 'Updated',
    });

    expect(result).toBeNull();
  });
});

describe('switchProfile', () => {
  it('returns null (TODO stub — no DB integration yet)', async () => {
    const result = await switchProfile(db, 'profile-123', 'account-123');

    expect(result).toBeNull();
  });
});
