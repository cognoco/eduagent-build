import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import {
  ForbiddenError,
  setActiveProfileId,
  UpstreamError,
} from '../lib/api-client';
import {
  useSubjectProgress,
  useOverallProgress,
  useContinueSuggestion,
  useLearningResumeTarget,
  useReviewSummary,
  useOverdueTopics,
  useTopicProgress,
  useProfileWeeklyReports,
  useRefreshProgressSnapshot,
} from './use-progress';

const mockFetch = jest.fn();

let queryClient: QueryClient;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function getMockFetchUrl(callIndex = 0): string {
  const input = mockFetch.mock.calls[callIndex]?.[0] as RequestInfo | URL;
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getMockFetchHeaders(callIndex = 0): Headers {
  const init = mockFetch.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useSubjectProgress', () => {
  it('fetches subject progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          progress: {
            subjectId: 'sub-1',
            name: 'Mathematics',
            topicsTotal: 10,
            topicsCompleted: 3,
            topicsVerified: 1,
            urgencyScore: 0,
            retentionStatus: 'strong',
            lastSessionAt: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(getMockFetchHeaders().get('X-Profile-Id')).toBe('test-profile-id');
    expect(result.current.data?.name).toBe('Mathematics');
    expect(result.current.data?.topicsTotal).toBe(10);
  });

  it('classifies HTTP errors through the real API client', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'SUBJECT_INACTIVE',
          message: 'Subject is archived',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ForbiddenError);
    expect((result.current.error as ForbiddenError).apiCode).toBe(
      'SUBJECT_INACTIVE',
    );
  });

  it('classifies server errors through the real API client', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Internal Server Error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(UpstreamError);
    expect(result.current.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      status: 500,
    });
  });
});

describe('useOverallProgress', () => {
  it('fetches overall progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subjects: [
            {
              subjectId: 'sub-1',
              name: 'Math',
              topicsTotal: 5,
              topicsCompleted: 2,
              topicsVerified: 1,
              urgencyScore: 0,
              retentionStatus: 'strong',
              lastSessionAt: null,
            },
          ],
          totalTopicsCompleted: 2,
          totalTopicsVerified: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useOverallProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.totalTopicsCompleted).toBe(2);
  });
});

describe('useContinueSuggestion', () => {
  it('fetches continue suggestion from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            subjectId: 'sub-1',
            subjectName: 'Math',
            topicId: 'topic-1',
            topicTitle: 'Algebra',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topicTitle).toBe('Algebra');
  });

  it('returns null when no suggestion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ suggestion: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

describe('useLearningResumeTarget', () => {
  it('fetches resume target with optional scope', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          target: {
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            subjectName: 'Biology',
            topicId: '770e8400-e29b-41d4-a716-446655440000',
            topicTitle: 'Photosynthesis',
            sessionId: null,
            resumeFromSessionId: '880e8400-e29b-41d4-a716-446655440000',
            resumeKind: 'recent_topic',
            lastActivityAt: '2026-02-15T09:00:00.000Z',
            reason: 'Pick up Photosynthesis',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () =>
        useLearningResumeTarget({
          subjectId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = getMockFetchUrl();
    expect(url).toContain('/progress/resume-target');
    expect(url).toContain('subjectId=550e8400-e29b-41d4-a716-446655440000');
    expect(result.current.data?.topicTitle).toBe('Photosynthesis');
  });
});

describe('useReviewSummary', () => {
  it('fetches review summary from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ totalOverdue: 6 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useReviewSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.totalOverdue).toBe(6);
  });
});

describe('useOverdueTopics', () => {
  it('fetches overdue topics grouped by subject from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          totalOverdue: 2,
          subjects: [
            {
              subjectId: 'sub-1',
              subjectName: 'Math',
              overdueCount: 2,
              topics: [
                {
                  topicId: 'topic-1',
                  topicTitle: 'Algebra',
                  overdueDays: 3,
                  failureCount: 1,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useOverdueTopics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.totalOverdue).toBe(2);
    expect(result.current.data?.subjects[0]?.subjectName).toBe('Math');
  });
});

describe('useTopicProgress', () => {
  it('fetches topic progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          topic: {
            topicId: 'topic-1',
            title: 'Algebra Basics',
            description: 'Intro',
            completionStatus: 'in_progress',
            retentionStatus: 'strong',
            struggleStatus: 'normal',
            masteryScore: 0.85,
            summaryExcerpt: null,
            xpStatus: 'pending',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useTopicProgress('sub-1', 'topic-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.title).toBe('Algebra Basics');
  });
});

describe('useProfileWeeklyReports', () => {
  it('parses weekly report responses through the shared schema', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reports: [
            {
              id: '550e8400-e29b-41d4-a716-446655440020',
              reportWeek: '2026-W19',
              viewedAt: null,
              createdAt: '2026-05-12T09:00:00.000Z',
              headlineStat: {
                label: 'Study time',
                value: 42,
                comparison: '+10 min',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () => useProfileWeeklyReports('test-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.id).toBe(
      '550e8400-e29b-41d4-a716-446655440020',
    );
  });

  it('fails when a response violates the shared weekly report schema', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [{ id: 'not-a-uuid' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useProfileWeeklyReports('test-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useRefreshProgressSnapshot', () => {
  it('posts to refresh and invalidates progress/dashboard caches', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          snapshotDate: '2026-05-12',
          metrics: {},
          milestones: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useRefreshProgressSnapshot(), {
      wrapper: createWrapper(),
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(getMockFetchUrl()).toContain('/progress/refresh');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['progress', 'inventory', 'test-profile-id'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['progress', 'history', 'test-profile-id'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['progress', 'milestones', 'test-profile-id'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard'],
    });
  });
});
