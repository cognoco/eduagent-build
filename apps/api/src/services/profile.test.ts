// ---------------------------------------------------------------------------
// Profile Service Tests
// ---------------------------------------------------------------------------

jest.mock('./consent', () => ({
  getConsentStatus: jest.fn().mockResolvedValue(null),
  checkConsentRequired: jest
    .fn()
    .mockReturnValue({ required: false, consentType: null }),
  createPendingConsentState: jest.fn().mockResolvedValue({
    id: 'consent-1',
    profileId: 'profile-1',
    consentType: 'GDPR',
    status: 'PENDING',
    parentEmail: null,
    requestedAt: '2025-01-15T10:00:00.000Z',
    respondedAt: null,
  }),
}));

import type { Database } from '@eduagent/database';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
} from './profile';
import {
  getConsentStatus,
  checkConsentRequired,
  createPendingConsentState,
} from './consent';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const BIRTH = new Date('1990-01-15T00:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

function mockProfileRow(
  overrides?: Partial<{
    id: string;
    accountId: string;
    displayName: string;
    avatarUrl: string | null;
    birthDate: Date | null;
    personaType: 'TEEN' | 'LEARNER' | 'PARENT';
    location: 'EU' | 'US' | 'OTHER' | null;
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
    location: overrides?.location ?? null,
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

  it('includes consentStatus from consent service', async () => {
    const mockGetConsent = getConsentStatus as jest.Mock;
    mockGetConsent
      .mockResolvedValueOnce('PARENTAL_CONSENT_REQUESTED')
      .mockResolvedValueOnce(null);

    const rows = [
      mockProfileRow({ id: 'child-1', displayName: 'Child' }),
      mockProfileRow({ id: 'adult-1', displayName: 'Adult' }),
    ];
    const db = createMockDb({ findManyResult: rows });
    const result = await listProfiles(db, 'account-123');

    expect(result[0].consentStatus).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result[1].consentStatus).toBeNull();
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

  it('creates PENDING consent state for EU child under 16', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
    });
    const row = mockProfileRow({ location: 'EU' });
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthDate: '2016-06-15' },
      false,
      'EU'
    );

    expect(checkConsentRequired).toHaveBeenCalledWith('2016-06-15', 'EU');
    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'GDPR');
    expect(result.consentStatus).toBe('PENDING');
  });

  it('creates PENDING consent state for US child under 13', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'COPPA',
    });
    (createPendingConsentState as jest.Mock).mockResolvedValueOnce({
      id: 'consent-2',
      profileId: 'profile-1',
      consentType: 'COPPA',
      status: 'PENDING',
      parentEmail: null,
      requestedAt: '2025-01-15T10:00:00.000Z',
      respondedAt: null,
    });
    const row = mockProfileRow({ location: 'US' });
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthDate: '2016-06-15' },
      false,
      'US'
    );

    expect(checkConsentRequired).toHaveBeenCalledWith('2016-06-15', 'US');
    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'COPPA');
    expect(result.consentStatus).toBe('PENDING');
  });

  it('does not create consent state for adult', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: false,
      consentType: null,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Adult', birthDate: '1990-01-15' },
      false,
      'EU'
    );

    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBeNull();
  });

  it('does not create consent state when no birthDate', async () => {
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'No BD' },
      false,
      'EU'
    );

    expect(checkConsentRequired).not.toHaveBeenCalled();
    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBeNull();
  });

  it('server location overrides client location', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
    });
    const row = mockProfileRow({ location: 'EU' });
    const db = createMockDb({ insertReturning: [row] });

    await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthDate: '2016-06-15', location: 'OTHER' },
      false,
      'EU'
    );

    // serverLocation 'EU' should override client 'OTHER'
    expect(checkConsentRequired).toHaveBeenCalledWith('2016-06-15', 'EU');
  });

  it('falls back to client location when no server location', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
    });
    const row = mockProfileRow({ location: 'EU' });
    const db = createMockDb({ insertReturning: [row] });

    await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthDate: '2016-06-15', location: 'EU' },
      false
    );

    expect(checkConsentRequired).toHaveBeenCalledWith('2016-06-15', 'EU');
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
