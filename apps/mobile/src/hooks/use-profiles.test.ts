import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useProfiles,
  useUpdateProfileAppContext,
  useUpdateProfileName,
} from './use-profiles';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

const mockGetToken = jest.fn().mockResolvedValue('mock-token');
type MockAuthState = {
  isSignedIn: boolean;
  userId: string | undefined;
  getToken: typeof mockGetToken;
};
const mockUseAuth = jest.fn<MockAuthState, []>(() => ({
  isSignedIn: true,
  userId: 'user-1',
  getToken: mockGetToken,
}));
jest.mock('@clerk/expo', () => ({
  useAuth: () => mockUseAuth(),
}));

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
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue('mock-token');
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    userId: 'user-1',
    getToken: mockGetToken,
  });
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

describe('useProfiles', () => {
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
      new Response(JSON.stringify({ profiles }), { status: 200 }),
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
      new Response(JSON.stringify({ profiles: [] }), { status: 200 }),
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
      new Response('Network error', { status: 500 }),
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
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      userId: undefined,
      getToken: mockGetToken,
    });

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
      new Response(JSON.stringify({ profile: updatedProfile }), {
        status: 200,
      }),
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

describe('useUpdateProfileAppContext', () => {
  it('sends PATCH with defaultAppContext and invalidates profiles', async () => {
    const updatedProfile = {
      id: 'p1',
      accountId: 'a1',
      displayName: 'Owner',
      avatarUrl: null,
      birthYear: 1980,
      isOwner: true,
      defaultAppContext: 'family',
      hasFamilyLinks: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: updatedProfile }), {
        status: 200,
      }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateProfileAppContext(), {
      wrapper,
    });

    result.current.mutate({
      profileId: 'p1',
      defaultAppContext: 'family',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles/p1/app-context');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.defaultAppContext).toBe('family');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['profiles', 'user-1'],
    });
  });

  it('retries once on a transient network failure before surfacing error', async () => {
    const updatedProfile = {
      id: 'p1',
      accountId: 'a1',
      displayName: 'Owner',
      avatarUrl: null,
      birthYear: 1980,
      isOwner: true,
      defaultAppContext: 'family',
      hasFamilyLinks: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: updatedProfile }), {
          status: 200,
        }),
      );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateProfileAppContext(), {
      wrapper,
    });

    result.current.mutate({
      profileId: 'p1',
      defaultAppContext: 'family',
    });

    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 3_000 },
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
