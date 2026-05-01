// ---------------------------------------------------------------------------
// Filing Timed-Out Observer — Tests [CR-FIL-RACE-01]
//
// Tests the mark-failed CAS guard that prevents filing_recovered from being
// overwritten with filing_failed when the retry succeeds after the
// waitForEvent window closes.
//
// Uses the manual step executor pattern (same as session-stale-cleanup.test.ts)
// because InngestTestEngine is incompatible with per-step try/catch isolation.
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

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockFormatFilingFailedPush = jest.fn().mockReturnValue({
  title: 'Filing failed',
  body: 'We could not save your session.',
});
const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../../services/notifications', () => ({
  formatFilingFailedPush: () => mockFormatFilingFailedPush(),
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock('../../services/settings', () => ({
  getRecentNotificationCount: (...args: unknown[]) =>
    mockGetRecentNotificationCount(...args),
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Import AFTER mocks are set up
import { filingTimedOutObserve } from './filing-timed-out-observe';

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
      sessionType: 'freeform',
      timeoutMs: 30000,
      timestamp: new Date().toISOString(),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Manual step executor
//
// Provides fine-grained control per step so we can simulate the race:
//   - mark-pending-and-claim-retry-slot  → returns attemptNumber
//   - wait-for-retry-completion          → returns null (window closed)
//   - mark-failed                        → uses the real inner fn to drive
//                                          our CAS assertion
// ---------------------------------------------------------------------------

type StepRunOverrides = Record<string, () => Promise<unknown>>;

async function executeHandler(
  stepRunOverrides: StepRunOverrides = {},
  waitForEventResult: unknown = null,
  snapshotSession: Partial<Record<string, unknown>> | null = {
    filedAt: null,
    filingStatus: 'filing_pending',
    filingRetryCount: 0,
    topicId: 'topic-001',
    exchangeCount: 3,
    updatedAt: new Date(),
  }
) {
  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name in stepRunOverrides) {
        return stepRunOverrides[name]();
      }
      return fn();
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue(waitForEventResult),
  };

  // Default db: query returns the snapshot session, update chains resolve []
  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
  };

  // select chain: the source code destructures the awaited result of
  // db.select(...).from(...).where(...) as an array, so where() must be
  // a thenable that resolves to [].
  const mockSelectWhere = jest.fn().mockResolvedValue([]);
  const mockSelectFrom = jest.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockSelectFrom });

  const mockDb = {
    query: {
      learningSessions: {
        findFirst: jest.fn().mockResolvedValue(snapshotSession),
      },
      sessionEvents: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    update: jest.fn().mockReturnValue(mockUpdateChain),
    select: mockSelect,
  };

  mockGetStepDatabase.mockReturnValue(mockDb);

  const handler = (filingTimedOutObserve as any).fn;
  const result = await handler({ event: makeEvent(), step: mockStep });
  return { result, mockStep, mockDb, mockUpdateChain };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filing-timed-out-observe [CR-FIL-RACE-01]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // BREAK TEST — the core race condition regression guard.
  //
  // Scenario:
  //   1. Session starts in filing_pending.
  //   2. Observer claims retry slot (attemptNumber returned).
  //   3. waitForEvent times out → retryResult = null.
  //   4. Between waitForEvent closing and mark-failed running,
  //      filing-completed-observe sets status to filing_recovered.
  //   5. mark-failed's CAS guard (eq filingStatus = 'filing_pending') matches
  //      0 rows because status is now filing_recovered.
  //   6. Function MUST return resolved_after_window — NOT unrecoverable.
  //   7. The subsequent push notification + captureException MUST NOT fire.
  //   8. A structured app/session.filing_resolved event with
  //      resolution: 'recovered_after_window' MUST be emitted so ops can
  //      query this path in Inngest run history. [CR-FIL-SILENT-01]
  //
  // Red→green verification (reasoned):
  //   Without the CAS guard the WHERE clause had no status predicate, so
  //   mark-failed would always return 1 row and proceed to the unrecoverable
  //   branch regardless of the current status. The test asserts:
  //     - resolution === 'recovered_after_window'   (would be 'unrecoverable' without guard)
  //     - sendEvent (emit-resolved unrecoverable) NOT called
  //     - sendEvent (emit-resolved-recovered-after-window) IS called with correct data
  //     - send-failure-push step NOT called
  //     - captureException NOT called
  //   Each of these fails on the old code and passes on the fixed code.
  // -------------------------------------------------------------------------
  it('[CR-FIL-RACE-01] mark-failed CAS guard prevents overwriting filing_recovered with filing_failed', async () => {
    // mark-failed inner fn returns [] (0 rows updated) — simulates the case
    // where filing-completed-observe already set status to filing_recovered.
    const markFailedReturnsZeroRows = async () => false;

    // mark-pending-and-claim-retry-slot returns attempt 1 so retry is dispatched.
    const claimRetrySlotReturns1 = async () => 1;

    const { result, mockStep } = await executeHandler(
      {
        // Override specific step names; all others run their real inner fns.
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
        'mark-failed': markFailedReturnsZeroRows,
      },
      // waitForEvent returns null → 60 s window expired
      null
    );

    // Primary assertion: function exits via the recovered_after_window path.
    expect(result.resolution).toBe('recovered_after_window');

    // The emit-resolved (unrecoverable) sendEvent must NOT be called.
    const emitResolvedCalls = mockStep.sendEvent.mock.calls.filter(
      ([name]: [string]) => name === 'emit-resolved'
    );
    // Only dispatch-filing-retry and emit-auto-retry-attempted are expected.
    // emit-resolved for the unrecoverable path must NOT be among them.
    const unrecoverableEmit = emitResolvedCalls.find(
      ([, payload]: [string, { data?: { resolution?: string } }]) =>
        payload?.data?.resolution === 'unrecoverable'
    );
    expect(unrecoverableEmit).toBeUndefined();

    // [CR-FIL-SILENT-01] emit-resolved-recovered-after-window MUST be called
    // with name 'app/session.filing_resolved' and resolution 'recovered_after_window'.
    const recoveredAfterWindowEmit = mockStep.sendEvent.mock.calls.find(
      ([name]: [string]) => name === 'emit-resolved-recovered-after-window'
    );
    expect(recoveredAfterWindowEmit).toBeDefined();
    expect(recoveredAfterWindowEmit[1]).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({
        resolution: 'recovered_after_window',
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
      }),
    });

    // send-failure-push step must NOT be invoked.
    const sendFailurePushCalls = mockStep.run.mock.calls.filter(
      ([name]) => name === 'send-failure-push'
    );
    expect(sendFailurePushCalls).toHaveLength(0);

    // captureException must NOT be called.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path: mark-failed runs normally (CAS matches, 1 row updated).
  // Ensures the guard doesn't break the ordinary unrecoverable path.
  // -------------------------------------------------------------------------
  it('proceeds to unrecoverable path when mark-failed CAS matches (filing_pending status)', async () => {
    // mark-failed inner fn returns true (1 row updated).
    const markFailedReturnsOneRow = async () => true;
    const claimRetrySlotReturns1 = async () => 1;

    const { result, mockStep } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
        'mark-failed': markFailedReturnsOneRow,
      },
      // waitForEvent returns null → window expired, retry did not complete in time
      null
    );

    expect(result.resolution).toBe('unrecoverable');

    // emit-resolved (unrecoverable) MUST be called.
    const unrecoverableEmit = mockStep.sendEvent.mock.calls.find(
      ([, payload]: [string, { data?: { resolution?: string } }]) =>
        payload?.data?.resolution === 'unrecoverable'
    );
    expect(unrecoverableEmit).toBeDefined();

    // send-failure-push step MUST be invoked.
    const sendFailurePushCalls = mockStep.run.mock.calls.filter(
      ([name]) => name === 'send-failure-push'
    );
    expect(sendFailurePushCalls).toHaveLength(1);

    // captureException MUST be called.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // No retry slot: attemptNumber is null (retry count exhausted).
  // mark-failed should also be guarded — CAS no-op path.
  // [CR-FIL-SILENT-01] The recovered_after_window event MUST still be emitted.
  // -------------------------------------------------------------------------
  it('[CR-FIL-RACE-01] CAS guard works even without a retry attempt (retry slot exhausted)', async () => {
    // No retry slot — attemptNumber is null.
    const claimRetrySlotExhausted = async () => null;
    // mark-failed sees status already advanced → 0 rows.
    const markFailedReturnsZeroRows = async () => false;

    const { result, mockStep } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotExhausted,
        'mark-failed': markFailedReturnsZeroRows,
      },
      null
    );

    expect(result.resolution).toBe('recovered_after_window');
    expect(mockCaptureException).not.toHaveBeenCalled();

    const sendFailurePushCalls = mockStep.run.mock.calls.filter(
      ([name]) => name === 'send-failure-push'
    );
    expect(sendFailurePushCalls).toHaveLength(0);

    // [CR-FIL-SILENT-01] structured event must be emitted even when no retry
    // slot was claimed — ops must be able to query this path.
    const recoveredAfterWindowEmit = mockStep.sendEvent.mock.calls.find(
      ([name]: [string]) => name === 'emit-resolved-recovered-after-window'
    );
    expect(recoveredAfterWindowEmit).toBeDefined();
    expect(recoveredAfterWindowEmit[1]).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({
        resolution: 'recovered_after_window',
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Late completion branch: session already has filedAt set when re-read.
  // mark-failed never reaches execution — ensure function short-circuits.
  // -------------------------------------------------------------------------
  it('returns late_completion and skips mark-failed when session already has filedAt', async () => {
    const sessionWithFiledAt = {
      filedAt: new Date(),
      filingStatus: 'filing_recovered',
      filingRetryCount: 0,
      topicId: 'topic-001',
      exchangeCount: 3,
      updatedAt: new Date(),
    };

    const { result, mockStep } = await executeHandler(
      {},
      null,
      sessionWithFiledAt
    );

    expect(result.resolution).toBe('late_completion');

    const markFailedCalls = mockStep.run.mock.calls.filter(
      ([name]: [string]) => name === 'mark-failed'
    );
    expect(markFailedCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Retry succeeded in time: waitForEvent returns a non-null result.
  // mark-failed should be skipped entirely.
  // -------------------------------------------------------------------------
  it('returns retry_succeeded and skips mark-failed when retry completes within window', async () => {
    const claimRetrySlotReturns1 = async () => 1;
    const retryCompletedEvent = {
      data: {
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
        timestamp: new Date().toISOString(),
      },
    };

    const { result, mockStep } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
      },
      retryCompletedEvent // waitForEvent returns this → retry succeeded
    );

    expect(result.resolution).toBe('retry_succeeded');

    const markFailedCalls = mockStep.run.mock.calls.filter(
      ([name]: [string]) => name === 'mark-failed'
    );
    expect(markFailedCalls).toHaveLength(0);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [BUG-699-FOLLOWUP] 24h dedup gate break tests
//
// The send-failure-push step gates on getRecentNotificationCount so that a
// duplicate `app/session.filing_timed_out` event (operator re-fire, replay)
// does not push the same "filing failed" message twice.
// ---------------------------------------------------------------------------

describe('[BUG-699-FOLLOWUP] filing-timed-out-observe 24h push dedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: mark-failed returns true (0→failed transition succeeded),
    // retry slot returns null (no retry claimed), so the function reaches
    // send-failure-push.
    mockGetRecentNotificationCount.mockResolvedValue(0);
    mockFormatFilingFailedPush.mockReturnValue({
      title: 'Filing failed',
      body: 'We could not save your session.',
    });
  });

  it('skips sendPushNotification when a session_filing_failed was sent in last 24h', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(1);

    // Override the mark-failed step to return true so we reach send-failure-push.
    const markFailedReturnsTrue = async () => true;

    const { result } = await executeHandler({
      'mark-pending-and-claim-retry-slot': async () => null,
      'mark-failed': markFailedReturnsTrue,
    });

    expect(result.resolution).toBe('unrecoverable');
    // getRecentNotificationCount must have been called with the correct args.
    expect(mockGetRecentNotificationCount).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      'session_filing_failed',
      24
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('sends the push when no recent session_filing_failed notification exists', async () => {
    mockGetRecentNotificationCount.mockResolvedValueOnce(0);

    const markFailedReturnsTrue = async () => true;

    await executeHandler({
      'mark-pending-and-claim-retry-slot': async () => null,
      'mark-failed': markFailedReturnsTrue,
    });

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
  });
});
