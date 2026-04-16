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

jest.mock('../../services/session', () => ({
  closeStaleSessions: (...args: unknown[]) => mockCloseStaleSessions(...args),
}));

const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => {
      // Expose the handler for direct invocation in tests
      return { fn: handler, _config, _trigger };
    }),
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));

// Import AFTER mocks are set up
import { sessionStaleCleanup } from './session-stale-cleanup';

// ---------------------------------------------------------------------------
// Manual step executor — same pattern as session-completed.test.ts
// ---------------------------------------------------------------------------

async function executeHandler() {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
  };

  const handler = (sessionStaleCleanup as any).fn;
  const result = await handler({ step: mockStep });
  return { result, mockStep };
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
  }> = {}
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
    mockGetStepDatabase.mockReturnValue(mockDb);
  });

  it('is configured with the correct function ID and cron schedule', () => {
    const config = (sessionStaleCleanup as any)._config;
    const trigger = (sessionStaleCleanup as any)._trigger;

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
      expect.any(Date)
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

    await executeHandler();

    expect(mockInngestSend).toHaveBeenCalledTimes(2);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/session.completed',
        data: expect.objectContaining({
          profileId: 'profile-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          subjectId: 'subject-1',
          summaryStatus: 'auto_closed',
        }),
      })
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/session.completed',
        data: expect.objectContaining({
          profileId: 'profile-2',
          sessionId: 'session-2',
        }),
      })
    );
  });

  it('includes sessionType and verificationType in dispatched events', async () => {
    const session = createClosedSession({
      sessionType: 'homework',
      verificationType: 'teach_back',
    });
    mockCloseStaleSessions.mockResolvedValue([session]);

    await executeHandler();

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionType: 'homework',
          verificationType: 'teach_back',
        }),
      })
    );
  });

  it('includes interleavedTopicIds in dispatched events for interleaved sessions', async () => {
    const session = createClosedSession({
      sessionType: 'interleaved',
      topicId: null,
      interleavedTopicIds: ['topic-a', 'topic-b'],
    });
    mockCloseStaleSessions.mockResolvedValue([session]);

    await executeHandler();

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId: null,
          interleavedTopicIds: ['topic-a', 'topic-b'],
        }),
      })
    );
  });

  it('dispatches no events when no sessions are stale', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);

    const { result } = await executeHandler();

    expect(mockInngestSend).not.toHaveBeenCalled();
    expect(result.closedCount).toBe(0);
  });

  it('handles BD-05 race condition: sessions resumed before close (empty result)', async () => {
    // closeStaleSessions internally skips sessions that were resumed between
    // the read and write (BD-05 in session-crud.ts). Those sessions are NOT
    // included in the result array. The function should handle this gracefully.
    mockCloseStaleSessions.mockResolvedValue([]);

    const { result } = await executeHandler();

    // No events dispatched for resumed sessions
    expect(mockInngestSend).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(result.closedCount).toBe(0);
  });

  it('handles BD-05 partial race: some sessions resumed, some closed', async () => {
    // Of 3 stale sessions found, 1 was resumed (filtered by closeStaleSessions),
    // 2 were actually closed and returned.
    const closed1 = createClosedSession({ sessionId: 'session-1' });
    const closed2 = createClosedSession({ sessionId: 'session-3' });
    mockCloseStaleSessions.mockResolvedValue([closed1, closed2]);

    const { result } = await executeHandler();

    // Only 2 events dispatched — the resumed session is not in the result
    expect(mockInngestSend).toHaveBeenCalledTimes(2);
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
    expect(result.cutoff).toBeDefined();
    expect(result.timestamp).toBeDefined();
    // Timestamp should be between before and after
    expect(result.timestamp >= before).toBe(true);
    expect(result.timestamp <= after).toBe(true);
  });

  it('propagates closeStaleSessions errors to Inngest for retry', async () => {
    mockCloseStaleSessions.mockRejectedValue(new Error('Connection refused'));

    await expect(executeHandler()).rejects.toThrow('Connection refused');
  });

  it('handles concurrent closures on same profile', async () => {
    // Two sessions from the same profile can be stale simultaneously.
    // Both should get separate session.completed events.
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

    await executeHandler();

    expect(mockInngestSend).toHaveBeenCalledTimes(2);
    // Both events have the same profileId but different sessionIds
    const calls = mockInngestSend.mock.calls.map(
      (call) => (call[0] as { data: { sessionId: string } }).data.sessionId
    );
    expect(calls).toContain('session-1');
    expect(calls).toContain('session-2');
  });
});
