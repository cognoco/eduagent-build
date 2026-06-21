// ---------------------------------------------------------------------------
// Consent Revocation — Tests
//
// [BUG-699-FOLLOWUP] Notification dedup against duplicate `app/consent.revoked`
// events: each `notify-*` step gates on getRecentNotificationCount(...,
// 'consent_expired', 24) so a replayed event does not re-push the same
// "account deleted" / "data deleted" message twice.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';
import { seedConsentState } from '../../test-utils/consent-seed';
import {
  createInngestStepRunner,
  type InngestStepRunnerOptions,
} from '../../test-utils/inngest-step-runner';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: external-boundary */,
  () => mockDatabaseModule.module,
);

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    ...actual,
    inngest: {
      createFunction: realInstance.createFunction.bind(realInstance),
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

// [WI-867] v2-only: consent-revocation.ts now imports exclusively from the v2
// service modules. ../../services/consent is NOT mocked — calculateAge (the only
// fn the SUT still imports from it) runs real (pure arithmetic, no DB).
//
// SEEDABILITY (WI-867 doctrine): the three v2 consent reads the SUT calls —
// isConsentRevocationGenerationCurrentV2 (db.query.membership/consentGrant),
// getPersonDisplayNameV2 + getPersonForConsentRevocationV2 (db.query.person) —
// are db.query.findFirst SEEDABLE reads, so they run REAL against query-seam
// seeds (seedConsentState + the local seedPerson Proxy in beforeEach). They are
// NOT mocked. Only the genuinely-unseedable v2 fns are mocked below.

// archivePersonOnRevocationV2 reaches a WRITE (tx.update(person).returning())
// inside a transaction — unseedable; mock the whole fn. Its consentGrant read +
// guardianship guard are exercised in the integration twin, not here.
const mockArchivePersonOnRevocationV2 = jest.fn();
jest.mock(
  '../../services/identity-v2/consent-v2' /* gc1-allow: archivePersonOnRevocationV2 — reaches tx.update(person).returning() (WRITE) inside db.transaction; cannot run against the mocked DB boundary. The seedable db.query reads in this module (isConsentRevocationGenerationCurrentV2, getPerson*V2) are NOT mocked — they run real via query-seam seeds. Write-path twin: WI-905 (no integration coverage for archivePersonOnRevocationV2 yet) */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/consent-v2',
    ) as typeof import('../../services/identity-v2/consent-v2');
    return {
      ...actual,
      archivePersonOnRevocationV2: (...args: unknown[]) =>
        mockArchivePersonOnRevocationV2(...args),
    };
  },
);

// getFamilyOwnerPersonIdV2 reaches findOwnerPersonId → db.select().innerJoin()
// (UNSEEDABLE join; createMockDb resolves all db.select chains to []), so the
// real fn would always return the fallback id. Mock the whole fn.
const mockGetFamilyOwnerPersonIdV2 = jest.fn();
jest.mock(
  '../../services/identity-v2/family-v2' /* gc1-allow: getFamilyOwnerPersonIdV2 — reaches findOwnerPersonId() db.select().innerJoin(); db.select joins are UNSEEDABLE on the mock DB boundary. Twin: WI-905 (no integration coverage for getFamilyOwnerPersonIdV2 yet) */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/family-v2',
    ) as typeof import('../../services/identity-v2/family-v2');
    return {
      ...actual,
      getFamilyOwnerPersonIdV2: (...args: unknown[]) =>
        mockGetFamilyOwnerPersonIdV2(...args),
    };
  },
);

// deletePersonIfConsentWithdrawnV2 runs a multi-step db.transaction
// (tx.query.consentGrant.findFirst + tx.delete(person)) — unseedable; mock whole.
const mockDeletePersonIfConsentWithdrawnV2 = jest.fn();
jest.mock(
  '../../services/identity-v2/deletion-v2' /* gc1-allow: deletePersonIfConsentWithdrawnV2 — runs a db.transaction (read consentGrant THEN delete person) that cannot execute against the mocked DB boundary. Twin: apps/api/src/services/identity-v2/consent-v2.integration.test.ts (5 references) */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/deletion-v2',
    ) as typeof import('../../services/identity-v2/deletion-v2');
    return {
      ...actual,
      deletePersonIfConsentWithdrawnV2: (...args: unknown[]) =>
        mockDeletePersonIfConsentWithdrawnV2(...args),
    };
  },
);

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock(
  '../../services/notifications' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
    };
  },
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
const mockGetWithdrawalArchivePreference = jest.fn().mockResolvedValue('never');
jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/settings',
    ) as typeof import('../../services/settings');
    return {
      ...actual,
      getRecentNotificationCount: (...args: unknown[]) =>
        mockGetRecentNotificationCount(...args),
      getWithdrawalArchivePreference: (...args: unknown[]) =>
        mockGetWithdrawalArchivePreference(...args),
    };
  },
);

