import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NowOverflowResponse, NowResponse } from '@eduagent/schemas';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { buildNowFeedCacheKey, readCachedNowFeed } from '../lib/now-feed-cache';
import {
  nowFeedQueryKey,
  useMentorNoticeActions,
  useNowFeed,
  useNowOverflow,
} from './use-now-feed';

const FRESH_CACHE_TIMESTAMP = '2999-06-14T08:00:00.000Z';

function feed(overrides: Partial<NowResponse> = {}): NowResponse {
  return {
    scope: 'self',
    cards: [],
    overflowCount: 0,
    generatedAt: FRESH_CACHE_TIMESTAMP,
    ...overrides,
  };
}

function overflow(
  overrides: Partial<NowOverflowResponse> = {},
): NowOverflowResponse {
  return {
    scope: 'self',
    items: [],
    ...overrides,
  };
}

describe('nowFeedQueryKey', () => {
  it('constructs one exact profile-scoped key for feed reads and invalidation', () => {
    expect(nowFeedQueryKey('profile-a')).toEqual(['now-feed', 'profile-a']);
    expect(nowFeedQueryKey('profile-b')).toEqual(['now-feed', 'profile-b']);
  });

  it('rejects unresolved profile IDs at the exact invalidation boundary', () => {
    // @ts-expect-error Exact invalidation keys require a resolved profile.
    expect(() => nowFeedQueryKey(undefined)).toThrow(
      'nowFeedQueryKey requires a profile ID',
    );
  });
});

describe('useNowFeed', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    jest.useRealTimers();
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId('test-profile-id');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('returns the parsed feed and mirrors it into the profile-scoped cache', async () => {
    const value = feed();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(value), { status: 200 }),
    );
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(value);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('/v1/now');
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('scope=self');
    await expect(readCachedNowFeed('test-profile-id')).resolves.toEqual(value);

    queryClient.clear();
  });

  it('[WI-2234] does not expose profile A cards while profile B feed is pending', async () => {
    const profileA = createTestProfile({ id: 'profile-a' });
    const profileB = createTestProfile({ id: 'profile-b' });
    const profileAFeed = feed({
      cards: [
        {
          kind: 'retention_due',
          templateKey: 'now.retention_due.profile-a',
          params: { topicTitle: 'Profile A topic' },
          deepLink: {
            route: 'retention.review',
            params: {},
            chain: [],
          },
          scope: 'self',
        },
      ],
    });
    const profileBFeed = feed();
    let resolveProfileBRequest!: (response: Response) => void;
    const profileBRequest = new Promise<Response>((resolve) => {
      resolveProfileBRequest = resolve;
    });
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(profileAFeed), { status: 200 }),
      )
      .mockReturnValueOnce(profileBRequest);
    const { queryClient, wrapper, profileContextValue } = createHookWrapper({
      activeProfile: profileA,
      profiles: [profileA, profileB],
    });

    const { result, rerender, unmount } = renderHook(() => useNowFeed(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(profileAFeed));

    act(() => {
      profileContextValue.activeProfile = profileB;
      setActiveProfileId(profileB.id);
      rerender(undefined);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    expect(result.current.fallbackFeed).toBeNull();

    await act(async () => {
      resolveProfileBRequest(
        new Response(JSON.stringify(profileBFeed), { status: 200 }),
      );
    });
    await waitFor(() => expect(result.current.data).toEqual(profileBFeed));

    unmount();
    queryClient.clear();
  });

  it('surfaces a rejected request as query error without throwing from render', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.fallbackFeed).toBeNull();

    queryClient.clear();
  });

  it('exposes a cached feed after the live request stays pending for 2 seconds', async () => {
    jest.useFakeTimers();
    const cached = feed({ generatedAt: '2999-06-14T07:59:00.000Z' });
    await AsyncStorage.setItem(
      buildNowFeedCacheKey('test-profile-id'),
      JSON.stringify(cached),
    );
    mockFetch.mockReturnValue(new Promise(() => undefined));
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(2_001);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.fallbackFeed).toEqual(cached));
    expect(result.current.isSlowFallback).toBe(true);

    queryClient.clear();
    jest.useRealTimers();
  });

  it('[WI-2234] does not expose profile A cached fallback while profile B feed is pending', async () => {
    jest.useFakeTimers();
    const profileA = createTestProfile({ id: 'profile-a' });
    const profileB = createTestProfile({ id: 'profile-b' });
    const profileACachedFeed = feed({
      generatedAt: '2999-06-14T07:59:00.000Z',
      cards: [
        {
          kind: 'retention_due',
          templateKey: 'now.retention_due.profile-a-cache',
          params: { topicTitle: 'Profile A cached topic' },
          deepLink: {
            route: 'retention.review',
            params: {},
            chain: [],
          },
          scope: 'self',
        },
      ],
    });
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(profileA.id),
      JSON.stringify(profileACachedFeed),
    );
    let resolveProfileARequest!: (response: Response) => void;
    let resolveProfileBRequest!: (response: Response) => void;
    const profileARequest = new Promise<Response>((resolve) => {
      resolveProfileARequest = resolve;
    });
    const profileBRequest = new Promise<Response>((resolve) => {
      resolveProfileBRequest = resolve;
    });
    mockFetch
      .mockReturnValueOnce(profileARequest)
      .mockReturnValueOnce(profileBRequest);
    const { queryClient, wrapper, profileContextValue } = createHookWrapper({
      activeProfile: profileA,
      profiles: [profileA, profileB],
    });

    const { result, rerender, unmount } = renderHook(() => useNowFeed(), {
      wrapper,
    });

    await act(async () => {
      jest.advanceTimersByTime(2_001);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.fallbackFeed).toEqual(profileACachedFeed),
    );
    expect(result.current.isSlowFallback).toBe(true);

    act(() => {
      profileContextValue.activeProfile = profileB;
      setActiveProfileId(profileB.id);
      rerender(undefined);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(result.current.fallbackFeed).toBeNull();
    expect(result.current.isSlowFallback).toBe(false);

    await act(async () => {
      resolveProfileARequest(
        new Response(JSON.stringify(feed()), { status: 200 }),
      );
      resolveProfileBRequest(
        new Response(JSON.stringify(feed()), { status: 200 }),
      );
    });
    await waitFor(() => expect(result.current.data).toEqual(feed()));

    unmount();
    queryClient.clear();
    jest.useRealTimers();
  });
});

