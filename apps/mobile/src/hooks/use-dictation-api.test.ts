import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createQueryWrapper,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, setProxyMode } from '../lib/api-client';
import {
  usePrepareHomework,
  useGenerateDictation,
  useReviewDictation,
  useRecordDictationResult,
  useDictationHistory,
  DICTATION_MUTATION_TIMEOUT_MS,
  DICTATION_REVIEW_TIMEOUT_MS,
} from './use-dictation-api';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

function createProfileWrapper() {
  const w = createHookWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
  setProxyMode(false);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  setActiveProfileId(undefined);
  setProxyMode(false);
});

describe('usePrepareHomework', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sentences: [
            {
              text: 'Test.',
              withPunctuation: 'Test period',
              wordCount: 1,
            },
          ],
          language: 'en',
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('returns a mutation that calls prepare-homework endpoint', async () => {
    const { result } = renderHook(() => usePrepareHomework(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: 'Hello world.' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.sentences).toHaveLength(1);
    expect(result.current.data?.language).toBe('en');
  });

  it('calls the API with the correct input', async () => {
    const { result } = renderHook(() => usePrepareHomework(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: 'My homework text.' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dictation/prepare-homework');
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'My homework text.',
    });
  });

  it('surfaces errors from the API', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Network error' }),
        { status: 500 },
      ),
    );

    const { result } = renderHook(() => usePrepareHomework(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: 'Some text.' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  // [FCR-2026-05-23-L6.L5] Without a timeout guard, a hung API call wedges
  // the dictation screen indefinitely. Assert the mutation passes an
  // AbortSignal to fetch so the timeout actually fires.
  it('passes an AbortSignal to fetch so a hung API does not wedge the screen', async () => {
    const { result } = renderHook(() => usePrepareHomework(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: 'Hello world.' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

// [WI-901] The photo-review call makes a server-side vision-LLM request whose
// provider timeout is ~25s. The client request timeout must exceed that so the
// client never aborts a still-valid grading first (the old shared 15s timeout
// did, surfacing a misleading "offline" error).
describe('dictation review timeout (WI-901)', () => {
  it('gives the photo review a client timeout longer than the server vision budget (25s) and the other dictation mutations', () => {
    expect(DICTATION_REVIEW_TIMEOUT_MS).toBeGreaterThan(25_000);
    expect(DICTATION_REVIEW_TIMEOUT_MS).toBeGreaterThan(
      DICTATION_MUTATION_TIMEOUT_MS,
    );
  });
});

describe('useGenerateDictation', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sentences: [
            {
              text: 'Generated.',
              withPunctuation: 'Generated period',
              wordCount: 1,
            },
          ],
          title: 'Test Title',
          topic: 'Test Topic',
          language: 'en',
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('returns a mutation that calls generate endpoint', async () => {
    const { result } = renderHook(() => useGenerateDictation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.title).toBe('Test Title');
    expect(result.current.data?.sentences).toHaveLength(1);
    expect(result.current.data?.language).toBe('en');
  });

  it('surfaces errors from the generate endpoint', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Generation failed',
        }),
        { status: 500 },
      ),
    );

    const { result } = renderHook(() => useGenerateDictation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Generation failed');
  });
});

describe('useReviewDictation', () => {
  afterEach(() => {
    jest.useRealTimers();
    queryClient?.clear();
  });

  it('posts review input to /dictation/review with the review timeout AbortSignal', async () => {
    jest.useFakeTimers();
    let resolveFetch: (response: Response) => void = () => undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { result } = renderHook(() => useReviewDictation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        imageBase64: 'base64-image',
        imageMimeType: 'image/jpeg',
        language: 'en',
        sentences: [
          {
            text: 'The cat sat.',
            withPunctuation: 'The cat sat period',
            wordCount: 3,
          },
        ],
      });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dictation/review');
    expect(JSON.parse(init.body as string)).toEqual({
      imageBase64: 'base64-image',
      imageMimeType: 'image/jpeg',
      language: 'en',
      sentences: [
        {
          text: 'The cat sat.',
          withPunctuation: 'The cat sat period',
          wordCount: 3,
        },
      ],
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const signal = init.signal as AbortSignal;
    act(() => {
      jest.advanceTimersByTime(DICTATION_REVIEW_TIMEOUT_MS - 1);
    });
    expect(signal.aborted).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            totalSentences: 1,
            correctCount: 1,
            mistakes: [],
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.correctCount).toBe(1);
  });
});

describe('useRecordDictationResult', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it("posts the result and invalidates the active profile's dictation history", async () => {
    const wrapper = createProfileWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const input = {
      localDate: '2026-07-06',
      sentenceCount: 1,
      mistakeCount: 0,
      mode: 'surprise' as const,
      reviewed: true,
      subjectId: '11111111-1111-4111-8111-111111111111',
      sentences: ['The cat sat.'],
    };

    const { result } = renderHook(() => useRecordDictationResult(), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate(input);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dictation/result');
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dictation-history', 'test-profile-id'],
    });
  });
});

describe('useDictationHistory', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              profileId: 'test-profile-id',
              completionKey: '33333333-3333-4333-8333-333333333333',
              date: '2026-07-06',
              sentenceCount: 1,
              mistakeCount: 0,
              mode: 'surprise',
              reviewed: true,
              sentences: ['The cat sat.'],
            },
          ],
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches /dictation/history and selects entries under a profile-scoped key', async () => {
    const wrapper = createProfileWrapper();

    const { result } = renderHook(() => useDictationHistory(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        sentences: ['The cat sat.'],
      }),
    ]);
    expect(queryClient.getQueryData(['dictation-history', 'test-profile-id']))
      .toEqual(result.current.data);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dictation/history');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
