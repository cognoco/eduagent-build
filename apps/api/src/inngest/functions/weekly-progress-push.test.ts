// ---------------------------------------------------------------------------
// [BUG-850 / F-SVC-021] Per-batch fan-out error escalation.
//
// The cron previously dispatched batches with a bare `await step.sendEvent(...)`.
// A single transient sendEvent failure either propagated and aborted the rest
// of the batches OR silently left the function returning `completed` while
// half the parents missed their weekly recap. The break test verifies the
// fixed cron survives a mid-loop sendEvent error, captures it to Sentry, and
// reports `partial` with accurate queued/failed counts.
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));
jest.mock('../helpers', () => ({
  getStepDatabase: () => ({
    query: { notificationPreferences: { findMany: async () => [] } },
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: async () => [] }),
      }),
    }),
  }),
}));
jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (config: unknown, trigger: unknown, fn: unknown) => ({
        fn,
        _config: config,
        _trigger: trigger,
      })
    ),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { isLocalHour9, weeklyProgressPushCron } from './weekly-progress-push';

describe('weekly-progress-push isLocalHour9 (BUG-640 / J-4)', () => {
  // Helper: count how many of the 24 Monday-UTC hours match for a TZ.
  // Picks a Monday well clear of DST transitions: 2026-04-13 (Mon).
  function fireCountForTimezone(timezone: string | null): number {
    let fires = 0;
    for (let h = 0; h < 24; h += 1) {
      const utc = new Date(Date.UTC(2026, 3, 13, h, 0, 0));
      if (isLocalHour9(timezone, utc)) fires += 1;
    }
    return fires;
  }

  it('fires for each parent exactly once across the 24 Monday-UTC hours', () => {
    const timezones = [
      null,
      'UTC',
      'Europe/London',
      'Europe/Prague',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland',
      'Asia/Kolkata',
    ];
    for (const tz of timezones) {
      expect({ tz, fires: fireCountForTimezone(tz) }).toEqual({
        tz,
        fires: 1,
      });
    }
  });

  it('null timezone falls back to UTC 09:00', () => {
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))).toBe(
      true
    );
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 8, 0, 0)))).toBe(
      false
    );
  });

  it('invalid timezone string falls back to UTC 09:00 (no crash)', () => {
    expect(
      isLocalHour9('Not/AReal_TZ', new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))
    ).toBe(true);
  });

  it('Europe/Prague (UTC+2 DST) matches at 07:00 UTC on a DST Monday', () => {
    // 2026-04-13 is in CEST (UTC+2). Local 09:00 → UTC 07:00.
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 7, 0, 0)))
    ).toBe(true);
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))
    ).toBe(false);
  });
});

describe('[BUG-850 / F-SVC-021] weekly-progress-push fan-out error escalation', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it('continues batching after a sendEvent failure and reports partial', async () => {
    // Simulate 3 batches worth of parents (BATCH_SIZE=200 → 401 parents = 3 batches).
    // The middle batch's sendEvent rejects; the cron must:
    //   - capture the exception with batch metadata,
    //   - still dispatch the third batch,
    //   - return `partial` with queuedBatches=2, failedBatches=1.
    const parentIds = Array.from({ length: 401 }, (_, i) => `parent-${i}`);
    let sendEventCalls = 0;
    const mockStep = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => {
        // The handler's first step.run resolves the parent list; later steps
        // are only used inside the per-event handler (not under test here).
        return parentIds;
      }),
      sendEvent: jest.fn(async (label: string) => {
        sendEventCalls += 1;
        if (label === 'fan-out-weekly-progress-200') {
          throw new Error('transient inngest 500');
        }
      }),
    };
    const handler = (
      weeklyProgressPushCron as unknown as {
        fn: (ctx: { step: typeof mockStep }) => Promise<unknown>;
      }
    ).fn;
    const result = (await handler({ step: mockStep })) as {
      status: string;
      queuedParents: number;
      totalParents: number;
      queuedBatches: number;
      failedBatches: number;
    };

    expect(sendEventCalls).toBe(3);
    expect(result.status).toBe('partial');
    expect(result.failedBatches).toBe(1);
    expect(result.queuedBatches).toBe(2);
    expect(result.queuedParents).toBe(401 - 200); // batches 0 and 400 succeeded
    expect(result.totalParents).toBe(401);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'weekly-progress-push-cron-fan-out',
          batchIndex: 200,
          batchSize: 200,
          totalParents: 401,
        }),
      })
    );
  });
});
