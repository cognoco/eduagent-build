import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
} from './use-subjects';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', {
      fetch: async (...args: unknown[]) => {
        const res = await mockFetch(...(args as Parameters<typeof fetch>));
        if (!res.ok) {
          const text = await res
            .clone()
            .text()
            .catch(() => res.statusText);
          throw new Error(`API error ${res.status}: ${text}`);
        }
        return res;
      },
    });
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

describe('useSubjects', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
});

describe('useCreateSubject', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
