import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NowOverflowResponse, NowResponse } from '@eduagent/schemas';

import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { buildNowFeedCacheKey, readCachedNowFeed } from '../lib/now-feed-cache';

import {
  useMentorNoticeActions,
  useNowFeed,
  useNowOverflow,
} from './use-now-feed';

// [WI-2498] useNowFeed now reads the authenticated actor id (Clerk userId) to
// bind the persisted Now-feed cache to actor+profile+policy. External-boundary
// mock (bare specifier), matching the pattern in use-subscription.test.ts.
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({
    userId: 'wi2498-test-actor',
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
}));

// [WI-2498] The Now-feed cache is bound to actor+profile+policy, not profile
// alone. The actor id here matches the @clerk/expo mock above.
const CACHE_BINDING = {
  actorId: 'wi2498-test-actor',
  profileId: 'test-profile-id',
};

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
    await expect(readCachedNowFeed(CACHE_BINDING)).resolves.toEqual(value);

    queryClient.clear();
  });

  it('surfaces a rejected request as query error without throwing from render', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockRejectedValue(new Error('offline'));
      const { queryClient, wrapper } = createHookWrapper();

      const { result } = renderHook(() => useNowFeed(), { wrapper });

      await waitFor(() => expect(result.current.isFetching).toBe(true));
      await act(async () => {
        // Cross the final retry boundary so React Query can publish the error.
        await jest.advanceTimersByTimeAsync(7_501);
      });
      expect(result.current.isError).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(5);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.fallbackFeed).toBeNull();

      queryClient.clear();
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes a cached feed after the live request stays pending for 2 seconds', async () => {
    jest.useFakeTimers();
    const cached = feed({ generatedAt: '2999-06-14T07:59:00.000Z' });
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(CACHE_BINDING),
      JSON.stringify(cached),
    );
    mockFetch.mockReturnValue(new Promise(() => undefined));
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    // [WI-2504] The query now waits for the stored policy observation to
    // hydrate before it fetches, so the slow-fallback timer must be advanced
    // after that, not before.
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    await act(async () => {
      jest.advanceTimersByTime(2_001);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.fallbackFeed).toEqual(cached));
    expect(result.current.isSlowFallback).toBe(true);

    queryClient.clear();
    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// [WI-2504] Observed flag-off must remove the WARM CACHED surface.
