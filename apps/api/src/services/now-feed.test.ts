import { nowDeepLinkRouteSchema } from '@eduagent/schemas';

import {
  PARKED_AGING_WINDOW_DAYS,
  RANKING,
  ROUTE_CATALOG,
  orderSupporterHubCandidates,
  buildNowFeedFromCandidates,
  buildNowOverflowFromCandidates,
  rankCandidates,
  resolveDeepLink,
  type NowFeedCandidate,
} from './now-feed';

const now = new Date('2026-06-11T12:00:00.000Z');

function candidate(
  overrides: Partial<NowFeedCandidate> & Pick<NowFeedCandidate, 'id' | 'kind'>,
): NowFeedCandidate {
  return {
    id: overrides.id,
    kind: overrides.kind,
    createdAt: overrides.createdAt ?? new Date('2026-06-10T12:00:00.000Z'),
    sortAt: overrides.sortAt,
    templateKey: overrides.templateKey ?? `now.${overrides.kind}.default`,
    params: overrides.params ?? {},
    deepLink:
      overrides.deepLink ??
      resolveDeepLink('subject.hub', {
        subjectId: '00000000-0000-4000-8000-000000000001',
      }),
    scope: overrides.scope ?? 'self',
    personId: overrides.personId,
    edgeId: overrides.edgeId,
    ledgerId: overrides.ledgerId,
  };
}

