import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  nowOverflowResponseSchema,
  nowResponseSchema,
  type NowOverflowResponse,
  type NowResponse,
  mentorNoticeDeferResponseSchema,
  mentorNoticeRecheckResponseSchema,
} from '@eduagent/schemas';

import { useAuth } from '@clerk/expo';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import {
  NOW_FEED_CACHE_POLICY_EPOCH,
  observePolicyEpoch,
  readCachedNowFeed,
  readObservedPolicyEpoch,
  stripNoticeCards,
  stripNoticeOverflowItems,
  writeCachedNowFeed,
} from '../lib/now-feed-cache';
import {
  mentorNoticePolicySuppressesPayloadFor,
  useMentorNoticePolicy,
} from '../lib/mentor-notice-policy';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';
import { queryKeys } from '../lib/query-keys';

const NOW_FEED_STALE_TIME_MS = 30_000;
const NOW_FEED_SLOW_FALLBACK_MS = 2_000;

export type NowFeedQueryResult = UseQueryResult<NowResponse> & {
  fallbackFeed: NowResponse | null;
  isSlowFallback: boolean;
  // [WI-2504 bounce 2] The policy epoch THIS hook observed as of its latest
  // render, so a consumer that starts an async action (e.g. a mentor-notice
  // recheck) can compare it against the epoch observed once that action
  // resolves, and refuse to act on a result that outlived the epoch it
  // started under.
  observedEpoch: string;
};

/**
 * [WI-2504] Query key the observed epoch is stored under, shared across every
 * hook instance for the same (actor, profile) pair.
 */
function observedPolicyEpochQueryKey(actorId: string, profileId: string) {
  return ['now-feed-observed-policy-epoch', actorId, profileId] as const;
}

/**
 * [WI-2504] The mentor-notice policy epoch this device last OBSERVED for
 * (actor, profile), hydrated from storage.
 *
 * `hydrated` is the ordering guarantee the acceptance criteria depend on:
 * nothing may build a cache key or read a projection until the stored
 * observation is back, or a cold offline launch would key under the bootstrap
 * epoch and serve a feed the device has already been told is void.
 *
 * [WI-2504 rework] Backed by the shared QueryClient cache rather than
 * hook-local `useState`. `useNowFeed`, `useNowOverflow`, and
 * `useSessionSummary` mount concurrently (the Mentor screen renders
 * `useNowFeed` + `useNowOverflow` together) and each previously held its OWN
 * copy of the observed epoch: one instance's fetch could `observe()` a
 * disabled epoch while sibling instances kept their prior enabled epoch and
 * the warm data keyed under it. Reading/writing through
 * `queryClient`'s cache for the same (actor, profile) query key means every
 * mounted consumer shares one observation — `observe()` from any one of them
 * invalidates the epoch for all of them atomically.
 *
 * Exported for `useSessionSummary` (hooks/use-sessions.ts), whose response
 * carries the notice RECEIPT. It is the same seam — one server epoch, one
 * stored observation — reused, not a second policy source.
 */
export function useObservedPolicyEpoch(
  actorId: string | null | undefined,
  profileId: string | undefined,
): {
  epoch: string;
  hydrated: boolean;
  observe: (next: string) => void;
} {
  const queryClient = useQueryClient();
  const canHydrate = !!actorId && !!profileId;

  const epochQuery = useQuery({
    // Actor/profile switch changes the key, so a new pair re-hydrates its OWN
    // observation from storage rather than inheriting the previous pair's.
    queryKey: canHydrate
      ? observedPolicyEpochQueryKey(actorId, profileId)
      : (['now-feed-observed-policy-epoch', 'unbound'] as const),
    queryFn: () =>
      readObservedPolicyEpoch(actorId as string, profileId as string),
    enabled: canHydrate,
    // No staleTime override: a fresh mount (e.g. the app was foregrounded
    // after storage changed out from under it) must re-read storage rather
    // than trust a query-cache entry that could be stale for THIS mount.
    // `observe()` still reaches every currently-mounted subscriber instantly
    // via `setQueryData`, independent of staleTime.
  });

  const observe = useMemo(
    () => (next: string) => {
      if (!canHydrate) return;
      queryClient.setQueryData(
        observedPolicyEpochQueryKey(actorId, profileId),
        next,
      );
    },
    [queryClient, canHydrate, actorId, profileId],
  );

  return {
    // No stored observation -> the bootstrap epoch, i.e. "this device has not
    // been told anything", never "policy disabled".
    epoch: (canHydrate ? epochQuery.data : null) ?? NOW_FEED_CACHE_POLICY_EPOCH,
    // Nothing to hydrate FROM when actor/profile is missing — report hydrated
    // so callers that gate on it are not blocked while auth resolves; the
    // cache binding stays null regardless, so no projection is read or
    // written under a guessed key.
    // `isFetching` also gates hydration: a fresh mount whose cached epoch is
    // stale (default staleTime) fires a background re-read, and consumers
    // must not build a cache key or query off that soon-to-be-stale value —
    // wait for the re-read to land, same as the very first hydration.
    hydrated: canHydrate
      ? epochQuery.isFetched && !epochQuery.isFetching
      : true,
    observe,
  };
}

