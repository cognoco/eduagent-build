import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NowResponse } from '@eduagent/schemas';

import {
  NOW_FEED_CACHE_TTL_MS,
  readCachedNowFeed,
  writeCachedNowFeed,
  buildNowFeedCacheKey,
} from './now-feed-cache';

const ACTOR_A = { actorId: 'actor-a', profileId: 'profile-1' };
const ACTOR_B = { actorId: 'actor-b', profileId: 'profile-1' };
const OTHER_PROFILE = { actorId: 'actor-a', profileId: 'profile-2' };

function feed(overrides: Partial<NowResponse> = {}): NowResponse {
  return {
    scope: 'self',
    cards: [],
    overflowCount: 0,
    generatedAt: '2026-06-14T08:00:00.000Z',
    ...overrides,
  };
}

/** A feed carrying both notice-bearing card kinds the server can emit. */
function noticeFeed(): NowResponse {
  return feed({
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
      {
        kind: 'ledger_moment',
        templateKey: 'now.ledger_moment.notice_locked_in',
        params: { ledgerKind: 'notice_locked_in', concept: 'distributing' },
        deepLink: { route: 'subject.hub', params: {}, chain: [] },
        scope: 'self',
      },
      {
        kind: 'parked_item',
        templateKey: 'now.parked_item.default',
        params: {},
        deepLink: { route: 'subject.hub', params: {}, chain: [] },
        scope: 'self',
      },
    ] as NowResponse['cards'],
  });
}

describe('now feed cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a valid feed per actor+profile binding', async () => {
    const value = feed();

    await writeCachedNowFeed(ACTOR_A, value);

    await expect(
      readCachedNowFeed(ACTOR_A, Date.parse('2026-06-14T09:00:00.000Z')),
    ).resolves.toEqual(value);
    await expect(readCachedNowFeed(OTHER_PROFILE)).resolves.toBeNull();
  });

  // [WI-2498] The pre-fix key was the selected profileId alone, so a guardian
  // proxying into a child's profile and the child themselves shared one cache
  // entry. Binding the key to the ACTOR makes that impossible by construction.
  it('does not serve one actor’s cached feed to a different actor on the same profile', async () => {
    await writeCachedNowFeed(ACTOR_A, feed());

    await expect(readCachedNowFeed(ACTOR_B)).resolves.toBeNull();
  });

  // [WI-2504 EXTENSION POINT] The policy epoch is already part of the key, so a
  // future server-authoritative epoch flip invalidates persisted projections
  // without a second cache seam.
  it('does not serve a feed cached under a different policy epoch', async () => {
    await writeCachedNowFeed({ ...ACTOR_A, policyEpoch: 'epoch-1' }, feed());

    await expect(
      readCachedNowFeed({ ...ACTOR_A, policyEpoch: 'epoch-2' }),
    ).resolves.toBeNull();
  });

  // Defense in depth — the server predicate V is the control.
  it('strips both notice-bearing card kinds when notices are not visible', async () => {
    await writeCachedNowFeed(ACTOR_A, noticeFeed(), { noticesVisible: false });

    const cached = await readCachedNowFeed(
      ACTOR_A,
      Date.parse('2026-06-14T09:00:00.000Z'),
    );
    expect(cached?.cards.map((card) => card.kind)).toEqual(['parked_item']);
  });

  it('filters notice-bearing cards on READ too, for entries written earlier', async () => {
    await writeCachedNowFeed(ACTOR_A, noticeFeed());

    const cached = await readCachedNowFeed(
      ACTOR_A,
      Date.parse('2026-06-14T09:00:00.000Z'),
      { noticesVisible: false },
    );
    expect(cached?.cards.map((card) => card.kind)).toEqual(['parked_item']);
  });

  it('keeps notice-bearing cards when notices are visible', async () => {
    await writeCachedNowFeed(ACTOR_A, noticeFeed());

    const cached = await readCachedNowFeed(
      ACTOR_A,
      Date.parse('2026-06-14T09:00:00.000Z'),
    );
    expect(cached?.cards).toHaveLength(3);
  });

  it('returns null for stale feeds', async () => {
    await writeCachedNowFeed(ACTOR_A, feed());

    await expect(
      readCachedNowFeed(
        ACTOR_A,
        Date.parse('2026-06-14T08:00:00.000Z') + NOW_FEED_CACHE_TTL_MS + 1,
      ),
    ).resolves.toBeNull();
  });

  it('returns null for corrupt JSON without throwing', async () => {
    await AsyncStorage.setItem(buildNowFeedCacheKey(ACTOR_A), '{bad');

    await expect(readCachedNowFeed(ACTOR_A)).resolves.toBeNull();
  });

  it('returns null when the cached blob fails the shared schema', async () => {
    await AsyncStorage.setItem(
      buildNowFeedCacheKey(ACTOR_A),
      JSON.stringify({ scope: 'self', cards: [], generatedAt: 'not enough' }),
    );

    await expect(readCachedNowFeed(ACTOR_A)).resolves.toBeNull();
  });
});
