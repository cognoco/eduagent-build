import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiResponseShapeError,
  type NowOverflowResponse,
  type NowResponse,
} from '@eduagent/schemas';

import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import { NetworkError, setActiveProfileId } from '../lib/api-client';
import { buildNowFeedCacheKey, readCachedNowFeed } from '../lib/now-feed-cache';
import { resetMentorNoticePolicyStoreForTests } from '../lib/mentor-notice-policy';

import {
  useMentorNoticeActions,
  useNowFeed,
  useNowOverflow,
} from './use-now-feed';

// [WI-2498] useNowFeed now reads the authenticated actor id (Clerk userId) to
// bind the persisted Now-feed cache to actor+profile+policy. External-boundary
// mock (bare specifier), matching the pattern in use-subscription.test.ts.
// [WI-2933] The actor id is swappable so a test can drive the BOUND -> UNBOUND
// transition (sign-out / auth teardown) that the unbound suppression path
// depends on. Default is unchanged for every pre-existing test.
let mockActorId: string | null = 'wi2498-test-actor';
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({
    get userId() {
      return mockActorId;
    },
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 3_000,
    });
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
    // [WI-2933] The mentor-notice policy store is MODULE-level, so clearing
    // AsyncStorage alone does not isolate these tests from each other — a
    // hydrated Entry survives into the next test and its floor is still
    // consulted. This describe is the first here to depend on that store.
    resetMentorNoticePolicyStoreForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  // -------------------------------------------------------------------------
  // [WI-2933] The persisted projection must be judged against the DISABLE FLOOR
  // of the pair it was cached for — including after that pair goes unbound.
  //
  // `fallbackFeed` can only be POPULATED while bound, but it SURVIVES the pair
  // going unbound (sign-out, auth teardown) while the component stays mounted.
  // Once unbound, the suppression call took the unbound branch, which has no
  // storage key and therefore no stored floor to consult — so a projection whose
  // pair had been told the rollout is off painted anyway.
  //
  // The assertion is on what the surface EXPOSES, never on an internal field.
  //
  // LIMITATION — THESE TWO DO NOT DISCRIMINATE THE FIX, and saying so here
  // rather than in a report that outlives this file. Reverting the fix to
  // `policy.suppressed(undefined)` leaves both GREEN. The reason, measured: with
  // a disabling floor seeded, the BOUND render already strips the notice card
  // (`fallbackFeed` is `[]` before sign-out ever happens), so the unbound
  // judgement is never reached; with no floor, there is nothing to suppress.
  // They therefore lock in current behaviour but prove nothing about the unbound
  // path.
  //
  // RETENTION MECHANISM, measured rather than read (WI-2933 reachability run):
  // forcing a real re-render with `userId = null` gives
  // `fallbackFeed = null, isError = false` — so with the query NOT in an error
  // state the projection does NOT survive the unbind; the `if (!query.isError)`
  // branch above clears it. Retention therefore requires `query.isError`, which
  // is what the source reads. An earlier probe here appeared to show the feed
  // surviving; that probe never forced a re-render, so it was sampling the still
  // BOUND component and proved nothing.
  //
  // STILL UNMEASURED: the `isError: true` AND unbound combination. Once the pair
  // is unbound the query stops fetching, so this harness could not drive it into
  // an error state afterwards. That combination is the only surviving candidate
  // for a reachable unbound judgement, and it remains undemonstrated.
  // -------------------------------------------------------------------------
  it('[WI-2933] does not paint the cached notice surface after sign-out when the pair’s stored floor forbids it', async () => {
    await seedWarmNoticeCache();
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, ENABLED_EPOCH);
    // The pair's durable floor: told the rollout is OFF at revision 7.
    await AsyncStorage.setItem(
      `mentor-notice-policy-state::${CACHE_BINDING.actorId}::${CACHE_BINDING.profileId}`,
      '{"revision":7,"enabled":false,"observedDisableRevision":7}',
    );

    const { result, queryClient } = await renderSlowFallback();
    // Establish the exposure: the projection really is being served.
    await waitFor(() => expect(result.current.fallbackFeed).not.toBeNull());

    // Sign-out — the pair goes unbound while this component stays mounted.
    mockActorId = null;
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    // THE CRITERION: no notice-bearing card is exposed off that projection.
    expect(
      result.current.fallbackFeed?.cards.map((card) => card.kind) ?? [],
    ).not.toContain('mentor_notice');

    mockActorId = 'wi2498-test-actor';
    queryClient.clear();
  });

  // NON-TRIVIALITY CONTROL. Identical sign-out, identical cached projection —
  // but the pair has NO stored floor. It must STILL paint. Without this, the
  // assertion above passes on a remedy that blanks every observation-less
  // payload on every pre-auth render, which is the fleet-wide harm AC-2 forbids
  // and the reason this was not folded into WI-2911.
  it('[WI-2933] still paints the cached notice surface after sign-out when the pair has NO stored floor', async () => {
    await seedWarmNoticeCache();
    await AsyncStorage.setItem(OBSERVED_EPOCH_KEY, ENABLED_EPOCH);
    // Deliberately no mentor-notice-policy-state key for this pair.

    const { result, queryClient } = await renderSlowFallback();
    await waitFor(() => expect(result.current.fallbackFeed).not.toBeNull());

    mockActorId = null;
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(
      result.current.fallbackFeed?.cards.map((card) => card.kind) ?? [],
    ).toContain('mentor_notice');

    mockActorId = 'wi2498-test-actor';
    queryClient.clear();
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

// ---------------------------------------------------------------------------
// [WI-2504 bounce 2] The `placeholderData` epoch gate above (Finding 1) makes
// `query.data` come back undefined immediately after a re-key — but the
// slow-fallback effect's OTHER piece of exposed state, `fallbackFeed`, was
// never epoch-gated. If a fallback had already been populated from an OLDER
// epoch's cache entry, `data ?? fallbackFeed` (the pattern every consumer
// uses — see mentor.tsx's `useTransitionBoundFeed`) would keep exposing that
// stale, possibly notice-bearing feed for the whole window until — or
// unless — the re-keyed query's own cache read lands.
// ---------------------------------------------------------------------------
describe('useNowFeed — fallbackFeed must not survive an epoch re-key', () => {
  const DISABLED_EPOCH = 'notice-policy-v1:off';

  let originalFetch: typeof globalThis.fetch;

  function noticeFallback(): NowResponse {
    return feed({
      generatedAt: '2999-06-14T07:59:00.000Z',
      cards: [
        {
          kind: 'mentor_notice',
          templateKey: 'now.mentor_notice.default',
          params: {
            noticeId: '44444444-4444-4444-8444-444444444444',
            concept: 'sign flip',
          },
          deepLink: { route: 'notice.recheck', params: {}, chain: [] },
          scope: 'self',
        },
      ] as NowResponse['cards'],
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

  it('clears a stale bootstrap-epoch fallback once the re-keyed (disabled-epoch) query starts its own pending fetch', async () => {
    jest.useFakeTimers();
    try {
      // Seeded under the BOOTSTRAP epoch (no policyEpoch override) — the key
      // the first, un-observed fetch's slow-fallback read will use.
      await AsyncStorage.setItem(
        buildNowFeedCacheKey(CACHE_BINDING),
        JSON.stringify(noticeFallback()),
      );

      let nowCallCount = 0;
      let resolveFirstCall: (() => void) | undefined;
      globalThis.fetch = jest.fn(async () => {
        nowCallCount += 1;
        if (nowCallCount === 1) {
          // Held pending long enough to trigger the slow-fallback read,
          // then resolved later (by the test) with a body that observes a
          // DIFFERENT epoch — the trigger for the re-key.
          return new Promise<Response>((resolve) => {
            resolveFirstCall = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    ...feed(),
                    mentorNoticePolicyEpoch: DISABLED_EPOCH,
                  }),
                  { status: 200 },
                ),
              );
          });
        }
        // The re-keyed (DISABLED_EPOCH) query's own fetch — left pending so
        // the assertion below runs before it could supply real data.
        return new Promise<Response>(() => undefined);
      }) as unknown as typeof globalThis.fetch;

      const { queryClient, wrapper } = createHookWrapper();
      const nowFeedHook = renderHook(() => useNowFeed(), { wrapper });

      await waitFor(() =>
        expect(nowFeedHook.result.current.isFetching).toBe(true),
      );
      await act(async () => {
        jest.advanceTimersByTime(2_001);
        await Promise.resolve();
      });

      // Precondition: the stale-fallback source is real, not a no-op.
      await waitFor(() =>
        expect(nowFeedHook.result.current.isSlowFallback).toBe(true),
      );
      expect(
        nowFeedHook.result.current.fallbackFeed?.cards.some(
          (c) => c.kind === 'mentor_notice',
        ),
      ).toBe(true);

      // Resolve the first fetch — its response observes DISABLED_EPOCH,
      // re-keying the query to a brand-new, dataless, pending query.
      await act(async () => {
        resolveFirstCall?.();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Consumer-visible outcome (`data ?? fallbackFeed`): the re-keyed query
      // has no data of its own yet, and the fallback populated for the
      // now-superseded bootstrap epoch must not still be exposed.
      expect(nowFeedHook.result.current.data).toBeUndefined();
      expect(
        (nowFeedHook.result.current.fallbackFeed?.cards ?? []).some(
          (c) => c.kind === 'mentor_notice',
        ),
      ).toBe(false);

      queryClient.clear();
    } finally {
      jest.useRealTimers();
    }
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

  // [WI-2499 AC-3/AC-6 rework] The success cases above only prove the happy
  // path. The evidence gate (defer/recheck can only ever succeed on a
  // schema-valid server confirmation) is enforced by these three failure
  // modes rejecting rather than resolving. `mentor.tsx`'s catch block only
  // treats a `status === 409` error as authoritative-refetch-worthy, so the
  // conflict case must surface that status.
  it('rejects a notice re-check with a typed ConflictError on a 409 response', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'CONFLICT', message: 'Already resolved' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.recheck.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).rejects.toMatchObject({
      status: 409,
    });
    await waitFor(() =>
      expect(rendered.result.current.recheck.isError).toBe(true),
    );
    expect(rendered.result.current.recheck.isSuccess).toBe(false);

    queryClient.clear();
  });

  it('rejects a notice re-check when the request fails at the transport layer', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.recheck.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).rejects.toBeInstanceOf(NetworkError);
    await waitFor(() =>
      expect(rendered.result.current.recheck.isError).toBe(true),
    );
    expect(rendered.result.current.recheck.isSuccess).toBe(false);

    queryClient.clear();
  });

  it('rejects a notice re-check with ApiResponseShapeError when the response is schema-malformed', async () => {
    // A 200 whose body fails `mentorNoticeRecheckResponseSchema` (sessionId
    // must be a UUID) — the HTTP layer reports success but the body is not
    // trustworthy.
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'not-a-uuid' }), {
        status: 200,
      }),
    );
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.recheck.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).rejects.toBeInstanceOf(ApiResponseShapeError);
    await waitFor(() =>
      expect(rendered.result.current.recheck.isError).toBe(true),
    );
    expect(rendered.result.current.recheck.isSuccess).toBe(false);

    queryClient.clear();
  });

  it('rejects a notice defer with a typed ConflictError on a 409 response', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'CONFLICT', message: 'Already resolved' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.defer.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).rejects.toMatchObject({
      status: 409,
    });
    await waitFor(() =>
      expect(rendered.result.current.defer.isError).toBe(true),
    );
    expect(rendered.result.current.defer.isSuccess).toBe(false);

    queryClient.clear();
  });

  it('rejects a notice defer when the request fails at the transport layer', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    const { queryClient, wrapper } = createHookWrapper();
    const rendered = renderHook(() => useMentorNoticeActions(), { wrapper });

    await expect(
      rendered.result.current.defer.mutateAsync(
        '550e8400-e29b-41d4-a716-446655440002',
      ),
    ).rejects.toBeInstanceOf(NetworkError);
    await waitFor(() =>
      expect(rendered.result.current.defer.isError).toBe(true),
    );
    expect(rendered.result.current.defer.isSuccess).toBe(false);

    queryClient.clear();
  });

  it('rejects a notice defer with ApiResponseShapeError when the response is schema-malformed', async () => {
    // A 200 whose body fails `mentorNoticeDeferResponseSchema` (missing the
    // required `deferredAt`) — the HTTP layer reports success but the body
    // is not trustworthy.
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          noticeId: '550e8400-e29b-41d4-a716-446655440002',
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
    ).rejects.toBeInstanceOf(ApiResponseShapeError);
    await waitFor(() =>
      expect(rendered.result.current.defer.isError).toBe(true),
    );
    expect(rendered.result.current.defer.isSuccess).toBe(false);

    queryClient.clear();
  });
});

