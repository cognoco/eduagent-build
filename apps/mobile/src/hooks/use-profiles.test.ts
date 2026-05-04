import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useProfiles, useUpdateProfileName } from './use-profiles';

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

jest.mock('../lib/profile', () => ({}));

const mockUseAuth = jest.fn(() => ({ isSignedIn: true }));
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => mockUseAuth(),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.Wrapper;
}

describe('useProfiles', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns profiles from API', async () => {
    const profiles = [
      {
        id: 'p1',
        accountId: 'a1',
        displayName: 'Alex',
        avatarUrl: null,
        birthYear: 2010,
        isOwner: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthYear: 2012,
        isOwner: false,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles }), { status: 200 })
    );

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(profiles);
  });

  it('returns empty array when no profiles exist', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: [] }), { status: 200 })
    );

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 })
    );

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('does not fetch when user is not signed in', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    // Query should stay in idle/disabled state — no fetch call
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useUpdateProfileName', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('sends PATCH with displayName and invalidates profiles', async () => {
    const updatedProfile = {
      id: 'p1',
      accountId: 'a1',
      displayName: 'New Name',
      avatarUrl: null,
      birthYear: 2010,
      isOwner: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: updatedProfile }), { status: 200 })
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateProfileName(), { wrapper });

    result.current.mutate({ profileId: 'p1', displayName: 'New Name' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/p1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.displayName).toBe('New Name');
  });

  it('reports error on API failure', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateProfileName(), { wrapper });

    result.current.mutate({ profileId: 'p1', displayName: 'Nope' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
