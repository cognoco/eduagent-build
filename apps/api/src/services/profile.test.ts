// ---------------------------------------------------------------------------
// Profile Service Tests
// ---------------------------------------------------------------------------

// [BUG-410] Mocks for escalation path in findOwnerProfile fallback.
// captureException and inngest.send are external-boundary calls; safeSend is
// internal but wraps the Inngest client which IS an external boundary.
const mockCaptureException = jest.fn();
jest.mock(
  './sentry' /* gc1-allow: external-boundary mock for sentry escalation */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../inngest/client' /* gc1-allow: external-boundary mock for Inngest dispatch */,
  () => ({
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  }),
);

jest.mock('./consent' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./consent') as typeof import('./consent');
  return {
    ...actual,
    getConsentStatus: jest.fn().mockResolvedValue(null),
    checkConsentRequired: jest
      .fn()
      .mockReturnValue({ required: false, consentType: null, age: 30 }),
    checkConsentRequiredFromDate: jest
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
  };
});

import type { Database } from '@eduagent/database';
import { ForbiddenError } from '@eduagent/schemas';
import {
  listProfiles,
  createProfile,
  findOwnerProfile,
  getProfile,
  updateProfile,
  updateProfileAppContext,
  switchProfile,
  resolveProfileRole,
  getProfileAge,
  loadProfileRowById,
  getProfileAgeBracket,
  getProfileDisplayName,
} from './profile';
import {
  checkConsentRequiredFromDate,
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
    defaultAppContext: 'study' | 'family' | null;
  }>,
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
    defaultAppContext: overrides?.defaultAppContext ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findManyResult = [] as ReturnType<typeof mockProfileRow>[],
  findFirstResult = undefined as ReturnType<typeof mockProfileRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockProfileRow>[],
  updateReturning = [] as ReturnType<typeof mockProfileRow>[],
  familyFindManyResult = [] as Array<{
    childProfileId: string;
    createdAt: Date;
  }>,
  familyFindFirstResult = undefined as
    | { childProfileId: string; createdAt: Date }
    | undefined,
  consentSelectResult = [] as Array<{
    profileId: string;
    status:
      | 'PENDING'
      | 'PARENTAL_CONSENT_REQUESTED'
      | 'CONSENTED'
      | 'WITHDRAWN';
    requestedAt: Date;
  }>,
} = {}): Database {
  // [L7-F1] db.select(...).from(...).where(...).orderBy(...) chain used by
  // listProfiles for the batched consent lookup. Returns consentSelectResult
  // as a thenable so `await` resolves directly.
  const selectChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue(consentSelectResult),
      }),
    }),
  };
  return {
    query: {
      profiles: {
        findMany: jest.fn().mockResolvedValue(findManyResult),
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      familyLinks: {
        findMany: jest.fn().mockResolvedValue(familyFindManyResult),
        findFirst: jest.fn().mockResolvedValue(familyFindFirstResult),
      },
    },
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
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
    expect(result[0]!.displayName).toBe('Alice');
    expect(result[1]!.displayName).toBe('Bob');
    expect(result[0]!.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('includes consentStatus from batched consent query', async () => {
    // [L7-F1] listProfiles now reads consent_states directly in a single
    // batched query instead of calling getConsentStatus per row. The mock
    // returns the latest-first rows for both profiles; null for adult-1 is
    // expressed by omitting the row entirely.
    const rows = [
      mockProfileRow({ id: 'child-1', displayName: 'Child' }),
      mockProfileRow({ id: 'adult-1', displayName: 'Adult' }),
    ];
    const db = createMockDb({
      findManyResult: rows,
      consentSelectResult: [
        {
          profileId: 'child-1',
          status: 'PARENTAL_CONSENT_REQUESTED',
          requestedAt: NOW,
        },
      ],
    });
    const result = await listProfiles(db, 'account-123');

    expect(result[0]!.consentStatus).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result[1]!.consentStatus).toBeNull();
  });

  it('includes server-computed family link capability', async () => {
    const linkCreatedAt = new Date('2026-02-03T04:05:06.000Z');
    const rows = [
      mockProfileRow({ id: 'owner-1', displayName: 'Owner', isOwner: true }),
      mockProfileRow({ id: 'child-1', displayName: 'Child', isOwner: false }),
    ];
    const db = createMockDb({
      findManyResult: rows,
      familyFindManyResult: [
        {
          childProfileId: 'child-1',
          createdAt: linkCreatedAt,
        },
      ],
    });

    const result = await listProfiles(db, 'account-123');

    expect(result[0]!.hasFamilyLinks).toBe(true);
    expect(result[0]!.linkCreatedAt).toBeNull();
    expect(result[1]!.hasFamilyLinks).toBe(true);
    expect(result[1]!.linkCreatedAt).toBe('2026-02-03T04:05:06.000Z');
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
      true,
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
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
      required: true,
      consentType: 'GDPR',
      age: 13,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Child', birthYear: 2013 },
      false,
    );

    expect(checkConsentRequiredFromDate).toHaveBeenCalledWith(
      2013,
      undefined,
      undefined,
    );
    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'GDPR');
    expect(result.consentStatus).toBe('PENDING');
  });

  it('does not create consent state for adult', async () => {
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
      required: false,
      consentType: null,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    const result = await createProfile(
      db,
      'account-123',
      { displayName: 'Adult', birthYear: 1990 },
      false,
    );

    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBeNull();
  });

  // BUG-239: Parent adding child must get CONSENTED, not PENDING
  it('creates CONSENTED consent state when parent adds child (parentProfileId set)', async () => {
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
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
      'parent-profile-id',
    );

    expect(createGrantedConsentState).toHaveBeenCalledWith(
      db,
      row.id,
      'GDPR',
      'parent-profile-id',
    );
    expect(createPendingConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBe('CONSENTED');
  });

  it('[BREAK] creates family link when parent adds child aged 17+ (consent not required)', async () => {
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
      required: false,
      consentType: null,
      age: 17,
    });
    const row = mockProfileRow({ id: 'child-17' });
    const db = createMockDb({ insertReturning: [row] });

    await createProfile(
      db,
      'account-123',
      { displayName: 'Older Teen', birthYear: 2009 },
      false,
      'parent-profile-id',
    );

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(createGrantedConsentState).not.toHaveBeenCalled();
  });

  it('does not create family link when no parentProfileId', async () => {
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
      required: false,
      consentType: null,
      age: 30,
    });
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });

    await createProfile(
      db,
      'account-123',
      { displayName: 'Solo User', birthYear: 1996 },
      false,
    );

    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  // BUG-239: Child self-registering (no parentProfileId) still gets PENDING
  it('creates PENDING consent state when child self-registers (no parentProfileId)', async () => {
    (checkConsentRequiredFromDate as jest.Mock).mockReturnValueOnce({
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
      undefined,
    );

    expect(createPendingConsentState).toHaveBeenCalledWith(db, row.id, 'GDPR');
    expect(createGrantedConsentState).not.toHaveBeenCalled();
    expect(result.consentStatus).toBe('PENDING');
  });

  // i18n Phase 1 — Signup-time fix. The first LLM call on a fresh profile
  // must use the device locale rather than English. The mobile client
  // forwards i18next.language; createProfile threads it into the INSERT.
  it('writes conversationLanguage to the insert when provided', async () => {
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });
    await createProfile(db, 'account-123', {
      displayName: 'Locale Test',
      birthYear: 2010,
      conversationLanguage: 'nb',
    });
    const valuesMock = (db.insert as jest.Mock).mock.results[0]!.value
      .values as jest.Mock;
    const passed = valuesMock.mock.calls[0]![0] as {
      conversationLanguage?: string;
    };
    expect(passed.conversationLanguage).toBe('nb');
  });

  it('omits conversationLanguage from the insert when not provided (DB default applies)', async () => {
    const row = mockProfileRow();
    const db = createMockDb({ insertReturning: [row] });
    await createProfile(db, 'account-123', {
      displayName: 'No Locale Test',
      birthYear: 2010,
    });
    const valuesMock = (db.insert as jest.Mock).mock.results[0]!.value
      .values as jest.Mock;
    const passed = valuesMock.mock.calls[0]![0] as Record<string, unknown>;
    expect('conversationLanguage' in passed).toBe(false);
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

  it('[BREAK-BUG-352] WHERE clause includes archived_at IS NULL guard', async () => {
    let capturedWhere: unknown;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((condition: unknown) => {
            capturedWhere = condition;
            return { returning: jest.fn().mockResolvedValue([]) };
          }),
        }),
      }),
    } as unknown as Database;

    await updateProfile(db, 'profile-1', 'account-1', { displayName: 'X' });

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});

