import AsyncStorage from '@react-native-async-storage/async-storage';
import { nowResponseSchema, type NowResponse } from '@eduagent/schemas';

import { Sentry } from './sentry';
import { NOW_FEED_CACHE_KEY_PREFIX as KEY_PREFIX } from './secure-store-keys';

export const NOW_FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * [WI-2498] Current mentor-notice policy version baked into the cache key.
 *
 * [WI-2504 EXTENSION POINT] The sibling item makes this a SERVER-AUTHORITATIVE
 * epoch (delivered on the response alongside the visibility decision, derived
 * from the same rollout + consent inputs as the server predicate V — see
 * apps/api/src/services/mentor-notices/visibility.ts) so a rollout flag-off
 * invalidates every persisted client projection. When it does: replace this
 * constant with the server-supplied value threaded into `NowFeedCacheBinding`
 * below, which is already part of the key. Do NOT add a second cache/policy
 * seam — this one exists to be extended.
 */
export const NOW_FEED_CACHE_POLICY_EPOCH = 'notice-policy-v1';

/**
 * [WI-2498] What a persisted Now-feed entry is bound to.
 *
 * Pre-WI-2498 the key was the selected `profileId` alone. That is not an actor
 * binding: a guardian selecting their child's profile and the child themselves
 * both resolve to the same key, so one actor's projection could be painted for
 * the other on a cold start. The key now carries the ACTOR (the authenticated
 * account identity) and the POLICY epoch as well.
 */
export type NowFeedCacheBinding = {
  /** Authenticated account identity (Clerk userId) — the ACTOR, not the subject. */
  actorId: string;
  /** Selected subject profile — the SUBJECT the projection is about. */
  profileId: string;
  /** Policy version; defaults to the constant above. See WI-2504 note. */
  policyEpoch?: string;
};

export function buildNowFeedCacheKey(binding: NowFeedCacheBinding): string {
  const epoch = binding.policyEpoch ?? NOW_FEED_CACHE_POLICY_EPOCH;
  return `${KEY_PREFIX}::${binding.actorId}::${binding.profileId}::${epoch}`;
}

/**
 * [WI-2498] Cards that carry mentor-notice evidence, across BOTH producing
 * server collectors: the open-notice card and the locked-in ledger moment.
 */
function isNoticeBearingCard(card: NowResponse['cards'][number]): boolean {
  if (card.kind === 'mentor_notice') return true;
  return (
    card.kind === 'ledger_moment' &&
    (card.params as { ledgerKind?: unknown } | undefined)?.ledgerKind ===
      'notice_locked_in'
  );
}

/**
 * [WI-2498] DEFENSE IN DEPTH ONLY. The server predicate V is the control: a
 * response reaching this client should already be notice-free whenever the
 * caller is not the subject. This strip exists so a stale build, a replayed
 * response, or a cache entry written before a policy change still cannot paint
 * notice evidence in a proxy session. Never rely on it as the boundary.
 */
export function stripNoticeCards(feed: NowResponse): NowResponse {
  const cards = feed.cards.filter((card) => !isNoticeBearingCard(card));
  if (cards.length === feed.cards.length) return feed;
  return { ...feed, cards };
}

export async function writeCachedNowFeed(
  binding: NowFeedCacheBinding,
  feed: NowResponse,
  options: { noticesVisible?: boolean } = {},
): Promise<void> {
  const payload =
    options.noticesVisible === false ? stripNoticeCards(feed) : feed;
  try {
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(binding),
      JSON.stringify(payload),
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'now_feed_cache', op: 'write' },
    });
  }
}

export async function readCachedNowFeed(
  binding: NowFeedCacheBinding,
  now = Date.now(),
  options: { noticesVisible?: boolean } = {},
): Promise<NowResponse | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(buildNowFeedCacheKey(binding));
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'now_feed_cache', op: 'read' },
    });
    return null;
  }

  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = nowResponseSchema.safeParse(parsed);
  if (!result.success) return null;

  const generatedAtMs = Date.parse(result.data.generatedAt);
  if (
    !Number.isFinite(generatedAtMs) ||
    now - generatedAtMs > NOW_FEED_CACHE_TTL_MS
  ) {
    return null;
  }

  return options.noticesVisible === false
    ? stripNoticeCards(result.data)
    : result.data;
}
