import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ExpoSecureStore from 'expo-secure-store';
import {
  ProfileProvider,
  useProfile,
  useLinkedChildren,
  useHasLinkedChildren,
  PROFILE_SCOPED_KEYS,
  type Profile,
} from './profile';
import {
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { queryKeys } from './query-keys';

// ./secure-storage uses real implementation: expo-secure-store is globally mocked
// in test-setup.ts with an in-memory store. We control behavior via ExpoSecureStore fns directly.

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'clerk-user-test' }),
}));

const mockFetch = jest.fn();
jest.mock(
  './api-client' /* gc1-allow: pattern-a conversion; real api-client requires a live Hono server; mockFetch lets tests drive profile CRUD responses */,
  () => ({
    ...jest.requireActual('./api-client'),
    useApiClient: () => {
      const { hc } = require('hono/client');
      return hc('http://localhost', { fetch: mockFetch });
    },
    setActiveProfileId: jest.fn(),
    setProxyMode: jest.fn(),
  }),
);

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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(ExpoSecureStore.setItemAsync).mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue('child-id');
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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue('deleted-id');
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'owner-id',
    );
  });

  it('[BREAK] falls back to owner when active-profile SecureStore restore hangs', async () => {
    jest.useFakeTimers();
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockImplementation((key: string) =>
        key === 'mentomate_active_profile_id'
          ? new Promise(() => {
              /* deliberately never resolves */
            })
          : Promise.resolve(null),
      );
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(true);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'owner-id',
    );
  });

  it('[BREAK] never pushes a SecureStore-restored profile id that the current account does not own', async () => {
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockImplementation((key: string) =>
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
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
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
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockImplementation((key: string) =>
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
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'child-id',
    );
    expect(result.current.activeProfile?.id).toBe('child-id');
  });

  it('[BREAK] updates API-client profile and proxy mode before query resets on parent-to-child switch', async () => {
    // [ACCOUNT-04] A plain switchProfile() to a child slot does NOT set proxy
    // mode — the parent is actually using the child's account, not previewing it.
    // Proxy requires an explicit opt-in via switchProfile(id, { proxyMode: true }).
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
    // Plain switch → proxy must be set to FALSE (no proxyMode option passed).
    const proxyDisabledPushIndex = proxyPushCalls.mock.calls.findIndex(
      (call) => call[0] === false,
    );
    const profilePushOrder =
      profilePushCalls.mock.invocationCallOrder[childProfilePushIndex];
    const proxyPushOrder =
      proxyPushCalls.mock.invocationCallOrder[proxyDisabledPushIndex];
    const resetOrder = resetSpy.mock.invocationCallOrder.at(-1);
    expect(pushProfileIdToApiClient).toHaveBeenLastCalledWith('child-id');
    expect(setProxyMode).toHaveBeenLastCalledWith(false);
    expect(childProfilePushIndex).toBeGreaterThanOrEqual(0);
    expect(proxyDisabledPushIndex).toBeGreaterThanOrEqual(0);
    expect(profilePushOrder).toBeLessThan(resetOrder!);
    expect(proxyPushOrder).toBeLessThan(resetOrder!);
  });

  it('[ACCOUNT-04 BREAK] explicit proxyMode:true sets proxy flag and persists to SecureStore', async () => {
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
      await result.current.switchProfile('child-id', { proxyMode: true });
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(true);
    expect(result.current.isExplicitProxyMode).toBe(true);
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'parent-proxy-active',
      'true',
    );
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
    const profileScopedQueries: Array<{
      key: unknown[];
      value: unknown;
    }> = [
      { key: ['subjects', 'owner-id'], value: [{ id: 's1', name: 'Math' }] },
      { key: ['progress', 'overview', 'owner-id'], value: { subjects: [] } },
      { key: ['dashboard'], value: { children: [] } },
      { key: ['books', 'subject-1', 'owner-id'], value: [{ id: 'book-1' }] },
      {
        key: ['book', 'subject-1', 'book-1', 'owner-id'],
        value: { id: 'book-1' },
      },
      {
        key: ['book-suggestions', 'subject-1'],
        value: [{ id: 'suggestion-1' }],
      },
      { key: ['book-sessions', 'subject-1', 'book-1', 'owner-id'], value: [] },
      { key: ['bookmarks', 'owner-id'], value: [{ id: 'bookmark-1' }] },
      {
        key: ['session-bookmarks', 'owner-id', 'session-1'],
        value: [{ id: 'bookmark-1' }],
      },
      { key: ['session-summary', 'session-1', 'owner-id'], value: {} },
      { key: ['all-notes', 'owner-id'], value: [{ id: 'note-1' }] },
      { key: ['book-notes', 'book-1', 'owner-id'], value: [{ id: 'note-1' }] },
      {
        key: ['topic-notes', 'topic-1', 'owner-id'],
        value: [{ id: 'note-1' }],
      },
      { key: ['library', 'owner-id'], value: { subjects: [] } },
      { key: ['library-search', 'math', 'owner-id'], value: { results: [] } },
      {
        key: ['learner-profile', 'owner-id'],
        value: { accommodationMode: 'none' },
      },
      { key: ['language-progress', 'owner-id'], value: { words: [] } },
      {
        key: ['vocabulary', 'owner-id', 'subject-1'],
        value: [{ id: 'word-1' }],
      },
      { key: ['quiz-recent', 'owner-id'], value: [] },
      { key: ['quiz-stats', 'owner-id'], value: { rounds: 1 } },
      { key: ['subject-sessions', 'subject-1', 'owner-id'], value: [] },
      { key: ['topic-suggestions', 'subject-1', 'owner-id'], value: [] },
      { key: ['resume-nudge', 'owner-id'], value: { topicId: 'topic-1' } },
    ];
    for (const { key, value } of profileScopedQueries) {
      queryClient.setQueryData(key, value);
    }
    for (const { key } of profileScopedQueries) {
      expect(queryClient.getQueryData(key)).toBeTruthy();
    }
    await act(async () => {
      await result.current.switchProfile('child-id');
    });
    for (const { key } of profileScopedQueries) {
      expect(queryClient.getQueryData(key)).toBeUndefined();
    }
    expect(
      queryClient.getQueryData(['profiles', 'clerk-user-test']),
    ).toBeTruthy();
  });

  it('keeps profile-scoped query key factory prefixes covered by PROFILE_SCOPED_KEYS', () => {
    const profileScopedFactoryKeys: Array<readonly unknown[]> = [
      queryKeys.progress.overview('study', 'owner-id'),
      queryKeys.progress.subject('study', 'subject-1', 'owner-id'),
      queryKeys.progress.resumeTarget('study', 'owner-id', {
        subjectId: 'subject-1',
      }),
      queryKeys.dashboard.root('family', 'owner-id'),
      queryKeys.dashboard.childDetail('family', 'child-id'),
      queryKeys.sessions.detail('study', 'session-1', 'owner-id'),
      queryKeys.sessions.transcript('study', 'session-1', 'owner-id'),
      queryKeys.sessions.summary('study', 'session-1', 'owner-id'),
      queryKeys.sessions.parkingLot('study', 'session-1', 'owner-id'),
      queryKeys.recaps.list('family', 'owner-id', 'child-id'),
      queryKeys.retention.topic('topic-1', 'owner-id'),
      queryKeys.library.retention('owner-id'),
      queryKeys.library.conceptMastery('owner-id', ['topic-1']),
      queryKeys.languageProgress.subject('owner-id', 'subject-1'),
      queryKeys.vocabulary.subject('owner-id', 'subject-1'),
      queryKeys.resumeNudge.root('owner-id'),
      queryKeys.subscription('owner-id'),
      queryKeys.usage('owner-id'),
      queryKeys.subscriptionFamily('owner-id'),
      queryKeys.subscriptionStatus('owner-id'),
      queryKeys.profiles.active('owner-id'),
      queryKeys.settings.notifications('owner-id'),
      queryKeys.settings.celebrationLevel('owner-id'),
      queryKeys.settings.childCelebrationLevel('child-id', 'owner-id'),
      queryKeys.onboarding.learnerProfile('owner-id'),
      queryKeys.bookSessions('subject-1', 'book-1', 'owner-id'),
      queryKeys.topicSessions('subject-1', 'topic-1', 'owner-id'),
      queryKeys.subjectSessions('subject-1', 'owner-id'),
    ];
    const representativeScopedLiteralKeys: Array<readonly unknown[]> = [
      ['subjects', 'owner-id'],
      ['books', 'subject-1', 'owner-id'],
      ['book', 'subject-1', 'book-1', 'owner-id'],
      ['book-suggestions', 'subject-1'],
      ['bookmarks', 'owner-id'],
      ['session-bookmarks', 'owner-id', 'session-1'],
      ['all-notes', 'owner-id'],
      ['book-notes', 'book-1', 'owner-id'],
      ['topic-notes', 'topic-1', 'owner-id'],
      ['library-search', 'math', 'owner-id'],
      ['quiz-recent', 'owner-id'],
      ['quiz-stats', 'owner-id'],
      ['topic-suggestions', 'subject-1', 'owner-id'],
    ];
    const scopedPrefixes = new Set(
      [...profileScopedFactoryKeys, ...representativeScopedLiteralKeys].map(
        (key) => String(key[0]),
      ),
    );

    const profileScopedKeySet = new Set<string>(PROFILE_SCOPED_KEYS);
    const missingPrefixes = [...scopedPrefixes]
      .filter((prefix) => !profileScopedKeySet.has(prefix))
      .sort();

    expect(missingPrefixes).toEqual([]);
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
    jest
      .mocked(ExpoSecureStore.setItemAsync)
      .mockRejectedValueOnce(new Error('SecureStore unavailable'));
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

  it('[BREAK] keeps cached profiles usable when a background profile refetch fails', async () => {
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Server error' }), {
        status: 500,
      }),
    );

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['profiles'] });
    });

    expect(result.current.profiles).toEqual(mockProfiles);
    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(result.current.profileLoadError).toBeNull();
  });

  it('[BREAK] clears mentomate_parent_home_seen on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut(['owner-id']);
    const deletedKeys = jest
      .mocked(ExpoSecureStore.deleteItemAsync)
      .mock.calls.map((c) => c[0] as string);
    expect(deletedKeys).toContain('mentomate_parent_home_seen_owner-id');
  });
});

