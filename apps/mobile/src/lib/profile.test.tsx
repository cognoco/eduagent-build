import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from './secure-storage';
import {
  ProfileProvider,
  useProfile,
  useLinkedChildren,
  useHasLinkedChildren,
  type Profile,
} from './profile';
import {
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';

jest.mock('./secure-storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
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
    linkCreatedAt: null,
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
    linkCreatedAt: null,
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
    mockFetch.mockReset();
    let resolveFetch: (value: Response) => void = () => undefined;
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const wrapper = createWrapper();
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {
      queryClient.setQueryData(['profiles'], userAProfiles);
      queryClient.setQueryData(['profiles', 'clerk-userA'], userAProfiles);
    });
    expect(result.current.activeProfile?.id).not.toBe('userA-owner');
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
    const pushedIds = (pushProfileIdToApiClient as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    expect(pushedIds).not.toContain('userA-owner');
  });

  it('switchProfile updates active profile and persists to SecureStore', async () => {
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
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'child-id',
    );
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
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
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
    expect(queryClient.getQueryData(['subjects', 'owner-id'])).toBeTruthy();
    expect(
      queryClient.getQueryData(['progress', 'overview', 'owner-id']),
    ).toBeTruthy();
    await act(async () => {
      await result.current.switchProfile('child-id');
    });
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
    expect(
      queryClient.getQueryData(['profiles', 'clerk-user-test']),
    ).toBeTruthy();
  });

  it('[BREAK / BUG-828] returns persistenceFailed when SecureStore write fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });
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

  it('[BREAK] clears mentomate_parent_home_seen on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut(['owner-id']);
    const deletedKeys = (
      SecureStore.deleteItemAsync as jest.Mock
    ).mock.calls.map((c) => c[0] as string);
    expect(deletedKeys).toContain('mentomate_parent_home_seen_owner-id');
  });
});

describe('useLinkedChildren', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => {
    queryClient?.clear();
  });

  it('returns non-owner profiles when active profile is the owner', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.profile.activeProfile?.id).toBe('owner-id');
    expect(result.current.linked).toHaveLength(1);
    expect(result.current.linked[0]!.id).toBe('child-id');
  });

  it('returns empty when active profile is not an owner', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('child-id');
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.profile.activeProfile?.id).toBe('child-id');
    expect(result.current.linked).toEqual([]);
  });

  it('returns empty when there are no non-owner profiles', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: [mockProfiles[0]!] }), {
        status: 200,
      }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.linked).toEqual([]);
  });

  it('sorts children by linkCreatedAt, falling back to createdAt', async () => {
    const threeProfiles: Profile[] = [
      mockProfiles[0]!,
      {
        ...mockProfiles[1]!,
        id: 'child-newer-created',
        displayName: 'Beta',
        createdAt: '2026-01-10T00:00:00Z',
        linkCreatedAt: '2026-01-02T00:00:00Z',
      },
      {
        ...mockProfiles[1]!,
        id: 'child-older-created',
        displayName: 'Alpha',
        createdAt: '2026-01-03T00:00:00Z',
        linkCreatedAt: null,
      },
    ];
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: threeProfiles }), {
        status: 200,
      }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.linked.map((p) => p.id)).toEqual([
      'child-newer-created',
      'child-older-created',
    ]);
  });
});

describe('useHasLinkedChildren', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => {
    queryClient?.clear();
  });

  it('returns true when owner has linked children', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), has: useHasLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.has).toBe(true);
  });

  it('returns false for solo owner', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: [mockProfiles[0]!] }), {
        status: 200,
      }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), has: useHasLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.has).toBe(false);
  });

  it('returns false when active profile is not owner (proxy mode)', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('child-id');
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
    const { result } = renderHook(
      () => ({ profile: useProfile(), has: useHasLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    expect(result.current.has).toBe(false);
  });
});

describe('proxy-mode regression', () => {
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

  it('[BREAK] useLinkedChildren returns empty while in proxy mode on a child profile', async () => {
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await act(async () => {
      await result.current.profile.switchProfile('child-id');
    });
    expect(result.current.profile.activeProfile?.id).toBe('child-id');
    expect(result.current.profile.activeProfile?.isOwner).toBe(false);
    expect(result.current.linked).toEqual([]);
  });

  it('[BREAK] switchProfile back to owner clears proxy flag and restores useLinkedChildren', async () => {
    const { result } = renderHook(
      () => ({ profile: useProfile(), linked: useLinkedChildren() }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => {
      expect(result.current.profile.isLoading).toBe(false);
    });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await act(async () => {
      await result.current.profile.switchProfile('child-id');
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(true);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await act(async () => {
      await result.current.profile.switchProfile('owner-id');
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(false);
    expect(result.current.profile.activeProfile?.id).toBe('owner-id');
    expect(result.current.linked).toHaveLength(1);
    expect(result.current.linked[0]!.id).toBe('child-id');
  });
});
