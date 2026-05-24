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
      getProfileForConsentRevocation: (...args: unknown[]) =>
        mockGetProfileForConsentRevocation(...args),
      getProfileDisplayName: (...args: unknown[]) =>
        mockGetProfileDisplayName(...args),
    };
  },
);

const mockDeleteProfile = jest.fn().mockResolvedValue(undefined);
const mockDeleteProfileIfConsentWithdrawn = jest.fn().mockResolvedValue(true);
jest.mock(
  '../../services/deletion' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/deletion',
    ) as typeof import('../../services/deletion');
    return {
      ...actual,
      deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
      deleteProfileIfConsentWithdrawn: (...args: unknown[]) =>
        mockDeleteProfileIfConsentWithdrawn(...args),
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

const mockRecordPendingNotice = jest.fn().mockResolvedValue(undefined);
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
    };
  },
);

import { consentRevocation } from './consent-revocation';

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

async function executeRevocation(
  eventData: {
    childProfileId: string;
    parentProfileId: string;
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
  (mockDatabaseModule.db.execute as jest.Mock).mockResolvedValue({
    rowCount: 1,
  });
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
  mockGetProfileDisplayName.mockResolvedValue('Liam');
  mockGetProfileForConsentRevocation.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2018,
    archivedAt: null,
  });
  mockGetFamilyOwnerProfileId.mockResolvedValue('parent-001');
  mockGetWithdrawalArchivePreference.mockResolvedValue('never');
  mockDeleteProfileIfConsentWithdrawn.mockImplementation(
    async (...args: unknown[]) => {
      await mockDeleteProfile(...args);
      return true;
    },
  );
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
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
    mockGetConsentStatus.mockResolvedValue('CONSENTED');

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

  it('returns restored without pushing or deleting when consent was restored', async () => {
    mockGetConsentStatus
      .mockResolvedValueOnce('CONSENTED')
      .mockResolvedValueOnce('CONSENTED');

    const { result } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(result).toEqual({ status: 'restored', childProfileId: 'child-001' });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  describe('happy path — still WITHDRAWN', () => {
    it('pushes child, deletes profile, pushes parent in order', async () => {
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
      // Profile deletion
      expect(mockDeleteProfile).toHaveBeenCalledWith(
        expect.anything(),
        'child-001',
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

      // Step ordering: notify-child before delete-child-profile before notify-parent
      expect(runner.runNames()).toEqual([
        'clear-unread-nudges',
        'send-warning-push',
        'check-restoration',
        'load-child-profile',
        'choose-final-action',
        'notify-child',
        'delete-child-profile',
        'notify-parent',
        'record-parent-delete-notice',
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
    });

    expect(result).toEqual({
      status: 'deleted',
      childProfileId: 'child-boundary',
    });
    expect(mockDeleteProfile).toHaveBeenCalledWith(
      expect.anything(),
      'child-boundary',
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
      // Profile deletion proceeds regardless of push dedup.
      expect(mockDeleteProfile).toHaveBeenCalledWith(
        expect.anything(),
        'child-dup',
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
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
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

    // delete must NOT have been called
    expect(mockDeleteProfile).not.toHaveBeenCalled();
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
    });

    // Exactly one call: inside `choose-final-action`, before any mutation.
    expect(mockGetFamilyOwnerProfileId).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [FIX-INNGEST-3] Idempotency and concurrency config break tests
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-3] idempotency and concurrency config', () => {
  it('declares idempotency keyed on event.data.childProfileId', () => {
    const opts = (consentRevocation as any).opts;
    expect(opts.idempotency).toBe('event.data.childProfileId');
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