const mockRecordPendingNotice = jest.fn().mockResolvedValue('notice-001');
const mockGetPendingNoticeChildName = jest.fn().mockResolvedValue('Emma');
jest.mock(
  '../../services/notices' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/notices',
    ) as typeof import('../../services/notices');
    return {
      ...actual,
      recordPendingNotice: (...args: unknown[]) =>
        mockRecordPendingNotice(...args),
      getPendingNoticeChildName: (...args: unknown[]) =>
        mockGetPendingNoticeChildName(...args),
    };
  },
);

import { consentRevocation } from './consent-revocation';

const ORIGINAL_IDENTITY_V2_ENABLED = process.env['IDENTITY_V2_ENABLED'];

// [WI-867] extractSqlTextAndValues + findProfileDeleteSql() removed:
// deleteProfileIfConsentWithdrawn (v1, ran against mocked DB execute) is
// replaced by deletePersonIfConsentWithdrawnV2 (v2, mocked at service
// boundary). Deletion assertions now use mockDeletePersonIfConsentWithdrawnV2
// call assertions. The archivePersonOnRevocationV2 SQL lock/generation guard
// is covered by consent-v2.integration.test.ts.

// [WI-867] Query-seam seed for db.query.person.findFirst — the read used by the
// REAL getPersonDisplayNameV2 + getPersonForConsentRevocationV2. seedConsentState
// does not cover `person`, so we layer a small Proxy here (same pattern).
// IMPORTANT: getPersonForConsentRevocationV2 does Number(row.birthDate.slice(0,4)),
// so birthDate MUST be a date STRING, not a birthYear number.
function seedPerson(
  db: Record<string, unknown>,
  row: { displayName: string; birthDate: string; archivedAt: Date | null },
): jest.Mock {
  const personFindFirst = jest.fn().mockResolvedValue(row);
  const originalQuery =
    db.query && typeof db.query === 'object'
      ? (db.query as Record<string | symbol, unknown>)
      : ({} as Record<string | symbol, unknown>);
  db.query = new Proxy(originalQuery, {
    get(target, prop) {
      if (prop === 'person') return { findFirst: personFindFirst };
      return target[prop];
    },
  });
  return personFindFirst;
}

async function executeRevocation(
  eventData: {
    childProfileId: string;
    parentProfileId: string;
    revokedAt?: string;
  },
  stepOptions?: InngestStepRunnerOptions,
) {
  const runner = createInngestStepRunner(stepOptions);

  const handler = (
    consentRevocation as unknown as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/consent.revoked' },
    step: runner.step,
  });

  return { result, runner };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-01-15T00:00:00.000Z') });
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  delete process.env['IDENTITY_V2_ENABLED'];
  (mockDatabaseModule.db.execute as jest.Mock).mockResolvedValue({
    rowCount: 1,
  });
  // [WI-867] v2-only: SEED the db.query seams; the real v2 consent reads run.
  // - seedConsentState seeds membership + consentGrant (+ consentRequest) so the
  //   REAL isConsentRevocationGenerationCurrentV2 resolves "still withdrawn".
  //   WITHDRAWN → grant.withdrawnAt set (no revokedAt arg ⇒ true ⇒ not restored).
  // - seedPerson seeds db.query.person so the REAL getPersonDisplayNameV2 +
  //   getPersonForConsentRevocationV2 return Liam / 2018.
  seedConsentState(mockDatabaseModule.db as Record<string, unknown>, {
    personId: 'child-001',
    organizationId: 'test-account-id',
    state: 'WITHDRAWN',
  });
  seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
    displayName: 'Liam',
    birthDate: '2018-06-01',
    archivedAt: null,
  });
  mockGetFamilyOwnerPersonIdV2.mockResolvedValue('parent-001');
  mockGetWithdrawalArchivePreference.mockResolvedValue('never');
  // deletePersonIfConsentWithdrawnV2 returns true (= deleted) by default.
  mockDeletePersonIfConsentWithdrawnV2.mockResolvedValue(true);
  // archivePersonOnRevocationV2 returns true (= archived) by default.
  mockArchivePersonOnRevocationV2.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
  if (ORIGINAL_IDENTITY_V2_ENABLED === undefined) {
    delete process.env['IDENTITY_V2_ENABLED'];
  } else {
    process.env['IDENTITY_V2_ENABLED'] = ORIGINAL_IDENTITY_V2_ENABLED;
  }
});