//
// Named red: a device that has already observed the disabled policy still
// paints the mentor-notice card it cached while the flag was on. Before this
// item the persisted entry was keyed on a CLIENT constant
// (`notice-policy-v1`), so nothing the server said could reach it; the
// response field carrying the epoch was simply stripped by
// `nowResponseSchema` and the slow-fallback read hit the same key as before.
//
// The tests below drive only the public hook + AsyncStorage, and express the
// observation as a RAW storage write, so the identical bodies run against
// unmodified main (where that key is read by nothing).
//
// NON-VACUITY: the disabled and enabled cases seed byte-identical storage and
// differ ONLY in the observed epoch value. The enabled case is the positive
// control — it proves this harness does produce a rendered notice-bearing
// fallback, so the disabled case's absence is a real consequence of the
// policy, not of an empty or unreadable cache. Both cases also assert the
// seeded entry is readable BEFORE rendering.
// ---------------------------------------------------------------------------
describe('useNowFeed — observed mentor-notice policy epoch', () => {
  const DISABLED_EPOCH = 'notice-policy-v1:off';
  const ENABLED_EPOCH = 'notice-policy-v1:on:self:consented';
  const OBSERVED_EPOCH_KEY = `now-feed-policy-epoch::${CACHE_BINDING.actorId}::${CACHE_BINDING.profileId}`;

  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  function noticeFeed(): NowResponse {
    return feed({
      generatedAt: '2999-06-14T07:59:00.000Z',
      cards: [
        {
          kind: 'mentor_notice',
          templateKey: 'now.mentor_notice.default',
          params: {
            noticeId: '11111111-1111-4111-8111-111111111111',
            concept: 'sign flip',
          },
          deepLink: { route: 'notice.recheck', params: {}, chain: [] },
          scope: 'self',
        },
      ] as NowResponse['cards'],
    });
  }

  /**
   * Warm cache written while the policy was ENABLED. Seeded under both the
   * enabled-epoch key and the pre-WI-2504 constant key, so the entry is
   * reachable by whichever key the code under test decides to build.
   */
  async function seedWarmNoticeCache(): Promise<NowResponse> {
    const cached = noticeFeed();
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(CACHE_BINDING),
      JSON.stringify(cached),
    );
    await AsyncStorage.setItem(
      buildNowFeedCacheKey({ ...CACHE_BINDING, policyEpoch: ENABLED_EPOCH }),
      JSON.stringify(cached),
    );
    return cached;
  }

  async function renderSlowFallback(): Promise<{
    result: { current: ReturnType<typeof useNowFeed> };
    queryClient: ReturnType<typeof createHookWrapper>['queryClient'];
  }> {
    // The live request never resolves: this is the offline / slow-network
    // path, the only one that paints from the persisted projection.
    mockFetch.mockReturnValue(new Promise(() => undefined));
    const { queryClient, wrapper } = createHookWrapper();
    const { result } = renderHook(() => useNowFeed(), { wrapper });
    // The query is gated on the stored observation being hydrated, so
    // `isFetching` is the signal that the epoch is in hand and the fallback
    // timer will build its key from the right one.
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    await act(async () => {
      jest.advanceTimersByTime(2_001);
      await Promise.resolve();
    });
    return { result, queryClient };
  }

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId(CACHE_BINDING.profileId);
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('does not paint a warm cached notice surface after the client observed flag-off', async () => {
    const cached = await seedWarmNoticeCache();
    // Precondition — the seeded entry really is readable and really does
    // carry a notice card. Without this the assertion below could pass on an
    // empty or unparseable cache.
    await expect(
      readCachedNowFeed(
        { ...CACHE_BINDING, policyEpoch: ENABLED_EPOCH },
        Date.parse('2999-06-14T08:00:00.000Z'),
      ),
    ).resolves.toEqual(cached);
    // The observation: this device has already been told the policy is off.
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, DISABLED_EPOCH);

    const { result, queryClient } = await renderSlowFallback();

    // Consumer-visible outcome: nothing notice-bearing is offered to render.
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.fallbackFeed).toBeNull();
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  // POSITIVE CONTROL — identical seeding, enabled observation.
  it('still paints the warm cached notice surface while the observed policy is enabled', async () => {
    const cached = await seedWarmNoticeCache();
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, ENABLED_EPOCH);

    const { result, queryClient } = await renderSlowFallback();

    await waitFor(() => expect(result.current.fallbackFeed).toEqual(cached));
    expect(result.current.fallbackFeed?.cards.map((card) => card.kind)).toEqual(
      ['mentor_notice'],
    );
    expect(result.current.isSlowFallback).toBe(true);

    queryClient.clear();
  });

  // The acceptance criteria's offline nuance: a device that has never observed
  // a policy change is NOT claimed to know one. It keeps serving what it
  // legitimately cached.
  it('serves its cache when it has never observed any epoch', async () => {
    const cached = await seedWarmNoticeCache();

    const { result, queryClient } = await renderSlowFallback();

    await waitFor(() => expect(result.current.fallbackFeed).toEqual(cached));

    queryClient.clear();
  });

  it('records a newly observed epoch and drops the projection cached under the previous one', async () => {
    // A resolving request, so no slow-fallback timer is involved.
    jest.useRealTimers();
    await seedWarmNoticeCache();
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, ENABLED_EPOCH);
    const disabledResponse = {
      ...feed(),
      mentorNoticePolicyEpoch: DISABLED_EPOCH,
    };
    // Fresh Response per call: observing a new epoch re-keys the query, so the
    // hook fetches again and a single Response body would already be consumed.
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify(disabledResponse), { status: 200 }),
    );
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(OBSERVED_EPOCH_KEY)).toBe(
        DISABLED_EPOCH,
      ),
    );
    // The entry written under the enabled epoch is gone, so a later re-enable
    // cannot resurrect a pre-rollback projection from inside the 24h TTL.
    await expect(
      readCachedNowFeed(
        { ...CACHE_BINDING, policyEpoch: ENABLED_EPOCH },
        Date.parse('2999-06-14T08:00:00.000Z'),
      ),
    ).resolves.toBeNull();

    queryClient.clear();
  });
});

