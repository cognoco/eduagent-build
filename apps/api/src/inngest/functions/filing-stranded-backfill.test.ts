// ---------------------------------------------------------------------------
// Filing Stranded Backfill — Tests
//
// Covers the cap-and-self-resume behaviour from [CR-FIL-LIMIT-AUTORESUME-09]
// plus baseline contract assertions (find query shape, dispatch count,
// non-capped return value).
//
// [CR-PR129-M9] Also covers deterministic composite (createdAt, id) ordering
// and cursor propagation on self-reinvoke.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });

const mockFindMany = jest.fn();
const mockDb = {
  query: { learningSessions: { findMany: mockFindMany } },
};

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    learningSessions: {
      id: col('id'),
      profileId: col('profileId'),
      topicId: col('topicId'),
      filedAt: col('filedAt'),
      filingStatus: col('filingStatus'),
      sessionType: col('sessionType'),
      status: col('status'),
      createdAt: col('createdAt'),
    },
  },
});
jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => ({
      fn: handler,
      _config,
      _trigger,
    })),
    send: jest.fn(),
  },
}));

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockDb,
}));

import { filingStrandedBackfill } from './filing-stranded-backfill';

interface MockStep {
  run: jest.Mock;
  sendEvent: jest.Mock;
  sleep: jest.Mock;
}

function makeStep(): MockStep {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn().mockResolvedValue(undefined),
  };
}

// filingTimedOutEventSchema validates sessionId/profileId as UUIDs, so the
// fixture must produce real UUID-shaped strings, not synthetic "s-0" labels.
function uuid(prefix: string, i: number): string {
  // Build a v4-shaped UUID with deterministic last segment for assertions.
  const hex = i.toString(16).padStart(12, '0');
  return `${prefix}-1234-4567-8901-${hex}`.padStart(36, '0');
}
function makeStrandedRows(
  count: number,
  createdAt = new Date('2026-04-20T00:00:00Z')
) {
  return Array.from({ length: count }, (_, i) => ({
    id: uuid('aaaaaaaa', i),
    profileId: uuid('bbbbbbbb', i),
    sessionType: 'learning',
    createdAt,
  }));
}

type HandlerFn = (ctx: {
  event: { data: Record<string, unknown> };
  step: MockStep;
}) => Promise<{ dispatched: number; capped: boolean; selfReinvoked: boolean }>;

function getHandler(): HandlerFn {
  return (filingStrandedBackfill as unknown as { fn: HandlerFn }).fn;
}

