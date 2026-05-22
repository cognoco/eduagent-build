import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, setProxyMode } from '../lib/api-client';
import { usePrepareHomework, useGenerateDictation } from './use-dictation-api';

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