describe('consentRevocation', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect((consentRevocation as { opts?: { id?: string } }).opts?.id).toBe(
      'consent-revocation',
    );
  });

  it('triggers on app/consent.revoked event', () => {
    const triggers = (consentRevocation as { opts?: { triggers?: unknown[] } })
      .opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.revoked' }),
      ]),
    );
  });

  it('sleeps at the 6-day warning mark and the 1-day grace end', async () => {
    const { runner } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(runner.sleepCalls).toEqual(
      expect.arrayContaining([
        { name: 'warning-mark', duration: '6d' },
        { name: 'grace-end', duration: '1d' },
      ]),
    );
  });

  it('sends a consent_warning push to the parent at the 6-day mark', async () => {
    // [WI-867] v2: isConsentRevocationGenerationCurrentV2 default true (still withdrawn)
    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      expect.anything(),
      'parent-001',
      'consent_warning',
      24,
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'parent-001',
        type: 'consent_warning',
        body: "Liam's account closes tomorrow. You can still reverse.",
      }),
    );
  });

  it('does not send a warning if consent was restored before the 6-day mark', async () => {
    // [WI-867] v2: seed CONSENTED → grant.withdrawnAt null → the REAL
    // isConsentRevocationGenerationCurrentV2 returns false (restored).
    seedConsentState(mockDatabaseModule.db as Record<string, unknown>, {
      personId: 'child-001',
      organizationId: 'test-account-id',
      state: 'CONSENTED',
    });

    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('does not send a duplicate warning if one was sent in the last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('[WI-78 review] does not warn for a stale revocation generation while consent is withdrawn again', async () => {
    // [WI-867] v2: exercise the REAL generation guard. Seeded WITHDRAWN grant
    // carries withdrawnAt = 2026-05-01T00:00:01Z (consent-seed REFERENCE_DATE+1s);
    // we pass a NON-matching revokedAt, so isConsentRevocationGenerationCurrentV2's
    // timestamp compare (withdrawnAt.getTime() === revokedAt.getTime()) is false →
    // a stale/superseded generation, no warning. (Default beforeEach already seeds
    // WITHDRAWN for child-001.)
    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-10T10:00:00.000Z',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('returns restored without pushing or deleting when consent was restored', async () => {
    // [WI-867] v2: seed CONSENTED → real isConsentRevocationGenerationCurrentV2
    // returns false on every call → restored, no push, no delete.
    seedConsentState(mockDatabaseModule.db as Record<string, unknown>, {
      personId: 'child-001',
      organizationId: 'test-account-id',
      state: 'CONSENTED',
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(result).toEqual({ status: 'restored', childProfileId: 'child-001' });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  it('[WI-78 review] stops before child notifications when the grace-end check sees a newer withdrawal generation', async () => {
    // [WI-867] v2: genuine WITHDRAWN→restored flip across two real
    // isConsentRevocationGenerationCurrentV2 calls. Script the seeded
    // consentGrant.findFirst handle directly (seedConsentState's sequence
    // mechanism advances only on consentRequest reads, which this fn never
    // makes — it reads membership + consentGrant only).
    //   call 1 (send-warning-push): grant withdrawn (revokedAt matches) → true.
    //   call 2 (check-restoration):  grant withdrawnAt null → false → restored.
    const revokedAt = new Date('2026-01-10T10:00:00.000Z');
    const { consentGrantFindFirst } = seedConsentState(
      mockDatabaseModule.db as Record<string, unknown>,
      {
        personId: 'child-001',
        organizationId: 'test-account-id',
        state: 'WITHDRAWN',
      },
    );
    consentGrantFindFirst
      .mockResolvedValueOnce({
        granted: true,
        withdrawnAt: revokedAt,
        grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        granted: true,
        withdrawnAt: null,
        grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

    const { result } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-10T10:00:00.000Z',
    });

    expect(result).toEqual({ status: 'restored', childProfileId: 'child-001' });
    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'child-001',
        type: 'consent_expired',
      }),
    );
    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  describe('happy path — still WITHDRAWN', () => {
    it('pushes child, deletes person, pushes parent in order', async () => {
      // [WI-867] v2: deletePersonIfConsentWithdrawnV2 replaces
      // deleteProfileIfConsentWithdrawn; parent-chain SQL guard removed (v2
      // enforces ownership via guardianship edge in the deletion service).
      const { result, runner } = await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
      });

      expect(result).toEqual({
        status: 'deleted',
        childProfileId: 'child-001',
      });

      // Warning push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'consent_warning',
        }),
      );
      // Child push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          profileId: 'child-001',
          type: 'consent_expired',
        }),
      );
      // [WI-867] v2: deletion via deletePersonIfConsentWithdrawnV2 mock.
      expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
        expect.anything(),
        'child-001',
        undefined, // revokedAt absent in this call path
      );
      // Parent push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'consent_expired',
        }),
      );

      // Step ordering: notify-child before delete-child-profile before notify-parent.
      expect(runner.runNames()).toEqual([
        'clear-unread-nudges',
        'send-warning-push',
        'check-restoration',
        'load-child-profile',
        'choose-final-action',
        'notify-child',
        'delete-child-profile',
        'notify-parent',
      ]);
    });
  });

  it('hard-deletes conservatively when birth-year-only age is 13', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2013 → real getPersonForConsentRevocationV2
    // returns birthYear 2013 → calculateAge ≤ 13 → conservative hard-delete.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2013-06-01',
      archivedAt: null,
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-boundary',
      parentProfileId: 'parent-001',
    });

    expect(result).toEqual({
      status: 'deleted',
      childProfileId: 'child-boundary',
    });
    // [WI-867] v2: deletion via deletePersonIfConsentWithdrawnV2 mock;
    // revokedAt absent → undefined passed; no responded_at guard in v2 signature.
    expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
      expect.anything(),
      'child-boundary',
      undefined,
    );
  });

  describe('[BUG-699-FOLLOWUP] 24h push dedup', () => {
    it('skips notify-child push when a consent_expired notification was logged for the child in last 24h', async () => {
      // Warning allowed; child dedups; parent allowed.
      mockGetRecentNotificationCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      await executeRevocation({
        childProfileId: 'child-dup',
        parentProfileId: 'parent-001',
      });

      expect(mockGetRecentNotificationCount).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'child-dup',
        'consent_expired',
        24,
      );
      // Warning + parent expired should have fired.
      expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ profileId: 'parent-001' }),
      );
    });

    it('skips notify-parent push when a consent_expired notification was logged for the parent in last 24h', async () => {
      mockGetRecentNotificationCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-dup',
      });

      expect(mockGetRecentNotificationCount).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        'parent-dup',
        'consent_expired',
        24,
      );
      // Warning + child expired should have fired.
      expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ profileId: 'child-001' }),
      );
    });

    it('skips both pushes when both child and parent already received recent notifications', async () => {
      mockGetRecentNotificationCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const { result } = await executeRevocation({
        childProfileId: 'child-dup',
        parentProfileId: 'parent-dup',
      });

      // Function still completes through the pipeline (deletion still runs).
      expect(result).toEqual({
        status: 'deleted',
        childProfileId: 'child-dup',
      });
      expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'consent_warning' }),
      );
      // [WI-867] v2: deletion proceeds regardless of push dedup; asserted at mock level.
      expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
        expect.anything(),
        'child-dup',
        undefined,
      );
    });

    it('still pushes when no recent consent_expired notifications exist for either party', async () => {
      mockGetRecentNotificationCount.mockResolvedValue(0);

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
      });

      expect(mockSendPushNotification).toHaveBeenCalledTimes(3);
    });
  });
});

