import {
  nowCardKindSchema,
  nowCardSchema,
  nowDeepLinkRouteSchema,
  nowDeepLinkSchema,
  nowQuerySchema,
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
  it('defines self and S4 supporter scopes', () => {
    expect(nowScopeSchema.options).toEqual(['self', 'supporter-hub', 'person']);
  });

  it('requires personId only for person-scope queries', () => {
    expect(nowQuerySchema.parse({})).toEqual({ scope: 'self' });
    expect(nowQuerySchema.parse({ scope: 'supporter-hub' })).toEqual({
      scope: 'supporter-hub',
    });
    expect(
      nowQuerySchema.parse({
        scope: 'person',
        personId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      scope: 'person',
      personId: '00000000-0000-4000-8000-000000000001',
    });
    expect(() => nowQuerySchema.parse({ scope: 'person' })).toThrow();
    expect(() =>
      nowQuerySchema.parse({
        scope: 'self',
        personId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
  });

  it('defines every S0 and S4 card kind', () => {
    expect(nowCardKindSchema.options).toEqual([
      'unfinished_session',
      'retention_due',
      'parked_item',
      'needs_deepening',
      'challenge_ready',
      'ledger_moment',
      'support_hub_pointer',
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
    expect(nowDeepLinkRouteSchema.options).toContain('journal');
    expect(nowDeepLinkRouteSchema.options).toContain('support.hub');
    expect(
      nowDeepLinkSchema.parse({
        route: 'journal',
        params: {},
        chain: [],
      }),
    ).toEqual({
      route: 'journal',
      params: {},
      chain: [],
    });
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
