// ---------------------------------------------------------------------------
// Recall Nudge Cron — Tests
//
// recall-nudge.ts is a cross-profile hourly cron that:
//   1. Runs step `find-eligible-profiles`: queries profiles with overdue
//      retention cards, push enabled, consent OK, local time 07:30–08:30,
//      not already nudged today.
//   2. Fans out `app/recall-nudge.send` events in chunks of 500.
//   3. Returns { status, eligibleCount, sentEvents }.
//
// Strategy: use `runResults` in createInngestStepRunner to inject the
// `find-eligible-profiles` step output. This decouples fan-out tests from
// the complex DB query. A dedicated DB-path test exercises the real step
// callback with a chainable mock DB to verify the query structure.
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, inngest: mockInngestTransport.inngest };
});

import { recallNudge } from './recall-nudge';

const ORIGINAL_IDENTITY_V2_ENABLED = process.env['IDENTITY_V2_ENABLED'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EligibleProfile = {
  profileId: string;
  overdueCount: number;
  topTopicIds: string[];
};

async function executeCron(
  eligibleProfiles: EligibleProfile[] | undefined = undefined,
): Promise<{
  result: { status: string; eligibleCount: number; sentEvents: number };
  sendEventCalls: ReturnType<typeof createInngestStepRunner>['sendEventCalls'];
  runCalls: ReturnType<typeof createInngestStepRunner>['runCalls'];
}> {
  const runResults =
    eligibleProfiles !== undefined
      ? { 'find-eligible-profiles': eligibleProfiles }
      : undefined;

  const { step, sendEventCalls, runCalls } = createInngestStepRunner(
    runResults !== undefined ? { runResults } : {},
  );

  const handler = (recallNudge as any).fn;
  const result = await handler({ step });

  return { result, sendEventCalls, runCalls };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockInngestTransport.clear();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  delete process.env['IDENTITY_V2_ENABLED'];
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
  if (ORIGINAL_IDENTITY_V2_ENABLED === undefined) {
    delete process.env['IDENTITY_V2_ENABLED'];
  } else {
    process.env['IDENTITY_V2_ENABLED'] = ORIGINAL_IDENTITY_V2_ENABLED;
  }
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('recallNudge configuration', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect((recallNudge as { opts?: { id?: string } }).opts?.id).toBe(
      'recall-nudge',
    );
  });

  it('triggers on an hourly cron schedule', () => {
    const trigger = (recallNudge as any).trigger;
    // Cron triggers are defined as { cron: '...' } on the trigger object
    expect(trigger.cron).toBe('0 * * * *');
  });

  it('has the correct function name', () => {
    const opts = (recallNudge as any).opts;
    expect(opts.name).toBe('Smart recall nudge (hourly)');
  });
});

// ---------------------------------------------------------------------------
// Happy path — zero eligible profiles
// ---------------------------------------------------------------------------

describe('recallNudge — no eligible profiles', () => {
  it('returns status:completed with zero counts when no profiles are eligible', async () => {
    const { result } = await executeCron([]);

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 0,
      sentEvents: 0,
    });
  });

  it('does not call step.sendEvent when no profiles are eligible', async () => {
    const { sendEventCalls } = await executeCron([]);

    expect(sendEventCalls).toHaveLength(0);
  });

  it('runs the find-eligible-profiles step', async () => {
    // Even when the step result is injected, step.run must be called
    const { runCalls } = await executeCron([]);

    expect(runCalls).toContainEqual({ name: 'find-eligible-profiles' });
  });
});

// ---------------------------------------------------------------------------
// Happy path — eligible profiles present
// ---------------------------------------------------------------------------