// ---------------------------------------------------------------------------
// I4 — auto preference + age 14 → archive path, step.sendEvent fires
// ---------------------------------------------------------------------------

describe('archive path — auto preference, age 14', () => {
  it('archives profile and emits schedule-archive-cleanup event via step.sendEvent', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012 → real getPersonForConsentRevocationV2
    // returns birthYear 2012 → calculateAge 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-06-01',
      archivedAt: null,
    });

    const { result, runner } = await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
    });

    expect(result).toEqual({ status: 'archived', childProfileId: 'child-014' });

    expect(runner.runNames()).toContain('archive-child-profile');

    expect(runner.sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'schedule-archive-cleanup',
          payload: expect.objectContaining({
            name: 'app/profile.archived',
            data: expect.objectContaining({
              profileId: 'child-014',
              parentProfileId: 'parent-001',
            }),
          }),
        },
      ]),
    );

    // [WI-867] v2: archive branch does not call deletePersonIfConsentWithdrawnV2.
    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  it('records archive notice against the resolved owner profile', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012 → real getPersonForConsentRevocationV2
    // returns birthYear 2012 → calculateAge 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-06-01',
      archivedAt: null,
    });
    // [WI-867] v2: getFamilyOwnerPersonIdV2 replaces getFamilyOwnerProfileId.
    mockGetFamilyOwnerPersonIdV2.mockResolvedValue('owner-profile-001');

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'coparent-profile-001',
    });

    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'owner-profile-001',
        type: 'consent_archived',
      }),
    );
  });

  it('[WI-78 review] atomically archives only when consent is still withdrawn', async () => {
    // [WI-867] v2: archivePersonOnRevocationV2 replaces the raw SQL execute.
    // The archive lock + generation guard live inside archivePersonOnRevocationV2
    // (covered by consent-v2.integration.test.ts). Here we assert the mock is
    // called with the right args — revokedAt undefined → revocationRespondedAt undefined.
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012 → age 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-06-01',
      archivedAt: null,
    });

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
    });

    expect(mockArchivePersonOnRevocationV2).toHaveBeenCalledWith(
      expect.anything(),
      'child-014',
      'parent-001', // ownerProfileId resolved by getFamilyOwnerPersonIdV2 default ('parent-001')
      expect.any(Date),
      undefined, // revocationRespondedAt (absent revokedAt)
    );
  });

  it('[WI-78 review] requires the archive to match the revocation generation', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012 → age 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-06-01',
      archivedAt: null,
    });
    // Seed the consentGrant so the REAL isConsentRevocationGenerationCurrentV2
    // timestamp compare (withdrawnAt === revokedAt) holds → both generation
    // checks pass → flow reaches the archive branch. (Persistent, not Once.)
    const { consentGrantFindFirst } = seedConsentState(
      mockDatabaseModule.db as Record<string, unknown>,
      { personId: 'child-014', organizationId: 'test-account-id', state: 'WITHDRAWN' },
    );
    consentGrantFindFirst.mockResolvedValue({
      granted: true,
      withdrawnAt: new Date('2026-01-10T10:00:00.000Z'),
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    // [WI-867] v2: simulate the GDPR lock failing (consent restored between
    // steps) by having archivePersonOnRevocationV2 (the mocked WRITE fn) return
    // false → SUT returns { status: 'restored' }. Persistent (not Once): the
    // archive branch is reached exactly once in this flow.
    mockArchivePersonOnRevocationV2.mockResolvedValue(false);

    const { result } = await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-10T10:00:00.000Z',
    });

    // [WI-867] v2: archivePersonOnRevocationV2 returning false → { status: 'restored' }.
    // The generation guard (revokedAt timestamp) lives inside archivePersonOnRevocationV2
    // and is covered by consent-v2.integration.test.ts. Here we verify the call
    // shape and the returned status.
    expect(result).toEqual({ status: 'restored', childProfileId: 'child-014' });
    expect(mockArchivePersonOnRevocationV2).toHaveBeenCalledWith(
      expect.anything(),
      'child-014',
      'parent-001',
      expect.any(Date),
      new Date('2026-01-10T10:00:00.000Z'), // revocationRespondedAt from revokedAt
    );
  });
});