// ---------------------------------------------------------------------------
// [WI-2627] The ORDERED rollout observation on the Now-feed surfaces.
//
// Distinct from the WI-2504 epoch coverage above and deliberately not a
// replacement for it: the epoch is the opaque cache key (equality only), this is
// the order. The cases that only the order can express are the ones here — a
// payload arriving out of order, and a re-enable that must require a strictly
// higher revision.
// ---------------------------------------------------------------------------
describe('[WI-2627] orderable mentor-notice rollout observation', () => {
  const ACTOR = 'wi2498-test-actor';
  const PROFILE = 'test-profile-id';
  const POLICY_KEY = `mentor-notice-policy-state::${ACTOR}::${PROFILE}`;

  let mockFetch: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  function policy(revision: number, enabled: boolean) {
    return {
      rolloutRevision: revision,
      rolloutEnabled: enabled,
      projectionEpoch: `notice-policy-v1:r${revision}:${
        enabled ? 'on' : 'off'
      }:self:consented`,
    };
  }

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const NOTICE_CARD = {
    kind: 'mentor_notice',
    templateKey: 'now.mentor_notice.default',
    params: {
      noticeId: '11111111-1111-4111-8111-111111111111',
      concept: 'sign flip',
    },
    deepLink: { route: 'notice.recheck', params: {}, chain: [] },
    scope: 'self',
  };

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId(PROFILE);
    resetMentorNoticePolicyStoreForTests();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  describe('GET /now', () => {
    it('folds the observation it arrives with and paints the cards at that revision', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(7, true),
        }),
      );

      const { result } = renderHook(() => useNowFeed(), {
        wrapper: createHookWrapper().wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Positive control for the suppression tests below.
      expect(result.current.data?.cards.map((c) => c.kind)).toEqual([
        'mentor_notice',
      ]);
      await waitFor(async () =>
        expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
          '{"revision":7,"enabled":true}',
        ),
      );
    });

    // The case the epoch cannot express. The epoch is comparable for equality
    // only, so this response's cards would render on the strength of arriving
    // last.
    it('does not paint the cards of a response that PREDATES the rollback we know about', async () => {
      await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":false}');
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(6, true),
        }),
      );

      const { result } = renderHook(() => useNowFeed(), {
        wrapper: createHookWrapper().wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.cards).toEqual([]);
      // The fold refused it too: the stored revision did not regress to 6.
      await waitFor(async () =>
        expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
          '{"revision":7,"enabled":false}',
        ),
      );
    });

    it('does not persist the cards of a suppressed response, so the next cold start cannot read them back', async () => {
      await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":false}');
      // `mockImplementation`, not `mockResolvedValue`: this response carries an
      // epoch, which re-keys the query and fires a second fetch — and a Response
      // body is single-use, so a shared instance would fail the refetch.
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            scope: 'self',
            cards: [NOTICE_CARD],
            overflowCount: 0,
            generatedAt: FRESH_CACHE_TIMESTAMP,
            mentorNoticePolicyEpoch: 'notice-policy-v1:r7:off',
            mentorNoticePolicy: policy(7, false),
          }),
        ),
      );

      const { result } = renderHook(() => useNowFeed(), {
        wrapper: createHookWrapper().wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await waitFor(async () => {
        const persisted = await readCachedNowFeed(
          {
            actorId: ACTOR,
            profileId: PROFILE,
            policyEpoch: 'notice-policy-v1:r7:off',
          },
          Date.parse('2999-06-14T08:00:00.000Z'),
        );
        expect(persisted?.cards ?? []).toEqual([]);
      });
    });

    it('re-enables only on a STRICTLY HIGHER revision', async () => {
      await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":false}');
      // Same revision, enabled — refused, so the cards stay suppressed.
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(7, true),
        }),
      );

      const sameRevision = renderHook(() => useNowFeed(), {
        wrapper: createHookWrapper().wrapper,
      });
      await waitFor(() =>
        expect(sameRevision.result.current.isSuccess).toBe(true),
      );
      expect(sameRevision.result.current.data?.cards).toEqual([]);
      sameRevision.unmount();

      // A deploy bumps the revision. That, and only that, brings them back.
      resetMentorNoticePolicyStoreForTests();
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(8, true),
        }),
      );

      const higher = renderHook(() => useNowFeed(), {
        wrapper: createHookWrapper().wrapper,
      });
      await waitFor(() => expect(higher.result.current.isSuccess).toBe(true));
      await waitFor(() =>
        expect(higher.result.current.data?.cards.map((c) => c.kind)).toEqual([
          'mentor_notice',
        ]),
      );
    });
  });

  describe('GET /now/overflow — the deep-link surface', () => {
    const OVERFLOW_ITEM = {
      kind: 'mentor_notice',
      templateKey: 'now.mentor_notice.default',
      params: {
        noticeId: '11111111-1111-4111-8111-111111111111',
        concept: 'sign flip',
      },
      deepLink: { route: 'notice.recheck', params: {}, chain: [] },
      scope: 'self',
    };

    it('serves its notice-bearing items at the observed revision', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          items: [OVERFLOW_ITEM],
          mentorNoticePolicy: policy(7, true),
        }),
      );

      const { result } = renderHook(() => useNowOverflow(true), {
        wrapper: createHookWrapper().wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await waitFor(() =>
        expect(result.current.data?.items.map((i) => i.kind)).toEqual([
          'mentor_notice',
        ]),
      );
    });

    it('drops its notice-bearing items — and their notice deep links — once the rollout is off', async () => {
      await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":false}');
      mockFetch.mockResolvedValue(
        jsonResponse({
          scope: 'self',
          items: [OVERFLOW_ITEM],
          mentorNoticePolicy: policy(7, false),
        }),
      );

      const { result } = renderHook(() => useNowOverflow(true), {
        wrapper: createHookWrapper().wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await waitFor(() => expect(result.current.data?.items).toEqual([]));
    });
  });

  describe('recheck / defer mutations', () => {
    it('folds the observation a successful recheck echoes', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          mentorNoticePolicy: policy(9, false),
        }),
      );

      const { result } = renderHook(() => useMentorNoticeActions(), {
        wrapper: createHookWrapper().wrapper,
      });

      await act(async () => {
        await result.current.recheck.mutateAsync(
          '11111111-1111-4111-8111-111111111111',
        );
      });

      await waitFor(async () =>
        expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
          '{"revision":9,"enabled":false}',
        ),
      );
    });

    it('folds the observation a successful defer echoes', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          noticeId: '11111111-1111-4111-8111-111111111111',
          deferredAt: '2026-07-26T08:00:00.000Z',
          mentorNoticePolicy: policy(4, true),
        }),
      );

      const { result } = renderHook(() => useMentorNoticeActions(), {
        wrapper: createHookWrapper().wrapper,
      });

      await act(async () => {
        await result.current.defer.mutateAsync(
          '11111111-1111-4111-8111-111111111111',
        );
      });

      await waitFor(async () =>
        expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
          '{"revision":4,"enabled":true}',
        ),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-2627 rework] Two routes that never reached the reducer at all.