export function useNowFeed(): NowFeedQueryResult {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  // [WI-2498] Proxy state is read through the navigation contract, not from
  // raw profile state — the contract is the single sanctioned reader of
  // owner/proxy/mode (navigation-contract-usage-guard.test.ts). The data-scope
  // variant is the one the other cache/query-scope hooks use (use-sessions,
  // use-dashboard, use-progress-scope): it skips the subscription query this
  // hook has no use for. `contract.isParentProxy` is a straight pass-through of
  // the same explicit-proxy flag, flag-state independent.
  const navigationContract = useNavigationDataScopeContract();
  const profileId = activeProfile?.id;
  const {
    epoch: observedEpoch,
    hydrated: epochHydrated,
    observe,
  } = useObservedPolicyEpoch(userId, profileId);
  // [WI-2627] Ordering, alongside the epoch's invalidation. Two seams because
  // they answer two questions — see lib/mentor-notice-policy.ts.
  const policy = useMentorNoticePolicy(userId, profileId);

  // [WI-2498] Cache entries are actor/profile/policy-bound, so one actor's
  // projection can never be rehydrated for another. Server-side V remains the
  // control; `noticesVisible` below is defense in depth only.
  // [WI-2504] ...and policy-bound now means bound to the OBSERVED server epoch,
  // not a client constant.
  const cacheBinding = useMemo(
    () =>
      userId && profileId && epochHydrated
        ? { actorId: userId, profileId, policyEpoch: observedEpoch }
        : null,
    [userId, profileId, epochHydrated, observedEpoch],
  );
  // The fetch that observes a new epoch may resolve after this render, so the
  // query function reads the binding through a ref rather than a stale closure.
  const cacheBindingRef = useRef(cacheBinding);
  cacheBindingRef.current = cacheBinding;
  const noticesVisible = !navigationContract.isParentProxy;
  // [WI-2933 re-open] The projection and the pair it was populated FOR are
  // written in one `setState`, never separately — see the effect below. This
  // makes "a feed exists whose `pair` doesn't match who cached it" a type
  // that cannot be constructed, not a sequencing rule two writes have to
  // honour. The previous shape (`fallbackFeed` state + a `fallbackPairRef`
  // reassigned during render from `cacheBinding`) is exactly what Gate-2
  // rejected: the ref tracked "whatever pair is bound RIGHT NOW", which can
  // legitimately be a DIFFERENT pair than the one that populated the still-
  // retained `fallbackFeed`, for one render, on a bound A -> B transition
  // (React commits before the cleanup effect clears A's retained feed).
  const [fallbackEntry, setFallbackEntry] = useState<{
    feed: NowResponse;
    pair: NonNullable<typeof cacheBinding>;
  } | null>(null);
  const [isSlowFallback, setIsSlowFallback] = useState(false);
  // [WI-2504 bounce 2] The epoch `fallbackFeed` was last populated (or
  // cleared) for — lets the effect below tell "still the same pending fetch"
  // from "the query key's epoch just changed out from under it".
  const fallbackEpochRef = useRef<string | null>(null);

  const query = useQuery({
    // [WI-2498] Keyed by actor AND subject: the in-memory cache must not be
    // shared across actors selecting the same profile.
    // [WI-2504] ...and by the observed epoch, so the warm in-memory projection
    // is dropped at the same moment the persisted one becomes unreachable.
    queryKey: queryKeys.now.feed(userId, profileId, observedEpoch),
    queryFn: async ({ signal: querySignal }): Promise<NowResponse> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.now.$get(
          { query: { scope: 'self' } },
          { init: { signal } },
        );
        const okRes = await assertOk(res);
        const data = await parseJson(okRes, nowResponseSchema, 'GET /now');
        // [WI-2627] This response is also the ORDERED observation. Fold it
        // before the cache write below, so a response that carries a rollback
        // is not persisted with its own notice cards intact.
        policy.observe(data.mentorNoticePolicy);
        const noticesAllowed = !policy.suppressed(data.mentorNoticePolicy);
        const binding = cacheBindingRef.current;
        if (binding) {
          // [WI-2504] This response IS the observation. An absent epoch means
          // the server told us nothing about policy (older worker), so the
          // previous observation stands — a device is never credited with
          // knowing a change it did not receive.
          const previousEpoch = binding.policyEpoch;
          const epoch = data.mentorNoticePolicyEpoch ?? previousEpoch;
          if (epoch !== previousEpoch) {
            await observePolicyEpoch(
              binding.actorId,
              binding.profileId,
              epoch,
              previousEpoch,
            );
            observe(epoch);
          }
          void writeCachedNowFeed({ ...binding, policyEpoch: epoch }, data, {
            // [WI-2627] `noticesVisible` was the proxy strip alone; a payload
            // the policy suppresses must not be persisted with its cards
            // either, or the next cold start reads them straight back.
            noticesVisible: noticesVisible && noticesAllowed,
          });
        }
        return data;
      } finally {
        cleanup();
      }
    },
    // [WI-2504] Wait for the stored observation so the first fetch already
    // carries the right key — otherwise every cold start would fetch twice.
    enabled: !!profileId && epochHydrated,
    staleTime: NOW_FEED_STALE_TIME_MS,
    // [WI-2504 bounce 2] `keepPreviousData` must not carry a query's data
    // across an epoch re-key. `observedEpoch` can change between renders —
    // from this hook's own fetch observing a new epoch, or from any other
    // consumer sharing the same observation (see `useObservedPolicyEpoch`
    // above) — re-keying THIS query while a settled query for the OLD epoch
    // still holds its (possibly notice-bearing) data. Plain
    // `keepPreviousData` would paint that old query's data for the whole
    // window the re-keyed query's own fetch is pending. Only reuse the
    // placeholder when the previous query was fetched under the SAME
    // observed epoch as now; otherwise expose no data until the new epoch's
    // fetch resolves.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[3] === observedEpoch ? previousData : undefined,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!cacheBinding || !query.isFetching || query.data) {
      setIsSlowFallback(false);
      if (!query.isError) {
        setFallbackEntry(null);
      }
      fallbackEpochRef.current = null;
      return undefined;
    }

    // [WI-2504 bounce 2] A fallback populated for a PREVIOUS epoch must not
    // survive into a re-keyed query's pending window: this branch runs
    // whenever `query.data` is absent, which is now also true immediately
    // after an epoch re-key (the freshly mounted query has no data of its
    // own yet — see the `placeholderData` epoch gate above). Without this,
    // `data ?? fallbackFeed` could keep exposing the OLD epoch's (possibly
    // notice-bearing) cached feed until — or unless — this fetch's own cache
    // read lands.
    if (fallbackEpochRef.current !== cacheBinding.policyEpoch) {
      setFallbackEntry(null);
      setIsSlowFallback(false);
      fallbackEpochRef.current = cacheBinding.policyEpoch ?? null;
    }

    // [WI-2933 re-open] `cacheBinding` is captured by this closure at the
    // moment the effect ran (it is the effect's own dependency), so it is
    // GUARANTEED to be the same pair `readCachedNowFeed` below reads for —
    // there is no later render that can move it out from under this
    // callback. Writing `{ feed, pair: cacheBinding }` in the SAME
    // `setFallbackEntry` call is what makes the two agree by construction:
    // there is no second write (a ref reassigned during render, elsewhere)
    // that can race ahead of or fall behind this one.
    let cancelled = false;
    const timer = setTimeout(() => {
      void readCachedNowFeed(cacheBinding, Date.now(), {
        noticesVisible,
      }).then((cached) => {
        if (cancelled || !cached) return;
        setFallbackEntry({ feed: cached, pair: cacheBinding });
        setIsSlowFallback(true);
      });
    }, NOW_FEED_SLOW_FALLBACK_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    cacheBinding,
    noticesVisible,
    query.data,
    query.isError,
    query.isFetching,
  ]);

  // [WI-2627] Bind each payload to the observation it arrived with, then apply
  // the policy. Three distinct suppressions, all through the one store:
  //   - `query.data` — the live response, suppressed if IT is stale (a reply
  //     that left the server at revision 6 landing after the client learned
  //     revision 7 carries pre-rollback cards; the fold correctly ignores its
  //     observation and does nothing about its cards);
  //   - `fallbackEntry.feed` — the persisted projection, which carries NO
  //     observation of its own, so it is suppressed purely on stored policy
  //     state for the pair it was CACHED FOR. This is the cached-resurrection
  //     case the store exists for;
  //   - and both re-evaluate on any store change, because a sibling surface
  //     observing a disable must blank this one too.
  const noticeSafeData = useMemo(() => {
    if (!query.data) return query.data;
    return policy.suppressed(query.data.mentorNoticePolicy)
      ? stripNoticeCards(query.data)
      : query.data;
  }, [query.data, policy]);

  // [WI-2933] Judge the persisted projection against the floor of the pair it
  // was CACHED FOR, not against whatever pair happens to be bound at render.
  //
  // `fallbackEntry` can only ever be populated while BOUND — the effect above
  // returns early without a `cacheBinding`, and the write that populates it
  // always carries the pair alongside the feed (see the effect). Whether it
  // SURVIVES the pair going unbound (sign-out, auth teardown, profile
  // cleared) is CONDITIONAL, and that condition is the whole reachability
  // question: the same early-return branch clears it unless `query.isError`,
  // so retention past an unbind requires the query to be in an error state.
  // Measured (WI-2933 reachability run): forcing a real re-render with a null
  // user gives `fallbackEntry = null, isError = false` — with no error the
  // projection does not survive.
  //
  // Because `fallbackEntry.pair` is written atomically with `.feed`, "a
  // retained feed judged against a DIFFERENT pair's floor" is not a state
  // this hook can be in — there is no code path that can update one half
  // without the other, so `fallbackPair ? ... : policy.suppressed(undefined)`
  // (a defensive branch for "feed present but its pair unknown") no longer
  // has a reachable `else`: whenever `fallbackEntry` exists, `.pair` exists
  // with it, by construction. The `isError: true` AND unbound combination is
  // still unmeasured (once the pair is unbound the query stops fetching, so
  // the harness could not drive it into an error state afterwards) — but on
  // that combination `fallbackEntry.pair` is still the pair that ACTUALLY
  // populated the retained feed, so the floor it is judged against is correct
  // by construction rather than merely plausible.
  //
  // A device that has NEVER been bound has no cached projection to paint and
  // no floor to consult (`fallbackEntry` is `null`), so it keeps today's
  // permissive default and nothing is blanked fleet-wide (AC-2).
  const noticeSafeFallback = useMemo(() => {
    if (!fallbackEntry) return null;
    const { feed, pair } = fallbackEntry;
    const suppressed = mentorNoticePolicySuppressesPayloadFor(
      pair.actorId,
      pair.profileId,
      undefined,
    );
    return suppressed ? stripNoticeCards(feed) : feed;
    // `policy` is not read in the body — `mentorNoticePolicySuppressesPayloadFor`
    // reads the store directly for `pair` — but it must stay a dependency: it is
    // the reactivity signal that ANY pair's store entry changed (a sibling
    // surface observing a disable), which this memo must re-run on to blank a
    // stale retained projection. See the `[WI-2627]` comment above.
    // Tracked deferral, NOT a sanctioned suppression: WI-2984 owns retiring
    // every react-hooks/exhaustive-deps suppression in this app, this site
    // included. The fix is to make the dependency legible to the rule (pass the
    // store value into the helper rather than having the helper read it), which
    // is disproportionate inside this pair-binding fix and would touch a
    // safety-adjacent path without its own regression coverage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackEntry, policy]);

  // The cast is the `UseQueryResult` discriminated union, not a type escape:
  // overriding `data` on a spread widens it to `NowResponse | undefined`, which
  // no longer narrows against the success/pending members. `noticeSafeData` is
  // `undefined` exactly when `query.data` is, so the runtime shape is unchanged.
  return {
    ...query,
    data: noticeSafeData,
    fallbackFeed: noticeSafeFallback,
    isSlowFallback,
    observedEpoch,
  } as NowFeedQueryResult;
}

export function useMentorNoticeActions() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  const issuedForProfileId = activeProfile?.id;
  // [WI-2627] Recheck and defer echo the observation on SUCCESS. A learner who
  // acts on a notice mid-rollback must not have that success applied under a
  // policy state the client has since superseded.
  const policy = useMentorNoticePolicy(userId, issuedForProfileId);

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['now-feed', userId, issuedForProfileId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['now-overflow', userId, issuedForProfileId],
      }),
    ]);
  };

  const recheck = useMutation({
    mutationFn: async (noticeId: string) => {
      const response = await client['mentor-notices'][
        ':noticeId'
      ].recheck.$post({ param: { noticeId } });
      const ok = await assertOk(response);
      const result = await parseJson(
        ok,
        mentorNoticeRecheckResponseSchema,
        'POST /mentor-notices/:noticeId/recheck',
      );
      policy.observe(result.mentorNoticePolicy);
      return result;
    },
    onSuccess: invalidate,
  });
  const defer = useMutation({
    mutationFn: async (noticeId: string) => {
      const response = await client['mentor-notices'][':noticeId'].defer.$post({
        param: { noticeId },
      });
      const ok = await assertOk(response);
      const result = await parseJson(
        ok,
        mentorNoticeDeferResponseSchema,
        'POST /mentor-notices/:noticeId/defer',
      );
      policy.observe(result.mentorNoticePolicy);
      return result;
    },
    onSuccess: invalidate,
  });

  return { recheck, defer, invalidate };
}

