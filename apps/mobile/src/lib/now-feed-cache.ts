import AsyncStorage from '@react-native-async-storage/async-storage';
import { nowResponseSchema, type NowResponse } from '@eduagent/schemas';

import { Sentry } from './sentry';
import {
  NOW_FEED_CACHE_KEY_PREFIX as KEY_PREFIX,
  NOW_FEED_POLICY_EPOCH_KEY_PREFIX as EPOCH_KEY_PREFIX,
} from './secure-store-keys';

export const NOW_FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * [WI-2498, extended WI-2504] Bootstrap epoch — the value used ONLY while this
 * device has never observed a server epoch (fresh install, or an entry written
 * by a build predating `mentorNoticePolicyEpoch` on the wire).
 *
 * It is deliberately NOT any value the server emits, so a never-observed device
 * can never collide with an observed policy state. Once `/now` delivers an
 * epoch the observed value takes over — see `readObservedPolicyEpoch`.
 */
export const NOW_FEED_CACHE_POLICY_EPOCH = 'notice-policy-v1';

function policyEpochKey(actorId: string, profileId: string): string {
  return `${EPOCH_KEY_PREFIX}::${actorId}::${profileId}`;
}

/**
 * [WI-2504] The epoch this device last OBSERVED for (actor, profile), or null
 * if it has never observed one.
 *
 * `null` means "no observation", NOT "policy disabled" — a device that has been
 * offline since before a remote flag change has observed nothing and must keep
 * serving what it legitimately cached. That is why the caller falls back to the
 * bootstrap epoch rather than to a disabled one.
 */
export async function readObservedPolicyEpoch(
  actorId: string,
  profileId: string,
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(policyEpochKey(actorId, profileId));
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'now_feed_cache', op: 'epoch_read' },
    });
    return null;
  }
}

/**
 * [WI-2504] Record a newly observed epoch and drop the projection persisted
 * under the previous one.
 *
 * The key change alone already makes the old entry unreachable, which is what
 * stops it rendering. The delete closes the RE-ENABLE hole: without it, a
 * flag-off followed by a re-enable within the 24h TTL would restore the old key
 * and resurrect a pre-rollback feed whose notices may no longer be eligible.
 * Deleting keeps re-enable "only records still eligible under current policy" —
 * a fresh server read — while the server's own rows stay untouched.
 */
export async function observePolicyEpoch(
  actorId: string,
  profileId: string,
  epoch: string,
  previousEpoch: string,
): Promise<void> {
  if (previousEpoch === epoch) return;
  try {
    await AsyncStorage.removeItem(
      buildNowFeedCacheKey({ actorId, profileId, policyEpoch: previousEpoch }),
    );
    await AsyncStorage.setItem(policyEpochKey(actorId, profileId), epoch);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'now_feed_cache', op: 'epoch_write' },
    });
  }
}

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
  /**
   * [WI-2504] The server epoch this device last OBSERVED, or the bootstrap
   * constant when it has observed none. Never a client-invented value.
   */
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