describe('recallNudge — eligible profiles fan-out', () => {
  it('fans out one app/recall-nudge.send event per eligible profile', async () => {
    const eligible: EligibleProfile[] = [
      {
        profileId: 'p-1',
        overdueCount: 3,
        topTopicIds: ['t-1', 't-2', 't-3'],
      },
      {
        profileId: 'p-2',
        overdueCount: 1,
        topTopicIds: ['t-4'],
      },
    ];

    const { sendEventCalls, result } = await executeCron(eligible);

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 2,
      sentEvents: 2,
    });
    expect(sendEventCalls).toHaveLength(1); // Both fit in one chunk
    expect(sendEventCalls[0]?.name).toBe('fan-out-0');
    const payload = sendEventCalls[0]?.payload as Array<{
      name: string;
      data: {
        profileId: string;
        fadingCount: number;
        topTopicIds: string[];
      };
    }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({
      name: 'app/recall-nudge.send',
      data: {
        profileId: 'p-1',
        fadingCount: 3,
        topTopicIds: ['t-1', 't-2', 't-3'],
      },
    });
    expect(payload[1]).toEqual({
      name: 'app/recall-nudge.send',
      data: {
        profileId: 'p-2',
        fadingCount: 1,
        topTopicIds: ['t-4'],
      },
    });
  });

  it('maps overdueCount to fadingCount in the event payload', async () => {
    const eligible: EligibleProfile[] = [
      { profileId: 'p-x', overdueCount: 7, topTopicIds: ['t-a', 't-b'] },
    ];

    const { sendEventCalls } = await executeCron(eligible);

    const payload = sendEventCalls[0]?.payload as Array<{
      data: { fadingCount: number };
    }>;
    expect(payload[0]?.data.fadingCount).toBe(7);
  });

  it('includes topTopicIds in every fan-out event', async () => {
    const eligible: EligibleProfile[] = [
      { profileId: 'p-topics', overdueCount: 2, topTopicIds: ['t-1', 't-2'] },
    ];

    const { sendEventCalls } = await executeCron(eligible);

    const payload = sendEventCalls[0]?.payload as Array<{
      data: { topTopicIds: string[] };
    }>;
    expect(payload[0]?.data.topTopicIds).toEqual(['t-1', 't-2']);
  });

  it('handles a profile with empty topTopicIds (null-safe fallback)', async () => {
    // The source does: topTopicIds: r.topTopicIds ?? []
    // Inject a result where topTopicIds is already an empty array (post-mapping).
    const eligible: EligibleProfile[] = [
      { profileId: 'p-empty', overdueCount: 1, topTopicIds: [] },
    ];

    const { sendEventCalls } = await executeCron(eligible);

    const payload = sendEventCalls[0]?.payload as Array<{
      data: { topTopicIds: string[] };
    }>;
    expect(payload[0]?.data.topTopicIds).toEqual([]);
  });

  it('returns eligibleCount and sentEvents matching the profiles list length', async () => {
    const eligible: EligibleProfile[] = Array.from({ length: 5 }, (_, i) => ({
      profileId: `p-${i}`,
      overdueCount: i + 1,
      topTopicIds: [`t-${i}`],
    }));

    const { result } = await executeCron(eligible);

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 5,
      sentEvents: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Batch chunking — 500-profile boundary
// ---------------------------------------------------------------------------

describe('recallNudge — batching at BATCH_SIZE=500', () => {
  it('emits a single fan-out-0 sendEvent call for exactly 500 profiles', async () => {
    const eligible: EligibleProfile[] = Array.from({ length: 500 }, (_, i) => ({
      profileId: `p-${i}`,
      overdueCount: 1,
      topTopicIds: [],
    }));

    const { sendEventCalls, result } = await executeCron(eligible);

    expect(sendEventCalls).toHaveLength(1);
    expect(sendEventCalls[0]?.name).toBe('fan-out-0');
    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 500,
      sentEvents: 500,
    });
  });

  it('caps a 501-profile scan to one 500-event fan-out', async () => {
    const eligible: EligibleProfile[] = Array.from({ length: 501 }, (_, i) => ({
      profileId: `p-${i}`,
      overdueCount: 2,
      topTopicIds: [],
    }));

    const { sendEventCalls, result } = await executeCron(eligible);

    expect(sendEventCalls).toHaveLength(1);
    expect(sendEventCalls[0]?.name).toBe('fan-out-0');

    const firstChunk = sendEventCalls[0]?.payload as unknown[];
    expect(firstChunk).toHaveLength(500);

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 500,
      sentEvents: 500,
    });
  });

  it('still sends only one capped batch for 1001 profiles', async () => {
    const eligible: EligibleProfile[] = Array.from(
      { length: 1001 },
      (_, i) => ({
        profileId: `p-${i}`,
        overdueCount: 1,
        topTopicIds: [],
      }),
    );

    const { sendEventCalls, result } = await executeCron(eligible);

    expect(sendEventCalls).toHaveLength(1);
    expect(sendEventCalls[0]?.name).toBe('fan-out-0');
    expect(sendEventCalls[0]?.payload as unknown[]).toHaveLength(500);

    expect(result).toMatchObject({
      status: 'completed',
      eligibleCount: 500,
      sentEvents: 500,
    });
  });

  it('sentEvents never exceeds the per-tick cap', async () => {
    const eligible: EligibleProfile[] = Array.from(
      { length: 1200 },
      (_, i) => ({
        profileId: `p-${i}`,
        overdueCount: 1,
        topTopicIds: [],
      }),
    );

    const { result } = await executeCron(eligible);

    expect(result.sentEvents).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DB path — step callback exercises real query chain
//
// Uses a chainable mock DB to verify the step callback calls db.select(),
// .from(), .innerJoin(), and .groupBy(). Does NOT assert on SQL internals
// (those are Drizzle's responsibility) — only that the query chain was
// invoked and the results are correctly mapped.
// ---------------------------------------------------------------------------

describe('recallNudge — find-eligible-profiles step DB path', () => {
  /**
   * Builds a chainable Drizzle-compatible mock DB.
   *
   * The recall-nudge query calls db.select() three times:
   *   1. Main query:  .select({profileId, overdueCount, topTopicIds})
   *                   .from().innerJoin()×4.where().groupBy()  → resolves to rows
   *   2. Subquery A:  .select({_:sql`1`}).from().where()       → value builder, not awaited
   *   3. Subquery B:  .select({_:sql`1`}).from().where()       → value builder, not awaited
   *
   * Strategy: every call to db.select() returns the same recursive "fluent
   * builder" object. All methods return `this` (the same builder) except
   * `groupBy`, which resolves to the provided rows — the one terminal point
   * in the main query chain. Subquery chains never call groupBy, so they just
   * collect method calls and resolve to nothing.
   */
  function buildChainableDb(
    rows: Array<{
      profileId: string;
      overdueCount: number;
      topTopicIds: string[] | null;
    }>,
  ): { select: jest.Mock; builder: Record<string, jest.Mock> } {
    // Builder that returns itself for every method except groupBy
    const builder: Record<string, jest.Mock> = {};
    const methods = [
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'having',
      'orderBy',
      'limit',
      'offset',
    ];
    for (const method of methods) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder['groupBy'] = jest.fn().mockReturnValue(builder);
    builder['limit'] = jest.fn().mockResolvedValue(rows);

    const selectMock = jest.fn().mockReturnValue(builder);
    return { select: selectMock, builder };
  }

  it('calls db.select() when executing the find-eligible-profiles step', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    // Do NOT inject runResults — let the real callback run
    const { step, runCalls } = createInngestStepRunner();
    const handler = (recallNudge as any).fn;
    await handler({ step });

    expect(runCalls).toContainEqual({ name: 'find-eligible-profiles' });
    expect(db.select).toHaveBeenCalled();
  });

  it('maps topTopicIds null to empty array from DB results', async () => {
    const dbRows = [
      { profileId: 'p-null-topics', overdueCount: 2, topTopicIds: null },
    ];
    const db = buildChainableDb(dbRows);
    mockGetStepDatabase.mockReturnValue(db);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (recallNudge as any).fn;
    await handler({ step });

    // The source does: topTopicIds: r.topTopicIds ?? []
    const payload = sendEventCalls[0]?.payload as Array<{
      data: { topTopicIds: string[] };
    }>;
    expect(payload[0]?.data.topTopicIds).toEqual([]);
  });

  it('returns zero eligible when DB query returns empty array', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step } = createInngestStepRunner();
    const handler = (recallNudge as any).fn;
    const result = await handler({ step });

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 0,
      sentEvents: 0,
    });
  });

  it('[WI-80] joins retention cards through owned topic parents before aggregating', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step } = createInngestStepRunner();
    const handler = (recallNudge as any).fn;
    await handler({ step });

    // [WI-867] v2-only collapse: query now joins person×membership×organization
    // (3) + retentionCards + curriculumTopics + curriculumBooks + curricula +
    // subjects + notificationPreferences = 8. Pre-collapse v1 path had 7.
    expect(db.builder.innerJoin).toHaveBeenCalledTimes(8);
  });

  it('fans out correctly when DB query returns eligible profiles', async () => {
    const dbRows = [
      {
        profileId: 'p-db-1',
        overdueCount: 4,
        topTopicIds: ['topic-a', 'topic-b'],
      },
      {
        profileId: 'p-db-2',
        overdueCount: 2,
        topTopicIds: ['topic-c'],
      },
    ];
    const db = buildChainableDb(dbRows);
    mockGetStepDatabase.mockReturnValue(db);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (recallNudge as any).fn;
    const result = await handler({ step });

    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 2,
      sentEvents: 2,
    });
    const payload = sendEventCalls[0]?.payload as Array<{
      name: string;
      data: { profileId: string; fadingCount: number; topTopicIds: string[] };
    }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      name: 'app/recall-nudge.send',
      data: { profileId: 'p-db-1', fadingCount: 4 },
    });
    expect(payload[1]).toMatchObject({
      name: 'app/recall-nudge.send',
      data: { profileId: 'p-db-2', fadingCount: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// Dedup / exclusion semantics — tested via step injection
//
// The dedup SQL (notExists on notificationLog) and timezone filter live
// inside the DB query. These tests verify the *behavioural contract*:
// profiles that were already-sent today must not appear in the eligible
// list at the step output level. The DB query is the enforcement point;
// these tests confirm that if the step returns zero profiles (because the
// DB filtered them all out), no events are sent.
// ---------------------------------------------------------------------------

describe('recallNudge — dedup and exclusion behaviour', () => {
  it('sends zero events when all profiles were already nudged today (step returns empty)', async () => {
    // Simulates the dedup SQL excluding all profiles
    const { sendEventCalls, result } = await executeCron([]);

    expect(sendEventCalls).toHaveLength(0);
    expect(result).toEqual({
      status: 'completed',
      eligibleCount: 0,
      sentEvents: 0,
    });
  });

  it('only fans out the profiles returned by the step (partial eligibility)', async () => {
    // 2 out of hypothetical 5 pass the dedup + timezone filter
    const eligible: EligibleProfile[] = [
      { profileId: 'p-eligible-1', overdueCount: 3, topTopicIds: ['t-1'] },
      { profileId: 'p-eligible-2', overdueCount: 1, topTopicIds: ['t-2'] },
    ];

    const { sendEventCalls, result } = await executeCron(eligible);

    expect(result.eligibleCount).toBe(2);
    expect(result.sentEvents).toBe(2);
    const payload = sendEventCalls[0]?.payload as Array<{
      data: { profileId: string };
    }>;
    const profileIds = payload.map((e) => e.data.profileId);
    expect(profileIds).toEqual(['p-eligible-1', 'p-eligible-2']);
  });
});

// ---------------------------------------------------------------------------
// Return shape contract
// ---------------------------------------------------------------------------

describe('recallNudge — return shape', () => {
  it('always returns status, eligibleCount, and sentEvents on success', async () => {
    const { result } = await executeCron([
      { profileId: 'p-shape', overdueCount: 1, topTopicIds: [] },
    ]);

    expect(result).toHaveProperty('status', 'completed');
    expect(result).toHaveProperty('eligibleCount');
    expect(result).toHaveProperty('sentEvents');
  });

  it('eligibleCount equals sentEvents when all profiles fit in one chunk', async () => {
    const eligible: EligibleProfile[] = Array.from({ length: 10 }, (_, i) => ({
      profileId: `p-${i}`,
      overdueCount: 1,
      topTopicIds: [],
    }));

    const { result } = await executeCron(eligible);

    expect(result.eligibleCount).toBe(result.sentEvents);
  });
});
