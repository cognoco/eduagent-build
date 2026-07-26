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
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import {
  createInngestStepRunner,
  type InngestStepRunnerOptions,
} from '../../test-utils/inngest-step-runner';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

function mockWithdrawnGrantSet(
  consentGrantFindFirst: jest.Mock,
  withdrawnAt: Date,
): void {
  let grantReadCount = 0;
  consentGrantFindFirst.mockImplementation(async () => {
    const purpose = CONSENT_PURPOSES[grantReadCount % CONSENT_PURPOSES.length];
    if (!purpose) {
      throw new Error('consent purpose contract is empty');
    }
    grantReadCount++;
    return {
      id: `grant-${purpose}`,
      purpose,
      granted: true,
      withdrawnAt,
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      withdrawalTokenId: 'withdrawal-token-id',
    };
  });
}

jest.mock(
  '@eduagent/database' /* gc1-allow: external-boundary */,
  () => mockDatabaseModule.module,
);

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => {
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
// service modules. ../../services/consent is NOT mocked — calculateAgeFromParts
// (the only fn the SUT still imports from it) runs real (pure arithmetic, no DB).
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
jest.mock('../../services/notifications', () => {
  const actual = jest.requireActual(
    '../../services/notifications',
  ) as typeof import('../../services/notifications');
  return {
    ...actual,
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
  };
});

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
const mockGetWithdrawalArchivePreference = jest.fn().mockResolvedValue('never');
jest.mock('../../services/settings', () => {
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
});

const mockRecordPendingNotice = jest.fn().mockResolvedValue('notice-001');
const mockGetPendingNoticeChildName = jest.fn().mockResolvedValue('Emma');
jest.mock('../../services/notices', () => {
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
});

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
    // [WI-973] revokedAt is now required by the schema. Tests that previously
    // omitted it were exercising the old vacuous-pass path (the bug). All tests
    // that represent "a legitimate revocation event" must supply a revokedAt.
    // Tests that intentionally omit it are in the WI-973 regression suite.
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
      // [WI-369] GDPR regulatory notice — must bypass the recipient's push
      // preference so the warning always delivers.
      { bypassPreferenceCheck: true },
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
        revokedAt: '2026-05-01T00:00:01.000Z',
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
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
      );
      // Child push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          profileId: 'child-001',
          type: 'consent_expired',
        }),
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
      );
      // [WI-867] v2: deletion via deletePersonIfConsentWithdrawnV2 mock.
      expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
        expect.anything(),
        'child-001',
        // [WI-867 re-derive] source forwards the event revokedAt (now aligned to
        // the consent-seed withdrawnAt) to the v2 deletion seam.
        new Date('2026-05-01T00:00:01.000Z'),
      );
      // Parent push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'consent_expired',
        }),
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
      new Date('2026-05-01T00:00:01.000Z'),
    );
  });

  // [WI-367] When the full birth date is persisted, the COPPA hard-delete
  // boundary uses EXACT age, not the year-only overestimate. Clock is faked to
  // 2026-01-15 (beforeEach). A child born 2012-06-15 is year-diff 14 but exactly
  // 13 on
  // 2026-01-15 (birthday not yet passed) → must hard-delete (the COPPA-protective
  // direction). This is the precision the year-only path could not express.
  it('hard-deletes when full-date exact age is 13 though year-only age is 14', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    const { consentGrantFindFirst } = seedConsentState(
      mockDatabaseModule.db as Record<string, unknown>,
      {
        personId: 'child-exact-13',
        organizationId: 'test-account-id',
        state: 'WITHDRAWN',
      },
    );
    mockWithdrawnGrantSet(
      consentGrantFindFirst,
      new Date('2026-01-15T00:00:00.000Z'),
    );
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-06-15',
      archivedAt: null,
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-exact-13',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'deleted',
      childProfileId: 'child-exact-13',
    });
    expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
      expect.anything(),
      'child-exact-13',
      new Date('2026-01-15T00:00:00.000Z'),
    );
  });

  // [WI-367] Companion: same birthYear (2012) but a birthday already passed by
  // the faked clock (2012-01-01 → exact age 14) archives, matching the year-only
  // path — proving the exact path only diverges when the birthday is genuinely
  // not yet passed, not for every full-date row.
  it('archives when full-date exact age is 14 (birthday already passed)', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    const { consentGrantFindFirst } = seedConsentState(
      mockDatabaseModule.db as Record<string, unknown>,
      {
        personId: 'child-exact-14',
        organizationId: 'test-account-id',
        state: 'WITHDRAWN',
      },
    );
    mockWithdrawnGrantSet(
      consentGrantFindFirst,
      new Date('2026-01-15T00:00:00.000Z'),
    );
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-01-01',
      archivedAt: null,
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-exact-14',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'archived',
      childProfileId: 'child-exact-14',
    });
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
        revokedAt: '2026-05-01T00:00:01.000Z',
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
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
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
        revokedAt: '2026-05-01T00:00:01.000Z',
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
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
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
        revokedAt: '2026-05-01T00:00:01.000Z',
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
        // [WI-369] consent push bypasses preference (GDPR regulatory notice).
        { bypassPreferenceCheck: true },
      );
      // [WI-867] v2: deletion proceeds regardless of push dedup; asserted at mock level.
      expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
        expect.anything(),
        'child-dup',
        new Date('2026-05-01T00:00:01.000Z'),
      );
    });

    it('still pushes when no recent consent_expired notifications exist for either party', async () => {
      mockGetRecentNotificationCount.mockResolvedValue(0);

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
        revokedAt: '2026-05-01T00:00:01.000Z',
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
    // [WI-867] v2: seed person birthDate 2012-01-01; under the faked
    // 2026-01-15 clock, exact age is 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-01-01',
      archivedAt: null,
    });

    const { result, runner } = await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-05-01T00:00:01.000Z',
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
    // [WI-867] v2: seed person birthDate 2012-01-01; under the faked
    // 2026-01-15 clock, exact age is 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-01-01',
      archivedAt: null,
    });
    // [WI-867] v2: getFamilyOwnerPersonIdV2 replaces getFamilyOwnerProfileId.
    mockGetFamilyOwnerPersonIdV2.mockResolvedValue('owner-profile-001');

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'coparent-profile-001',
      revokedAt: '2026-05-01T00:00:01.000Z',
    });

    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'owner-profile-001',
        type: 'consent_archived',
        sourceId: 'consent-revocation:child-014:2026-05-01T00:00:01.000Z',
      }),
    );
  });

  it('[WI-78 review] atomically archives only when consent is still withdrawn', async () => {
    // [WI-867] v2: archivePersonOnRevocationV2 replaces the raw SQL execute.
    // The archive lock + generation guard live inside archivePersonOnRevocationV2
    // (covered by consent-v2.integration.test.ts). Here we assert the mock is
    // called with the right args — revokedAt undefined → revocationRespondedAt undefined.
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012-01-01 → exact age 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-01-01',
      archivedAt: null,
    });

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-05-01T00:00:01.000Z',
    });

    expect(mockArchivePersonOnRevocationV2).toHaveBeenCalledWith(
      expect.anything(),
      'child-014',
      'parent-001', // ownerProfileId resolved by getFamilyOwnerPersonIdV2 default ('parent-001')
      expect.any(Date),
      new Date('2026-05-01T00:00:01.000Z'), // revocationRespondedAt = event revokedAt
    );
  });

  it('[WI-78 review] requires the archive to match the revocation generation', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2012-01-01 → exact age 14 → archive branch.
    seedPerson(mockDatabaseModule.db as Record<string, unknown>, {
      displayName: 'Liam',
      birthDate: '2012-01-01',
      archivedAt: null,
    });
    // Seed the consentGrant so the REAL isConsentRevocationGenerationCurrentV2
    // timestamp compare (withdrawnAt === revokedAt) holds → both generation
    // checks pass → flow reaches the archive branch. (Persistent, not Once.)
    const { consentGrantFindFirst } = seedConsentState(
      mockDatabaseModule.db as Record<string, unknown>,
      {
        personId: 'child-014',
        organizationId: 'test-account-id',
        state: 'WITHDRAWN',
      },
    );
    mockWithdrawnGrantSet(
      consentGrantFindFirst,
      new Date('2026-01-10T10:00:00.000Z'),
    );
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
      revokedAt: '2026-05-01T00:00:01.000Z',
    });

    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'owner-profile-001',
        type: 'consent_deleted',
        sourceId: 'consent-revocation:child-001:2026-05-01T00:00:01.000Z',
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
      revokedAt: '2026-05-01T00:00:01.000Z',
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
        data: {
          childProfileId: 'child-001',
          parentProfileId: 'parent-001',
          revokedAt: '2026-05-01T00:00:01.000Z',
        },
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
      expect.objectContaining({
        type: 'consent_deleted',
        childName: 'Liam',
        sourceId: 'consent-revocation:child-001:2026-05-01T00:00:01.000Z',
      }),
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
      // [WI-369] consent push bypasses preference (GDPR regulatory notice).
      { bypassPreferenceCheck: true },
    );
  });

  it('archive path: never memoizes the child name or birth year', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    // [WI-867] v2: seed person birthDate 2008 → older than the COPPA boundary.
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
      // [WI-369] consent push bypasses preference (GDPR regulatory notice).
      { bypassPreferenceCheck: true },
    );
  });
});