describe('useNowOverflow', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId('test-profile-id');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('stays idle until enabled, then returns parsed overflow rows', async () => {
    const value = overflow();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(value), { status: 200 }),
    );
    const { queryClient, wrapper } = createHookWrapper();

    const disabled = renderHook(() => useNowOverflow(false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
    disabled.unmount();

    const enabled = renderHook(() => useNowOverflow(true), { wrapper });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(enabled.result.current.data).toEqual(value);

    queryClient.clear();
  });
});

describe('useMentorNoticeActions', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId('test-profile-id');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('starts a notice re-check through the typed action endpoint', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: '550e8400-e29b-41d4-a716-446655440001',
        }),
        { status: 200 },
      ),
    );
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.recheck.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).resolves.toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      '/mentor-notices/550e8400-e29b-41d4-a716-446655440002/recheck',
    );

    queryClient.clear();
  });

  it('defers a notice through the typed action endpoint', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          noticeId: '550e8400-e29b-41d4-a716-446655440002',
          deferredAt: '2026-07-19T12:00:00.000Z',
        }),
        { status: 200 },
      ),
    );
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.defer.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).resolves.toEqual({
      noticeId: '550e8400-e29b-41d4-a716-446655440002',
      deferredAt: '2026-07-19T12:00:00.000Z',
    });
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      '/mentor-notices/550e8400-e29b-41d4-a716-446655440002/defer',
    );

    queryClient.clear();
  });

  it('does not invalidate an unscoped feed when no profile is active', async () => {
    const { queryClient, wrapper } = createHookWrapper({
      activeProfile: null,
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await rendered.result.current.invalidate();

    expect(invalidateSpy).not.toHaveBeenCalled();
    queryClient.clear();
  });
});
