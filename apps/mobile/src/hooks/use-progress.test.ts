import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { setActiveProfileId } from '../lib/api-client';
import { ForbiddenError, UpstreamError } from '../lib/api-errors';
import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import {
  useSubjectProgress,
  useOverallProgress,
  useContinueSuggestion,
  useLearningResumeTarget,
  useReviewSummary,
  useOverdueTopics,
  useTopicProgress,
} from './use-progress';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
  globalThis.fetch = originalFetch;
});

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
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.name).toBe('Mathematics');
    expect(result.current.data?.topicsTotal).toBe(10);
  });

  it('classifies forbidden API responses through the real client boundary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'SUBJECT_INACTIVE',
          message: 'This subject is archived',
        }),
        { status: 403 },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ForbiddenError);
    expect(result.current.error).toMatchObject({
      apiCode: 'SUBJECT_INACTIVE',
      message: 'This subject is archived',
    });
  });

  it('classifies server errors through the real client boundary', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Internal Server Error',
        }),
        { status: 500 },
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
        { status: 200 },
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
        { status: 200 },
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
      new Response(JSON.stringify({ suggestion: null }), { status: 200 }),
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
        { status: 200 },
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

    const url = String(mockFetch.mock.calls[0]?.[0]);
    expect(url).toContain('/progress/resume-target');
    expect(url).toContain('subjectId=550e8400-e29b-41d4-a716-446655440000');
    expect(result.current.data?.topicTitle).toBe('Photosynthesis');
  });
});

describe('useReviewSummary', () => {
  it('fetches review summary from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ totalOverdue: 6 }), { status: 200 }),
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
        { status: 200 },
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
        { status: 200 },
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