export function useNowOverflow(
  enabled: boolean,
): UseQueryResult<NowOverflowResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { userId } = useAuth();
  const profileId = activeProfile?.id;
  // [WI-2504] The overflow page is not persisted, but it IS a notice-bearing
  // surface that can sit warm in memory across a flag-off. Binding its key to
  // the same observed epoch drops it at the moment the feed's projection dies,
  // so the overflow list cannot outlive the policy the client observed.
  const { epoch: observedEpoch, hydrated: epochHydrated } =
    useObservedPolicyEpoch(userId, profileId);
  const policy = useMentorNoticePolicy(userId, profileId);

  const query = useApiQuery({
    // [WI-2498] Actor-bound, matching the now-feed key above.
    queryKey: queryKeys.now.overflow(userId, profileId, observedEpoch),
    enabled: enabled && epochHydrated,
    schema: nowOverflowResponseSchema,
    fetch: (signal) =>
      client.now.overflow.$get(
        { query: { scope: 'self' } },
        { init: { signal } },
      ),
    // [WI-2627] The fold happens HERE, not in an effect. `useApiQuery` runs
    // `select` inside the query fn, i.e. BEFORE the query publishes — which is
    // the only place a fold can sit without the surface painting a frame first.
    //
    // In an effect it was too late: the preceding committed render evaluated
    // `policy.suppressed(observation)` against the still-enabled store, judged
    // the newer payload non-stale, and handed its notice items and their
    // notice.recheck deep links to NowCardStack; they disappeared only once the
    // effect forced another render. A rollback-bearing response therefore
    // painted for one frame, which is precisely the exposure the emergency
    // rollback boundary exists to prevent. `useNowFeed` folds in its query fn
    // for the same reason.
    //
    // The STRIP stays outside `select` — baked into the cache entry it would
    // never re-evaluate when a sibling surface observes a disable, and it is
    // what blanks data the query RETAINED across a failed refetch.
    select: (json) => {
      policy.observe(json.mentorNoticePolicy);
      return json;
    },
  });

  const observation = query.data?.mentorNoticePolicy;

  const noticeSafeData = useMemo(() => {
    if (!query.data) return query.data;
    return policy.suppressed(observation)
      ? stripNoticeOverflowItems(query.data)
      : query.data;
  }, [query.data, observation, policy]);

  return {
    ...query,
    data: noticeSafeData,
  } as UseQueryResult<NowOverflowResponse>;
}
