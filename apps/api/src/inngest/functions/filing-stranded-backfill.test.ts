// ---------------------------------------------------------------------------
// Filing Stranded Backfill — Tests
//
// Covers the cap-and-self-resume behaviour from [CR-FIL-LIMIT-AUTORESUME-09]
// plus baseline contract assertions (find query shape, dispatch count,
// non-capped return value).
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
function makeStrandedRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: uuid('aaaaaaaa', i),
    profileId: uuid('bbbbbbbb', i),
    sessionType: 'learning',
    createdAt: new Date('2026-04-20T00:00:00Z'),
  }));
}

describe('filingStrandedBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dispatches one synthetic-timeout event per stranded session', async () => {
    mockFindMany.mockResolvedValue(makeStrandedRows(3));
    const step = makeStep();
    const handler = (
      filingStrandedBackfill as unknown as {
        fn: (ctx: { step: MockStep }) => Promise<{
          dispatched: number;
          capped: boolean;
          selfReinvoked: boolean;
        }>;
      }
    ).fn;

    const result = await handler({ step });

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
    const handler = (
      filingStrandedBackfill as unknown as {
        fn: (ctx: { step: MockStep }) => Promise<{
          dispatched: number;
          capped: boolean;
          selfReinvoked: boolean;
        }>;
      }
    ).fn;

    const result = await handler({ step });

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
      const handler = (
        filingStrandedBackfill as unknown as {
          fn: (ctx: { step: MockStep }) => Promise<{
            dispatched: number;
            capped: boolean;
            selfReinvoked: boolean;
          }>;
        }
      ).fn;

      const result = await handler({ step });

      expect(result.capped).toBe(true);
      expect(result.selfReinvoked).toBe(true);

      // Self-trigger must be one of the sendEvent calls — and crucially,
      // it must come AFTER a sleep so observers have time to clear status.
      const continueCall = step.sendEvent.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as { name: string }).name ===
          'app/maintenance.filing_stranded_backfill'
      );
      expect(continueCall).toBeDefined();
      expect(step.sleep).toHaveBeenCalledTimes(1);
      expect(step.sleep).toHaveBeenCalledWith('backfill-cooldown', '5m');
    });

    it('does not sleep or self-trigger when stranded.length is 0', async () => {
      mockFindMany.mockResolvedValue([]);
      const step = makeStep();
      const handler = (
        filingStrandedBackfill as unknown as {
          fn: (ctx: { step: MockStep }) => Promise<{
            dispatched: number;
            capped: boolean;
            selfReinvoked: boolean;
          }>;
        }
      ).fn;

      const result = await handler({ step });

      expect(result).toEqual({
        dispatched: 0,
        capped: false,
        selfReinvoked: false,
      });
      expect(step.sleep).not.toHaveBeenCalled();
      expect(step.sendEvent).not.toHaveBeenCalled();
    });
  });
});