describe('useLinkedChildren', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(ExpoSecureStore.setItemAsync).mockResolvedValue(undefined);
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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue('child-id');
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
    expect(result.current.linked.map((p: Profile) => p.id)).toEqual([
      'child-newer-created',
      'child-older-created',
    ]);
  });
});

describe('useHasLinkedChildren', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(ExpoSecureStore.setItemAsync).mockResolvedValue(undefined);
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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue('child-id');
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
    jest.mocked(ExpoSecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(ExpoSecureStore.setItemAsync).mockResolvedValue(undefined);
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
    // [ACCOUNT-04] First switch into child via explicit proxy, then switch back.
    // Switching back to owner always clears proxy regardless of options.
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
    // Enter proxy explicitly (the confirm-modal path).
    await act(async () => {
      await result.current.profile.switchProfile('child-id', {
        proxyMode: true,
      });
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(true);
    expect(result.current.profile.isExplicitProxyMode).toBe(true);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    // Switch back to owner — proxy must be cleared.
    await act(async () => {
      await result.current.profile.switchProfile('owner-id');
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(false);
    expect(result.current.profile.isExplicitProxyMode).toBe(false);
    expect(result.current.profile.activeProfile?.id).toBe('owner-id');
    expect(result.current.linked).toHaveLength(1);
    expect(result.current.linked[0]!.id).toBe('child-id');
  });
});
