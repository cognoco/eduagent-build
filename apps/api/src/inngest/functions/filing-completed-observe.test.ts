// ---------------------------------------------------------------------------
// Filing Completed Observer — Unit Tests
//
// Tests the audit observer that flips filing_pending / filing_failed →
// filing_recovered when an app/filing.completed event arrives, and dispatches
// app/session.filing_resolved with resolution 'recovered' only when the prior
// status was filing_failed (not filing_pending — the filing-timed-out-observer
// handles that path).
//
// Uses the manual step executor pattern (same as filing-timed-out-observe.test.ts).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module mocks — declared BEFORE any imports per Jest hoisting rules.
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (
        _config: unknown,
        _trigger: unknown,
        handler: (...args: unknown[]) => unknown
      ) => ({ fn: handler, _config, _trigger })
    ),
  },
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Import AFTER mocks are set up
import { filingCompletedObserve } from './filing-completed-observe';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      sessionId: SESSION_ID,
      profileId: PROFILE_ID,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Manual step executor
//
// Provides fine-grained control per step so we can:
//   - control what db.query.learningSessions.findFirst returns (priorStatus)
//   - control what db.update().returning() resolves to (flipped / not flipped)
// ---------------------------------------------------------------------------

type StepRunOverrides = Record<string, () => Promise<unknown>>;

async function executeHandler(
  filingStatus: string | null,
  // Controls what db.update().returning() resolves to.
  // Defaults to [{ id: SESSION_ID }] (1 row updated → flipped = true).
  updateRows: unknown[] = [{ id: SESSION_ID }],
  stepRunOverrides: StepRunOverrides = {},
  eventOverrides: Partial<Record<string, unknown>> = {}
) {
  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name in stepRunOverrides) {
        return stepRunOverrides[name]();
      }
      return fn();
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(updateRows),
  };

  const mockDb = {
    query: {
      learningSessions: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            filingStatus !== null ? { filingStatus } : undefined
          ),
      },
    },
    update: jest.fn().mockReturnValue(mockUpdateChain),
  };

  mockGetStepDatabase.mockReturnValue(mockDb);

  const handler = (filingCompletedObserve as any).fn;
  const result = await handler({
    event: makeEvent(eventOverrides),
    step: mockStep,
  });
  return { result, mockStep, mockDb, mockUpdateChain };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filing-completed-observe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: filing_pending → filing_recovered
  //
  // The common happy path: a session stuck in filing_pending gets recovered
  // when filing.completed fires. No filing_resolved event is dispatched because
  // that is the timed-out-observer's responsibility for the pending path.
  // -------------------------------------------------------------------------
  it('flips filing_pending → filing_recovered on completion event', async () => {
    const { result, mockStep, mockUpdateChain } = await executeHandler(
      'filing_pending',
      [{ id: SESSION_ID }]
    );

    // Function reports recovered = true
    expect(result.recovered).toBe(true);
    expect(result.priorStatus).toBe('filing_pending');

    // The update step ran and included the correct status values
    expect(mockUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ filingStatus: 'filing_recovered' })
    );

    // No filing_resolved event — pending path is handled by timed-out-observer
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: filing_failed → filing_recovered + dispatches filing_resolved
  //
  // When recovering from a confirmed failure, the observer dispatches
  // app/session.filing_resolved with resolution: 'recovered' so downstream
  // consumers can act on the late recovery.
  // -------------------------------------------------------------------------
  it('flips filing_failed → filing_recovered and dispatches app/session.filing_resolved', async () => {
    const { result, mockStep } = await executeHandler('filing_failed', [
      { id: SESSION_ID },
    ]);

    expect(result.recovered).toBe(true);
    expect(result.priorStatus).toBe('filing_failed');

    // filing_resolved MUST be dispatched with resolution 'recovered'
    expect(mockStep.sendEvent).toHaveBeenCalledTimes(1);
    const [stepName, payload] = mockStep.sendEvent.mock.calls[0];
    expect(stepName).toBe('emit-resolved');
    expect(payload).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
        resolution: 'recovered',
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: filing_status null → no-op
  //
  // When the session has no filing status (never entered filing flow, or
  // already cleaned up), the function returns early without touching the DB.
  // -------------------------------------------------------------------------
  it('is a no-op for sessions with filing_status null', async () => {
    const { result, mockStep, mockUpdateChain } = await executeHandler(
      null,
      []
    );

    expect(result.recovered).toBe(false);
    expect(result.priorStatus).toBeNull();

    // No UPDATE and no event
    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: filing_pending flip succeeded but filing_resolved NOT dispatched
  //
  // Verifies the conditional: event is only sent when
  // flipped === true AND priorStatus === 'filing_failed'.
  // For filing_pending the condition must be false.
  // -------------------------------------------------------------------------
  it('does NOT dispatch filing_resolved when flipping from filing_pending (observer handles it)', async () => {
    const { result, mockStep } = await executeHandler('filing_pending', [
      { id: SESSION_ID },
    ]);

    // Flip did succeed
    expect(result.recovered).toBe(true);
    expect(result.priorStatus).toBe('filing_pending');

    // But no event dispatched — only filing_failed triggers the event
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Bonus: filing_recovered → no-op (already in terminal recovered state)
  // -------------------------------------------------------------------------
  it('is a no-op when session is already filing_recovered', async () => {
    const { result, mockStep, mockUpdateChain } = await executeHandler(
      'filing_recovered',
      []
    );

    expect(result.recovered).toBe(false);
    expect(result.priorStatus).toBe('filing_recovered');

    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Bonus: CAS no-op — DB returns 0 rows for filing_failed (race condition)
  //
  // Another observer already advanced the status before this step ran.
  // flipped = false → no filing_resolved event despite priorStatus=filing_failed.
  // -------------------------------------------------------------------------
  it('does NOT dispatch filing_resolved when CAS update matches 0 rows (concurrent update)', async () => {
    const { result, mockStep } = await executeHandler(
      'filing_failed',
      [] // 0 rows updated → flipped = false
    );

    expect(result.recovered).toBe(false);
    expect(result.priorStatus).toBe('filing_failed');

    // flipped is false so event must NOT be dispatched
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Bonus: missing sessionId / profileId → early return
  // -------------------------------------------------------------------------
  it('returns recovered: false and priorStatus: null when sessionId is missing', async () => {
    const mockStep = {
      run: jest.fn(),
      sendEvent: jest.fn(),
    };

    const mockDb = {
      query: { learningSessions: { findFirst: jest.fn() } },
      update: jest.fn(),
    };
    mockGetStepDatabase.mockReturnValue(mockDb);

    const handler = (filingCompletedObserve as any).fn;
    const result = await handler({
      event: { data: { profileId: PROFILE_ID } }, // sessionId absent
      step: mockStep,
    });

    expect(result).toEqual({ recovered: false, priorStatus: null });
    expect(mockStep.run).not.toHaveBeenCalled();
    expect(mockStep.sendEvent).not.toHaveBeenCalled();
  });
});
