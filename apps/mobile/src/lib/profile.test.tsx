import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PublicProfile } from '@eduagent/schemas';
import * as ExpoSecureStore from 'expo-secure-store';
import {
  ProfileProvider,
  useProfile,
  useLinkedChildren,
  useHasLinkedChildren,
  PROFILE_SCOPED_KEYS,
} from './profile';
import {
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { queryKeys } from './query-keys';

// ./secure-storage uses real implementation: expo-secure-store is globally mocked
// in test-setup.ts with an in-memory store. We control behavior via ExpoSecureStore fns directly.

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'clerk-user-test' }),
}));

const mockFetch = jest.fn();
const OWNER_PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const USER_A_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const NEWER_CHILD_PROFILE_ID = '44444444-4444-4444-8444-444444444444';
const OLDER_CHILD_PROFILE_ID = '55555555-5555-4555-8555-555555555555';

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

const mockProfiles: PublicProfile[] = [
  {
    id: OWNER_PROFILE_ID,
    displayName: 'Parent',
    avatarUrl: null,
    birthYear: 1990,
    birthMonth: null,
    birthDay: null,
    location: null,
    isOwner: true,
    hasPremiumLlm: false,
    hasFamilyLinks: false,
    defaultAppContext: null,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    linkCreatedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: CHILD_PROFILE_ID,
    displayName: 'Alex',
    avatarUrl: null,
    birthYear: 2012,
    birthMonth: null,
    birthDay: null,
    location: null,
    isOwner: false,
    hasPremiumLlm: false,
    hasFamilyLinks: false,
    defaultAppContext: null,
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
    expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(result.current.activeProfile?.displayName).toBe('Parent');
  });

  it('restores active profile from SecureStore', async () => {
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockResolvedValue(CHILD_PROFILE_ID);
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.activeProfile?.id).toBe(CHILD_PROFILE_ID);
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
    expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      OWNER_PROFILE_ID,
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
    expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      OWNER_PROFILE_ID,
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
    expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    const pushedIds = (pushProfileIdToApiClient as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    expect(pushedIds).not.toContain('userA-profile-id');
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      OWNER_PROFILE_ID,
    );
  });

  it('[BREAK] cache leak: stale [profiles] cache from previous user does not leak profile id to api-client', async () => {
    const userAProfiles: PublicProfile[] = [
      {
        ...mockProfiles[0]!,
        id: USER_A_PROFILE_ID,
        displayName: 'Previous User',
      },
    ];
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockImplementation((key: string) =>
        Promise.resolve(
          key === 'mentomate_active_profile_id' ? USER_A_PROFILE_ID : null,
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
    expect(result.current.activeProfile?.id).not.toBe(USER_A_PROFILE_ID);
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ profiles: mockProfiles }), {
          status: 200,
        }),
      );
    });
    await waitFor(() => {
      expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    });
    const pushedIds = (pushProfileIdToApiClient as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    expect(pushedIds).not.toContain(USER_A_PROFILE_ID);
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
      await result.current.switchProfile(CHILD_PROFILE_ID);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      CHILD_PROFILE_ID,
    );
    expect(result.current.activeProfile?.id).toBe(CHILD_PROFILE_ID);
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
      await result.current.switchProfile(CHILD_PROFILE_ID);
    });
    const profilePushCalls = pushProfileIdToApiClient as jest.Mock;
    const proxyPushCalls = setProxyMode as jest.Mock;
    const childProfilePushIndex = profilePushCalls.mock.calls.findIndex(
      (call) => call[0] === CHILD_PROFILE_ID,
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
    expect(pushProfileIdToApiClient).toHaveBeenLastCalledWith(CHILD_PROFILE_ID);
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
      await result.current.switchProfile(CHILD_PROFILE_ID, { proxyMode: true });
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
      {
        key: ['subjects', OWNER_PROFILE_ID],
        value: [{ id: 's1', name: 'Math' }],
      },
      {
        key: ['progress', 'overview', OWNER_PROFILE_ID],
        value: { subjects: [] },
      },
      { key: ['dashboard'], value: { children: [] } },
      {
        key: ['books', 'subject-1', OWNER_PROFILE_ID],
        value: [{ id: 'book-1' }],
      },
      {
        key: ['book', 'subject-1', 'book-1', OWNER_PROFILE_ID],
        value: { id: 'book-1' },
      },
      {
        key: ['book-suggestions', 'subject-1'],
        value: [{ id: 'suggestion-1' }],
      },
      {
        key: ['book-sessions', 'subject-1', 'book-1', OWNER_PROFILE_ID],
        value: [],
      },
      { key: ['bookmarks', OWNER_PROFILE_ID], value: [{ id: 'bookmark-1' }] },
      {
        key: ['session-bookmarks', OWNER_PROFILE_ID, 'session-1'],
        value: [{ id: 'bookmark-1' }],
      },
      { key: ['session-summary', 'session-1', OWNER_PROFILE_ID], value: {} },
      { key: ['all-notes', OWNER_PROFILE_ID], value: [{ id: 'note-1' }] },
      {
        key: ['book-notes', 'book-1', OWNER_PROFILE_ID],
        value: [{ id: 'note-1' }],
      },
      {
        key: ['topic-notes', 'topic-1', OWNER_PROFILE_ID],
        value: [{ id: 'note-1' }],
      },
      { key: ['library', OWNER_PROFILE_ID], value: { subjects: [] } },
      {
        key: ['library-search', 'math', OWNER_PROFILE_ID],
        value: { results: [] },
      },
      {
        key: ['learner-profile', OWNER_PROFILE_ID],
        value: { accommodationMode: 'none' },
      },
      { key: ['language-progress', OWNER_PROFILE_ID], value: { words: [] } },
      {
        key: ['vocabulary', OWNER_PROFILE_ID, 'subject-1'],
        value: [{ id: 'word-1' }],
      },
      { key: ['quiz-recent', OWNER_PROFILE_ID], value: [] },
      { key: ['quiz-stats', OWNER_PROFILE_ID], value: { rounds: 1 } },
      { key: ['subject-sessions', 'subject-1', OWNER_PROFILE_ID], value: [] },
      { key: ['topic-suggestions', 'subject-1', OWNER_PROFILE_ID], value: [] },
      {
        key: ['resume-nudge', OWNER_PROFILE_ID],
        value: { topicId: 'topic-1' },
      },
    ];
    for (const { key, value } of profileScopedQueries) {
      queryClient.setQueryData(key, value);
    }
    for (const { key } of profileScopedQueries) {
      expect(queryClient.getQueryData(key)).toBeTruthy();
    }
    await act(async () => {
      await result.current.switchProfile(CHILD_PROFILE_ID);
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
      queryKeys.progress.overview('study', OWNER_PROFILE_ID),
      queryKeys.progress.subject('study', 'subject-1', OWNER_PROFILE_ID),
      queryKeys.progress.resumeTarget('study', OWNER_PROFILE_ID, {
        subjectId: 'subject-1',
      }),
      queryKeys.dashboard.root('family', OWNER_PROFILE_ID),
      queryKeys.dashboard.childDetail('family', CHILD_PROFILE_ID),
      queryKeys.sessions.detail('study', 'session-1', OWNER_PROFILE_ID),
      queryKeys.sessions.transcript('study', 'session-1', OWNER_PROFILE_ID),
      queryKeys.sessions.summary('study', 'session-1', OWNER_PROFILE_ID),
      queryKeys.sessions.parkingLot('study', 'session-1', OWNER_PROFILE_ID),
      queryKeys.recaps.list('family', OWNER_PROFILE_ID, CHILD_PROFILE_ID),
      queryKeys.retention.topic('topic-1', OWNER_PROFILE_ID),
      queryKeys.library.retention(OWNER_PROFILE_ID),
      queryKeys.library.conceptMastery(OWNER_PROFILE_ID, ['topic-1']),
      queryKeys.languageProgress.subject(OWNER_PROFILE_ID, 'subject-1'),
      queryKeys.vocabulary.subject(OWNER_PROFILE_ID, 'subject-1'),
      queryKeys.resumeNudge.root(OWNER_PROFILE_ID),
      queryKeys.subscription(OWNER_PROFILE_ID),
      queryKeys.usage(OWNER_PROFILE_ID),
      queryKeys.subscriptionFamily(OWNER_PROFILE_ID),
      queryKeys.subscriptionStatus(OWNER_PROFILE_ID),
      queryKeys.profiles.active(OWNER_PROFILE_ID),
      queryKeys.settings.notifications(OWNER_PROFILE_ID),
      queryKeys.settings.celebrationLevel(OWNER_PROFILE_ID),
      queryKeys.settings.childCelebrationLevel(
        CHILD_PROFILE_ID,
        OWNER_PROFILE_ID,
      ),
      queryKeys.onboarding.learnerProfile(OWNER_PROFILE_ID),
      queryKeys.bookSessions('subject-1', 'book-1', OWNER_PROFILE_ID),
      queryKeys.topicSessions('subject-1', 'topic-1', OWNER_PROFILE_ID),
      queryKeys.subjectSessions('subject-1', OWNER_PROFILE_ID),
    ];
    const representativeScopedLiteralKeys: Array<readonly unknown[]> = [
      ['subjects', OWNER_PROFILE_ID],
      ['books', 'subject-1', OWNER_PROFILE_ID],
      ['book', 'subject-1', 'book-1', OWNER_PROFILE_ID],
      ['book-suggestions', 'subject-1'],
      ['bookmarks', OWNER_PROFILE_ID],
      ['session-bookmarks', OWNER_PROFILE_ID, 'session-1'],
      ['all-notes', OWNER_PROFILE_ID],
      ['book-notes', 'book-1', OWNER_PROFILE_ID],
      ['topic-notes', 'topic-1', OWNER_PROFILE_ID],
      ['library-search', 'math', OWNER_PROFILE_ID],
      ['quiz-recent', OWNER_PROFILE_ID],
      ['quiz-stats', OWNER_PROFILE_ID],
      ['topic-suggestions', 'subject-1', OWNER_PROFILE_ID],
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
      switchResult = await result.current.switchProfile(CHILD_PROFILE_ID);
    });
    expect(switchResult).toEqual({ success: true, persistenceFailed: true });
    expect(result.current.activeProfile?.id).toBe(CHILD_PROFILE_ID);
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
    expect(result.current.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(result.current.profileLoadError).toBeNull();
  });

  it('[BREAK] clears mentomate_parent_home_seen on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut([OWNER_PROFILE_ID]);
    const deletedKeys = jest
      .mocked(ExpoSecureStore.deleteItemAsync)
      .mock.calls.map((c) => c[0] as string);
    expect(deletedKeys).toContain(
      `mentomate_parent_home_seen_${OWNER_PROFILE_ID}`,
    );
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
    expect(result.current.profile.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(result.current.linked).toHaveLength(1);
    expect(result.current.linked[0]!.id).toBe(CHILD_PROFILE_ID);
  });

  it('returns empty when active profile is not an owner', async () => {
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockResolvedValue(CHILD_PROFILE_ID);
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
    expect(result.current.profile.activeProfile?.id).toBe(CHILD_PROFILE_ID);
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
    const threeProfiles: PublicProfile[] = [
      mockProfiles[0]!,
      {
        ...mockProfiles[1]!,
        id: NEWER_CHILD_PROFILE_ID,
        displayName: 'Beta',
        createdAt: '2026-01-10T00:00:00Z',
        linkCreatedAt: '2026-01-02T00:00:00Z',
      },
      {
        ...mockProfiles[1]!,
        id: OLDER_CHILD_PROFILE_ID,
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
    expect(result.current.linked.map((p: PublicProfile) => p.id)).toEqual([
      NEWER_CHILD_PROFILE_ID,
      OLDER_CHILD_PROFILE_ID,
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
    jest
      .mocked(ExpoSecureStore.getItemAsync)
      .mockResolvedValue(CHILD_PROFILE_ID);
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
      await result.current.profile.switchProfile(CHILD_PROFILE_ID);
    });
    expect(result.current.profile.activeProfile?.id).toBe(CHILD_PROFILE_ID);
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
      await result.current.profile.switchProfile(CHILD_PROFILE_ID, {
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
      await result.current.profile.switchProfile(OWNER_PROFILE_ID);
    });
    expect(setProxyMode).toHaveBeenLastCalledWith(false);
    expect(result.current.profile.isExplicitProxyMode).toBe(false);
    expect(result.current.profile.activeProfile?.id).toBe(OWNER_PROFILE_ID);
    expect(result.current.linked).toHaveLength(1);
    expect(result.current.linked[0]!.id).toBe(CHILD_PROFILE_ID);
  });
});