//
// Both defects live ABOVE the reducer, so a reducer-level test proves nothing
// about either: one is a response that fails schema validation before the fold
// runs, the other is a fold that runs a render too late.
// ---------------------------------------------------------------------------
describe('[WI-2627] the fold must be reachable, and must precede publication', () => {
  const ACTOR = 'wi2498-test-actor';
  const PROFILE = 'test-profile-id';
  const POLICY_KEY = `mentor-notice-policy-state::${ACTOR}::${PROFILE}`;

  let mockFetch: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  function policy(revision: number, enabled: boolean) {
    return {
      rolloutRevision: revision,
      rolloutEnabled: enabled,
      projectionEpoch: `notice-policy-v1:r${revision}:${
        enabled ? 'on' : 'off'
      }:self:consented`,
    };
  }

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const NOTICE_CARD = {
    kind: 'mentor_notice',
    templateKey: 'now.mentor_notice.default',
    params: {
      noticeId: '11111111-1111-4111-8111-111111111111',
      concept: 'sign flip',
    },
    deepLink: { route: 'notice.recheck', params: {}, chain: [] },
    scope: 'self',
  };

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId(PROFILE);
    resetMentorNoticePolicyStoreForTests();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  // [WI-2949] The DESCOPE, direction A: an unparseable response body that is
  // unrelated to mentor-notice policy must NOT suppress notices.
  //
  // WI-2627 stage 2 wired a fail-closed policy fold into the whole-body
  // parse-failure path of these surfaces. The failing field is not identifiable
  // without a
  // second read of a single-use body, so that call was over-broad BY
  // CONSTRUCTION: any unparseable /now body — a bad card, a bad count, anything —
  // silently suppressed mentor notices for that pair. No WI-2627 criterion asked
  // for that, and it is a behaviour change to an unrelated failure mode.
  //
  // These two tests drive a REAL parse failure whose cause has nothing to do with
  // policy (`overflowCount: -1`, `scope: 'not-a-scope'`), with a perfectly valid
  // policy field alongside, and assert the retained notices STILL RENDER.
  it('keeps notices visible when the /now body fails to parse for an unrelated reason', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(7, true),
        }),
      ),
    );

    const { result } = renderHook(() => useNowFeed(), {
      wrapper: createHookWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.cards.map((c) => c.kind)).toEqual([
      'mentor_notice',
    ]);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
        '{"revision":7,"enabled":true}',
      ),
    );

    // Refetch fails the schema on `overflowCount`, NOT on policy — the policy
    // field is valid and unchanged.
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: -1,
          generatedAt: FRESH_CACHE_TIMESTAMP,
          mentorNoticePolicy: policy(7, true),
        }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    // Establish the retention rather than assume it: the query really is in an
    // error state and really is still holding the prior page.
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeDefined();
    // THE CRITERION: the unrelated failure did not blank the notice.
    expect(result.current.data?.cards.map((c) => c.kind)).toEqual([
      'mentor_notice',
    ]);
    // ...and the store was not moved by a failure that told it nothing.
    expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
      '{"revision":7,"enabled":true}',
    );
  });

  it('keeps overflow notices visible when the body fails to parse for an unrelated reason', async () => {
    const OVERFLOW_NOTICE_ITEM = {
      kind: 'mentor_notice',
      templateKey: 'now.mentor_notice.default',
      params: {
        noticeId: '11111111-1111-4111-8111-111111111111',
        concept: 'sign flip',
      },
      deepLink: { route: 'notice.recheck', params: {}, chain: [] },
      scope: 'self',
    };

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'self',
          items: [OVERFLOW_NOTICE_ITEM],
          mentorNoticePolicy: policy(7, true),
        }),
      ),
    );

    const { result } = renderHook(() => useNowOverflow(true), {
      wrapper: createHookWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.map((item) => item.kind)).toEqual([
      'mentor_notice',
    ]);

    // Refetch fails the schema on `scope`, NOT on policy. This is the surface
    // whose failure path ran through `useApiQuery`'s `onParseError` seam; the
    // seam itself stays (it is generic and has other potential consumers), only
    // the mentor-notice call is gone.
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'not-a-scope',
          items: [OVERFLOW_NOTICE_ITEM],
          mentorNoticePolicy: policy(7, true),
        }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.items.map((item) => item.kind)).toEqual([
      'mentor_notice',
    ]);
    expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
      '{"revision":7,"enabled":true}',
    );
  });

  // [WI-2949] Direction A's near neighbour, kept explicit because collapsing the
  // two is how a reviewer could read this change as relaxing the real
  // fail-closed path: an ABSENT policy field is "nothing was observed", not
  // "something arrived and cannot be trusted". WI-2627 ruled it keeps current
  // state — treating absence as a disable would blank notices fleet-wide the
  // moment a pre-field worker answered. Unchanged by this item.
  it('keeps notices visible when the body carries NO policy field at all', async () => {
    await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":true}');
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'self',
          cards: [NOTICE_CARD],
          overflowCount: 0,
          generatedAt: FRESH_CACHE_TIMESTAMP,
        }),
      ),
    );

    const { result } = renderHook(() => useNowFeed(), {
      wrapper: createHookWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.cards.map((c) => c.kind)).toEqual([
      'mentor_notice',
    ]);
    expect(await AsyncStorage.getItem(POLICY_KEY)).toBe(
      '{"revision":7,"enabled":true}',
    );
  });

  // "It is correct after the effect" IS the bug, so this asserts on every
  // COMMITTED render rather than on eventual state.
  it('never publishes a rollback-bearing overflow payload — not even for one frame', async () => {
    await AsyncStorage.setItem(POLICY_KEY, '{"revision":7,"enabled":true}');
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          scope: 'self',
          items: [
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
          ],
          // The response that carries the rollback.
          mentorNoticePolicy: policy(8, false),
        }),
      ),
    );

    // Record what each committed render exposed. The pre-fix code published one
    // render with the notice items intact — judged non-stale against the
    // still-enabled store — before the effect's fold forced a second render.
    const committed: (string[] | undefined)[] = [];
    const { result } = renderHook(
      () => {
        const query = useNowOverflow(true);
        committed.push(query.data?.items.map((item) => item.kind));
        return query;
      },
      { wrapper: createHookWrapper().wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.data?.items).toEqual([]));

    // No committed render may ever have carried the notice item or its deep link.
    expect(
      committed.filter((items) => items?.includes('mentor_notice')),
    ).toEqual([]);
    // Positive control: renders with data really did occur, so the assertion
    // above is not passing because nothing was ever published.
    expect(committed.some((items) => Array.isArray(items))).toBe(true);
  });
});