describe('now feed ranking', () => {
  it('orders mixed candidates by deterministic priority', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: '06-ledger', kind: 'ledger_moment' }),
        candidate({ id: '03-needs', kind: 'needs_deepening' }),
        candidate({ id: '01-session', kind: 'unfinished_session' }),
        candidate({ id: '04-challenge', kind: 'challenge_ready' }),
        candidate({ id: '02-retention', kind: 'retention_due' }),
        candidate({ id: '05-parked', kind: 'parked_item' }),
      ],
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual([
      '01-session',
      '02-retention',
      '03-needs',
      '04-challenge',
      '05-parked',
      '06-ledger',
    ]);
  });

  it('promotes aged parked items and near-expiry needs-deepening items into the P1.5 band', () => {
    const agedParked = candidate({
      id: 'parked-old',
      kind: 'parked_item',
      createdAt: new Date(
        now.getTime() - (PARKED_AGING_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
      ),
    });
    const nearExpiryNeeds = candidate({
      id: 'needs-near-expiry',
      kind: 'needs_deepening',
      sortAt: new Date('2026-06-12T12:00:00.000Z'),
    });
    const ordinaryNeeds = candidate({
      id: 'needs-ordinary',
      kind: 'needs_deepening',
      sortAt: new Date('2026-06-30T12:00:00.000Z'),
    });

    const ranked = rankCandidates(
      [
        candidate({ id: 'retention', kind: 'retention_due' }),
        ordinaryNeeds,
        agedParked,
        nearExpiryNeeds,
      ],
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'retention',
      'needs-near-expiry',
      'parked-old',
      'needs-ordinary',
    ]);
    expect(RANKING.PROMOTED_AGING).toBeGreaterThan(RANKING.RETENTION_DUE);
    expect(RANKING.PROMOTED_AGING).toBeLessThan(RANKING.NEEDS_DEEPENING);
  });

  it('breaks same-priority ties by sort time and then id', () => {
    const ranked = rankCandidates(
      [
        candidate({
          id: 'b',
          kind: 'retention_due',
          sortAt: new Date('2026-06-10T12:00:00.000Z'),
        }),
        candidate({
          id: 'a',
          kind: 'retention_due',
          sortAt: new Date('2026-06-10T12:00:00.000Z'),
        }),
        candidate({
          id: 'older',
          kind: 'retention_due',
          sortAt: new Date('2026-06-09T12:00:00.000Z'),
        }),
      ],
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual(['older', 'a', 'b']);
  });

  it('caps the feed at three cards and keeps overflow reachable', () => {
    const candidates = [
      candidate({ id: 'session', kind: 'unfinished_session' }),
      candidate({ id: 'retention', kind: 'retention_due' }),
      candidate({ id: 'needs', kind: 'needs_deepening' }),
      candidate({ id: 'parked', kind: 'parked_item' }),
    ];

    const feed = buildNowFeedFromCandidates(candidates, 'self', now);
    const overflow = buildNowOverflowFromCandidates(candidates, 'self', now);

    expect(feed.cards.map((item) => item.kind)).toEqual([
      'unfinished_session',
      'retention_due',
      'needs_deepening',
    ]);
    expect(feed.overflowCount).toBe(1);
    expect(overflow.items.map((item) => item.kind)).toEqual(['parked_item']);
  });

  it('keeps one slot for each supportership edge before filling globally', () => {
    const edgeA = '00000000-0000-4000-8000-0000000000a1';
    const edgeB = '00000000-0000-4000-8000-0000000000b1';
    const ordered = orderSupporterHubCandidates(
      [
        candidate({
          id: 'a1-session',
          kind: 'unfinished_session',
          edgeId: edgeA,
          personId: '00000000-0000-4000-8000-000000000101',
        }),
        candidate({
          id: 'a2-retention',
          kind: 'retention_due',
          edgeId: edgeA,
          personId: '00000000-0000-4000-8000-000000000101',
        }),
        candidate({
          id: 'a3-needs',
          kind: 'needs_deepening',
          edgeId: edgeA,
          personId: '00000000-0000-4000-8000-000000000101',
        }),
        candidate({
          id: 'b1-challenge',
          kind: 'challenge_ready',
          edgeId: edgeB,
          personId: '00000000-0000-4000-8000-000000000102',
        }),
      ],
      now,
    );

    expect(ordered.slice(0, 3).map((item) => item.id)).toEqual([
      'a1-session',
      'b1-challenge',
      'a2-retention',
    ]);
  });

  it('builds a non-empty supporter-hub feed from derived person-scope candidates', () => {
    const ordered = orderSupporterHubCandidates(
      [
        candidate({
          id: 'edge-retention',
          kind: 'retention_due',
          scope: 'person',
          edgeId: '00000000-0000-4000-8000-0000000000a1',
          personId: '00000000-0000-4000-8000-000000000101',
        }),
      ],
      now,
    );

    const feed = buildNowFeedFromCandidates(ordered, 'supporter-hub', now);

    expect(feed.scope).toBe('supporter-hub');
    expect(feed.cards).toHaveLength(1);
    expect(feed.cards[0]).toMatchObject({
      scope: 'person',
      edgeId: '00000000-0000-4000-8000-0000000000a1',
      personId: '00000000-0000-4000-8000-000000000101',
    });
  });

  it('represents the Me-scope support hub pointer as one link card', () => {
    const feed = buildNowFeedFromCandidates(
      [
        candidate({ id: 'session', kind: 'unfinished_session' }),
        candidate({
          id: 'pointer',
          kind: 'support_hub_pointer',
          templateKey: 'now.support_hub_pointer.default',
          deepLink: resolveDeepLink('support.hub', {}),
          params: { count: 1 },
        }),
        candidate({ id: 'retention', kind: 'retention_due' }),
        candidate({ id: 'needs', kind: 'needs_deepening' }),
      ],
      'self',
      now,
    );

    expect(feed.cards).toHaveLength(3);
    expect(feed.cards).toContainEqual(
      expect.objectContaining({
        kind: 'support_hub_pointer',
        deepLink: { route: 'support.hub', params: {}, chain: [] },
      }),
    );
    expect(
      feed.cards.find((item) => item.kind === 'support_hub_pointer'),
    ).not.toHaveProperty('edgeId');
  });
});

describe('now feed route catalog', () => {
  it('keeps the route catalog in parity with the shared schema', () => {
    expect(Object.keys(ROUTE_CATALOG).sort()).toEqual(
      [...nowDeepLinkRouteSchema.options].sort(),
    );
  });

  it('returns ancestor chain metadata for deep links', () => {
    expect(
      resolveDeepLink('subject.topic', {
        subjectId: 'subject-1',
        bookId: 'book-1',
        topicId: 'topic-1',
      }),
    ).toEqual({
      route: 'subject.topic',
      params: {
        subjectId: 'subject-1',
        bookId: 'book-1',
        topicId: 'topic-1',
      },
      chain: ['subject.hub'],
    });
  });

  it('supports profile-level journal deep links for global ledger moments', () => {
    expect(resolveDeepLink('journal', {})).toEqual({
      route: 'journal',
      params: {},
      chain: [],
    });
  });

  it('throws when a required route param is missing', () => {
    expect(() =>
      resolveDeepLink('subject.topic', {
        subjectId: 'subject-1',
        topicId: 'topic-1',
      }),
    ).toThrow(/bookId/);
  });
});
