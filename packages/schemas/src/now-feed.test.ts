import {
  nowCardKindSchema,
  nowCardSchema,
  nowDeepLinkSchema,
  nowResponseSchema,
  nowScopeSchema,
} from './now-feed.js';

const deepLink = {
  route: 'subject.topic' as const,
  params: {
    subjectId: '00000000-0000-4000-8000-000000000001',
    bookId: '00000000-0000-4000-8000-000000000002',
    topicId: '00000000-0000-4000-8000-000000000003',
  },
  chain: ['subject.hub'],
};

function card(id: string) {
  return {
    kind: 'retention_due' as const,
    templateKey: `now.retention_due.${id}`,
    params: { topicTitle: `Topic ${id}` },
    deepLink,
    scope: 'self' as const,
  };
}

describe('now feed schemas', () => {
  it('serves only self scope in S0', () => {
    expect(nowScopeSchema.options).toEqual(['self']);
  });

  it('defines every S0 card kind', () => {
    expect(nowCardKindSchema.options).toEqual([
      'unfinished_session',
      'retention_due',
      'parked_item',
      'needs_deepening',
      'challenge_ready',
      'ledger_moment',
    ]);
  });

  it('caps highlight cards at three', () => {
    const base = {
      scope: 'self' as const,
      overflowCount: 0,
      generatedAt: '2026-06-11T12:00:00.000Z',
    };

    expect(
      nowResponseSchema.parse({ ...base, cards: [card('a'), card('b')] }).cards,
    ).toHaveLength(2);
    expect(() =>
      nowResponseSchema.parse({
        ...base,
        cards: [card('a'), card('b'), card('c'), card('d')],
      }),
    ).toThrow();
  });

  it('requires deep-link routes to come from the closed catalog', () => {
    expect(nowDeepLinkSchema.parse(deepLink)).toEqual(deepLink);
    expect(() =>
      nowDeepLinkSchema.parse({
        ...deepLink,
        route: '/raw/mobile/path',
      }),
    ).toThrow();
  });

  it('accepts a well-formed now card', () => {
    expect(nowCardSchema.parse(card('ok'))).toEqual(card('ok'));
  });
});
