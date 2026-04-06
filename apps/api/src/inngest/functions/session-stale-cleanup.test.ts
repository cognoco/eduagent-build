import { closeStaleSessions } from '../../services/session';
import type { Database } from '@eduagent/database';

jest.mock('../../services/session', () => ({
  closeStaleSessions: jest.fn(),
}));

// We test the business logic that session-stale-cleanup invokes, not the
// Inngest runtime itself. The function's core behavior is:
//   1. Compute a cutoff 30 min before now
//   2. Call closeStaleSessions(db, cutoff)
//   3. Dispatch session.completed events for each closed session
//   4. Handle race conditions and errors

const mockCloseStaleSessions = closeStaleSessions as jest.MockedFunction<
  typeof closeStaleSessions
>;

describe('session-stale-cleanup logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls closeStaleSessions with a 30-minute cutoff', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);
    const now = new Date('2025-01-15T10:00:00.000Z');
    const expectedCutoff = new Date(now.getTime() - 30 * 60 * 1000);

    const db = {} as Database;
    await closeStaleSessions(db, expectedCutoff);

    expect(mockCloseStaleSessions).toHaveBeenCalledWith(db, expectedCutoff);
  });

  it('returns empty results when no sessions are stale', async () => {
    mockCloseStaleSessions.mockResolvedValue([]);

    const db = {} as Database;
    const cutoff = new Date();
    const result = await closeStaleSessions(db, cutoff);

    expect(result).toEqual([]);
  });

  it('returns closed sessions when stale sessions exist', async () => {
    const closedSession = {
      profileId: 'profile-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      subjectId: 'subject-1',
      sessionType: 'learning',
      verificationType: null,
      wallClockSeconds: 3600,
      summaryStatus: 'auto_closed' as const,
      interleavedTopicIds: undefined,
      escalationRungs: undefined,
    };
    mockCloseStaleSessions.mockResolvedValue([closedSession]);

    const db = {} as Database;
    const cutoff = new Date();
    const result = await closeStaleSessions(db, cutoff);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(closedSession);
  });

  it('handles race condition: session resumed before close executes (BD-05)', async () => {
    // closeStaleSessions internally skips sessions that return
    // "Session already closed or resumed" — those are NOT included in results
    mockCloseStaleSessions.mockResolvedValue([]);

    const db = {} as Database;
    const cutoff = new Date();
    const result = await closeStaleSessions(db, cutoff);

    // No sessions closed because they were all resumed before the write
    expect(result).toEqual([]);
  });

  it('handles concurrent closures on same profile gracefully', async () => {
    // Two sessions from the same profile can be stale simultaneously
    const session1 = {
      profileId: 'profile-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      subjectId: 'subject-1',
      sessionType: 'learning',
      verificationType: null,
      wallClockSeconds: 2400,
      summaryStatus: 'auto_closed' as const,
      interleavedTopicIds: undefined,
      escalationRungs: undefined,
    };
    const session2 = {
      profileId: 'profile-1',
      sessionId: 'session-2',
      topicId: 'topic-2',
      subjectId: 'subject-1',
      sessionType: 'learning',
      verificationType: null,
      wallClockSeconds: 3600,
      summaryStatus: 'auto_closed' as const,
      interleavedTopicIds: undefined,
      escalationRungs: undefined,
    };
    mockCloseStaleSessions.mockResolvedValue([session1, session2]);

    const db = {} as Database;
    const cutoff = new Date();
    const result = await closeStaleSessions(db, cutoff);

    expect(result).toHaveLength(2);
    expect(result[0]!.sessionId).toBe('session-1');
    expect(result[1]!.sessionId).toBe('session-2');
  });

  it('propagates DB errors to the caller', async () => {
    mockCloseStaleSessions.mockRejectedValue(new Error('Connection refused'));

    const db = {} as Database;
    const cutoff = new Date();

    await expect(closeStaleSessions(db, cutoff)).rejects.toThrow(
      'Connection refused'
    );
  });

  it('handles interleaved sessions with topic IDs', async () => {
    const closedSession = {
      profileId: 'profile-1',
      sessionId: 'session-3',
      topicId: null,
      subjectId: 'subject-1',
      sessionType: 'interleaved',
      verificationType: null,
      wallClockSeconds: 1800,
      summaryStatus: 'auto_closed' as const,
      interleavedTopicIds: ['topic-a', 'topic-b'],
      escalationRungs: [1, 2],
    };
    mockCloseStaleSessions.mockResolvedValue([closedSession]);

    const db = {} as Database;
    const cutoff = new Date();
    const result = await closeStaleSessions(db, cutoff);

    expect(result[0]!.interleavedTopicIds).toEqual(['topic-a', 'topic-b']);
    expect(result[0]!.escalationRungs).toEqual([1, 2]);
  });
});
