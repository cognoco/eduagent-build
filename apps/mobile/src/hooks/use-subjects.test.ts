import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
} from './use-subjects';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

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

describe('useSubjects', () => {
  it('returns subjects from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subjects: [
            { id: 's1', name: 'Math', status: 'active' },
            { id: 's2', name: 'Science', status: 'active' },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual([
      { id: 's1', name: 'Math', status: 'active' },
      { id: 's2', name: 'Science', status: 'active' },
    ]);
  });

  it('returns empty array when API returns no subjects', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ subjects: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('refetchInterval tolerates a non-array payload without throwing [BUG-634 / M-2]', async () => {
    // A malformed / error payload shaped `{ subjects: <non-array> }` must not
    // crash the polling guard. Before the fix the guard only checked `!subjects`,
    // so a truthy non-array reached `subjects.some(...)` and threw a TypeError.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ subjects: 'not-an-array' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const query = queryClient.getQueryCache().findAll()[0];
    expect(query).toBeDefined();
    expect(query!.state.data).toBe('not-an-array');

    // query.options is typed as QueryOptions (internal), which does not expose
    // observer-level options like refetchInterval. Cast through unknown to access
    // the runtime-present refetchInterval function.
    const refetchInterval = (
      query!.options as unknown as {
        refetchInterval: (q: typeof query) => number | false;
      }
    ).refetchInterval;
    expect(typeof refetchInterval).toBe('function');

    let interval: number | false | undefined;
    expect(() => {
      interval = refetchInterval(query!);
    }).not.toThrow();
    expect(interval).toBe(false);
  });
});

describe('useCreateSubject', () => {
  it('calls POST /subjects with subject name', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: { id: 's1', name: 'Calculus', status: 'active' },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useCreateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Calculus' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      subject: { id: 's1', name: 'Calculus', status: 'active' },
    });
  });

  it('handles creation errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Subject already exists', { status: 409 }),
    );

    const { result } = renderHook(() => useCreateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Calculus' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useUpdateSubject', () => {
  it('sends archived status in the PATCH body', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: { id: 's1', name: 'Calculus', status: 'archived' },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useUpdateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ subjectId: 's1', status: 'archived' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ status: 'archived' });
    expect(result.current.data).toEqual({
      subject: { id: 's1', name: 'Calculus', status: 'archived' },
    });
  });

  it('retries transient rate-limit failures when updating a subject', async () => {
    const rateLimited = Object.assign(
      new Error("You've hit the limit. Wait a moment and try again."),
      {
        name: 'RateLimitedError',
        retryAfter: 0,
      },
    );
    mockFetch.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: { id: 's1', name: 'Calculus', status: 'archived' },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useUpdateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        subjectId: 's1',
        status: 'archived',
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({
      subject: { id: 's1', name: 'Calculus', status: 'archived' },
    });
  });
});
