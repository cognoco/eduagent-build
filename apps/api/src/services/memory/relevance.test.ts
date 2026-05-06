import type { ScopedRepository } from '@eduagent/database';

import type { FactEmbedder } from './embed-fact';
import { emptyMemorySnapshot } from './memory-facts';
import { getRelevantMemories } from './relevance';

const QUERY_VECTOR = new Array(1024).fill(0.1);

function grantedProfile() {
  return {
    memoryConsentStatus: 'granted',
    memoryEnabled: true,
    memoryInjectionEnabled: true,
  };
}

function stubScoped(args?: {
  relevant?: Array<ReturnType<typeof makeRelevantRow>>;
  active?: Array<ReturnType<typeof makeRelevantRow>>;
}): ScopedRepository {
  return {
    memoryFacts: {
      findRelevant: jest.fn(async () => args?.relevant ?? []),
      findManyActive: jest.fn(async () => args?.active ?? []),
    },
  } as unknown as ScopedRepository;
}

function stubEmbedder(): FactEmbedder {
  return async () => ({ ok: true, vector: QUERY_VECTOR });
}

function makeRelevantRow(overrides: {
  id?: string;
  text: string;
  distance?: number;
  observedAt?: Date;
  category?: string;
}) {
  return {
    id: overrides.id ?? overrides.text,
    profileId: 'p1',
    category: overrides.category ?? 'communication_note',
    text: overrides.text,
    textNormalized: overrides.text.toLowerCase(),
    metadata: {},
    sourceSessionIds: [],
    sourceEventIds: [],
    observedAt: overrides.observedAt ?? new Date('2026-05-05T00:00:00Z'),
    confidence: 'medium' as const,
    createdAt: new Date('2026-05-05T00:00:00Z'),
    distance: overrides.distance ?? 0.1,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

describe('getRelevantMemories', () => {
  it('returns no_profile when profile is null', async () => {
    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: null,
      scoped: stubScoped(),
      embedder: stubEmbedder(),
    });

    expect(result).toEqual({
      snapshot: emptyMemorySnapshot(),
      source: 'no_profile',
    });
  });

  it('returns empty snapshot when memory injection is disabled', async () => {
    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: { ...grantedProfile(), memoryInjectionEnabled: false },
      scoped: stubScoped(),
      embedder: stubEmbedder(),
    });

    expect(result).toEqual({
      snapshot: emptyMemorySnapshot(),
      source: 'consent_gate',
    });
  });

  it('returns empty snapshot when memory is disabled', async () => {
    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: { ...grantedProfile(), memoryEnabled: false },
      scoped: stubScoped(),
      embedder: stubEmbedder(),
    });

    expect(result.source).toBe('consent_gate');
    expect(result.snapshot).toEqual(emptyMemorySnapshot());
  });

  it('falls back to recency when stage 1 returns no candidates', async () => {
    const scoped = stubScoped({
      relevant: [],
      active: [makeRelevantRow({ text: 'recent note' })],
    });

    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: grantedProfile(),
      scoped,
      embedder: stubEmbedder(),
    });

    expect(result.source).toBe('recency_fallback');
    expect(result.snapshot.communicationNotes).toEqual(['recent note']);
  });

  it('uses relevance when a small profile has fewer candidates than k', async () => {
    const scoped = stubScoped({
      relevant: [
        makeRelevantRow({ text: 'only embedded note', distance: 0.1 }),
      ],
      active: [makeRelevantRow({ text: 'recent fallback note' })],
    });

    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: grantedProfile(),
      scoped,
      embedder: stubEmbedder(),
    });

    expect(result.source).toBe('relevance');
    expect(result.snapshot.communicationNotes).toEqual(['only embedded note']);
  });

  it('blends relevance and recency so old-tight beats recent-loose', async () => {
    const now = new Date('2026-05-05T00:00:00Z');
    const scoped = stubScoped({
      relevant: [
        makeRelevantRow({
          id: 'b',
          text: 'recent-loose',
          distance: 0.4,
          observedAt: addDays(now, -1),
        }),
        makeRelevantRow({
          id: 'a',
          text: 'old-tight',
          distance: 0.05,
          observedAt: addDays(now, -180),
        }),
      ],
    });

    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 1,
      profile: grantedProfile(),
      scoped,
      embedder: stubEmbedder(),
      now,
    });

    expect(result.source).toBe('relevance');
    expect(result.snapshot.communicationNotes).toEqual(['old-tight']);
  });

  it('uses a precomputed query vector without calling the embedder', async () => {
    const embedder = jest.fn();
    const scoped = stubScoped({
      relevant: [makeRelevantRow({ text: 'matching note' })],
    });

    await getRelevantMemories({
      profileId: 'p1',
      queryVector: QUERY_VECTOR,
      k: 1,
      profile: grantedProfile(),
      scoped,
      embedder,
    });

    expect(embedder).not.toHaveBeenCalled();
  });
});
