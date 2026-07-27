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

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

const mockFormatFilingFailedPush = jest.fn().mockReturnValue({
  title: 'Filing failed',
  body: 'We could not save your session.',
});
const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../../services/notifications', () => {
  const actual = jest.requireActual(
    '../../services/notifications',
  ) as typeof import('../../services/notifications');
  return {
    ...actual,
    formatFilingFailedPush: () => mockFormatFilingFailedPush(),
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
  };
});

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
jest.mock('../../services/settings', () => {
  const actual = jest.requireActual(
    '../../services/settings',
  ) as typeof import('../../services/settings');
  return {
    ...actual,
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
  };
});

jest.mock('../../services/logger', () => {
  const actual = jest.requireActual(
    '../../services/logger',
  ) as typeof import('../../services/logger');
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };
});

// Import AFTER mocks are set up
import { filingTimedOutObserve } from './filing-timed-out-observe';
import { filingResolvedEventSchema } from '@eduagent/schemas';
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROFILE_ID = TEST_PROFILE_ID;
const SESSION_ID = TEST_SESSION_ID;

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
  },
  // Controls what db.update().returning() resolves to for the mark-failed step.
  // Defaults to [] (0 rows) — CAS guard fires, recovered_after_window path.
  // Pass [{ id: SESSION_ID }] to exercise the 1-row / unrecoverable path.
  markFailedRows: unknown[] = [],
  // Controls what findFirst returns when the re-read-recovered-after-window
  // step re-reads the row to verify filing_recovered status. Defaults to a
  // filing_recovered row so existing CAS no-op tests keep passing.
  recheckRow: Partial<Record<string, unknown>> | null = {
    filingStatus: 'filing_recovered',
  },
) {
  // Convert stepRunOverrides (callback-per-name) into runResults for the step runner.
  // createInngestStepRunner accepts function values in runResults and calls them.
  const runResults: Record<string, () => Promise<unknown>> = {};
  for (const [name, fn] of Object.entries(stepRunOverrides)) {
    runResults[name] = fn;
  }

  const runner = createInngestStepRunner({
    runResults,
    waitForEventResult,
  });

  // Default db: query returns the snapshot session, update chains resolve [].
  // mark-failed is the only step that runs db.update() when mark-pending-and-
  // claim-retry-slot is overridden, so markFailedRows drives its CAS outcome.
  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(markFailedRows),
  };

  // select chain: the source code destructures the awaited result of
  // db.select(...).from(...).where(...) as an array, so where() must be
  // a thenable that resolves to [].
  const mockSelectWhere = jest.fn().mockResolvedValue([]);
  const mockSelectFrom = jest.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockSelectFrom });

  // findFirst is called multiple times across steps:
  //   call 1: capture-diagnostic-snapshot  → snapshotSession
  //   call 2: re-read-session              → snapshotSession
  //   call 3: re-read-recovered-after-window re-read → recheckRow
  // Use mockResolvedValueOnce for the first two, then fall through to the
  // persistent mockResolvedValue (recheckRow) for all subsequent calls.
  const findFirstMock = jest
    .fn()
    .mockResolvedValueOnce(snapshotSession)
    .mockResolvedValueOnce(snapshotSession)
    .mockResolvedValue(recheckRow);

  const mockDb = {
    query: {
      learningSessions: {
        findFirst: findFirstMock,
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
  const result = await handler({ event: makeEvent(), step: runner.step });
  return { result, runner, mockDb, mockUpdateChain };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filing-timed-out-observe [CR-FIL-RACE-01]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
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
    // mark-pending-and-claim-retry-slot returns attempt 1 so retry is dispatched.
    const claimRetrySlotReturns1 = async () => 1;

    // markFailedRows defaults to [] (0 rows) — real mark-failed step body runs
    // and sees the DB returning 0 rows, simulating the race where
    // filing-completed-observe already set the status to filing_recovered.
    const { result, runner } = await executeHandler(
      {
        // Only override the slot-claim; mark-failed runs its real step body.
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
      },
      // waitForEvent returns null → 60 s window expired
      null,
    );

    // Primary assertion: function exits via the recovered_after_window path.
    expect(result.resolution).toBe('recovered_after_window');

    // The emit-resolved (unrecoverable) sendEvent must NOT be called.
    const emitResolvedCalls = runner.sendEventCalls.filter(
      (c) => c.name === 'emit-resolved',
    );
    // Only dispatch-filing-retry and emit-auto-retry-attempted are expected.
    // emit-resolved for the unrecoverable path must NOT be among them.
    const unrecoverableEmit = emitResolvedCalls.find(
      (c) =>
        (c.payload as { data?: { resolution?: string } })?.data?.resolution ===
        'unrecoverable',
    );
    expect(unrecoverableEmit).toBeUndefined();

    // [CR-FIL-SILENT-01] emit-resolved-recovered-after-window MUST be called
    // with name 'app/session.filing_resolved' and resolution 'recovered_after_window'.
    const recoveredAfterWindowEmit = runner.sendEventCalls.find(
      (c) => c.name === 'emit-resolved-recovered-after-window',
    );
    expect(recoveredAfterWindowEmit).not.toBeUndefined();
    expect(recoveredAfterWindowEmit!.payload).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({
        resolution: 'recovered_after_window',
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
      }),
    });

    // send-failure-push step must NOT be invoked.
    const sendFailurePushCalls = runner.runCalls.filter(
      (c) => c.name === 'send-failure-push',
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
    const claimRetrySlotReturns1 = async () => 1;

    // markFailedRows = [{ id: SESSION_ID }] (1 row) — real mark-failed step body
    // runs and sees the DB returning 1 row, meaning the CAS guard matched and
    // the status was successfully flipped to filing_failed.
    const { result, runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
      },
      // waitForEvent returns null → window expired, retry did not complete in time
      null,
      undefined,
      [{ id: SESSION_ID }],
    );

    expect(result.resolution).toBe('unrecoverable');

    // emit-resolved (unrecoverable) MUST be called.
    const unrecoverableEmit = runner.sendEventCalls.find(
      (c) =>
        (c.payload as { data?: { resolution?: string } })?.data?.resolution ===
        'unrecoverable',
    );
    expect(unrecoverableEmit).not.toBeUndefined();

    // send-failure-push step MUST be invoked.
    const sendFailurePushCalls = runner.runCalls.filter(
      (c) => c.name === 'send-failure-push',
    );
    expect(sendFailurePushCalls).toHaveLength(1);

    // captureException MUST be called.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { surface: 'filing', signal: 'unrecoverable' },
      }),
    );
  });

  // -------------------------------------------------------------------------
  // No retry slot: attemptNumber is null (retry count exhausted).
  // mark-failed should also be guarded — CAS no-op path.
  // [CR-FIL-SILENT-01] The recovered_after_window event MUST still be emitted.
  // -------------------------------------------------------------------------
  it('[CR-FIL-RACE-01] CAS guard works even without a retry attempt (retry slot exhausted)', async () => {
    // No retry slot — attemptNumber is null.
    const claimRetrySlotExhausted = async () => null;

    // markFailedRows defaults to [] (0 rows) — real mark-failed step body runs
    // and sees the DB returning 0 rows (status already advanced to filing_recovered).
    const { result, runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotExhausted,
      },
      null,
    );

    expect(result.resolution).toBe('recovered_after_window');
    expect(mockCaptureException).not.toHaveBeenCalled();

    const sendFailurePushCalls = runner.runCalls.filter(
      (c) => c.name === 'send-failure-push',
    );
    expect(sendFailurePushCalls).toHaveLength(0);

    // [CR-FIL-SILENT-01] structured event must be emitted even when no retry
    // slot was claimed — ops must be able to query this path.
    const recoveredAfterWindowEmit = runner.sendEventCalls.find(
      (c) => c.name === 'emit-resolved-recovered-after-window',
    );
    expect(recoveredAfterWindowEmit).not.toBeUndefined();
    expect(recoveredAfterWindowEmit!.payload).toMatchObject({
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

    const { result, runner } = await executeHandler(
      {},
      null,
      sessionWithFiledAt,
    );

    expect(result.resolution).toBe('late_completion');

    const markFailedCalls = runner.runCalls.filter(
      (c) => c.name === 'mark-failed',
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

    const { result, runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': claimRetrySlotReturns1,
      },
      retryCompletedEvent, // waitForEvent returns this → retry succeeded
    );

    expect(result.resolution).toBe('retry_succeeded');

    const markFailedCalls = runner.runCalls.filter(
      (c) => c.name === 'mark-failed',
    );
    expect(markFailedCalls).toHaveLength(0);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('dispatches app/session.auto_file_requested instead of legacy app/filing.retry for freeform auto-file sessions', async () => {
    const { runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': async () => 1,
      },
      null,
      {
        filedAt: null,
        filingStatus: 'filing_pending',
        filingRetryCount: 0,
        topicId: null,
        exchangeCount: 3,
        metadata: { effectiveMode: 'freeform' },
        updatedAt: new Date(),
      },
    );

    const retryDispatch = runner.sendEventCalls.find(
      (c) => c.name === 'dispatch-filing-retry',
    );
    expect(retryDispatch?.payload).toMatchObject({
      name: 'app/session.auto_file_requested',
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        profileId: PROFILE_ID,
        reason: 'retry',
        dispatchId: expect.stringMatching(/^observer-retry-/),
      }),
    });
    expect(
      runner.sendEventCalls.some(
        (c) => (c.payload as { name?: string }).name === 'app/filing.retry',
      ),
    ).toBe(false);
  });

  it('reuses the same auto-file event id for the same session and retry attempt', async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now++);
    const freeformSession = {
      filedAt: null,
      filingStatus: 'filing_pending',
      filingRetryCount: 1,
      topicId: null,
      exchangeCount: 3,
      metadata: { effectiveMode: 'freeform' },
      updatedAt: new Date(),
    };

    try {
      const first = await executeHandler(
        {
          'mark-pending-and-claim-retry-slot': async () => 2,
        },
        null,
        freeformSession,
      );
      const second = await executeHandler(
        {
          'mark-pending-and-claim-retry-slot': async () => 2,
        },
        null,
        freeformSession,
      );

      const firstDispatch = first.runner.sendEventCalls.find(
        (call) => call.name === 'dispatch-filing-retry',
      );
      const secondDispatch = second.runner.sendEventCalls.find(
        (call) => call.name === 'dispatch-filing-retry',
      );

      expect(firstDispatch?.payload).toMatchObject({
        id: `auto-file-${SESSION_ID}-observer-retry-${SESSION_ID}-2`,
      });
      expect((secondDispatch?.payload as { id?: string } | undefined)?.id).toBe(
        (firstDispatch?.payload as { id?: string } | undefined)?.id,
      );
    } finally {
      nowSpy.mockRestore();
    }
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
    mockInngestTransport.clear();
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
      24,
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