// ---------------------------------------------------------------------------
// [WI-2504 rework] One observed disabled-epoch must invalidate ALL
// concurrently-mounted mentor-notice surfaces, not just the hook instance
// whose own fetch happened to observe it.
//
// Named red: `useNowFeed` and `useNowOverflow` are mounted together on the
// Mentor screen. Each previously called `useObservedPolicyEpoch` with its OWN
// `useState`, so only the instance whose fetch resolved a new epoch updated
// its own query key. The sibling kept its prior (enabled) epoch in its own
// hook-local state and so kept its warm, notice-bearing query-cache entry —
// nothing ever told it the policy had gone away.
// ---------------------------------------------------------------------------
describe('useNowFeed + useNowOverflow — shared observed epoch across concurrent hooks', () => {
  const ENABLED_EPOCH = 'notice-policy-v1:on:self:consented';
  const DISABLED_EPOCH = 'notice-policy-v1:off';
  const OBSERVED_EPOCH_KEY = `now-feed-policy-epoch::${CACHE_BINDING.actorId}::${CACHE_BINDING.profileId}`;

  let originalFetch: typeof globalThis.fetch;

  function noticeOverflowResponse(epoch: string): NowOverflowResponse {
    return overflow({
      items: [
        {
          kind: 'mentor_notice',
          templateKey: 'now.mentor_notice.default',
          params: {
            noticeId: '22222222-2222-4222-8222-222222222222',
            concept: 'sign flip',
          },
          deepLink: { route: 'notice.recheck', params: {}, chain: [] },
          scope: 'self',
        },
      ] as NowOverflowResponse['items'],
      mentorNoticePolicyEpoch: epoch,
    });
  }

  function noticeNowResponse(epoch: string): NowResponse {
    return feed({
      cards: [
        {
          kind: 'mentor_notice',
          templateKey: 'now.mentor_notice.default',
          params: {
            noticeId: '33333333-3333-4333-8333-333333333333',
            concept: 'sign flip',
          },
          deepLink: { route: 'notice.recheck', params: {}, chain: [] },
          scope: 'self',
        },
      ] as NowResponse['cards'],
      mentorNoticePolicyEpoch: epoch,
    });
  }

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    setActiveProfileId(CACHE_BINDING.profileId);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('drops the sibling surface’s warm notice-bearing overflow entry the moment the OTHER hook observes a disabled epoch', async () => {
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, ENABLED_EPOCH);

    let overflowCallCount = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/now/overflow')) {
        overflowCallCount += 1;
        // First call warms the surface under the ENABLED epoch. Any later
        // call (the re-key this fix must trigger) gets a clean response —
        // proving a genuine re-fetch under the new epoch, not a stale read.
        const body =
          overflowCallCount === 1
            ? noticeOverflowResponse(ENABLED_EPOCH)
            : overflow({ mentorNoticePolicyEpoch: DISABLED_EPOCH });
        return new Response(JSON.stringify(body), { status: 200 });
      }
      if (url.includes('/now')) {
        // The now-feed fetch is the one whose response tells the client the
        // policy just went to disabled.
        return new Response(
          JSON.stringify({
            ...feed(),
            mentorNoticePolicyEpoch: DISABLED_EPOCH,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const { queryClient, wrapper } = createHookWrapper();

    // Mount the overflow surface first and let it warm up while the observed
    // epoch is still ENABLED — this is the concurrently-mounted sibling that
    // never itself observes the disable.
    const overflowHook = renderHook(() => useNowOverflow(true), { wrapper });
    await waitFor(() =>
      expect(overflowHook.result.current.isSuccess).toBe(true),
    );
    expect(
      overflowHook.result.current.data?.items.map((item) => item.kind),
    ).toEqual(['mentor_notice']);

    // Mount the now-feed surface. ITS fetch is the one that observes the
    // disabled epoch.
    const nowFeedHook = renderHook(() => useNowFeed(), { wrapper });
    await waitFor(() =>
      expect(nowFeedHook.result.current.isSuccess).toBe(true),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(OBSERVED_EPOCH_KEY)).toBe(
        DISABLED_EPOCH,
      ),
    );

    // Consumer-visible outcome: the OTHER hook, which never fetched on its
    // own, no longer exposes the notice-bearing overflow entry it had warm.
    await waitFor(() =>
      expect(
        overflowHook.result.current.data?.items.some(
          (item) => item.kind === 'mentor_notice',
        ),
      ).toBe(false),
    );

    queryClient.clear();
  });

  // [WI-2504 bounce 2] `useNowFeed` only ever observes epoch changes from ITS
  // OWN fetch (the sole writer of the shared observation — see
  // `useObservedPolicyEpoch` above), so the leak this reproduces is a
  // SECOND fetch of an ALREADY-SETTLED query that observes a new epoch: the
  // settled query keeps its OLD (notice-bearing) `data` visible while that
  // very fetch is in flight (ordinary React Query refetch behavior) — and
  // when it resolves, `observe()` fires and re-keys the query BEFORE this
  // fetch's own new (non-notice) data commits to the OLD key. The freshly
  // mounted re-keyed query has no data of its own yet, so
  // `placeholderData: keepPreviousData` would paint the OLD key's
  // still-notice-bearing `data` for the whole window the re-keyed query's
  // own fetch is pending, even though nothing has told the client the
  // notice is still valid under the new (disabled) epoch.
  it("does not expose a stale ENABLED-epoch notice card while the re-keyed query's own fetch is pending after a later same-hook fetch observes a disabled epoch", async () => {
    let nowCallCount = 0;
    let resolveFourthCall: (() => void) | undefined;
    globalThis.fetch = jest.fn(async () => {
      nowCallCount += 1;
      if (nowCallCount === 1 || nowCallCount === 2) {
        // Call 1 (bootstrap key) observes ENABLED_EPOCH and re-keys to it;
        // call 2 (now under the ENABLED_EPOCH key) settles that query with
        // notice-bearing data — this is the warm, stable state before
        // anything observes a disable.
        return new Response(JSON.stringify(noticeNowResponse(ENABLED_EPOCH)), {
          status: 200,
        });
      }
      if (nowCallCount === 3) {
        // A later refetch of the SAME (still ENABLED_EPOCH-keyed) query
        // that now observes the disabled epoch and re-keys again.
        return new Response(
          JSON.stringify({
            ...feed(),
            mentorNoticePolicyEpoch: DISABLED_EPOCH,
          }),
          { status: 200 },
        );
      }
      // The re-keyed (DISABLED_EPOCH) query's own fetch. Held pending so
      // the assertion below runs during the exact window a leaking
      // placeholder would expose the ENABLED_EPOCH key's stale notice card.
      return new Promise<Response>((resolve) => {
        resolveFourthCall = () =>
          resolve(new Response(JSON.stringify(feed()), { status: 200 }));
      });
    }) as unknown as typeof globalThis.fetch;

    const { queryClient, wrapper } = createHookWrapper();
    const nowFeedHook = renderHook(() => useNowFeed(), { wrapper });

    // The warm, settled state: 2 calls in, notice-bearing, under ENABLED_EPOCH.
    await waitFor(() =>
      expect(nowFeedHook.result.current.isSuccess).toBe(true),
    );
    expect(nowCallCount).toBe(2);
    expect(nowFeedHook.result.current.data?.cards.map((c) => c.kind)).toEqual([
      'mentor_notice',
    ]);

    // Force the 3rd fetch — the one that observes the disabled epoch.
    act(() => {
      void nowFeedHook.result.current.refetch();
    });
    await waitFor(() => expect(nowCallCount).toBe(4));

    // Consumer-visible outcome: while the re-keyed (DISABLED_EPOCH) query's
    // own fetch is pending, the hook must not still paint the notice card
    // from the now-superseded ENABLED_EPOCH key.
    expect(
      nowFeedHook.result.current.data?.cards.some(
        (c) => c.kind === 'mentor_notice',
      ),
    ).not.toBe(true);

    resolveFourthCall?.();
    await waitFor(() =>
      expect(nowFeedHook.result.current.isSuccess).toBe(true),
    );

    queryClient.clear();
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
});
