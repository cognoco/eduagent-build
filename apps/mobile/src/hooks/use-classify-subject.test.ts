import { renderHook, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useClassifySubject } from './use-classify-subject';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.Wrapper;
}

describe('useClassifySubject', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls POST /subjects/classify with text and returns classification', async () => {
    const classifyResult = {
      category: 'mathematics',
      confidence: 0.95,
      suggestedName: 'Mathematics',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(classifyResult), { status: 200 })
    );

    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        text: 'algebra and equations',
      });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!).toEqual(classifyResult);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Server error', code: 'INTERNAL_ERROR' },
        }),
        { status: 500 }
      )
    );

    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ text: 'test' })
      ).rejects.toThrow();
    });
  });

  it('starts in idle state before mutation is called', () => {
    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
