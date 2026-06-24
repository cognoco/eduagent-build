// ---------------------------------------------------------------------------
// Consent Revocation — Tests
//
// [BUG-699-FOLLOWUP] Notification dedup against duplicate `app/consent.revoked`
// events: each `notify-*` step gates on getRecentNotificationCount(...,
// 'consent_expired', 24) so a replayed event does not re-push the same
// "account deleted" / "data deleted" message twice.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';
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

const mockGetConsentStatus = jest.fn();
const mockIsConsentRevocationGenerationCurrent = jest.fn();
const mockGetProfileDisplayName = jest.fn();
const mockGetProfileForConsentRevocation = jest.fn();
const mockGetFamilyOwnerProfileId = jest.fn();
jest.mock(
  '../../services/consent' /* gc1-allow: pattern-a conversion — DB-backed; calculateAge kept real */,
  () => {
    const actual = jest.requireActual(
      '../../services/consent',
    ) as typeof import('../../services/consent');
    return {
      ...actual,
      // consentRevocation only reaches calculateAge plus the four DB-backed
      // functions below; add an override here if the SUT gains another call.
      getFamilyOwnerProfileId: (...args: unknown[]) =>
        mockGetFamilyOwnerProfileId(...args),
      getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
      isConsentRevocationGenerationCurrent: (...args: unknown[]) =>
        mockIsConsentRevocationGenerationCurrent(...args),
      getProfileForConsentRevocation: (...args: unknown[]) =>
        mockGetProfileForConsentRevocation(...args),
      getProfileDisplayName: (...args: unknown[]) =>
        mockGetProfileDisplayName(...args),
    };
  },
);

// [GC6] services/deletion is NOT mocked: the real
// deleteProfileIfConsentWithdrawn runs against the mocked @eduagent/database
// boundary (db.execute resolves { rowCount: 1 } in beforeEach). Deletion
// behaviour is asserted at the SQL level via findProfileDeleteSql().

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

