const mockCaptureException = jest.fn();

jest.mock(
  '../../services/sentry' /* gc1-allow: sentry boundary — @sentry/cloudflare requires a Worker-scoped client unavailable in Node.js tests */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

jest.mock(/* gc1-allow: Inngest boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (opts: Record<string, unknown>, triggers: unknown, fn: unknown) =>
        Object.assign(fn as object, {
          opts: {
            ...opts,
            triggers: Array.isArray(triggers) ? triggers : [triggers],
          },
          fn,
        }),
    ),
  },
}));

import type { BlockedSafetyDailyBucket } from '@eduagent/database';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import {
  blockedSafetyDigestDelivery,
  blockedSafetyDigestIngest,
  runBlockedSafetyDigestDelivery,
  runBlockedSafetyDigestIngest,
} from './blocked-safety-digest';
import { functions } from '../index';

describe('[WI-1691] blocked-safety digest Inngest functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers one ingest function for all three blocked-safety events', () => {
    const triggers = (
      blockedSafetyDigestIngest as unknown as {
        opts: { triggers: unknown[] };
      }
    ).opts.triggers;
    expect(triggers).toEqual([
      { event: 'app/safety.dangerous_procedure_blocked' },
      { event: 'app/safety.minor_pii_echo_redacted' },
      { event: 'app/safety.suitability_blocked' },
    ]);
  });

  it('registers the delivery cron for 00:15 UTC and exports both functions', () => {
    const triggers = (
      blockedSafetyDigestDelivery as unknown as {
        opts: { triggers: unknown[] };
      }
    ).opts.triggers;
    expect(triggers).toEqual([{ cron: '15 0 * * *' }]);
    expect(functions).toEqual(
      expect.arrayContaining([
        blockedSafetyDigestIngest,
        blockedSafetyDigestDelivery,
      ]),
    );
  });

  it('closes a valid source payload before its durable record step', async () => {
    const record = jest.fn().mockResolvedValue({
      recorded: true,
      bucketDate: '2026-07-11',
    });
    const { step, runNames } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestIngest(
        {
          event: {
            name: 'app/safety.dangerous_procedure_blocked',
            data: {
              eventId: '00000000-0000-4000-8000-000000001691',
              timestamp: '2026-07-11T10:00:00.000Z',
              profileId: 'private-profile',
              sessionId: 'private-session',
              content: 'private-content',
            },
          },
          step,
        },
        { record },
      ),
    ).resolves.toEqual({
      status: 'recorded',
      recorded: true,
      bucketDate: '2026-07-11',
    });

    expect(runNames()).toEqual(['record-blocked-safety-event']);
    expect(record).toHaveBeenCalledWith({
      name: 'app/safety.dangerous_procedure_blocked',
      eventId: '00000000-0000-4000-8000-000000001691',
      timestamp: '2026-07-11T10:00:00.000Z',
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain('private');
  });

  // [WI-1900] The post-display adult judge reuses app/safety.suitability_blocked
  // to raise a real alarm, but it fires AFTER display — no reply was replaced.
  // suitabilityBlockedCount is an operator-facing safety metric; counting an
  // observed detection there would assert a learner was protected when none
  // was. These two tests are the guard on that false-compliance signal.
  it('[WI-1900] does NOT count an observed-mode suitability event in the digest', async () => {
    const record = jest.fn();
    const { step, runNames } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestIngest(
        {
          event: {
            name: 'app/safety.suitability_blocked',
            data: {
              eventId: '00000000-0000-4000-8000-000000001900',
              timestamp: '2026-08-07T10:00:00.000Z',
              mode: 'observed',
            },
          },
          step,
        },
        { record },
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'observed_only' });

    // Never reaches the durable counter step at all.
    expect(record).not.toHaveBeenCalled();
    expect(runNames()).toEqual([]);
  });

  it('[WI-1900] still counts a suitability event with NO mode (pre-WI-1900 enforced events)', async () => {
    // Backward compatibility: every event emitted before WI-1900 came from the
    // synchronous minor enforcing gate and carries no mode. Those must keep
    // counting exactly as before — the new field must not silently drop them.
    const record = jest.fn().mockResolvedValue({
      recorded: true,
      bucketDate: '2026-08-07',
    });
    const { step } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestIngest(
        {
          event: {
            name: 'app/safety.suitability_blocked',
            data: {
              eventId: '00000000-0000-4000-8000-000000001901',
              timestamp: '2026-08-07T10:00:00.000Z',
            },
          },
          step,
        },
        { record },
      ),
    ).resolves.toEqual({
      status: 'recorded',
      recorded: true,
      bucketDate: '2026-08-07',
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('[WI-1900] counts an explicitly enforced-mode suitability event', async () => {
    const record = jest.fn().mockResolvedValue({
      recorded: true,
      bucketDate: '2026-08-07',
    });
    const { step } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestIngest(
        {
          event: {
            name: 'app/safety.suitability_blocked',
            data: {
              eventId: '00000000-0000-4000-8000-000000001902',
              timestamp: '2026-08-07T10:00:00.000Z',
              mode: 'enforced',
            },
          },
          step,
        },
        { record },
      ),
    ).resolves.toMatchObject({ status: 'recorded' });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('captures invalid payload shape without logging or capturing raw data', async () => {
    const record = jest.fn();
    const { step, runNames } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestIngest(
        {
          event: {
            name: 'app/safety.suitability_blocked',
            data: { eventId: 'invalid', content: 'DO_NOT_CAPTURE_SENTINEL' },
          },
          step,
        },
        { record },
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'invalid_payload' });

    expect(runNames()).toEqual([]);
    expect(record).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
      'DO_NOT_CAPTURE_SENTINEL',
    );
  });

  it('loads closed buckets once and gives each date its own durable delivery step', async () => {
    const buckets: BlockedSafetyDailyBucket[] = [
      {
        bucketDate: '2026-07-09',
        dangerousProcedureBlockedCount: 1,
        minorPiiEchoRedactedCount: 0,
        suitabilityBlockedCount: 0,
        deliveredAt: null,
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      },
      {
        bucketDate: '2026-07-10',
        dangerousProcedureBlockedCount: 0,
        minorPiiEchoRedactedCount: 2,
        suitabilityBlockedCount: 1,
        deliveredAt: null,
        createdAt: new Date('2026-07-10T00:00:00.000Z'),
        updatedAt: new Date('2026-07-10T00:00:00.000Z'),
      },
    ];
    const loadClosed = jest.fn().mockResolvedValue(buckets);
    const deliver = jest.fn().mockResolvedValue({ delivered: true });
    const { step, runNames } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestDelivery(
        { step },
        { loadClosed, deliver, currentDate: () => '2026-07-11' },
      ),
    ).resolves.toEqual({ status: 'completed', bucketCount: 2 });

    expect(loadClosed).toHaveBeenCalledWith('2026-07-11');
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(runNames()).toEqual([
      'load-undelivered-closed-buckets',
      'deliver-blocked-safety-digest-2026-07-09',
      'deliver-blocked-safety-digest-2026-07-10',
    ]);
  });

  it('surfaces a terminal/config delivery failure instead of reporting completed', async () => {
    const buckets: BlockedSafetyDailyBucket[] = [
      {
        bucketDate: '2026-07-09',
        dangerousProcedureBlockedCount: 1,
        minorPiiEchoRedactedCount: 0,
        suitabilityBlockedCount: 0,
        deliveredAt: null,
        createdAt: new Date('2026-07-09T00:00:00.000Z'),
        updatedAt: new Date('2026-07-09T00:00:00.000Z'),
      },
    ];
    const loadClosed = jest.fn().mockResolvedValue(buckets);
    const deliver = jest.fn().mockResolvedValue({
      delivered: false,
      reason: 'no_api_key',
      retryability: 'none',
    });
    const { step } = createInngestStepRunner();

    await expect(
      runBlockedSafetyDigestDelivery(
        { step },
        { loadClosed, deliver, currentDate: () => '2026-07-11' },
      ),
    ).resolves.toEqual({
      status: 'failed',
      bucketCount: 1,
      failedBucketDate: '2026-07-09',
      reason: 'no_api_key',
    });

    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      extra: {
        bucketDate: '2026-07-09',
        reason: 'no_api_key',
        retryability: 'none',
      },
    });
  });
});
