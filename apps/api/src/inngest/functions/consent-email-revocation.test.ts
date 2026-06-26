// ---------------------------------------------------------------------------
// Consent Email Revocation — Tests
//
// Spec: docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md §8
//
// This function is the edge-free email-parent grace→delete path. Tests mirror
// the consent-revocation.test.ts harness pattern (same module mock style).
//
// Deletion service is mocked via gc1-allow because deletePersonIfConsentWithdrawnV2
// requires a real DB with transaction support (advisory lock + ORM operations
// across a transaction boundary) that the createMockDb() proxy cannot provide.
// This follows the "pattern-a conversion" approach used throughout the existing
// consent-revocation test for DB-backed identity-v2 functions.
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

const mockIsConsentRevocationGenerationCurrentV2 = jest.fn();
const mockGetPersonDisplayNameV2 = jest.fn();
jest.mock(
  '../../services/identity-v2/consent-v2' /* gc1-allow: pattern-a conversion — DB-backed */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/consent-v2',
    ) as typeof import('../../services/identity-v2/consent-v2');
    return {
      ...actual,
      isConsentRevocationGenerationCurrentV2: (...args: unknown[]) =>
        mockIsConsentRevocationGenerationCurrentV2(...args),
      getPersonDisplayNameV2: (...args: unknown[]) =>
        mockGetPersonDisplayNameV2(...args),
    };
  },
);

// [GC6] deletePersonIfConsentWithdrawnV2 requires a real DB with transaction
// support (advisory lock + multi-step ORM operations). The createMockDb() proxy
// cannot provide the necessary transaction / query behavior without a full DB
// fixture. This gc1-allow mock follows the same pattern as the other DB-backed
// identity-v2 function mocks above.
const mockDeletePersonIfConsentWithdrawnV2 = jest.fn().mockResolvedValue(true);
jest.mock(
  '../../services/identity-v2/deletion-v2' /* gc1-allow: pattern-a conversion — requires real DB transaction support */,
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
    };
  },
);

import { consentEmailRevocation } from './consent-email-revocation';

async function executeEmailRevocation(
  eventData: {
    chargePersonId: string;
    revokedAt?: string;
  },
  stepOptions?: InngestStepRunnerOptions,
) {
  const runner = createInngestStepRunner(stepOptions);

  const handler = (
    consentEmailRevocation as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/consent.email-revoked' },
    step: runner.step,
  });

  return { result, runner };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-01-15T00:00:00.000Z') });
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  mockIsConsentRevocationGenerationCurrentV2.mockResolvedValue(true);
  mockGetPersonDisplayNameV2.mockResolvedValue('Alex');
  mockDeletePersonIfConsentWithdrawnV2.mockResolvedValue(true);
  mockSendPushNotification.mockResolvedValue({ sent: true });
  mockGetRecentNotificationCount.mockResolvedValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
});

describe('consentEmailRevocation', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect(
      (consentEmailRevocation as { opts?: { id?: string } }).opts?.id,
    ).toBe('consent-email-revocation');
  });

  it('triggers on app/consent.email-revoked event', () => {
    const triggers = (
      consentEmailRevocation as { opts?: { triggers?: unknown[] } }
    ).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.email-revoked' }),
      ]),
    );
  });

  it('declares idempotency keyed on event.data.chargePersonId and revokedAt', () => {
    const opts = (consentEmailRevocation as any).opts;
    expect(opts.idempotency).toBe(
      'event.data.chargePersonId + "-" + event.data.revokedAt',
    );
  });

  it('declares concurrency limit of 1 keyed on event.data.chargePersonId', () => {
    const opts = (consentEmailRevocation as any).opts;
    expect(opts.concurrency).toMatchObject({
      key: 'event.data.chargePersonId',
      limit: 1,
    });
  });

  it('declares retries: 5', () => {
    const opts = (consentEmailRevocation as any).opts;
    expect(opts.retries).toBe(5);
  });

  it('sleeps at the 6-day warning mark and the 1-day grace end', async () => {
    const { runner } = await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(runner.sleepCalls).toEqual(
      expect.arrayContaining([
        { name: 'warning-mark', duration: '6d' },
        { name: 'grace-end', duration: '1d' },
      ]),
    );
  });

  it('sends a consent_warning push to the child at the 6-day mark', async () => {
    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      expect.anything(),
      'charge-001',
      'consent_warning',
      24,
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'charge-001',
        type: 'consent_warning',
        body: expect.stringContaining('parent withdrew consent'),
      }),
      { bypassPreferenceCheck: true },
    );
  });

  it('does not send a warning push if consent was restored before the 6-day mark', async () => {
    mockIsConsentRevocationGenerationCurrentV2.mockResolvedValueOnce(false);

    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('does not send a duplicate warning push if one was sent in the last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
    );
  });

  it('does not send a push to any other profileId (no parent person)', async () => {
    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    for (const call of mockSendPushNotification.mock.calls) {
      expect(call[1]).toMatchObject({ profileId: 'charge-001' });
    }
  });
});

