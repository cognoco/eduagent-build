// ---------------------------------------------------------------------------
// Trial Subscription Failed handler — Tests (BUG-837 / F-SVC-003)
// Pin both:
//   - the trigger (so a future rename can't silently disconnect this from
//     the account-service emitter), and
//   - the structured error log shape (so observability stays queryable).
// ---------------------------------------------------------------------------

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

import { billingTrialSubscriptionFailed } from './billing-trial-subscription-failed';

beforeEach(() => {
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

interface FailureEventData {
  accountId: string;
  reason: string;
  timestamp: string;
}

async function invokeHandler(data: FailureEventData) {
  const handler = ((billingTrialSubscriptionFailed as any).fn ??
    billingTrialSubscriptionFailed) as (args: {
    event: { data: FailureEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('billingTrialSubscriptionFailed (BUG-837 / F-SVC-003)', () => {
  it('is registered as the listener for app/billing.trial_subscription_failed', () => {
    // The account service fans out to this exact event name. If the trigger
    // drifts, escalation events are silently dropped — the very thing this
    // bug was filed against.
    const trigger = (billingTrialSubscriptionFailed as any).trigger;
    expect(trigger).toEqual({
      event: 'app/billing.trial_subscription_failed',
    });
    expect(mockInngestTransport.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: { event: 'app/billing.trial_subscription_failed' },
        }),
      ]),
    );
  });

  it('returns logged status with account metadata after validating the payload (BUG-754)', async () => {
    const result = await invokeHandler({
      accountId: 'acc-1',
      reason: 'DB constraint violation',
      timestamp: '2026-04-27T10:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      accountId: 'acc-1',
    });
  });

  it('returns invalid_payload when the event data fails Zod validation (BUG-754 / BUG-761)', async () => {
    // Missing required `accountId` field — the schema rejects it and the
    // handler returns a terminal status without trying to keep processing.
    const result = await invokeHandler({
      // accountId omitted intentionally
      reason: 'malformed event',
      timestamp: '2026-04-27T10:00:00.000Z',
    } as unknown as FailureEventData);

    expect(result).toEqual({
      status: 'invalid_payload',
      accountId: null,
    });
  });

  it('declares retries: 2 so transient failures retry instead of silently terminating (BUG-754)', () => {
    const opts =
      (billingTrialSubscriptionFailed as any).opts ??
      (billingTrialSubscriptionFailed as any).config ??
      (billingTrialSubscriptionFailed as any);
    // Inngest exposes function options under different keys across versions;
    // the retries field should be 2 regardless of which surface holds it.
    const retryCandidates = [
      { path: 'opts.retries', value: opts?.retries },
      {
        path: 'fn.opts.retries',
        value: (billingTrialSubscriptionFailed as any).fn?.opts?.retries,
      },
      {
        path: 'options.retries',
        value: (billingTrialSubscriptionFailed as any).options?.retries,
      },
    ];
    const retries = retryCandidates.find(
      (candidate) => candidate.value !== undefined,
    )?.value;
    if (retries === undefined) {
      throw new Error(
        `Could not locate retries config on billingTrialSubscriptionFailed; tried ${retryCandidates
          .map((candidate) => candidate.path)
          .join(', ')}`,
      );
    }
    expect(retries).toBe(2);
  });

  it('emits a structured error log with the failure reason (observability guarantee)', async () => {
    await invokeHandler({
      accountId: 'acc-2',
      reason: 'Transient network error',
      timestamp: '2026-04-27T10:00:00.000Z',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCall = consoleErrorSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('billing.trial_subscription_failed.received');
    expect(entry.level).toBe('error');
    expect(entry.context).toMatchObject({
      accountId: 'acc-2',
      reason: 'Transient network error',
      eventTimestamp: '2026-04-27T10:00:00.000Z',
    });
  });
});
