const mockGetStepDatabase = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => ({
      fn: handler,
      _config,
      _trigger,
    })),
  },
}));

import { summaryReconciliationCron } from './summary-reconciliation-cron';

// ---------------------------------------------------------------------------
// Chainable DB mock — returns [] by default for all queries
// ---------------------------------------------------------------------------

function makeMockDb() {
  const chain = {
    select: jest.fn(),
    from: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue([]);
  return chain;
}

// ---------------------------------------------------------------------------
// Step factory — pass-through (executes the real callback)
// ---------------------------------------------------------------------------

function createPassThroughStep(overrides: Record<string, unknown> = {}) {
  return {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name in overrides) return overrides[name];
      return fn();
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Step factory — stub (returns whatever override says, skips callbacks)
// ---------------------------------------------------------------------------

function createStubStep(overrides: Record<string, unknown> = {}) {
  return {
    run: jest.fn(async (name: string) => overrides[name] ?? []),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe('summaryReconciliationCron', () => {
  describe('event fan-out behaviour', () => {
    it('fans out create/regenerate/recap events without replaying app/session.completed', async () => {
      const step = createStubStep({
        'find-missing-summaries': [
          {
            sessionId: 'session-create',
            profileId: 'profile-1',
            subjectId: 'subject-1',
            topicId: 'topic-1',
          },
        ],
        'find-missing-llm-summaries': [
          {
            sessionSummaryId: 'summary-1',
            sessionId: 'session-regen',
            profileId: 'profile-2',
            subjectId: 'subject-2',
            topicId: 'topic-2',
          },
        ],
        'find-missing-learner-recaps': [
          {
            sessionSummaryId: 'summary-2',
            sessionId: 'session-recap',
            profileId: 'profile-3',
            subjectId: 'subject-3',
            topicId: 'topic-3',
          },
        ],
      });

      const handler = (summaryReconciliationCron as any).fn;
      const result = await handler({ step });

      expect(result).toEqual(
        expect.objectContaining({
          status: 'completed',
          createCount: 1,
          regenerateCount: 1,
          recapCount: 1,
        }),
      );
      expect(step.sendEvent).toHaveBeenCalledWith(
        'fan-out-create-summaries',
        expect.arrayContaining([
          expect.objectContaining({ name: 'app/session.summary.create' }),
        ]),
      );
      expect(step.sendEvent).toHaveBeenCalledWith(
        'fan-out-regenerate-summaries',
        expect.arrayContaining([
          expect.objectContaining({ name: 'app/session.summary.regenerate' }),
        ]),
      );
      expect(step.sendEvent).toHaveBeenCalledWith(
        'fan-out-regenerate-recaps',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'app/session.learner-recap.regenerate',
          }),
        ]),
      );

      const sentNames = (step.sendEvent as jest.Mock).mock.calls.flatMap(
        ([, payload]: [string, unknown]) =>
          Array.isArray(payload)
            ? payload.map((event) => (event as { name: string }).name)
            : [(payload as { name: string }).name],
      );
      expect(sentNames).not.toContain('app/session.completed');
      expect(sentNames).toEqual(
        expect.arrayContaining(['app/summary.reconciliation.scanned']),
      );
      // [BUG-994] When totalCount > 0, the requeued event IS emitted for SLO alerting.
      expect(sentNames).toContain('app/summary.reconciliation.requeued');
    });

    it('still emits reconciliation metrics when every queue is empty', async () => {
      const step = createStubStep({});
      const handler = (summaryReconciliationCron as any).fn;

      const result = await handler({ step });

      expect(result).toEqual(
        expect.objectContaining({
          status: 'completed',
          createCount: 0,
          regenerateCount: 0,
          recapCount: 0,
        }),
      );
      expect(step.sendEvent).toHaveBeenCalledWith(
        'notify-summary-reconciliation-scanned',
        expect.objectContaining({
          name: 'app/summary.reconciliation.scanned',
          data: expect.objectContaining({ totalCount: 0 }),
        }),
      );
      // [BUG-994] No requeued event when nothing was requeued (avoids alert noise).
      const emptySentNames = (step.sendEvent as jest.Mock).mock.calls.flatMap(
        ([, payload]: [string, unknown]) =>
          Array.isArray(payload)
            ? payload.map((e) => (e as { name: string }).name)
            : [(payload as { name: string }).name],
      );
      expect(emptySentNames).not.toContain(
        'app/summary.reconciliation.requeued',
      );
    });
  });

  // -------------------------------------------------------------------------
  // M1: 6-hour upper bound
  //
  // The cron must NOT requeue sessions that ended less than 6 hours ago —
  // those haven't had time to complete the normal post-session pipeline.
  // Spec `docs/specs/2026-05-05-tiered-conversation-retention.md` lines
  // 194, 208, 327-328.
  //
  // Strategy: use fake timers to pin Date.now(), then inspect the drizzle SQL
  // objects captured by the mock DB's .where() calls. drizzle's lt() builds a
  // SQL object whose queryChunks include the date value as an ISO string at a
  // known position. We extract all Date-like strings from those chunks and
  // verify each is exactly 6 hours before the pinned clock.
  // -------------------------------------------------------------------------

  describe('M1 — 6-hour upper bound on all three WHERE clauses', () => {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    // Pin the clock so the 6-hour date is deterministic
    const FAKE_NOW = new Date('2026-05-05T12:00:00.000Z').getTime();
    const EXPECTED_UPPER_BOUND_MS = FAKE_NOW - SIX_HOURS_MS; // 2026-05-05T06:00:00Z

    let mockDb: ReturnType<typeof makeMockDb>;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers({ now: FAKE_NOW });
      mockDb = makeMockDb();
      mockGetStepDatabase.mockReturnValue(mockDb);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Recursively extract Date objects from a drizzle SQL object. Dates passed
     * to operators like `lt(col, date)` end up wrapped in a `Param` whose
     * `.value` is the real Date — not directly inside queryChunks.
     */
    function extractDatesFromSql(sqlObj: unknown): Date[] {
      if (!sqlObj) return [];
      if (sqlObj instanceof Date) return [sqlObj];
      if (typeof sqlObj !== 'object') return [];
      const obj = sqlObj as Record<string, unknown>;
      const dates: Date[] = [];
      if (Array.isArray(obj.queryChunks)) {
        for (const c of obj.queryChunks) dates.push(...extractDatesFromSql(c));
      }
      if (obj.value !== undefined) {
        dates.push(...extractDatesFromSql(obj.value));
      }
      return dates;
    }

    it('includes a < now()-6h upper bound in the WHERE clause of all three queries', async () => {
      const step = createPassThroughStep();
      const handler = (summaryReconciliationCron as any).fn;
      await handler({ step });

      // .where() is called once per query (3 total)
      expect(mockDb.where).toHaveBeenCalledTimes(3);
      expect(mockDb.orderBy).toHaveBeenCalledTimes(3);

      for (const call of mockDb.where.mock.calls) {
        // The single argument to .where() is an AND(...) SQL object
        const andObj = call[0] as unknown;
        const dates = extractDatesFromSql(andObj);
        // At least one Date in this WHERE must equal exactly sixHoursAgo
        const hasSixHourBound = dates.some(
          (d) => d.getTime() === EXPECTED_UPPER_BOUND_MS,
        );
        expect(hasSixHourBound).toBe(true);
      }
    });

    it('does NOT include a date newer than now()-6h as an upper bound', async () => {
      const step = createPassThroughStep();
      const handler = (summaryReconciliationCron as any).fn;
      await handler({ step });

      for (const call of mockDb.where.mock.calls) {
        const andObj = call[0] as unknown;
        const dates = extractDatesFromSql(andObj);
        // Every upper-bound date must be <= sixHoursAgo (not a too-recent timestamp)
        // The lower-bound dates (since, recapSince) are further in the past, so
        // this also holds for them. The key invariant: no date is between
        // sixHoursAgo and now.
        for (const d of dates) {
          const t = d.getTime();
          // Reject any date that is newer than sixHoursAgo (which would allow
          // recently-ended sessions to be requeued prematurely)
          const isLowerBound = t < EXPECTED_UPPER_BOUND_MS; // further past = lower bound (since/recapSince)
          const isUpperBound = t === EXPECTED_UPPER_BOUND_MS;
          expect(isLowerBound || isUpperBound).toBe(true);
        }
      }
    });
  });
});
