// ---------------------------------------------------------------------------
// Session Stale Cleanup — Tests
//
// Tests the actual Inngest function handler (not just the closeStaleSessions
// service). Uses the same manual step executor pattern as
// session-completed.test.ts because InngestTestEngine is incompatible with
// per-step try/catch error isolation.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

const mockCloseStaleSessions = jest.fn();
const mockAbandonStaleQuizRounds = jest.fn();

jest.mock(
  '../../services/session' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/session',
    ) as typeof import('../../services/session');
    return {
      ...actual,
      closeStaleSessions: (...args: unknown[]) =>
        mockCloseStaleSessions(...args),
    };
  },
);

jest.mock('../../services/quiz' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/quiz',
  ) as typeof import('../../services/quiz');
  return {
    ...actual,
    abandonStaleQuizRounds: (...args: unknown[]) =>
      mockAbandonStaleQuizRounds(...args),
  };
});

const mockGetStepDatabase = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

// Import AFTER mocks are set up
import { sessionStaleCleanup } from './session-stale-cleanup';

// ---------------------------------------------------------------------------
// Manual step executor — same pattern as session-completed.test.ts
// ---------------------------------------------------------------------------

async function executeHandler() {
  const { step, sendEventCalls } = createInngestStepRunner();

  const handler = (sessionStaleCleanup as any).fn;
  const result = await handler({ step });
  return { result, sendEventCalls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createClosedSession(
  overrides: Partial<{
    profileId: string;
    sessionId: string;
    topicId: string | null;
    subjectId: string;
    sessionType: string;
    verificationType: string | null;
    wallClockSeconds: number;
    summaryStatus: string;
    interleavedTopicIds: string[];
    escalationRungs: number[];
  }> = {},
) {
  return {
    profileId: overrides.profileId ?? 'profile-1',
    sessionId: overrides.sessionId ?? 'session-1',
    topicId: 'topicId' in overrides ? overrides.topicId : 'topic-1',
    subjectId: overrides.subjectId ?? 'subject-1',
    sessionType: overrides.sessionType ?? 'learning',
    verificationType: overrides.verificationType ?? null,
    wallClockSeconds: overrides.wallClockSeconds ?? 3600,
    summaryStatus: overrides.summaryStatus ?? 'auto_closed',
    interleavedTopicIds: overrides.interleavedTopicIds,
    escalationRungs: overrides.escalationRungs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session-stale-cleanup Inngest function', () => {
  const mockDb = {} as Database;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockAbandonStaleQuizRounds.mockResolvedValue(0);
  });

  it('is configured with the correct function ID and cron schedule', () => {
    const config = (sessionStaleCleanup as any).opts;
    const trigger = (sessionStaleCleanup as any).trigger;

    expect(config.id).toBe('session-stale-cleanup');
    expect(trigger.cron).toBe('*/10 * * * *');
  });

  it('passes a 30-minute cutoff to closeStaleSessions', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);

    const before = Date.now();
    await executeHandler();
    const after = Date.now();

    expect(mockCloseStaleSessions).toHaveBeenCalledWith(
      mockDb,
      expect.any(Date),
    );

    const cutoff = mockCloseStaleSessions.mock.calls[0][1] as Date;
    const cutoffMs = cutoff.getTime();
    const thirtyMinMs = 30 * 60 * 1000;

    // Cutoff should be approximately 30 minutes before now
    expect(cutoffMs).toBeGreaterThanOrEqual(before - thirtyMinMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - thirtyMinMs + 1000);
  });

  it('dispatches session.completed events for each closed session', async () => {
    const session1 = createClosedSession({
      sessionId: 'session-1',
      profileId: 'profile-1',
      topicId: 'topic-1',
      subjectId: 'subject-1',
    });
    const session2 = createClosedSession({
      sessionId: 'session-2',
      profileId: 'profile-2',
      topicId: 'topic-2',
      subjectId: 'subject-2',
    });
    mockCloseStaleSessions.mockResolvedValue([session1, session2]);

    const { sendEventCalls } = await executeHandler();

    // [BUG-696 / J-7] One memoized step.sendEvent call carrying the array of
    // per-session payloads — NOT N separate inngest.send calls.
    expect(sendEventCalls).toHaveLength(1);
    expect(sendEventCalls[0]!.name).toBe('dispatch-session-completed');
    expect(sendEventCalls[0]!.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            profileId: 'profile-1',
            sessionId: 'session-1',
            topicId: 'topic-1',
            subjectId: 'subject-1',
            summaryStatus: 'auto_closed',
          }),
        }),
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            profileId: 'profile-2',
            sessionId: 'session-2',
          }),
        }),
      ]),
    );
  });

  it('includes sessionType and verificationType in dispatched events', async () => {
    const session = createClosedSession({
      sessionType: 'homework',
      verificationType: 'teach_back',
    });
    mockCloseStaleSessions.mockResolvedValue([session]);

    const { sendEventCalls } = await executeHandler();

    expect(sendEventCalls[0]!.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            sessionType: 'homework',
            verificationType: 'teach_back',
          }),
        }),
      ]),
    );
  });

  it('includes interleavedTopicIds in dispatched events for interleaved sessions', async () => {
    const session = createClosedSession({
      sessionType: 'interleaved',
      topicId: null,
      interleavedTopicIds: ['topic-a', 'topic-b'],
    });
    mockCloseStaleSessions.mockResolvedValue([session]);

    const { sendEventCalls } = await executeHandler();

    expect(sendEventCalls[0]!.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: null,
            interleavedTopicIds: ['topic-a', 'topic-b'],
          }),
        }),
      ]),
    );
  });

  it('dispatches no events when no sessions are stale', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);

    const { result, sendEventCalls } = await executeHandler();

    expect(sendEventCalls).toHaveLength(0);
    expect(result.closedCount).toBe(0);
  });

  it('handles BD-05 race condition: sessions resumed before close (empty result)', async () => {
    // closeStaleSessions internally skips sessions that were resumed between
    // the read and write (BD-05 in session-crud.ts). Those sessions are NOT
    // included in the result array. The function should handle this gracefully.
    mockCloseStaleSessions.mockResolvedValue([]);

    const { result, sendEventCalls } = await executeHandler();

    // No events dispatched for resumed sessions
    expect(sendEventCalls).toHaveLength(0);
    expect(result.status).toBe('completed');
    expect(result.closedCount).toBe(0);
  });

  it('handles BD-05 partial race: some sessions resumed, some closed', async () => {
    // Of 3 stale sessions found, 1 was resumed (filtered by closeStaleSessions),
    // 2 were actually closed and returned.
    const closed1 = createClosedSession({ sessionId: 'session-1' });
    const closed2 = createClosedSession({ sessionId: 'session-3' });
    mockCloseStaleSessions.mockResolvedValue([closed1, closed2]);

    const { result, sendEventCalls } = await executeHandler();

    // One step.sendEvent call carrying both payloads in the array.
    expect(sendEventCalls).toHaveLength(1);
    const dispatched = sendEventCalls[0]!.payload as unknown[];
    expect(dispatched).toHaveLength(2);
    expect(result.closedCount).toBe(2);
  });

  it('returns status with closedCount and timestamp', async () => {
    const session = createClosedSession();
    mockCloseStaleSessions.mockResolvedValue([session]);

    const before = new Date().toISOString();
    const { result } = await executeHandler();
    const after = new Date().toISOString();

    expect(result.status).toBe('completed');
    expect(result.closedCount).toBe(1);
    expect(typeof result.cutoff).toBe('string');
    expect(typeof result.timestamp).toBe('string');
    // Timestamp should be between before and after
    expect(result.timestamp >= before).toBe(true);
    expect(result.timestamp <= after).toBe(true);
  });

  it('calls abandonStaleQuizRounds with a 2-hour cutoff', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);
    mockAbandonStaleQuizRounds.mockResolvedValue(3);

    const before = Date.now();
    const { result } = await executeHandler();
    const after = Date.now();

    expect(mockAbandonStaleQuizRounds).toHaveBeenCalledWith(
      mockDb,
      expect.any(Date),
    );

    const cutoff = mockAbandonStaleQuizRounds.mock.calls[0][1] as Date;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - twoHoursMs - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - twoHoursMs + 1000);
    expect(result.abandonedQuizRounds).toBe(3);
  });

  it('propagates closeStaleSessions errors to Inngest for retry', async () => {
    mockCloseStaleSessions.mockRejectedValue(new Error('Connection refused'));

    await expect(executeHandler()).rejects.toThrow('Connection refused');
  });

  it('[BUG-637 / J-1] dispatches reason:silence_timeout so session-completed skips streak credit for unattended closes', async () => {
    // The session-completed handler no longer infers SM-2 quality from close
    // reason, but stale cleanup still needs this reason so unattended closes
    // do not count toward streak activity.
    const session = createClosedSession();
    mockCloseStaleSessions.mockResolvedValue([session]);

    const { sendEventCalls } = await executeHandler();

    expect(sendEventCalls[0]!.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            reason: 'silence_timeout',
            summaryStatus: 'auto_closed',
          }),
        }),
      ]),
    );
  });

  it('handles concurrent closures on same profile', async () => {
    // Two sessions from the same profile can be stale simultaneously.
    // Both should appear in the same memoized step.sendEvent dispatch.
    const session1 = createClosedSession({
      profileId: 'profile-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
    });
    const session2 = createClosedSession({
      profileId: 'profile-1',
      sessionId: 'session-2',
      topicId: 'topic-2',
    });
    mockCloseStaleSessions.mockResolvedValue([session1, session2]);

    const { sendEventCalls } = await executeHandler();

    expect(sendEventCalls).toHaveLength(1);
    const dispatched = sendEventCalls[0]!.payload as Array<{
      data: { sessionId: string };
    }>;
    expect(dispatched).toHaveLength(2);
    const ids = dispatched.map((event) => event.data.sessionId);
    expect(ids).toContain('session-1');
    expect(ids).toContain('session-2');
  });

  // [BUG-696 / J-7] BREAK TEST — guards the regression that motivated J-7.
  // Bare inngest.send inside step.run was the duplicate-event source: if the
  // step throws midway, retry replays from the start and re-emits already-sent
  // events. The fix mandates step.sendEvent (memoized) for ALL outbound events
  // from this handler. If anyone reverts to inngest.send, this test fires.
  it('[BUG-696 / J-7] never calls bare inngest.send — uses memoized step.sendEvent only', async () => {
    const session = createClosedSession();
    mockCloseStaleSessions.mockResolvedValue([session]);

    const { sendEventCalls } = await executeHandler();

    expect(mockInngestTransport.sentEvents).toHaveLength(0);
    expect(sendEventCalls).toHaveLength(1);
  });
});
