import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useRetentionTopics,
  useTopicRetention,
  useEvaluateEligibility,
  useSubmitRecallTest,
  useStartRelearn,
  useTeachingPreference,
} from './use-retention';
import { queryKeys } from '../lib/query-keys';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useRetentionTopics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches retention topics for a subject', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          topics: [
            {
              topicId: 'topic-1',
              easeFactor: 2.5,
              intervalDays: 7,
              repetitions: 3,
              nextReviewAt: '2026-02-22T10:00:00.000Z',
              xpStatus: 'pending',
              failureCount: 0,
            },
          ],
          reviewDueCount: 0,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useRetentionTopics('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topics).toHaveLength(1);
    expect(result.current.data?.reviewDueCount).toBe(0);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useRetentionTopics('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useTopicRetention', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches topic retention card', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          card: {
            topicId: 'topic-1',
            easeFactor: 2.5,
            intervalDays: 7,
            repetitions: 3,
            nextReviewAt: '2026-02-22T10:00:00.000Z',
            xpStatus: 'verified',
            failureCount: 0,
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useTopicRetention('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.xpStatus).toBe('verified');
  });

  it('returns null when no card exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ card: null }), { status: 200 }),
    );

    const { result } = renderHook(() => useTopicRetention('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

// FR128-129: Evaluate eligibility
describe('useEvaluateEligibility', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches evaluate eligibility for a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          eligible: true,
          topicId: 'topic-1',
          topicTitle: 'Algebra Basics',
          currentRung: 2,
          easeFactor: 2.7,
          repetitions: 5,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useEvaluateEligibility('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.eligible).toBe(true);
    expect(result.current.data?.currentRung).toBe(2);
  });

  it('returns ineligible when retention is too weak', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          eligible: false,
          topicId: 'topic-1',
          topicTitle: 'New Topic',
          currentRung: 1,
          easeFactor: 2.0,
          repetitions: 0,
          reason: 'No successful reviews yet',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useEvaluateEligibility('topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.eligible).toBe(false);
    expect(result.current.data?.reason).toBe('No successful reviews yet');
  });
});

describe('useSubmitRecallTest', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('submits a dont_remember recall attempt without an answer', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            passed: false,
            failureCount: 1,
            hint: 'Start from the main idea.',
            failureAction: 'feedback_only',
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubmitRecallTest(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        topicId: 'topic-1',
        attemptMode: 'dont_remember',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      passed: false,
      failureCount: 1,
      hint: 'Start from the main idea.',
      failureAction: 'feedback_only',
    });
  });
});

describe('useTeachingPreference', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches the preferred teaching method for a subject', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preference: {
            subjectId: 'sub-1',
            method: 'visual_diagrams',
            analogyDomain: null,
            nativeLanguage: null,
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useTeachingPreference('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.method).toBe('visual_diagrams');
  });
});

// ---------------------------------------------------------------------------
// PR-10 workflow tests
// ---------------------------------------------------------------------------

describe('useStartRelearn — no-op ["sessions"] removal (PR-10)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // [PR-10 guard] The old ['sessions'] invalidation in useStartRelearn was a
  // no-op (top segment 'sessions' matches no registered key; session keys use
  // 'session', 'session-transcript', etc.). Confirm it was removed.
  it('[PR-10] does not call no-op ["sessions"] invalidation after relearn', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: 'new-session-1',
          message: 'Relearn session started',
          recap: null,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useStartRelearn(), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({
        topicId: 'topic-1',
        method: 'same',
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['sessions'] });
    // Broad ['retention'] and ['progress'] still fire (PR-10 deferred)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['retention'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress'] });
  });
});

describe('evaluateEligibility key under "retention" prefix (PR-10)', () => {
  // [PR-10 guard] Verify that the evaluateEligibility key now lives under
  // ['retention', 'evaluate-eligibility', ...] so that broad ['retention']
  // invalidations (recall test, relearn) correctly mark it stale.
  it('broad ["retention"] invalidation covers evaluateEligibility keys', async () => {
    createWrapper();
    const profileId = 'test-profile-id';
    const topicId = 'topic-1';

    // Seed the evaluateEligibility cache entry
    queryClient.setQueryData(
      ['retention', 'evaluate-eligibility', topicId, profileId],
      { eligible: true, topicId, currentRung: 2 },
    );

    // Confirm it is currently fresh (not invalid)
    const stateBefore = queryClient.getQueryState([
      'retention',
      'evaluate-eligibility',
      topicId,
      profileId,
    ]);
    expect(stateBefore?.isInvalidated).toBeFalsy();

    // Broad ['retention'] prefix invalidation (what recall-test and relearn do)
    await queryClient.invalidateQueries({ queryKey: ['retention'] });

    const stateAfter = queryClient.getQueryState([
      'retention',
      'evaluate-eligibility',
      topicId,
      profileId,
    ]);
    expect(stateAfter?.isInvalidated).toBe(true);
  });

  it('evaluateEligibility key identity — now under "retention" prefix', () => {
    const { queryKeys: qk } = require('../lib/query-keys') as {
      queryKeys: typeof import('../lib/query-keys').queryKeys;
    };
    expect(qk.retention.evaluateEligibility('topic-1', 'profile-A')).toEqual([
      'retention',
      'evaluate-eligibility',
      'topic-1',
      'profile-A',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Profile-switch cache isolation
// ---------------------------------------------------------------------------

describe('profile-switch cache isolation', () => {
  it('retention.subject — same subject, different profiles produce different keys', () => {
    const keyA = queryKeys.retention.subject('sub-1', 'profile-A');
    const keyB = queryKeys.retention.subject('sub-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual(['retention', 'subject', 'sub-1', 'profile-A']);
  });

  it('retention.topic — same topic, different profiles are isolated', () => {
    const keyA = queryKeys.retention.topic('topic-1', 'profile-A');
    const keyB = queryKeys.retention.topic('topic-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
  });

  // PR 10: key now lives under 'retention' prefix — isolation property unchanged
  it('retention.evaluateEligibility — same topic, undefined vs defined profile', () => {
    const keyDefined = queryKeys.retention.evaluateEligibility(
      'topic-1',
      'profile-A',
    );
    const keyUndefined = queryKeys.retention.evaluateEligibility(
      'topic-1',
      undefined,
    );
    expect(keyDefined).not.toEqual(keyUndefined);
    // Confirm the new key shape lives under 'retention'
    expect(keyDefined).toEqual([
      'retention',
      'evaluate-eligibility',
      'topic-1',
      'profile-A',
    ]);
  });
});