// ---------------------------------------------------------------------------
// restored-during-grace — check-restoration sees grant no longer withdrawn
// ---------------------------------------------------------------------------

describe('restored-during-grace path', () => {
  it('returns restored without calling deletePersonIfConsentWithdrawnV2', async () => {
    // call 1: send-warning-push (still current); call 2: check-restoration (restored)
    mockIsConsentRevocationGenerationCurrentV2
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const { result } = await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'restored',
      chargePersonId: 'charge-001',
    });
    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  it('does not issue a consent_expired push to the child when restored during grace', async () => {
    mockIsConsentRevocationGenerationCurrentV2
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_expired' }),
    );
  });

  it('step names do not include delete-charge-person when restored during grace', async () => {
    mockIsConsentRevocationGenerationCurrentV2
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const { runner } = await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(runner.runNames()).not.toContain('delete-charge-person');
  });
});

// ---------------------------------------------------------------------------
// still-withdrawn path — full cascade delete
// ---------------------------------------------------------------------------

describe('still-withdrawn path', () => {
  it('calls deletePersonIfConsentWithdrawnV2 and returns deleted', async () => {
    const { result, runner } = await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'deleted',
      chargePersonId: 'charge-001',
    });

    expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledWith(
      expect.anything(),
      'charge-001',
      // revocationRespondedAt: the parsed Date from revokedAt
      expect.any(Date),
    );

    // Step ordering: clear-unread-nudges → send-warning-push → check-restoration
    // → notify-child → delete-charge-person
    expect(runner.runNames()).toEqual([
      'clear-unread-nudges',
      'send-warning-push',
      'check-restoration',
      'notify-child',
      'delete-charge-person',
    ]);
  });

  it('pushes consent_warning at day 6 and consent_expired to child before delete', async () => {
    await executeEmailRevocation({
      chargePersonId: 'charge-001',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    // Warning push at day 6
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'charge-001',
        type: 'consent_warning',
      }),
      { bypassPreferenceCheck: true },
    );
    // Pre-delete push
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: 'charge-001',
        type: 'consent_expired',
      }),
      { bypassPreferenceCheck: true },
    );
  });

  it('returns restored (not deleted) when deletePersonIfConsentWithdrawnV2 returns false (race: consent restored just before delete)', async () => {
    mockDeletePersonIfConsentWithdrawnV2.mockResolvedValueOnce(false);

    const { result } = await executeEmailRevocation({
      chargePersonId: 'charge-race',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'restored',
      chargePersonId: 'charge-race',
    });
  });

  it('24h dedup skips notify-child push when a consent_expired notification was recently logged', async () => {
    // warning ok, child deduped
    mockGetRecentNotificationCount
      .mockResolvedValueOnce(0) // consent_warning check (send-warning-push)
      .mockResolvedValueOnce(1); // consent_expired check (notify-child)

    await executeEmailRevocation({
      chargePersonId: 'charge-dup',
      revokedAt: '2026-01-15T00:00:00.000Z',
    });

    // Only the warning push fires; no consent_expired push
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'consent_warning' }),
      { bypassPreferenceCheck: true },
    );
    // Delete still runs regardless of push dedup.
    expect(mockDeletePersonIfConsentWithdrawnV2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// idempotency: duplicate event (same chargePersonId + revokedAt)
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-3] idempotency and concurrency config', () => {
  it('declares idempotency expression covering both chargePersonId and revokedAt', () => {
    const opts = (consentEmailRevocation as any).opts;
    expect(opts.idempotency).toContain('chargePersonId');
    expect(opts.idempotency).toContain('revokedAt');
  });

  it('a second execution with the same inputs produces the same outcome (no side-effect amplification)', async () => {
    for (let i = 0; i < 2; i++) {
      jest.clearAllMocks();
      mockIsConsentRevocationGenerationCurrentV2.mockResolvedValue(true);
      mockGetPersonDisplayNameV2.mockResolvedValue('Alex');
      mockDeletePersonIfConsentWithdrawnV2.mockResolvedValue(true);
      mockSendPushNotification.mockResolvedValue({ sent: true });
      mockGetRecentNotificationCount.mockResolvedValue(0);

      const { result } = await executeEmailRevocation({
        chargePersonId: 'charge-idem',
        revokedAt: '2026-01-15T00:00:00.000Z',
      });

      expect(result).toEqual({
        status: 'deleted',
        chargePersonId: 'charge-idem',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// onFailure dead-letter handler
// ---------------------------------------------------------------------------

import * as sentry from '../../services/sentry';
import * as safeNonCore from '../../services/safe-non-core';
import { NonRetriableError } from 'inngest';

describe('[onFailure] dead-letter handler', () => {
  type OnFailureArgs = {
    event: { data: { event?: { data?: unknown }; run_id?: string } };
    error: unknown;
  };

  function getOnFailure() {
    return (consentEmailRevocation as any).opts.onFailure as
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

  it('[BREAK] calls captureMessage(level=error) with chargePersonId on terminal failure', async () => {
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
              chargePersonId: 'charge-fail-001',
            },
          },
          run_id: 'run-email-revoke-abc',
        },
      },
      error: new Error('DB connection lost'),
    });

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      expect.stringContaining('charge-fail-001'),
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({
          surface: 'consent-email-revocation.terminal_failure',
          chargePersonId: 'charge-fail-001',
          runId: 'run-email-revoke-abc',
        }),
      }),
    );
  });

  it('[BREAK] calls safeSend with app/consent.email-revocation.failed event on terminal failure', async () => {
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
              chargePersonId: 'charge-fail-001',
            },
          },
          run_id: 'run-email-revoke-abc',
        },
      },
      error: new Error('DB connection lost'),
    });

    expect(safeSendSpy).toHaveBeenCalledTimes(1);
    const [sendThunk, surface, context] = safeSendSpy.mock.calls[0]!;
    expect(surface).toBe('consent-email-revocation.terminal_failure');
    expect(context).toMatchObject({ chargePersonId: 'charge-fail-001' });
    // Invoke the thunk to confirm it dispatches the correct event name.
    await expect(sendThunk()).resolves.not.toThrow();
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/consent.email-revocation.failed',
        data: expect.objectContaining({
          chargePersonId: 'charge-fail-001',
          error: 'DB connection lost',
        }),
      }),
    );
  });

  it('tolerates missing original event payload (null chargePersonId)', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    jest.spyOn(safeNonCore, 'safeSend').mockResolvedValue(undefined);

    const onFailure = getOnFailure()!;
    await expect(
      onFailure({ event: { data: {} }, error: 'string-rejection' }),
    ).resolves.not.toThrow();

    expect(captureSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown'),
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({ chargePersonId: null }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// NonRetriableError guard — malformed payload
// ---------------------------------------------------------------------------

describe('malformed consent.email-revoked payload — NonRetriableError guard', () => {
  it('throws NonRetriableError when revokedAt is omitted', async () => {
    await expect(
      executeEmailRevocation({
        chargePersonId: 'charge-001',
        // revokedAt intentionally omitted — this is the malformed case
      }),
    ).rejects.toThrow(NonRetriableError);

    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });

  it('throws NonRetriableError when chargePersonId is absent', async () => {
    const runner = createInngestStepRunner();
    const handler = (
      consentEmailRevocation as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    await expect(
      handler({
        event: {
          data: { revokedAt: '2026-01-15T00:00:00.000Z' },
          name: 'app/consent.email-revoked',
        },
        step: runner.step,
      }),
    ).rejects.toThrow(NonRetriableError);

    expect(mockDeletePersonIfConsentWithdrawnV2).not.toHaveBeenCalled();
  });
});
