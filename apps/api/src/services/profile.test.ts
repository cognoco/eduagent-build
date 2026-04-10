// ---------------------------------------------------------------------------
// Profile Service Tests
// ---------------------------------------------------------------------------

jest.mock('./consent', () => ({
  getConsentStatus: jest.fn().mockResolvedValue(null),
  checkConsentRequired: jest
    .fn()
    .mockReturnValue({ required: false, consentType: null, age: 30 }),
  createPendingConsentState: jest.fn().mockResolvedValue({
    id: 'consent-1',
    profileId: 'profile-1',
    consentType: 'GDPR',
    status: 'PENDING',
    parentEmail: null,
    requestedAt: '2025-01-15T10:00:00.000Z',
    respondedAt: null,
  }),
  createGrantedConsentState: jest.fn().mockResolvedValue({
    id: 'consent-1',
    profileId: 'profile-1',
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: null,
    requestedAt: '2025-01-15T10:00:00.000Z',
    respondedAt: '2025-01-15T10:00:00.000Z',
  }),
}));

import type { Database } from '@eduagent/database';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
  resolveProfileRole,
} from './profile';
import {
  getConsentStatus,
  checkConsentRequired,
  createPendingConsentState,
  createGrantedConsentState,
} from './consent';

const NOW = new Date('2025-01-15T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

function mockProfileRow(
  overrides?: Partial<{
    id: string;
    accountId: string;
    displayName: string;
    avatarUrl: string | null;
    birthYear: number | null;
    location: 'EU' | 'US' | 'OTHER' | null;
    isOwner: boolean;
    hasPremiumLlm: boolean;
  }>
) {
  return {
    id: overrides?.id ?? 'profile-1',
    accountId: overrides?.accountId ?? 'account-123',
    displayName: overrides?.displayName ?? 'Test User',
    avatarUrl: overrides?.avatarUrl ?? null,
    birthYear: overrides?.birthYear ?? null,
    location: overrides?.location ?? null,
    isOwner: overrides?.isOwner ?? false,
    hasPremiumLlm: overrides?.hasPremiumLlm ?? false,
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
      birthYear: 2008,
    });

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('accountId');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('avatarUrl');
    expect(result).toHaveProperty('birthYear');
    expect(result).toHaveProperty('isOwner');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
  });

  it('sets isOwner when specified', async () => {
    const row = mockProfileRow({ isOwner: true });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Owner', birthYear: 1990 },
      true
    );

    expect(result.isOwner).toBe(true);
  });

  it('defaults isOwner to false', async () => {
    const row = mockProfileRow({ isOwner: false });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'account-123', {
      displayName: 'Non-owner',
      birthYear: 2008,
    });

    expect(result.isOwner).toBe(false);
  });

  it('returns ISO 8601 timestamps', async () => {
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'account-123', {
      displayName: 'Timestamp Test',
      birthYear: 2014,
    });

    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes input fields in returned profile', async () => {
    const row = mockProfileRow({
      accountId: 'acct-1',
      displayName: 'Custom Name',
      avatarUrl: 'https://example.com/avatar.png',
      birthYear: 1990,
    });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'acct-1', {
      displayName: 'Custom Name',
      avatarUrl: 'https://example.com/avatar.png',
      birthYear: 1990,
    });

    expect(result.displayName).toBe('Custom Name');
    expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    expect(result.birthYear).toBe(1990);
    expect(result.accountId).toBe('acct-1');
  });

  it('creates PENDING consent state for child under 16', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
      age: 9,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthYear: 2016 },
      false
    );

    expect(checkConsentRequired).toHaveBeenCalledWith(2016);
    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'GDPR');
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
      { displayName: 'Adult', birthYear: 1990 },
      false
    );

    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBeNull();
  });

  // BUG-239: Parent adding child must get CONSENTED, not PENDING
  it('creates CONSENTED consent state when parent adds child (parentProfileId set)', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
      age: 13,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Child Added By Parent', birthYear: 2013 },
      false,
      'parent-profile-id'
    );

    expect(createGrantedConsentState).toHaveBeenCalledWith(
      db,
      row.id,
      'GDPR',
      'parent-profile-id'
    );
    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBe('CONSENTED');
  });

  // BUG-239: Child self-registering (no parentProfileId) still gets PENDING
  it('creates PENDING consent state when child self-registers (no parentProfileId)', async () => {
    (checkConsentRequired as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
      age: 13,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Self-Registering Child', birthYear: 2013 },
      false,
      undefined
    );

    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'GDPR');
    expect(createGrantedConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBe('PENDING');
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

// ---------------------------------------------------------------------------
// resolveProfileRole
// ---------------------------------------------------------------------------

describe('resolveProfileRole', () => {
  it('returns guardian when profile has child links', async () => {
    const db = {
      query: {
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'link-1',
            parentProfileId: 'parent-1',
            childProfileId: 'child-1',
          }),
        },
      },
    } as unknown as Database;

    const result = await resolveProfileRole(db, 'parent-1');
    expect(result).toBe('guardian');
  });

  it('returns self_learner when profile has no child links', async () => {
    const db = {
      query: {
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    } as unknown as Database;

    const result = await resolveProfileRole(db, 'user-1');
    expect(result).toBe('self_learner');
  });
});
