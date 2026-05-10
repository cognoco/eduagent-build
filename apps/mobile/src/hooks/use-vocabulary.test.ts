import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useVocabulary,
  useCreateVocabulary,
  useReviewVocabulary,
} from './use-vocabulary';

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

describe('useVocabulary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches vocabulary list for a subject', async () => {
    const vocabularyData = {
      vocabulary: [
        {
          id: 'vocab-1',
          profileId: 'test-profile-id',
          subjectId: 'sub-1',
          term: 'hola',
          termNormalized: 'hola',
          translation: 'hello',
          type: 'word',
          cefrLevel: 'A1',
          milestoneId: null,
          mastered: false,
          createdAt: '2026-02-17T10:00:00.000Z',
          updatedAt: '2026-02-17T10:00:00.000Z',
        },
        {
          id: 'vocab-2',
          profileId: 'test-profile-id',
          subjectId: 'sub-1',
          term: 'buenos días',
          termNormalized: 'buenos dias',
          translation: 'good morning',
          type: 'chunk',
          cefrLevel: 'A1',
          milestoneId: null,
          mastered: true,
          createdAt: '2026-02-17T10:00:00.000Z',
          updatedAt: '2026-02-17T10:00:00.000Z',
        },
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('creates a vocabulary item', async () => {
    const createdVocab = {
      vocabulary: {
        id: 'vocab-new',
        profileId: 'test-profile-id',
        subjectId: 'sub-1',
        term: 'gracias',
        termNormalized: 'gracias',
        translation: 'thank you',
        type: 'word',
        cefrLevel: 'A1',
        milestoneId: null,
        mastered: false,
        createdAt: '2026-02-17T10:00:00.000Z',
        updatedAt: '2026-02-17T10:00:00.000Z',
      },
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('submits a vocabulary review', async () => {
    const reviewResult = { success: true };
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
      new Response(JSON.stringify({ success: true }), { status: 200 }),
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
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['vocabulary'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['language-progress'] }),
    );

    invalidateSpy.mockRestore();
  });
});
