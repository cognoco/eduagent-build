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

const NOW = new Date('2025-01-15T10:00:00.000Z');
const BIRTH = new Date('1990-01-15T00:00:00.000Z');

function mockProfileRow(
  overrides?: Partial<{
    id: string;
    accountId: string;
    displayName: string;
    avatarUrl: string | null;
    birthDate: Date | null;
    personaType: 'TEEN' | 'LEARNER' | 'PARENT';
    isOwner: boolean;
  }>
) {
  return {
    id: overrides?.id ?? 'profile-1',
    accountId: overrides?.accountId ?? 'account-123',
    displayName: overrides?.displayName ?? 'Test User',
    avatarUrl: overrides?.avatarUrl ?? null,
    birthDate: overrides?.birthDate ?? null,
    personaType: overrides?.personaType ?? 'LEARNER',
    isOwner: overrides?.isOwner ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findManyResult = [] as ReturnType<typeof mockProfileRow>[],
  findFirstResult = undefined as ReturnType<typeof mockProfileRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockProfileRow>[],
  updateReturning = [] as ReturnType<typeof mockProfileRow>[],
} = {}): Database {
  return {
    query: {
      profiles: {
        findMany: jest.fn().mockResolvedValue(findManyResult),
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
  } as unknown as Database;
}

describe('listProfiles', () => {
  it('returns empty array when no profiles exist', async () => {
    const db = createMockDb({ findManyResult: [] });
    const result = await listProfiles(db, 'account-123');

    expect(result).toEqual([]);
  });

  it('returns mapped profiles', async () => {
    const rows = [
      mockProfileRow({ id: 'p1', displayName: 'Alice' }),
      mockProfileRow({ id: 'p2', displayName: 'Bob' }),
    ];
    const db = createMockDb({ findManyResult: rows });
    const result = await listProfiles(db, 'account-123');

    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe('Alice');
    expect(result[1].displayName).toBe('Bob');
    expect(result[0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });
});

describe('createProfile', () => {
  it('returns profile with all required fields', async () => {
    const row = mockProfileRow({ displayName: 'Test User' });
    const db = createMockDb({ insertReturning: [row] });
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
    const row = mockProfileRow({ isOwner: true, personaType: 'PARENT' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Owner', personaType: 'PARENT' },
      true
    );

    expect(result.isOwner).toBe(true);
  });

  it('defaults isOwner to false', async () => {
    const row = mockProfileRow({ isOwner: false });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'account-123', {
      displayName: 'Non-owner',
      personaType: 'LEARNER',
    });

    expect(result.isOwner).toBe(false);
  });

  it('defaults personaType to LEARNER when not specified', async () => {
    const row = mockProfileRow({ personaType: 'LEARNER' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'account-123', {
      displayName: 'Default Persona',
    });

    expect(result.personaType).toBe('LEARNER');
  });

  it('returns ISO 8601 timestamps', async () => {
    const row = mockProfileRow({ personaType: 'TEEN' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'account-123', {
      displayName: 'Timestamp Test',
      personaType: 'TEEN',
    });

    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes input fields in returned profile', async () => {
    const row = mockProfileRow({
      accountId: 'acct-1',
      displayName: 'Custom Name',
      personaType: 'PARENT',
      avatarUrl: 'https://example.com/avatar.png',
      birthDate: BIRTH,
    });
    const db = createMockDb({ insertReturning: [row] });
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
  it('returns null when profile not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getProfile(db, 'profile-123', 'account-123');

    expect(result).toBeNull();
  });

  it('returns mapped profile when found', async () => {
    const row = mockProfileRow({ id: 'profile-123' });
    const db = createMockDb({ findFirstResult: row });
    const result = await getProfile(db, 'profile-123', 'account-123');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('profile-123');
    expect(result!.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });
});

describe('updateProfile', () => {
  it('returns null when profile not found', async () => {
    const db = createMockDb({ updateReturning: [] });
    const result = await updateProfile(db, 'profile-123', 'account-123', {
      displayName: 'Updated',
    });

    expect(result).toBeNull();
  });

  it('returns mapped updated profile', async () => {
    const row = mockProfileRow({ displayName: 'Updated Name' });
    const db = createMockDb({ updateReturning: [row] });
    const result = await updateProfile(db, 'profile-123', 'account-123', {
      displayName: 'Updated Name',
    });

    expect(result).not.toBeNull();
    expect(result!.displayName).toBe('Updated Name');
  });
});

describe('switchProfile', () => {
  it('returns null when profile not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await switchProfile(db, 'profile-123', 'account-123');

    expect(result).toBeNull();
  });

  it('returns profileId when found', async () => {
    const row = mockProfileRow({ id: 'profile-123' });
    const db = createMockDb({ findFirstResult: row });
    const result = await switchProfile(db, 'profile-123', 'account-123');

    expect(result).toEqual({ profileId: 'profile-123' });
  });
});