function extractSqlTextAndValues(
  node: unknown,
  visited = new WeakSet<object>(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [String(node).toLowerCase()];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj['value'] === 'string') values.push(obj['value'].toLowerCase());
  if (Array.isArray(obj['value'])) {
    for (const item of obj['value']) {
      values.push(...extractSqlTextAndValues(item, visited));
    }
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
}

/**
 * [GC6] Returns the lowercased text+values of the first db.execute call whose
 * SQL is the profile DELETE issued by the real deleteProfileIfConsentWithdrawn,
 * or undefined when no delete was issued.
 */
function findProfileDeleteSql(): string | undefined {
  const calls = (mockDatabaseModule.db.execute as jest.Mock).mock.calls;
  return calls
    .map((call: unknown[]) => extractSqlTextAndValues(call[0]).join(' '))
    .find((text: string) => text.includes('delete from profiles'));
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
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
  mockIsConsentRevocationGenerationCurrent.mockResolvedValue(true);
  mockGetProfileDisplayName.mockResolvedValue('Liam');
  mockGetProfileForConsentRevocation.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2018,
    archivedAt: null,
  });
  mockGetFamilyOwnerProfileId.mockResolvedValue('parent-001');
  mockGetWithdrawalArchivePreference.mockResolvedValue('never');
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
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(runner.sleepCalls).toEqual(
      expect.arrayContaining([
        { name: 'warning-mark', duration: '6d' },
        { name: 'grace-end', duration: '1d' },
      ]),
    );
  });

  it('sends a consent_warning push to the parent at the 6-day mark', async () => {
    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
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
    mockGetConsentStatus.mockResolvedValue('CONSENTED');
    mockIsConsentRevocationGenerationCurrent.mockResolvedValue(false);

    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
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
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('[WI-78 review] does not warn for a stale revocation generation while consent is withdrawn again', async () => {
    mockIsConsentRevocationGenerationCurrent.mockResolvedValueOnce(false);

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
    mockGetConsentStatus
      .mockResolvedValueOnce('CONSENTED')
      .mockResolvedValueOnce('CONSENTED');
    mockIsConsentRevocationGenerationCurrent.mockResolvedValue(false);

    const { result } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({ status: 'restored', childProfileId: 'child-001' });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(findProfileDeleteSql()).toBeUndefined();
  });

  it('[WI-78 review] stops before child notifications when the grace-end check sees a newer withdrawal generation', async () => {
    mockIsConsentRevocationGenerationCurrent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

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
    expect(findProfileDeleteSql()).toBeUndefined();
  });

  describe('happy path — still WITHDRAWN', () => {
    it('pushes child, deletes profile, pushes parent in order', async () => {
      const { result, runner } = await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
        revokedAt: '2026-01-15T00:00:00.000Z',
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
      // Profile deletion — the real deleteProfileIfConsentWithdrawn issues the
      // DELETE through the mocked db.execute. [F-093] the SQL must carry the
      // parent-chain account guard bound to the resolved ownerProfileId.
      const deleteSql = findProfileDeleteSql();
      expect(deleteSql).toBeDefined();
      expect(deleteSql).toContain('child-001');
      expect(deleteSql).toContain(
        'account_id = (select account_id from profiles where id =',
      );
      expect(deleteSql).toContain('parent-001');
      // Parent push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'consent_expired',
        }),
      );

      // Step ordering: notify-child before delete-child-profile before
      // notify-parent. The delete notice is recorded inside
      // delete-child-profile (name captured pre-delete, memoized as an
      // opaque notice id — never the name itself).
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
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2013,
      archivedAt: null,
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-boundary',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'deleted',
      childProfileId: 'child-boundary',
    });
    // [F-093] real DELETE SQL carries the account guard. revokedAt is now
    // required by the schema (WI-973), so responded_at appears in the SQL.
    const deleteSql = findProfileDeleteSql();
    expect(deleteSql).toBeDefined();
    expect(deleteSql).toContain('child-boundary');
    expect(deleteSql).toContain(
      'account_id = (select account_id from profiles where id =',
    );
    expect(deleteSql).toContain('parent-001');
    expect(deleteSql).toContain('responded_at');
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
        revokedAt: '2026-01-15T00:00:00.000Z',
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
        revokedAt: '2026-01-15T00:00:00.000Z',
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
        revokedAt: '2026-01-15T00:00:00.000Z',
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
      // Profile deletion proceeds regardless of push dedup. [F-093] the real
      // DELETE SQL carries the account guard bound to the resolved owner.
      const deleteSql = findProfileDeleteSql();
      expect(deleteSql).toBeDefined();
      expect(deleteSql).toContain('child-dup');
      expect(deleteSql).toContain(
        'account_id = (select account_id from profiles where id =',
      );
      expect(deleteSql).toContain('parent-001');
    });

    it('still pushes when no recent consent_expired notifications exist for either party', async () => {
      mockGetRecentNotificationCount.mockResolvedValue(0);

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
        revokedAt: '2026-01-15T00:00:00.000Z',
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
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });

    const { result, runner } = await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
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

    // delete must NOT have been issued (archive branch only UPDATEs)
    expect(findProfileDeleteSql()).toBeUndefined();
  });

  it('records archive notice against the resolved owner profile', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });
    mockGetFamilyOwnerProfileId.mockResolvedValue('owner-profile-001');

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'coparent-profile-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockRecordPendingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerProfileId: 'owner-profile-001',
        type: 'consent_archived',
      }),
    );
  });

  it('[WI-78 review] locks the GDPR consent row before archiving the profile', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });

    await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    const sqlArg = (mockDatabaseModule.db.execute as jest.Mock).mock
      .calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('with locked_consent');
    expect(sqlText).toContain('for update');
    expect(sqlText).toContain('consent_type');
    expect(sqlText).toContain('gdpr');
    expect(sqlText).toContain('withdrawn');
  });

  it('[WI-78 review] requires the archive to match the revocation generation', async () => {
    mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });
    (mockDatabaseModule.db.execute as jest.Mock).mockResolvedValueOnce({
      rowCount: 0,
    });

    const { result } = await executeRevocation({
      childProfileId: 'child-014',
      parentProfileId: 'parent-001',
      revokedAt: '2026-01-10T10:00:00.000Z',
    });

    expect(result).toEqual({ status: 'restored', childProfileId: 'child-014' });
    const sqlArg = (mockDatabaseModule.db.execute as jest.Mock).mock
      .calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('responded_at');
    expect(sqlText).toContain('2026-01-10t10:00:00.000z');
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
    // First call (inside `choose-final-action`, before deletion): returns the
    // real owner-of-the-family ('owner-profile-001'). Any subsequent call
    // simulates the post-cascade state where family_links is gone — falls back
    // to the event-sender ('coparent-profile-001'). The fix must NOT call
    // getFamilyOwnerProfileId a second time; if it does, the notice would
    // route to the wrong account.
    mockGetFamilyOwnerProfileId
      .mockResolvedValueOnce('owner-profile-001')
      .mockResolvedValue('coparent-profile-001');

    await executeRevocation({
      childProfileId: 'child-001',
      // Event sender is the co-parent, NOT the account owner.
      parentProfileId: 'coparent-profile-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
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
    mockGetFamilyOwnerProfileId.mockResolvedValue('owner-profile-001');

    await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'coparent-profile-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    // Exactly one call: inside `choose-final-action`, before any mutation.
    expect(mockGetFamilyOwnerProfileId).toHaveBeenCalledTimes(1);
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
          revokedAt: '2026-01-15T00:00:00.000Z',
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
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2008,
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

// ---------------------------------------------------------------------------
// [WI-973] Regression: malformed app/consent.revoked events must throw
// NonRetriableError and must NOT reach the deletion path.
// ---------------------------------------------------------------------------

import { NonRetriableError } from 'inngest';

describe('[WI-973] malformed consent.revoked payload — NonRetriableError guard', () => {
  it('throws NonRetriableError when revokedAt is omitted, and does NOT call deleteProfileIfConsentWithdrawn', async () => {
    await expect(
      executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
        // revokedAt intentionally omitted — this is the malformed case
      }),
    ).rejects.toThrow(NonRetriableError);

    // Deletion must NOT have been reached.
    expect(findProfileDeleteSql()).toBeUndefined();
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

    expect(findProfileDeleteSql()).toBeUndefined();
  });
});
