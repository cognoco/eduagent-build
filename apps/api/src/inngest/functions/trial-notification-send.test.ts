// ---------------------------------------------------------------------------
// Trial Notification Send — Tests
//
// [TRIAL-FANOUT] Per-trial receiver for the trial-expiry cron's warning /
// soft-landing fan-out. These tests exercise the REAL handler logic +
// sendTrialNotificationToAccountOwner (the exported helper it calls), mocking
// only true external boundaries: the database module (no real Neon), the
// Inngest client (no network), Sentry, the push provider, the atomic
// rate-limit gate, and owner-profile resolution.
//
// The handler's contract:
//   - It owns the atomic rate-limit gate (BUG-117) — so a retry / concurrent
//     fan-out fire pushes at most once per 24h. This is what makes the cron's
//     monolithic-loop replay problem go away: each trial is its own step.
//   - It preserves the exact notification semantics (title / body / type).
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    ...actual,
    inngest: {
      createFunction: realInstance.createFunction.bind(realInstance),
      send: jest.fn().mockResolvedValue(undefined),
    },
  };
});

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

// [BUG-117] Atomic dedup gate. Default false = not limited = caller may send.
const mockCheckAndLogRateLimitInternal = jest.fn().mockResolvedValue(false);
jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/settings',
    ) as typeof import('../../services/settings');
    return {
      ...actual,
      checkAndLogRateLimitInternal: (...args: unknown[]) =>
        mockCheckAndLogRateLimitInternal(...args),
    };
  },
);

const mockFindOwnerProfile = jest.fn();
jest.mock(
  '../../services/profile' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/profile',
    ) as typeof import('../../services/profile');
    return {
      ...actual,
      findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
    };
  },
);

import { trialNotificationSend } from './trial-notification-send';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

interface SendResult {
  status: string;
  accountId: string;
  step: string;
  reason?: string;
}

async function runHandler(data: {
  accountId: string;
  title: string;
  body: string;
  step: 'send-trial-warnings' | 'send-soft-landing';
}) {
  const runner = createInngestStepRunner();
  const handler = (trialNotificationSend as any).fn;
  const result = (await handler({
    event: { name: 'app/billing.trial_notification.send', data },
    step: runner.step,
  })) as SendResult;
  return { result, ...runner };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  // Pin the identity cutover flag OFF so sendTrialNotificationToAccountOwner
  // resolves the owner via the legacy findOwnerProfile path these mocks target,
  // regardless of any IDENTITY_V2_ENABLED leaked into process.env by the
  // Doppler-synced .env.development.local.
  process.env['IDENTITY_V2_ENABLED'] = 'false';
  mockFindOwnerProfile.mockImplementation(
    async (_db: unknown, accountId: string) => ({ id: `owner-${accountId}` }),
  );
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
  delete process.env['IDENTITY_V2_ENABLED'];
});

describe('trialNotificationSend', () => {
  it('is registered as an Inngest function with the expected id', () => {
    expect((trialNotificationSend as { opts?: { id?: string } }).opts?.id).toBe(
      'trial-notification-send',
    );
  });

  it('is triggered by the app/billing.trial_notification.send event', () => {
    const triggers = (trialNotificationSend as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app/billing.trial_notification.send',
        }),
      ]),
    );
  });

  it('sends the push for a warning event with the exact notification semantics', async () => {
    const { result } = await runHandler({
      accountId: 'acc-3',
      title: 'Trial ending soon',
      body: '3 days left of your trial',
      step: 'send-trial-warnings',
    });

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'owner-acc-3',
        title: 'Trial ending soon',
        body: '3 days left of your trial',
        type: 'trial_expiry',
      }),
      // [WI-369] Transactional billing notice — must bypass push preference.
      { bypassPreferenceCheck: true },
    );
    expect(result).toEqual({
      status: 'sent',
      accountId: 'acc-3',
      step: 'send-trial-warnings',
      reason: undefined,
    });
  });

  it('sends the push for a soft-landing event with the exact notification semantics', async () => {
    const { result } = await runHandler({
      accountId: 'acc-4',
      title: 'Your trial has ended',
      body: 'giving you 15/day for 2 more weeks',
      step: 'send-soft-landing',
    });

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'owner-acc-4',
        title: 'Your trial has ended',
        body: 'giving you 15/day for 2 more weeks',
        type: 'trial_expiry',
      }),
      // [WI-369] Transactional billing notice — must bypass push preference.
      { bypassPreferenceCheck: true },
    );
    expect(result.status).toBe('sent');
    expect(result.step).toBe('send-soft-landing');
  });

  // [BUG-117] The atomic rate-limit gate moved INTO this handler. On a retry
  // (or a concurrent fan-out fire), the gate observes the prior log row and
  // blocks the duplicate push — the dedup that the cron's monolithic loop used
  // to own. This is the regression that proves the gate was not dropped.
  it('does NOT push when the atomic rate-limit gate reports already-sent (retry dedup)', async () => {
    mockCheckAndLogRateLimitInternal.mockResolvedValueOnce(true);

    const { result } = await runHandler({
      accountId: 'acc-dedup',
      title: 'Trial ending soon',
      body: '3 days left of your trial',
      step: 'send-trial-warnings',
    });

    expect(mockCheckAndLogRateLimitInternal).toHaveBeenCalledWith(
      expect.anything(),
      'owner-acc-dedup',
      'trial_expiry',
      { hours: 24, maxCount: 1 },
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('dedup_24h');
  });

  it('reports skipped when the owner profile cannot be resolved', async () => {
    mockFindOwnerProfile.mockResolvedValueOnce(null);

    const { result } = await runHandler({
      accountId: 'acc-no-owner',
      title: 'Trial ending soon',
      body: '3 days left of your trial',
      step: 'send-trial-warnings',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_owner_profile');
  });

  it('reports skipped when the push provider does not deliver', async () => {
    mockSendPushNotification.mockResolvedValueOnce({
      sent: false,
      reason: 'no_push_token',
    });

    const { result } = await runHandler({
      accountId: 'acc-7',
      title: 'Trial ending soon',
      body: '3 days left of your trial',
      step: 'send-trial-warnings',
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_push_token');
  });
});
