import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePrepareHomework, useGenerateDictation } from './use-dictation-api';

const mockPreparePost = jest.fn();
const mockGeneratePost = jest.fn();

jest.mock('../lib/api-client', () => ({
  useApiClient: () => ({
    dictation: {
      'prepare-homework': {
        $post: (...args: unknown[]) => mockPreparePost(...args),
      },
      generate: {
        $post: (...args: unknown[]) => mockGeneratePost(...args),
      },
    },
  }),
}));

jest.mock('../lib/assert-ok', () => ({
  assertOk: jest.fn().mockResolvedValue(undefined),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('usePrepareHomework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreparePost.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sentences: [
            {
              text: 'Test.',
              withPunctuation: 'Test period',
              wordCount: 1,
            },
          ],
          language: 'en',
        }),
    });
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

    expect(mockPreparePost).toHaveBeenCalledWith({
      json: { text: 'My homework text.' },
    });
  });

  it('surfaces errors from the API', async () => {
    mockPreparePost.mockRejectedValue(new Error('Network error'));

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
    jest.clearAllMocks();
    mockGeneratePost.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
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
    });
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
    mockGeneratePost.mockRejectedValue(new Error('Generation failed'));

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
