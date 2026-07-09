import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createQueryWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useCreateProfile } from './use-create-profile';

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
  // Use createQueryWrapper (not createHookWrapper) so we can set gcTime to
  // Infinity for queries. createHookWrapper uses gcTime:0, which GCs any
  // setQueryData entries without active observers before the mutation's
  // onSuccess callback runs — making post-mutation cache assertions unreliable.
  // useCreateProfile only needs QueryClientProvider (no ProfileContext).
  const w = createQueryWrapper({
    queryClientOptions: {
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: 0 },
      },
    },
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

const testBody = {
  displayName: 'Alice',
  birthYear: 2010,
  birthMonth: 5,
  birthDay: 15,
};

const testProfile = createTestProfile({
  id: 'new-profile-id',
  displayName: 'Alice',
});

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

describe('useCreateProfile', () => {
  it('calls POST /profiles and returns the created profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: testProfile }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ body: testBody });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/profiles');
    expect(init.method).toBe('POST');
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.displayName).toBe('Alice');
    expect(sentBody.birthYear).toBe(2010);
  });

  it('adds the new profile to an existing profiles cache entry on success', async () => {
    const existingProfile = createTestProfile({ id: 'existing-id' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: testProfile }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      // Seed inside act() so the data is in cache when onSuccess runs.
      // createHookWrapper uses gcTime:0, so data seeded before act() would
      // be garbage-collected before the async mutation's onSuccess fires.
      queryClient.setQueryData(['profiles', 'user-1'], [existingProfile]);
      await result.current.mutateAsync({ body: testBody });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<unknown[]>(['profiles', 'user-1']);
    expect(cached).toHaveLength(2);
    const ids = (cached as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(existingProfile.id);
    expect(ids).toContain(testProfile.id);
  });

  it('does not add a duplicate if profile already in cache', async () => {
    // Edge case: profile already in cache (idempotency guard)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: testProfile }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      // Seed inside act() — same gcTime:0 reason as the test above.
      queryClient.setQueryData(['profiles', 'user-1'], [testProfile]);
      await result.current.mutateAsync({ body: testBody });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<unknown[]>(['profiles', 'user-1']);
    expect(cached).toHaveLength(1);
  });

  it('surfaces an error when the API returns a 4xx', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({ body: testBody });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('passes the abort signal to the fetch call', async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: testProfile }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        body: testBody,
        signal: controller.signal,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The signal is forwarded — fetch received it in the init object
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('supports optional child kind discriminator', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: testProfile }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        body: { ...testBody, kind: 'child' as const },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.kind).toBe('child');
  });
});