describe('updateProfileAppContext', () => {
  it('returns mapped profile after persisting the default app context', async () => {
    const row = mockProfileRow({
      id: 'owner-1',
      birthYear: 1985,
      isOwner: true,
      defaultAppContext: 'family',
    });
    const db = createMockDb({
      findFirstResult: row,
      updateReturning: [row],
      familyFindFirstResult: {
        childProfileId: 'child-1',
        createdAt: new Date('2026-02-03T04:05:06.000Z'),
      },
    });

    const result = await updateProfileAppContext(
      db,
      'owner-1',
      'account-123',
      'family',
    );

    expect(result).not.toBeNull();
    expect(result!.defaultAppContext).toBe('family');
    expect(result!.hasFamilyLinks).toBe(true);
  });

  it('allows study context for profiles that are not family-capable', async () => {
    const row = mockProfileRow({
      id: 'child-1',
      birthYear: 2014,
      isOwner: false,
      defaultAppContext: 'study',
    });
    const db = createMockDb({
      findFirstResult: row,
      updateReturning: [row],
    });

    const result = await updateProfileAppContext(
      db,
      'child-1',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.defaultAppContext).toBe('study');
  });

  it('[BREAK] rejects family context for non-owner profiles', async () => {
    const row = mockProfileRow({
      id: 'child-1',
      birthYear: 2014,
      isOwner: false,
    });
    const db = createMockDb({ findFirstResult: row });

    await expect(
      updateProfileAppContext(db, 'child-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('[BREAK] rejects family context for adult owners without family links', async () => {
    const row = mockProfileRow({
      id: 'owner-1',
      birthYear: 1985,
      isOwner: true,
    });
    const db = createMockDb({ findFirstResult: row });

    await expect(
      updateProfileAppContext(db, 'owner-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('[BREAK] rejects family context for under-18 owners with family links', async () => {
    const row = mockProfileRow({
      id: 'owner-1',
      birthYear: 2012,
      isOwner: true,
    });
    const db = createMockDb({
      findFirstResult: row,
      familyFindFirstResult: {
        childProfileId: 'child-1',
        createdAt: new Date('2026-02-03T04:05:06.000Z'),
      },
    });

    await expect(
      updateProfileAppContext(db, 'owner-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns null when the profile does not exist', async () => {
    const db = createMockDb({ updateReturning: [] });

    const result = await updateProfileAppContext(
      db,
      'profile-123',
      'account-123',
      'study',
    );

    expect(result).toBeNull();
  });

  it('[BREAK] WHERE clause includes archived_at IS NULL guard', async () => {
    let capturedWhere: unknown;
    const db = {
      query: {
        profiles: {
          findFirst: jest.fn().mockResolvedValue(
            mockProfileRow({
              id: 'profile-1',
              accountId: 'account-1',
              birthYear: 1985,
            }),
          ),
        },
        familyLinks: {
          findFirst: jest.fn(),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((condition: unknown) => {
            capturedWhere = condition;
            return { returning: jest.fn().mockResolvedValue([]) };
          }),
        }),
      }),
    } as unknown as Database;

    await updateProfileAppContext(db, 'profile-1', 'account-1', 'study');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
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
// findOwnerProfile — [BUG-410] fallback must NOT elevate isOwner to true
// ---------------------------------------------------------------------------

describe('findOwnerProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[BREAK][BUG-410] returns null when account has no profiles at all', async () => {
    const db = {
      query: {
        profiles: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Database;

    const result = await findOwnerProfile(db, 'account-123');
    expect(result).toBeNull();
  });

  it('[BREAK][BUG-410] returns owner profile with isOwner:true when DB row is marked as owner', async () => {
    const ownerRow = mockProfileRow({ id: 'owner-1', isOwner: true });
    let callCount = 0;
    const db = {
      query: {
        profiles: {
          // First call: owner query → returns ownerRow
          findFirst: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(ownerRow);
            return Promise.resolve(undefined);
          }),
        },
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Database;

    const result = await findOwnerProfile(db, 'account-123');
    expect(result).not.toBeNull();
    expect(result!.isOwner).toBe(true);
    // No escalation — a clean owner row should not trigger captureException
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('[BREAK][BUG-410] when no owner row exists but a fallback profile does, returned meta has isOwner:false (never elevated)', async () => {
    // No owner row (isOwner=true query returns undefined), but a fallback row exists.
    const fallbackRow = mockProfileRow({ id: 'non-owner-1', isOwner: false });
    let callCount = 0;
    const db = {
      query: {
        profiles: {
          findFirst: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(undefined); // owner query → nothing
            return Promise.resolve(fallbackRow); // fallback query → non-owner row
          }),
        },
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Database;

    const result = await findOwnerProfile(db, 'account-123');
    expect(result).not.toBeNull();
    // [BUG-410] Core assertion: fallback must NOT force isOwner to true.
    expect(result!.isOwner).toBe(false);
  });

  it('[BREAK][BUG-410] when fallback fires, captureException is called with profile.owner_resolution_fallback tag', async () => {
    const fallbackRow = mockProfileRow({ id: 'non-owner-1', isOwner: false });
    let callCount = 0;
    const db = {
      query: {
        profiles: {
          findFirst: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(undefined);
            return Promise.resolve(fallbackRow);
          }),
        },
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Database;

    await findOwnerProfile(db, 'account-123');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          tag: 'profile.owner_resolution_fallback',
          accountId: 'account-123',
        }),
      }),
    );
  });

  it('[BREAK][BUG-410] when fallback fires, safeSend dispatches app/profile.no_owner_resolved event', async () => {
    const fallbackRow = mockProfileRow({ id: 'non-owner-1', isOwner: false });
    let callCount = 0;
    const db = {
      query: {
        profiles: {
          findFirst: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(undefined);
            return Promise.resolve(fallbackRow);
          }),
        },
        familyLinks: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Database;

    await findOwnerProfile(db, 'account-123');

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/profile.no_owner_resolved',
        data: expect.objectContaining({
          accountId: 'account-123',
          fallbackProfileId: 'non-owner-1',
        }),
      }),
    );
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

// ---------------------------------------------------------------------------
// [BREAK-BUG-352] archived-profile guard tests
// Verify isNull(profiles.archivedAt) is present in WHERE clauses for the 5
// helpers that previously lacked the guard.
// ---------------------------------------------------------------------------

/**
 * Walks a drizzle SQL condition node and returns all text fragments joined.
 * Handles drizzle's internal structure:
 *   - { name: string }          — column reference (e.g. "archived_at")
 *   - { value: string[] }       — SQL literal array (e.g. [" is null"])
 *   - { queryChunks: unknown[] }— recursive condition node
 *   - string                    — raw string chunk
 * Uses a visited set to avoid circular reference stack overflows.
 */
function drizzleConditionToText(
  node: unknown,
  visited = new Set<object>(),
  depth = 0,
): string {
  if (depth > 20) return '';
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.toLowerCase();
  if (typeof node !== 'object') return '';
  if (visited.has(node as object)) return '';
  visited.add(node as object);

  const obj = node as Record<string, unknown>;

  // Column reference: { name: "archived_at", ... }
  if (typeof obj['name'] === 'string') {
    return obj['name'].toLowerCase();
  }

  // SQL literal fragment: { value: [" is null"] }
  if (Array.isArray(obj['value'])) {
    return (obj['value'] as unknown[])
      .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
      .join('');
  }

  // Recursive condition: { queryChunks: [...] }
  if (Array.isArray(obj['queryChunks'])) {
    return (obj['queryChunks'] as unknown[])
      .map((chunk) => drizzleConditionToText(chunk, visited, depth + 1))
      .join(' ');
  }

  return '';
}

describe('getProfileAge — archived-profile guard', () => {
  it('[BREAK-BUG-352]', async () => {
    let capturedWhere: unknown;
    const db = {
      query: {
        profiles: {
          findFirst: jest
            .fn()
            .mockImplementation(({ where }: { where: unknown }) => {
              capturedWhere = where;
              return Promise.resolve(undefined);
            }),
        },
      },
    } as unknown as Database;

    await getProfileAge(db, 'profile-1');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});

describe('loadProfileRowById — archived-profile guard', () => {
  it('[BREAK-BUG-352]', async () => {
    let capturedWhere: unknown;
    const db = {
      query: {
        profiles: {
          findFirst: jest
            .fn()
            .mockImplementation(({ where }: { where: unknown }) => {
              capturedWhere = where;
              return Promise.resolve(undefined);
            }),
        },
      },
    } as unknown as Database;

    await loadProfileRowById(db, 'profile-1');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});

describe('getProfileAgeBracket — archived-profile guard', () => {
  it('[BREAK-BUG-352]', async () => {
    let capturedWhere: unknown;
    const db = {
      query: {
        profiles: {
          findFirst: jest
            .fn()
            .mockImplementation(({ where }: { where: unknown }) => {
              capturedWhere = where;
              return Promise.resolve(undefined);
            }),
        },
      },
    } as unknown as Database;

    await getProfileAgeBracket(db, 'profile-1');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});

describe('getProfileDisplayName — archived-profile guard', () => {
  it('[BREAK-BUG-352]', async () => {
    let capturedWhere: unknown;
    const db = {
      query: {
        profiles: {
          findFirst: jest
            .fn()
            .mockImplementation(({ where }: { where: unknown }) => {
              capturedWhere = where;
              return Promise.resolve(undefined);
            }),
        },
      },
    } as unknown as Database;

    await getProfileDisplayName(db, 'profile-1');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});
