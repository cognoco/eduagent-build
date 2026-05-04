import { renderHook, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useResolveSubject } from './use-resolve-subject';

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

describe('useResolveSubject', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls POST /subjects/resolve with rawInput and returns result', async () => {
    const resolveResult = {
      subjectId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Mathematics',
      isNew: true,
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(resolveResult), { status: 200 })
    );

    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({ rawInput: 'math' });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!).toEqual(resolveResult);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Bad request', code: 'VALIDATION_ERROR' },
        }),
        { status: 400 }
      )
    );

    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ rawInput: '' })
      ).rejects.toThrow();
    });
  });

  it('starts in idle state before mutation is called', () => {
    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
