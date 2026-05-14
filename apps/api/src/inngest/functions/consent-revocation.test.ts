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
  '../../services/consent' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/consent',
    ) as typeof import('../../services/consent');
    return {
      ...actual,
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
jest.mock(
  '../../services/deletion' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/deletion',
    ) as typeof import('../../services/deletion');
    return {
      ...actual,
      deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
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
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
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
});

describe('consentRevocation', () => {
  it('is defined as an Inngest function', () => {
    expect(consentRevocation).toBeTruthy();
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
