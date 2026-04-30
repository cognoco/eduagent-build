// ---------------------------------------------------------------------------
// Consent Revocation — Tests
//
// [BUG-699-FOLLOWUP] Notification dedup against duplicate `app/consent.revoked`
// events: each `notify-*` step gates on getRecentNotificationCount(...,
// 'consent_expired', 24) so a replayed event does not re-push the same
// "account deleted" / "data deleted" message twice.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../client', () => {
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    inngest: {
      createFunction: realInstance.createFunction.bind(realInstance),
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

const mockGetConsentStatus = jest.fn();
jest.mock('../../services/consent', () => ({
  getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
}));

const mockDeleteProfile = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/deletion', () => ({
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
}));

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock('../../services/settings', () => ({
  getRecentNotificationCount: (...args: unknown[]) =>
    mockGetRecentNotificationCount(...args),
}));

import { consentRevocation } from './consent-revocation';

interface MockStep {
  run: jest.Mock;
  sleep: jest.Mock;
  sendEvent: jest.Mock;
}

async function executeRevocation(eventData: {
  childProfileId: string;
  parentProfileId: string;
}): Promise<{ result: unknown; mockStep: MockStep }> {
  const mockStep: MockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn().mockResolvedValue(undefined),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (
    consentRevocation as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/consent.revoked' },
    step: mockStep,
  });

  return { result, mockStep };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
});

describe('consentRevocation', () => {
  it('is defined as an Inngest function', () => {
    expect(consentRevocation).toBeDefined();
  });

  it('triggers on app/consent.revoked event', () => {
    const triggers = (consentRevocation as { opts?: { triggers?: unknown[] } })
      .opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.revoked' }),
      ])
    );
  });

  it('sleeps 7 days before checking restoration', async () => {
    const { mockStep } = await executeRevocation({
      childProfileId: 'child-001',
      parentProfileId: 'parent-001',
    });

    expect(mockStep.sleep).toHaveBeenCalledWith(
      'revocation-grace-period',
      '7d'
    );
  });

  it('returns restored without pushing or deleting when consent was restored', async () => {
    mockGetConsentStatus.mockResolvedValueOnce('CONSENTED');

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
      const { result, mockStep } = await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
      });

      expect(result).toEqual({
        status: 'deleted',
        childProfileId: 'child-001',
      });

      // Child push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          profileId: 'child-001',
          type: 'consent_expired',
        })
      );
      // Profile deletion
      expect(mockDeleteProfile).toHaveBeenCalledWith(
        expect.anything(),
        'child-001'
      );
      // Parent push
      expect(mockSendPushNotification).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          profileId: 'parent-001',
          type: 'consent_expired',
        })
      );

      // Step ordering: notify-child before delete-child-profile before notify-parent
      const stepNames = mockStep.run.mock.calls.map((c) => c[0]);
      expect(stepNames).toEqual([
        'check-restoration',
        'notify-child',
        'delete-child-profile',
        'notify-parent',
      ]);
    });
  });

  describe('[BUG-699-FOLLOWUP] 24h push dedup', () => {
    it('skips notify-child push when a consent_expired notification was logged for the child in last 24h', async () => {
      // First call (child) returns 1 → dedup; second call (parent) returns 0 → push
      mockGetRecentNotificationCount
        .mockResolvedValueOnce(1) // child dedup
        .mockResolvedValueOnce(0); // parent allowed

      await executeRevocation({
        childProfileId: 'child-dup',
        parentProfileId: 'parent-001',
      });

      expect(mockGetRecentNotificationCount).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        'child-dup',
        'consent_expired',
        24
      );
      // Only the parent push should have fired.
      expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ profileId: 'parent-001' })
      );
    });

    it('skips notify-parent push when a consent_expired notification was logged for the parent in last 24h', async () => {
      mockGetRecentNotificationCount
        .mockResolvedValueOnce(0) // child allowed
        .mockResolvedValueOnce(1); // parent dedup

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-dup',
      });

      expect(mockGetRecentNotificationCount).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'parent-dup',
        'consent_expired',
        24
      );
      // Only the child push should have fired.
      expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ profileId: 'child-001' })
      );
    });

    it('skips both pushes when both child and parent already received recent notifications', async () => {
      mockGetRecentNotificationCount
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
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      // Profile deletion proceeds regardless of push dedup.
      expect(mockDeleteProfile).toHaveBeenCalledWith(
        expect.anything(),
        'child-dup'
      );
    });

    it('still pushes when no recent consent_expired notifications exist for either party', async () => {
      mockGetRecentNotificationCount.mockResolvedValue(0);

      await executeRevocation({
        childProfileId: 'child-001',
        parentProfileId: 'parent-001',
      });

      expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
    });
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
