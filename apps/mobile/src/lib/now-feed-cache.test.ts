import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NowResponse } from '@eduagent/schemas';

import {
  NOW_FEED_CACHE_TTL_MS,
  readCachedNowFeed,
  writeCachedNowFeed,
  buildNowFeedCacheKey,
} from './now-feed-cache';

function feed(overrides: Partial<NowResponse> = {}): NowResponse {
  return {
    scope: 'self',
    cards: [],
    overflowCount: 0,
    generatedAt: '2026-06-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('now feed cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a valid feed per profile', async () => {
    const value = feed();

    await writeCachedNowFeed('profile-1', value);

    await expect(
      readCachedNowFeed('profile-1', Date.parse('2026-06-14T09:00:00.000Z')),
    ).resolves.toEqual(value);
    await expect(readCachedNowFeed('profile-2')).resolves.toBeNull();
  });

  it('returns null for stale feeds', async () => {
    await writeCachedNowFeed('profile-1', feed());

    await expect(
      readCachedNowFeed(
        'profile-1',
        Date.parse('2026-06-14T08:00:00.000Z') + NOW_FEED_CACHE_TTL_MS + 1,
      ),
    ).resolves.toBeNull();
  });

  it('returns null for corrupt JSON without throwing', async () => {
    await AsyncStorage.setItem(buildNowFeedCacheKey('profile-1'), '{bad');

    await expect(readCachedNowFeed('profile-1')).resolves.toBeNull();
  });

  it('returns null when the cached blob fails the shared schema', async () => {
    await AsyncStorage.setItem(
      buildNowFeedCacheKey('profile-1'),
      JSON.stringify({ scope: 'self', cards: [], generatedAt: 'not enough' }),
    );

    await expect(readCachedNowFeed('profile-1')).resolves.toBeNull();
  });
});