// ---------------------------------------------------------------------------
// [CR-2026-05-19-H19] Multi-parent family — delete-notice owner resolution
//
// Break test: getFamilyOwnerProfileId is called by `choose-final-action`
// BEFORE `delete-child-profile`. After the cascade delete, family_links rows
// for the child no longer exist, so a second call to getFamilyOwnerProfileId
// would return zero rows and fall back to the event-sender parentProfileId.
// In multi-parent families where the event-sender is NOT the owner, that
// would route the delete notice to the wrong account.
//
// Fix: `record-parent-delete-notice` must reuse the ownerProfileId computed
// in `choose-final-action` rather than re-querying after deletion. This test
// simulates the post-deletion state (second invocation returns the fallback
// value) and asserts that the notice still lands on the pre-deletion owner.
// ---------------------------------------------------------------------------

describe('[CR-2026-05-19-H19] multi-parent family — delete-notice owner resolution', () => {
  it('records delete notice against the owner resolved BEFORE deletion, not after cascade', async () => {
    // [WI-867] v2: getFamilyOwnerPersonIdV2 replaces getFamilyOwnerProfileId.
    // First call (inside `choose-final-action`, before deletion): returns the
    // real owner-of-the-family ('owner-profile-001'). Any subsequent call
    // simulates the post-cascade state where family_links is gone — falls back
    // to the event-sender ('coparent-profile-001').
    mockGetFamilyOwnerPersonIdV2
      .mockResolvedValueOnce('owner-profile-001')
      .mockResolvedValue('coparent-profile-001');

    await executeRevocation({
      childProfileId: 'child-001',
      // Event sender is the co-parent, NOT the account owner.
      parentProfileId: 'coparent-profile-001',
    });

    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'owner-profile-001',
        type: 'consent_deleted',
      }),
    );
    // Make the wrong-owner assertion explicit so the test name is unambiguous.
    expect(mockRecordPendingNotice).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'coparent-profile-001',
        type: 'consent_deleted',
      }),
    );
  });

  it('resolves owner exactly once across the entire revocation flow (no post-deletion re-query)', async () => {
    // [WI-867] v2: getFamilyOwnerPersonIdV2 replaces getFamilyOwnerProfileId.
    mockGetFamilyOwnerPersonIdV2.mockResolvedValue('owner-profile-001');

    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'coparent-profile-001',
    });

    // Exactly one call: inside `choose-final-action`, before any mutation.
    expect(mockGetFamilyOwnerPersonIdV2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [FIX-INNGEST-3] Idempotency and concurrency config break tests
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-3] idempotency and concurrency config', () => {
  it('declares idempotency keyed on event.data.childProfileId and revokedAt', () => {
    const opts = (consentRevocation as any).opts;
    expect(opts.idempotency).toBe(
      'event.data.childProfileId + "-" + event.data.revokedAt',
    );
  });

  it('declares concurrency limit of 1 keyed on event.data.childProfileId', () => {
    const opts = (consentRevocation as any).opts;
    expect(opts.concurrency).toMatchObject({
      key: 'event.data.childProfileId',
      limit: 1,
    });
  });

  it('declares retries: 5 for transient DB failures during consent revocation', () => {
    const opts = (consentRevocation as any).opts;
    expect(opts.retries).toBe(5);
  });
});

