import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { Curriculum } from '@eduagent/schemas';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useCurriculum,
  useSkipTopic,
  useUnskipTopic,
  useChallengeCurriculum,
  useAddCurriculumTopic,
  useExplainTopic,
} from './use-curriculum';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const CURRICULUM_ID = 'd0000000-0000-4000-8000-000000000001';
const SUBJECT_ID = 'd0000000-0000-4000-8000-000000000002';
const BOOK_ID = 'd0000000-0000-4000-8000-000000000003';
const TOPIC_1_ID = 'd0000000-0000-4000-8000-000000000004';
const TOPIC_2_ID = 'd0000000-0000-4000-8000-000000000005';

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

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

const mockCurriculum: Curriculum = {
  id: CURRICULUM_ID,
  subjectId: SUBJECT_ID,
  version: 1,
  topics: [
    {
      id: TOPIC_1_ID,
      title: 'Introduction',
      description: 'Getting started',
      sortOrder: 0,
      relevance: 'core',
      estimatedMinutes: 15,
      bookId: BOOK_ID,
      skipped: false,
    },
    {
      id: TOPIC_2_ID,
      title: 'Advanced Concepts',
      description: 'Deep dive',
      sortOrder: 1,
      relevance: 'recommended',
      estimatedMinutes: 30,
      bookId: BOOK_ID,
      skipped: false,
    },
  ],
  generatedAt: '2026-01-01T00:00:00Z',
};

describe('useCurriculum', () => {
  it('returns curriculum from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: mockCurriculum }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockCurriculum);
  });

  it('returns null when no curriculum exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: null }), { status: 200 }),
    );

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when subjectId is empty', async () => {
    const { result } = renderHook(() => useCurriculum(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSkipTopic', () => {
  // [BREAK] [BUG-161] All 5 curriculum mutations (skip/unskip/challenge/
  // add-topic/adapt) invalidate the curriculum cache. Before the fix, the
  // invalidation key was ['curriculum', subjectId] — missing profileId.
  // A useSkipTopic mutation on the active profile would invalidate ANY
  // cached curriculum for the same subjectId across profiles (e.g. a
  // parent's cache for the same shared subjectId), causing unnecessary
  // refetches and silently bridging cache lifecycles across identities.
  it('[BREAK] invalidates curriculum scoped to the active profile id', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'Topic skipped', topicId: TOPIC_1_ID }),
        {
          status: 200,
        },
      ),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSkipTopic('subject-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['curriculum', 'subject-1', 'test-profile-id'],
      }),
    );
  });

  it('calls POST to skip a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'Topic skipped', topicId: TOPIC_1_ID }),
        {
          status: 200,
        },
      ),
    );

    const { result } = renderHook(() => useSkipTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useUnskipTopic', () => {
  it('calls POST to unskip (restore) a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'Topic restored', topicId: TOPIC_1_ID }),
        {
          status: 200,
        },
      ),
    );

    const { result } = renderHook(() => useUnskipTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useChallengeCurriculum', () => {
  it('calls POST to challenge curriculum with feedback', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ curriculum: mockCurriculum }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useChallengeCurriculum('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I already know the basics');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useAddCurriculumTopic', () => {
  it('previews a normalized topic draft', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mode: 'preview',
          preview: {
            title: 'Trigonometry Basics',
            description: 'Angles and triangle relationships',
            estimatedMinutes: 35,
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useAddCurriculumTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mode: 'preview', title: 'trig' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      mode: 'preview',
      preview: {
        title: 'Trigonometry Basics',
        description: 'Angles and triangle relationships',
        estimatedMinutes: 35,
      },
    });
  });
});

describe('useExplainTopic', () => {
  it('calls GET to explain a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ explanation: 'This topic covers...' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useExplainTopic('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toBe('This topic covers...');
  });
});
