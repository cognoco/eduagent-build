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
const mockDb = {
  query: {
    familyLinks: { findMany: jest.fn().mockResolvedValue([]) },
    notificationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  },
  select: jest.fn(() => ({
    from: () => ({
      innerJoin: () => ({ where: async () => [] }),
    }),
  })),
};
jest.mock('../helpers', () => ({
  getStepDatabase: () => mockDb,
}));
jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (config: unknown, trigger: unknown, fn: unknown) => ({
        fn,
        _config: config,
        _trigger: trigger,
      }),
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
      true,
    );
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 8, 0, 0)))).toBe(
      false,
    );
  });

  it('invalid timezone string falls back to UTC 09:00 (no crash)', () => {
    expect(
      isLocalHour9('Not/AReal_TZ', new Date(Date.UTC(2026, 3, 13, 9, 0, 0))),
    ).toBe(true);
  });

  it('Europe/Prague (UTC+2 DST) matches at 07:00 UTC on a DST Monday', () => {
    // 2026-04-13 is in CEST (UTC+2). Local 09:00 → UTC 07:00.
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 7, 0, 0))),
    ).toBe(true);
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 9, 0, 0))),
    ).toBe(false);
  });
});

describe('[BUG-850 / F-SVC-021] weekly-progress-push fan-out error escalation', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    jest.clearAllMocks();
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({ where: async () => [] }),
      }),
    });
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
      run: jest.fn(async (_name: string, _fn: () => Promise<unknown>) => {
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
      }),
    );
  });
});

describe('weekly progress parent eligibility', () => {
  function timezoneForLocalHour(targetHour: number): string {
    const now = new Date();
    const candidates = [
      'Etc/GMT+12',
      'Etc/GMT+11',
      'Etc/GMT+10',
      'Etc/GMT+9',
      'Etc/GMT+8',
      'Etc/GMT+7',
      'Etc/GMT+6',
      'Etc/GMT+5',
      'Etc/GMT+4',
      'Etc/GMT+3',
      'Etc/GMT+2',
      'Etc/GMT+1',
      'Etc/GMT',
      'Etc/GMT-1',
      'Etc/GMT-2',
      'Etc/GMT-3',
      'Etc/GMT-4',
      'Etc/GMT-5',
      'Etc/GMT-6',
      'Etc/GMT-7',
      'Etc/GMT-8',
      'Etc/GMT-9',
      'Etc/GMT-10',
      'Etc/GMT-11',
      'Etc/GMT-12',
      'Etc/GMT-13',
      'Etc/GMT-14',
    ];
    const match = candidates.find((timezone) => {
      const hour = Number(
        now.toLocaleString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hour12: false,
        }),
      );
      return hour === targetHour;
    });
    if (!match) throw new Error(`No timezone found for hour ${targetHour}`);
    return match;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.familyLinks.findMany.mockResolvedValue([]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([]);
  });

  it('queues an email-only parent even when push is disabled', async () => {
    mockDb.query.familyLinks.findMany.mockResolvedValue([
      { parentProfileId: 'parent-email-only' },
    ]);
    mockDb.query.notificationPreferences.findMany.mockResolvedValue([
      {
        profileId: 'parent-email-only',
        pushEnabled: false,
        weeklyProgressPush: false,
        weeklyProgressEmail: true,
      },
    ]);
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: async () => [
            {
              profileId: 'parent-email-only',
              timezone: timezoneForLocalHour(9),
            },
          ],
        }),
      }),
    });

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };
    const handler = (
      weeklyProgressPushCron as unknown as {
        fn: (ctx: { step: typeof step }) => Promise<unknown>;
      }
    ).fn;

    const result = (await handler({ step })) as { queuedParents: number };

    expect(result.queuedParents).toBe(1);
    expect(step.sendEvent).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({
        name: 'app/weekly-progress-push.generate',
        data: { parentId: 'parent-email-only' },
      }),
    ]);
  });
});