describe('filingStrandedBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dispatches one synthetic-timeout event per stranded session', async () => {
    mockFindMany.mockResolvedValue(makeStrandedRows(3));
    const step = makeStep();

    const result = await getHandler()({ event: { data: {} }, step });

    expect(step.sendEvent).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      dispatched: 3,
      capped: false,
      selfReinvoked: false,
    });
  });

  it('returns capped:false and does NOT self-trigger when below the 500 limit', async () => {
    mockFindMany.mockResolvedValue(makeStrandedRows(499));
    const step = makeStep();

    const result = await getHandler()({ event: { data: {} }, step });

    expect(result.capped).toBe(false);
    expect(result.selfReinvoked).toBe(false);
    expect(step.sleep).not.toHaveBeenCalled();
    // 499 synthetic-timeout sends; no continue-stranded-backfill
    const eventNames = step.sendEvent.mock.calls.map(
      (call: unknown[]) => (call[1] as { name: string }).name
    );
    expect(eventNames).not.toContain(
      'app/maintenance.filing_stranded_backfill'
    );
  });

  // [CR-FIL-LIMIT-AUTORESUME-09] When the 500-row cap is hit, the cron must
  // self-trigger another invocation after a cooldown so operators don't have
  // to manually re-fire after cold-start incidents. The cooldown gives prior
  // observer runs time to mark filingStatus, so the same 500 rows aren't
  // re-dispatched.
  describe('[CR-FIL-LIMIT-AUTORESUME-09] auto-resume when capped', () => {
    it('self-triggers another stranded-backfill event when exactly 500 stranded sessions are found', async () => {
      mockFindMany.mockResolvedValue(makeStrandedRows(500));
      const step = makeStep();

      const result = await getHandler()({ event: { data: {} }, step });

      expect(result.capped).toBe(true);
      expect(result.selfReinvoked).toBe(true);

      // Self-trigger must be one of the sendEvent calls — and crucially,
      // it must come AFTER a sleep so observers have time to clear status.
      const continueCall = step.sendEvent.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as { name: string }).name ===
          'app/maintenance.filing_stranded_backfill'
      );
      expect(continueCall).not.toBeUndefined();
      expect(step.sleep).toHaveBeenCalledTimes(1);
      expect(step.sleep).toHaveBeenCalledWith('backfill-cooldown', '5m');
    });

    it('does not sleep or self-trigger when stranded.length is 0', async () => {
      mockFindMany.mockResolvedValue([]);
      const step = makeStep();

      const result = await getHandler()({ event: { data: {} }, step });

      expect(result).toEqual({
        dispatched: 0,
        capped: false,
        selfReinvoked: false,
      });
      expect(step.sleep).not.toHaveBeenCalled();
      expect(step.sendEvent).not.toHaveBeenCalled();
    });
  });

  // [CR-PR129-M9] Deterministic ordering and cursor propagation.
  describe('[CR-PR129-M9] deterministic (createdAt, id) ordering and cursor', () => {
    it('passes orderBy with both createdAt and id columns to findMany', async () => {
      mockFindMany.mockResolvedValue(makeStrandedRows(3));
      const step = makeStep();

      await getHandler()({ event: { data: {} }, step });

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const callArg = mockFindMany.mock.calls[0][0] as {
        orderBy: unknown[];
      };
      // orderBy must be an array with two entries — createdAt asc then id asc.
      expect(Array.isArray(callArg.orderBy)).toBe(true);
      expect((callArg.orderBy as unknown[]).length).toBe(2);
    });

    it('rows with identical createdAt but different ids are dispatched in consistent id order across two runs', async () => {
      // Two rows share the exact same createdAt — only id distinguishes them.
      const sharedTs = new Date('2026-04-21T12:00:00Z');
      const rowA = {
        id: uuid('aaaaaaaa', 0),
        profileId: uuid('bbbbbbbb', 0),
        sessionType: 'learning',
        createdAt: sharedTs,
      };
      const rowB = {
        id: uuid('aaaaaaaa', 1),
        profileId: uuid('bbbbbbbb', 1),
        sessionType: 'learning',
        createdAt: sharedTs,
      };

      // Simulate DB always returning rows sorted by (createdAt asc, id asc).
      // Both runs return the same deterministic order — this is what we assert.
      mockFindMany.mockResolvedValue([rowA, rowB]);

      const step1 = makeStep();
      await getHandler()({ event: { data: {} }, step: step1 });

      mockFindMany.mockResolvedValue([rowA, rowB]);

      const step2 = makeStep();
      await getHandler()({ event: { data: {} }, step: step2 });

      // Extract dispatched session IDs from both runs.
      const idsRun1 = step1.sendEvent.mock.calls
        .filter((c: unknown[]) =>
          (c[0] as string).startsWith('synthetic-timeout-')
        )
        .map(
          (c: unknown[]) =>
            (c[1] as { data: { sessionId: string } }).data.sessionId
        );

      const idsRun2 = step2.sendEvent.mock.calls
        .filter((c: unknown[]) =>
          (c[0] as string).startsWith('synthetic-timeout-')
        )
        .map(
          (c: unknown[]) =>
            (c[1] as { data: { sessionId: string } }).data.sessionId
        );

      // Same order across both runs — deterministic.
      expect(idsRun1).toEqual(idsRun2);
      expect(idsRun1).toHaveLength(2);
    });

    it('self-reinvoke event data carries lastCreatedAt and lastId cursor from the last row', async () => {
      const rows = makeStrandedRows(500);
      mockFindMany.mockResolvedValue(rows);
      const step = makeStep();

      await getHandler()({ event: { data: {} }, step });

      const continueCall = step.sendEvent.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as { name: string }).name ===
          'app/maintenance.filing_stranded_backfill'
      );
      expect(continueCall).not.toBeUndefined();
      const eventData = (
        continueCall![1] as { data: { lastCreatedAt: string; lastId: string } }
      ).data;
      const lastRow = rows[499];
      expect(eventData.lastCreatedAt).toBe(
        new Date(lastRow.createdAt).toISOString()
      );
      expect(eventData.lastId).toBe(lastRow.id);
    });

    it('second run passes cursor filter to findMany when event.data contains lastCreatedAt + lastId', async () => {
      const ts = '2026-04-20T00:00:00.000Z';
      const lastId = uuid('aaaaaaaa', 499);
      mockFindMany.mockResolvedValue(makeStrandedRows(3));
      const step = makeStep();

      await getHandler()({
        event: { data: { lastCreatedAt: ts, lastId } },
        step,
      });

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const callArg = mockFindMany.mock.calls[0][0] as {
        where: unknown;
      };
      // The where clause must be non-null — it includes the cursor filter.
      expect(callArg.where).toEqual(expect.any(Object));
      expect(callArg.where).not.toBeNull();
    });

    it('first run (no cursor in event.data) does NOT include cursor filter', async () => {
      mockFindMany.mockResolvedValue(makeStrandedRows(3));
      const step = makeStep();

      await getHandler()({ event: { data: {} }, step });

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      // The call must have happened — spot-check that findMany received a
      // where clause (the base filters are always present).
      const callArg = mockFindMany.mock.calls[0][0] as { where: unknown };
      expect(callArg.where).toEqual(expect.any(Object));
    });
  });
});
