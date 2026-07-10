import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useVocabulary,
  useCreateVocabulary,
  useReviewVocabulary,
  useDeleteVocabulary,
} from './use-vocabulary';
import { queryKeys } from '../lib/query-keys';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const VOCAB_1_ID = '770e8400-e29b-41d4-a716-446655440001';
const VOCAB_2_ID = '770e8400-e29b-41d4-a716-446655440002';

function makeVocabulary(overrides: Record<string, unknown> = {}) {
  return {
    id: VOCAB_1_ID,
    profileId: PROFILE_ID,
    subjectId: SUBJECT_ID,
    term: 'hola',
    termNormalized: 'hola',
    translation: 'hello',
    type: 'word',
    cefrLevel: 'A1',
    milestoneId: null,
    mastered: false,
    createdAt: '2026-02-17T10:00:00.000Z',
    updatedAt: '2026-02-17T10:00:00.000Z',
    ...overrides,
  };
}

function makeReviewResponse() {
  return {
    vocabulary: makeVocabulary(),
    retention: {
      vocabularyId: VOCAB_1_ID,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      lastReviewedAt: '2026-02-17T10:00:00.000Z',
      nextReviewAt: '2026-02-18T10:00:00.000Z',
      failureCount: 0,
      consecutiveSuccesses: 1,
    },
  };
}

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

describe('useVocabulary', () => {
  it('fetches vocabulary list for a subject', async () => {
    const vocabularyData = {
      vocabulary: [
        makeVocabulary(),
        makeVocabulary({
          id: VOCAB_2_ID,
          term: 'buenos días',
          termNormalized: 'buenos dias',
          translation: 'good morning',
          type: 'chunk',
          mastered: true,
        }),
      ],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(vocabularyData), { status: 200 }),
    );

    const { result } = renderHook(() => useVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.term).toBe('hola');
    expect(result.current.data?.[1]?.term).toBe('buenos días');
  });

  it('returns empty array when no vocabulary exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ vocabulary: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal server error', { status: 500 }),
    );

    const { result } = renderHook(() => useVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useCreateVocabulary', () => {
  it('creates a vocabulary item', async () => {
    const createdVocab = {
      vocabulary: makeVocabulary({
        id: '770e8400-e29b-41d4-a716-446655440003',
        term: 'gracias',
        termNormalized: 'gracias',
        translation: 'thank you',
      }),
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(createdVocab), { status: 200 }),
    );

    const { result } = renderHook(() => useCreateVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        term: 'gracias',
        translation: 'thank you',
        type: 'word',
        cefrLevel: 'A1',
      });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.term).toBe('gracias');
    expect(data!.translation).toBe('thank you');
  });

  it('throws when API returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        }),
        { status: 400 },
      ),
    );

    const { result } = renderHook(() => useCreateVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          term: '',
          translation: 'hello',
          type: 'word',
        }),
      ).rejects.toThrow('Validation failed');
    });
  });
});

describe('useReviewVocabulary', () => {
  it('submits a vocabulary review', async () => {
    const reviewResult = makeReviewResponse();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(reviewResult), { status: 200 }),
    );

    const { result } = renderHook(() => useReviewVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        vocabularyId: 'vocab-1',
        input: { quality: 4 },
      });
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('throws when review API returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: 'Vocabulary not found' }),
        { status: 404 },
      ),
    );

    const { result } = renderHook(() => useReviewVocabulary('sub-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          vocabularyId: 'vocab-nonexistent',
          input: { quality: 3 },
        }),
      ).rejects.toThrow('Vocabulary not found');
    });
  });

  it('invalidates vocabulary and language-progress queries on success', async () => {
    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeReviewResponse()), { status: 200 }),
    );

    const { result } = renderHook(() => useReviewVocabulary('sub-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        vocabularyId: 'vocab-1',
        input: { quality: 5 },
      });
    });

    // onSuccess fires synchronously after mutation resolves (notifyManager scheduler
    // is set to immediate in test-setup.ts), so invalidateQueries should already
    // have been called by the time mutateAsync resolves.
    //
    // [BUG-535] Profile-scoped, subject-scoped invalidation. The previous bare
    // ['vocabulary'] / ['language-progress'] keys crossed account boundaries on
    // a shared device via React Query's prefix matching.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.vocabulary.subject('test-profile-id', 'sub-1'),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.languageProgress.subject(
          'test-profile-id',
          'sub-1',
        ),
      }),
    );

    invalidateSpy.mockRestore();
  });
});

describe('useDeleteVocabulary', () => {
  it('invalidates profile-scoped vocabulary and language-progress queries on success', async () => {
    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useDeleteVocabulary('sub-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('vocab-1');
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.vocabulary.subject('test-profile-id', 'sub-1'),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.languageProgress.subject(
          'test-profile-id',
          'sub-1',
        ),
      }),
    );

    invalidateSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Profile-switch cache isolation
// ---------------------------------------------------------------------------

describe('profile-switch cache isolation', () => {
  it('vocabulary.subject — same subject, different profiles produce different keys', () => {
    const keyA = queryKeys.vocabulary.subject('profile-A', 'sub-1');
    const keyB = queryKeys.vocabulary.subject('profile-B', 'sub-1');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual(['vocabulary', 'profile-A', 'sub-1']);
  });

  it('languageProgress.subject — same subject, different profiles are isolated', () => {
    const keyA = queryKeys.languageProgress.subject('profile-A', 'sub-1');
    const keyB = queryKeys.languageProgress.subject('profile-B', 'sub-1');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual(['language-progress', 'profile-A', 'sub-1']);
  });

  it('vocabulary.subject — undefined vs defined profile are isolated', () => {
    const keyDefined = queryKeys.vocabulary.subject('profile-A', 'sub-1');
    const keyUndefined = queryKeys.vocabulary.subject(undefined, 'sub-1');
    expect(keyDefined).not.toEqual(keyUndefined);
  });
});