// ---------------------------------------------------------------------------
// [WI-997] onFailure dead-letter handler — GDPR cascade-delete terminal failure
//
// Red → green: remove the onFailure key from the createFunction config and the
// first test fails (opts.onFailure is undefined); remove the captureMessage
// call and the second test fails; remove the safeSend call and the third fails.
//
// onFailure runs OUTSIDE the original Sentry async scope — captureMessage
// (not captureException) is used so the message scopes cleanly without a live
// Sentry scope. safeSend (not bare inngest.send) is used because a failure of
// the dead-letter dispatch must not surface as a second crash (non-core).
// ---------------------------------------------------------------------------

import * as sentry from '../../services/sentry';
import * as safeNonCore from '../../services/safe-non-core';

describe('[WI-997] onFailure dead-letter handler', () => {
  type OnFailureArgs = {
    event: { data: { event?: { data?: unknown }; run_id?: string } };
    error: unknown;
  };

  function getOnFailure() {
    return (consentRevocation as any).opts.onFailure as
      | ((args: OnFailureArgs) => Promise<void>)
      | undefined;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[BREAK] declares an onFailure handler', () => {
    expect(typeof getOnFailure()).toBe('function');
  });

  it('[BREAK] calls captureMessage(level=error) with childProfileId/parentProfileId on terminal failure', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    jest.spyOn(safeNonCore, 'safeSend').mockResolvedValue(undefined);

    const onFailure = getOnFailure()!;
    await onFailure({
      event: {
        data: {
          event: {
            data: {
              childProfileId: 'child-revoke-001',
              parentProfileId: 'parent-revoke-001',
            },
          },
          run_id: 'run-revoke-abc',
        },
      },
      error: new Error('DB connection lost'),
    });

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      expect.stringContaining('child-revoke-001'),
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({
          surface: 'consent-revocation.terminal_failure',
          childProfileId: 'child-revoke-001',
          parentProfileId: 'parent-revoke-001',
          runId: 'run-revoke-abc',
        }),
      }),
    );
  });

  it('[BREAK] calls safeSend with app/consent.revocation.failed event on terminal failure', async () => {
    jest.spyOn(sentry, 'captureMessage').mockImplementation(() => undefined);
    const safeSendSpy = jest
      .spyOn(safeNonCore, 'safeSend')
      .mockResolvedValue(undefined);

    const onFailure = getOnFailure()!;
    await onFailure({
      event: {
        data: {
          event: {
            data: {
              childProfileId: 'child-revoke-001',
              parentProfileId: 'parent-revoke-001',
            },
          },
          run_id: 'run-revoke-abc',
        },
      },
      error: new Error('DB connection lost'),
    });

    expect(safeSendSpy).toHaveBeenCalledTimes(1);
    // First arg is a thunk (() => inngest.send(...)) — invoke it so we can
    // inspect the event name it would dispatch.
    const [sendThunk, surface, context] = safeSendSpy.mock.calls[0]!;
    expect(surface).toBe('consent-revocation.terminal_failure');
    expect(context).toMatchObject({
      childProfileId: 'child-revoke-001',
      parentProfileId: 'parent-revoke-001',
    });
    // Invoke the thunk to confirm it tries to send the right event name.
    // mockInngestSend is already wired to the inngest.send stub in this file.
    await expect(sendThunk()).resolves.not.toThrow();
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/consent.revocation.failed',
        data: expect.objectContaining({
          childProfileId: 'child-revoke-001',
          parentProfileId: 'parent-revoke-001',
          error: 'DB connection lost',
        }),
      }),
    );
  });

  it('tolerates missing original event payload (null childProfileId/parentProfileId)', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    jest.spyOn(safeNonCore, 'safeSend').mockResolvedValue(undefined);

    const onFailure = getOnFailure()!;
    // No event.data.event — simulates an Inngest onFailure with no original payload
    await expect(
      onFailure({ event: { data: {} }, error: 'string-rejection' }),
    ).resolves.not.toThrow();

    expect(captureSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown'),
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({
          childProfileId: null,
          parentProfileId: null,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [WI-973] Regression: malformed app/consent.revoked events must throw
// NonRetriableError and must NOT reach the deletion path.
// ---------------------------------------------------------------------------

import { NonRetriableError } from 'inngest';

describe('[WI-973] malformed consent.revoked payload — NonRetriableError guard', () => {
  it('throws NonRetriableError when revokedAt is omitted, and does NOT call deletePersonIfConsentWithdrawnV2', async () => {
    await expect(
      executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
        // revokedAt intentionally omitted — this is the malformed case
      }),
    ).rejects.toThrow(NonRetriableError);

    // Deletion must NOT have been reached.
    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  it('throws NonRetriableError when childProfileId is absent', async () => {
    const runner = createInngestStepRunner();
    const handler = (
      consentRevocation as unknown as { fn: (ctx: unknown) => Promise<unknown> }
    ).fn;
    await expect(
      handler({
        event: {
          data: {
            parentProfileId: 'parent-001',
            revokedAt: '2026-01-10T10:00:00.000Z',
          },
          name: 'app/consent.revoked',
        },
        step: runner.step,
      }),
    ).rejects.toThrow(NonRetriableError);

    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });
});