// ---------------------------------------------------------------------------
// [H-2 / INNGEST-NESTED-STEP] Break tests for the recovered_after_window path
//
// The recovered_after_window branch was refactored to fix an illegal nested
// step-tool call: the previous revision invoked `step.sendEvent` INSIDE the
// `step.run('emit-resolved-recovered-after-window', ...)` callback, which
// throws on the real Inngest executor (step tools must run at the function
// body's top level). The re-read now happens in a data-only
// `step.run('re-read-recovered-after-window', ...)` that returns
// `{ shouldEmit }`, and the dispatch is hoisted to the top level.
//
// 1. NESTING GUARD: the re-read step body must NOT itself call step.sendEvent;
//    the emit fires only at the function-body top level.
// 2. Zod parse failure at the hoisted emit → captureException called, function
//    does NOT throw (resolves normally to recovered_after_window).
// 3. CAS recheck: row in non-recovered terminal state → no event emitted.
// 4. sendPushNotification throw → captureException called, function continues.
// ---------------------------------------------------------------------------

describe('[H-2] filing-timed-out-observe — recovered_after_window safety guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
  });

  // -------------------------------------------------------------------------
  // Break test 1a (NESTING REGRESSION GUARD): the re-read step must not nest a
  // step.sendEvent inside its step.run callback. We model the real executor
  // constraint by making step.sendEvent throw if it is ever invoked from
  // within a step.run callback — exactly what Inngest does at runtime. On the
  // fixed code the emit is hoisted to the top level so no nesting occurs and
  // the function resolves normally; on the buggy (nested) code this throws.
  // -------------------------------------------------------------------------
  it('[INNGEST-NESTED-STEP] does not invoke step.sendEvent from inside a step.run callback', async () => {
    const runner = createInngestStepRunner({
      runResults: {
        'mark-pending-and-claim-retry-slot': async () => null,
      },
    });

    // Wrap the runner's step to detect nesting: set a flag for the duration of
    // any step.run callback; if step.sendEvent fires while the flag is set the
    // call is illegal (mirrors Inngest's "no step tools inside step.run").
    let insideRun = false;
    const guardedStep = {
      run: async (name: string, cb: () => Promise<unknown>) => {
        const prev = insideRun;
        insideRun = true;
        try {
          return await runner.step.run(name, cb);
        } finally {
          insideRun = prev;
        }
      },
      sendEvent: async (name: string, payload: unknown) => {
        if (insideRun) {
          throw new Error(
            `Illegal nested step.sendEvent("${name}") inside a step.run callback`,
          );
        }
        return runner.step.sendEvent(name, payload);
      },
      sleep: runner.step.sleep,
      waitForEvent: runner.step.waitForEvent,
    };

    // Default db: findFirst returns filing_recovered on the re-read so the
    // recovered_after_window emit path is exercised.
    const mockUpdateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]), // CAS no-op
    };
    const findFirstMock = jest
      .fn()
      .mockResolvedValueOnce({
        filedAt: null,
        filingStatus: 'filing_pending',
        filingRetryCount: 0,
        topicId: 'topic-001',
        exchangeCount: 3,
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        filedAt: null,
        filingStatus: 'filing_pending',
        filingRetryCount: 0,
        topicId: 'topic-001',
        exchangeCount: 3,
        updatedAt: new Date(),
      })
      .mockResolvedValue({ filingStatus: 'filing_recovered' });
    const mockSelectWhere = jest.fn().mockResolvedValue([]);
    const mockDb = {
      query: {
        learningSessions: { findFirst: findFirstMock },
        sessionEvents: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      update: jest.fn().mockReturnValue(mockUpdateChain),
      select: jest
        .fn()
        .mockReturnValue({ from: () => ({ where: mockSelectWhere }) }),
    };
    mockGetStepDatabase.mockReturnValue(mockDb);

    const handler = (filingTimedOutObserve as any).fn;
    const result = await handler({ event: makeEvent(), step: guardedStep });

    // No nesting error thrown → the function resolves normally.
    expect(result.resolution).toBe('recovered_after_window');

    // The emit fired exactly once, at the top level (not nested).
    const recoveredEmit = runner.sendEventCalls.filter(
      (c) => c.name === 'emit-resolved-recovered-after-window',
    );
    expect(recoveredEmit).toHaveLength(1);
    expect(recoveredEmit[0]!.payload).toMatchObject({
      name: 'app/session.filing_resolved',
      data: expect.objectContaining({ resolution: 'recovered_after_window' }),
    });
  });

  // -------------------------------------------------------------------------
  // Break test 1b: Zod parse failure at the hoisted emit is captured to Sentry
  // and the function does NOT throw (resolves to recovered_after_window).
  //
  // The parse now runs at the function-body top level, after the data-only
  // re-read step returns { shouldEmit: true }. We force the throw by spying on
  // filingResolvedEventSchema.parse for the recovered_after_window payload.
  // -------------------------------------------------------------------------
  it('[H-2] Zod parse failure at the hoisted recovered_after_window emit is captured, not re-thrown', async () => {
    const zodError = new Error('ZodError: invalid_string at sessionId');
    const parseSpy = jest
      .spyOn(filingResolvedEventSchema, 'parse')
      .mockImplementation((input: unknown) => {
        if (
          (input as { resolution?: string })?.resolution ===
          'recovered_after_window'
        ) {
          throw zodError;
        }
        return input as never;
      });

    try {
      const { result, runner } = await executeHandler(
        {
          'mark-pending-and-claim-retry-slot': async () => null,
        },
        null,
        undefined,
        [], // markFailedRows = [] → CAS no-op → recovered_after_window branch
        { filingStatus: 'filing_recovered' }, // re-read confirms recovered
      );

      // Function resolves normally — the parse throw is contained.
      expect(result.resolution).toBe('recovered_after_window');
      expect(mockCaptureException).toHaveBeenCalledWith(
        zodError,
        expect.objectContaining({ profileId: PROFILE_ID }),
      );
      // No emit-resolved-recovered-after-window event should have been sent.
      const recoveredEmit = runner.sendEventCalls.find(
        (c) => c.name === 'emit-resolved-recovered-after-window',
      );
      expect(recoveredEmit).toBeUndefined();
    } finally {
      parseSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // Break test 2: CAS recheck returns a non-recovered terminal state (e.g.
  // row deleted, or in 'filing_failed'). No event must be emitted, warn logged.
  //
  // Red→green: without the recheck guard the step would always emit
  // 'recovered_after_window' regardless of current DB state.
  // -------------------------------------------------------------------------
  it('[H-2] CAS recheck: row not in filing_recovered → no event emitted', async () => {
    // recheckRow is null (row deleted)
    const { result, runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': async () => null,
      },
      null,
      undefined,
      [], // markFailedRows = [] → CAS no-op
      null, // recheckRow = null (row missing after CAS no-op)
    );

    expect(result.resolution).toBe('recovered_after_window');

    // No 'emit-resolved-recovered-after-window' sendEvent should have fired.
    const recoveredEmit = runner.sendEventCalls.find(
      (c) => c.name === 'emit-resolved-recovered-after-window',
    );
    expect(recoveredEmit).toBeUndefined();
  });

  it('[H-2] CAS recheck: row in filing_failed (not recovered) → no event emitted', async () => {
    const { result, runner } = await executeHandler(
      {
        'mark-pending-and-claim-retry-slot': async () => null,
      },
      null,
      undefined,
      [], // markFailedRows = [] → CAS no-op
      { filingStatus: 'filing_failed' }, // recheckRow has wrong status
    );

    expect(result.resolution).toBe('recovered_after_window');

    const recoveredEmit = runner.sendEventCalls.find(
      (c) => c.name === 'emit-resolved-recovered-after-window',
    );
    expect(recoveredEmit).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Break test 3: sendPushNotification throws → captureException called,
  // function resolves to 'unrecoverable' (not a function-level retry).
  //
  // Red→green: without the try/catch in send-failure-push the throw from
  // sendPushNotification would propagate out of step.run, causing Inngest to
  // retry the step (and eventually the whole function). With the fix the step
  // swallows the error and the function completes normally.
  // -------------------------------------------------------------------------
  it('[line-278] sendPushNotification throw is captured, function resolves to unrecoverable', async () => {
    const pushError = new Error('FCM: service unavailable');
    mockSendPushNotification.mockRejectedValueOnce(pushError);
    mockGetRecentNotificationCount.mockResolvedValue(0);

    const markFailedReturnsTrue = async () => true;

    const { result } = await executeHandler({
      'mark-pending-and-claim-retry-slot': async () => null,
      'mark-failed': markFailedReturnsTrue,
    });

    // Function must complete normally (not throw).
    expect(result.resolution).toBe('unrecoverable');

    // captureException must have been called at least once for the push error.
    const pushCapture = mockCaptureException.mock.calls.find(
      ([err]: [Error]) => err === pushError,
    );
    expect(pushCapture).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [Bug #424] Idempotency + concurrency config break tests
//
// Verifies that filingTimedOutObserve is configured with idempotency and
// concurrency keys so duplicate events for the same sessionId are deduped
// by the Inngest runtime rather than running two parallel executions that
// both increment filingRetryCount.
//
// Red→green: before the fix, createFunction was called with only { id, name }.
// After the fix it carries idempotency and concurrency keyed on sessionId.
// ---------------------------------------------------------------------------
describe('[Bug #424] filing-timed-out-observe idempotency + concurrency config', () => {
  it('has idempotency key set to event.data.sessionId', () => {
    const config = (filingTimedOutObserve as any).opts;
    expect(config.idempotency).toBe('event.data.sessionId');
  });

  it('has concurrency key set to event.data.sessionId with limit 1', () => {
    const config = (filingTimedOutObserve as any).opts;
    expect(config.concurrency).toEqual(
      expect.objectContaining({
        key: 'event.data.sessionId',
        limit: 1,
      }),
    );
  });
});
