import AsyncStorage from '@react-native-async-storage/async-storage';
import { nowResponseSchema, type NowResponse } from '@eduagent/schemas';

import { Sentry } from './sentry';
import { NOW_FEED_CACHE_KEY_PREFIX as KEY_PREFIX } from './secure-store-keys';

export const NOW_FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function buildNowFeedCacheKey(profileId: string): string {
  return `${KEY_PREFIX}::${profileId}`;
}

export async function writeCachedNowFeed(
  profileId: string,
  feed: NowResponse,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(profileId),
      JSON.stringify(feed),
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'now_feed_cache', op: 'write' },
    });
  }
}

export async function readCachedNowFeed(
  profileId: string,
  now = Date.now(),
): Promise<NowResponse | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(buildNowFeedCacheKey(profileId));
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

  return result.data;
}