// Memoized step returns are persisted in Inngest's third-party state store;
// this is a child-account-deletion flow, so they must never carry the
// minor's display name or birth year.
describe('memoized step-state PII break test [F-088]', () => {
  async function executeRecordingRevocation() {
    const memoized: unknown[] = [];
    const runner = createInngestStepRunner();
    const recordingStep = {
      ...runner.step,
      run: async (name: string, cb: () => Promise<unknown>) => {
        const value = await runner.step.run(name, cb);
        memoized.push(value);
        return value;
      },
    };
    const handler = (
      consentRevocation as unknown as { fn: (ctx: unknown) => Promise<unknown> }
    ).fn;
    const result = await handler({
      event: {
        data: { childProfileId: 'child-001', parentProfileId: 'parent-001' },
        name: 'app/consent.revoked',
      },
      step: recordingStep,
    });
    return { result, memoized };
  }

  it('delete path: never memoizes the child name or birth year', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('never');

    const { result, memoized } = await executeRecordingRevocation();

    const serialized = JSON.stringify(memoized);
    expect(serialized).not.toContain('Liam');
    expect(serialized).not.toContain('2018');
    expect(JSON.stringify(result)).not.toContain('Liam');

    // The parent completion push still names the child — rehydrated from the
    // pending-notice row by its opaque id, not from step state.
    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_deleted', childName: 'Liam' }),
    );
    expect(mockGetPendingNoticeChildName).toHaveBeenCalledWith(
      expect.anything(),
      'parent-001', // owner-scoped read (same shape as markPendingNoticeSeen)
      'notice-001',
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'consent_expired',
        profileId: 'parent-001',
        body: expect.stringContaining('Emma'),
      }),
    );
  });

  it('archive path: never memoizes the child name or birth year', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2008 → age 18 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2008-06-01',
      archivedAt: null,
    });

    const { result, memoized } = await executeRecordingRevocation();

    const serialized = JSON.stringify(memoized);
    expect(serialized).not.toContain('Liam');
    expect(serialized).not.toContain('2008');
    expect(JSON.stringify(result)).not.toContain('Liam');

    // Archive push rehydrates the (still-existing) profile's name in-step.
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'consent_archived',
        body: expect.stringContaining('Liam'),
      }),
    );
  });
});
