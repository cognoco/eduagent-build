import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from './secure-storage';
import { ProfileProvider, useProfile, type Profile } from './profile';
import {
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';

jest.mock('./secure-storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'clerk-user-test' }),
}));

const mockFetch = jest.fn();
jest.mock('./api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
  setActiveProfileId: jest.fn(),
  setProxyMode: jest.fn(),
}));

const mockProfiles: Profile[] = [
  {
    id: 'owner-id',
    accountId: 'a1',
    displayName: 'Parent',
    avatarUrl: null,
    birthYear: 1990,
    location: null,
    isOwner: true,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'child-id',
    accountId: 'a1',
    displayName: 'Alex',
    avatarUrl: null,
    birthYear: 2012,
    location: null,
    isOwner: false,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileProvider>{children}</ProfileProvider>
      </QueryClientProvider>
    );
  };
}

describe('ProfileProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches profiles and selects owner as active by default', async () => {
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profiles).toEqual(mockProfiles);
    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(result.current.activeProfile?.displayName).toBe('Parent');
  });

  it('restores active profile from SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('child-id');

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeProfile?.id).toBe('child-id');
    expect(result.current.activeProfile?.displayName).toBe('Alex');
  });

  it('falls back to owner when saved ID is stale', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('deleted-id');

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'owner-id',
    );
  });

  // [BREAK] Cross-account leak regression. Real-world scenario: User A signs
  // out via a path that does NOT call clearProfileSecureStorageOnSignOut
  // (5 of 6 sign-out call sites as of 2026-05-10), so mentomate_active_profile_id
  // survives. User B then signs in with their own Clerk credentials. The
  // api-client must NEVER receive User A's profile id — even transiently —
  // because attaching it as X-Profile-Id on any request would either return
  // User A's data (if a family link existed) or 403, and any
  // activeProfile.id-keyed cache read would render User A's UI to User B.
  //
  // Symptom that triggered this test: a real account's monthly usage counter
  // incremented while the owner was not using the app — wife had signed in on
  // his phone after his sign-out, and her API calls were attributed to his
  // profileId server-side.
  it('[BREAK] never pushes a SecureStore-restored profile id that the current account does not own', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'mentomate_active_profile_id' ? 'userA-profile-id' : null,
      ),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeProfile?.id).toBe('owner-id');

    const pushedIds = (pushProfileIdToApiClient as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    expect(pushedIds).not.toContain('userA-profile-id');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'owner-id',
    );
  });

  // [BREAK] Cache-leak half of the cross-account bug. The ['profiles'] query
  // key is NOT scoped by Clerk userId — so when sign-out doesn't call
  // queryClient.clear() (5 of 6 call sites today), User A's profiles list
  // survives in the cache. When User B signs in, useProfiles serves the stale
  // list immediately, savedExists matches against User A's ids, and
  // pushProfileIdToApiClient fires with a profileId User B does not own.
  // Every subsequent fetch then carries X-Profile-Id: <userA-id>.
  //
  // This test pre-seeds ['profiles'] with User A's list and asserts that
  // User A's id is never propagated to the api-client even during the
  // refetch window. Fix is one of: scope the query key by Clerk userId,
  // call queryClient.clear() on every sign-out path, or refetchOnMount: 'always'
  // for the profiles query.
  it('[BREAK] cache leak: stale [profiles] cache from previous user does not leak profile id to api-client', async () => {
    const userAProfiles: Profile[] = [
      {
        ...mockProfiles[0]!,
        id: 'userA-owner',
        accountId: 'userA-account',
        displayName: 'Previous User',
      },
    ];

    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'mentomate_active_profile_id' ? 'userA-owner' : null,
      ),
    );

    // Gate the network fetch so the test can observe the window where
    // useProfiles is serving stale cache data BEFORE the refetch resolves
    // with the new user's profiles. Without this gate, the mocked fetch
    // resolves so fast the leak window collapses and the bug is hidden.
    mockFetch.mockReset();
    let resolveFetch: (value: Response) => void = () => undefined;
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useProfile(), { wrapper });

    // Seed BOTH the unscoped legacy key and a foreign-userId key. The first
    // models a pre-fix cache entry left over after an in-place upgrade; the
    // second models the cache an earlier signed-in user would have written
    // with the post-fix code. The current consumer's scoped key
    // ['profiles', 'clerk-user-test'] must match neither.
    await act(async () => {
      queryClient.setQueryData(['profiles'], userAProfiles);
      queryClient.setQueryData(['profiles', 'clerk-userA'], userAProfiles);
    });

    // The leak window the pre-fix code exposed cannot exist with the scoped
    // query key — activeProfile must never resolve to the previous user's id
    // even before the network refetch settles.
    expect(result.current.activeProfile?.id).not.toBe('userA-owner');

    // Resolve the refetch with the current user's actual profiles.
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ profiles: mockProfiles }), {
          status: 200,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.activeProfile?.id).toBe('owner-id');
    });

    // Contract: no profile id from a previous account should ever have been
    // pushed to the api-client — any value pushed here ends up as
    // X-Profile-Id on subsequent fetches and was the mechanism that
    // attributed wife's API calls to husband's profileId server-side.
    const pushedIds = (pushProfileIdToApiClient as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    expect(pushedIds).not.toContain('userA-owner');
  });

  it('switchProfile updates active profile and persists to SecureStore', async () => {
    // Mock the switch POST call
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    // profiles GET + switch POST (profiles query excluded from resetQueries)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'child-id',
    );

    // activeProfile updates immediately via setActiveProfileId (profiles
    // query was NOT reset, so the cached list is still available).
    expect(result.current.activeProfile?.id).toBe('child-id');
  });

  it('[BREAK] updates API-client profile and proxy mode before query resets on parent-to-child switch', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const resetSpy = jest.spyOn(QueryClient.prototype, 'resetQueries');

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    const profilePushCalls = pushProfileIdToApiClient as jest.Mock;
    const proxyPushCalls = setProxyMode as jest.Mock;
    const childProfilePushIndex = profilePushCalls.mock.calls.findIndex(
      (call) => call[0] === 'child-id',
    );
    const proxyEnabledPushIndex = proxyPushCalls.mock.calls.findIndex(
      (call) => call[0] === true,
    );
    const profilePushOrder =
      profilePushCalls.mock.invocationCallOrder[childProfilePushIndex];
    const proxyPushOrder =
      proxyPushCalls.mock.invocationCallOrder[proxyEnabledPushIndex];
    const resetOrder = resetSpy.mock.invocationCallOrder.at(-1);

    expect(pushProfileIdToApiClient).toHaveBeenLastCalledWith('child-id');
    expect(setProxyMode).toHaveBeenLastCalledWith(true);
    expect(childProfilePushIndex).toBeGreaterThanOrEqual(0);
    expect(proxyEnabledPushIndex).toBeGreaterThanOrEqual(0);
    expect(profilePushOrder).toBeLessThan(resetOrder!);
    expect(proxyPushOrder).toBeLessThan(resetOrder!);
  });

  it('resets data queries on profile switch (cache isolation)', async () => {
    // Simulate cached data from child A's session
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Seed query cache with data belonging to owner profile
    queryClient.setQueryData(
      ['subjects', 'owner-id'],
      [{ id: 's1', name: 'Math' }],
    );
    queryClient.setQueryData(['progress', 'overview', 'owner-id'], {
      subjects: [],
    });
    queryClient.setQueryData(['dashboard'], { children: [] });
    queryClient.setQueryData(
      ['books', 'subject-1', 'owner-id'],
      [{ id: 'book-1' }],
    );
    queryClient.setQueryData(['book', 'subject-1', 'book-1', 'owner-id'], {
      id: 'book-1',
    });
    queryClient.setQueryData(
      ['book-suggestions', 'subject-1'],
      [{ id: 'suggestion-1' }],
    );

    // Verify data is cached
    expect(queryClient.getQueryData(['subjects', 'owner-id'])).toBeTruthy();
    expect(
      queryClient.getQueryData(['progress', 'overview', 'owner-id']),
    ).toBeTruthy();

    // Switch to child profile
    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    // All non-profiles queries must be reset (data cleared)
    expect(queryClient.getQueryData(['subjects', 'owner-id'])).toBeUndefined();
    expect(
      queryClient.getQueryData(['progress', 'overview', 'owner-id']),
    ).toBeUndefined();
    expect(queryClient.getQueryData(['dashboard'])).toBeUndefined();
    expect(
      queryClient.getQueryData(['books', 'subject-1', 'owner-id']),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['book', 'subject-1', 'book-1', 'owner-id']),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['book-suggestions', 'subject-1']),
    ).toBeUndefined();

    // Profiles query must survive (not reset) to avoid blank screen. The
    // query is scoped by Clerk userId — see useProfiles in hooks/use-profiles.ts.
    expect(
      queryClient.getQueryData(['profiles', 'clerk-user-test']),
    ).toBeTruthy();
  });

  // [BREAK / BUG-828] If SecureStore.setItemAsync rejects (e.g., Keychain
  // unavailable, disk full, OS-level Keychain reset), the in-memory switch
  // must still go through so the user isn't stuck mid-flow, BUT the result
  // must report persistenceFailed: true so the caller can warn the user that
  // the change won't survive an app restart. Previously the failure was
  // silently swallowed and callers had no way to know.
  it('[BREAK / BUG-828] returns persistenceFailed when SecureStore write fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    // Wait for mount to settle so the auto-save effect (line 166) has fired
    // with the default resolved mock — only THEN inject the rejection so it
    // hits switchProfile's setItemAsync, not the on-mount one.
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('SecureStore unavailable'),
    );

    let switchResult: Awaited<
      ReturnType<typeof result.current.switchProfile>
    > | null = null;
    await act(async () => {
      switchResult = await result.current.switchProfile('child-id');
    });

    expect(switchResult).toEqual({ success: true, persistenceFailed: true });
    // In-memory switch still proceeds so navigation isn't dead-ended.
    expect(result.current.activeProfile?.id).toBe('child-id');
  });

  it('returns empty profiles when API returns none', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profiles).toEqual([]);
    expect(result.current.activeProfile).toBeNull();
    expect(result.current.profileLoadError).toBeNull();
  });

  it('[BUG-PROFILE-GATE] exposes profile load errors instead of treating them as no profiles', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Server error' }), {
        status: 500,
      }),
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.profileLoadError).toBeTruthy();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.profiles).toEqual([]);
    expect(result.current.activeProfile).toBeNull();
  });
});
