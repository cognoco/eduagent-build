import {
  memoryDedupDecisions as _memoryDedupDecisions,
  memoryFacts as _memoryFacts,
  type Database,
  type ScopedRepository,
} from '@eduagent/database';

import type { DedupActionOutcome } from './dedup-actions';
import type { DedupLlmResult } from './dedup-llm';
import {
  dedupPairKey,
  runDedupForProfile,
  type DedupPassArgs,
} from './dedup-pass';

describe('dedupPairKey', () => {
  it('is independent of pair order', () => {
    expect(dedupPairKey('fractions', 'fraction arithmetic')).toBe(
      dedupPairKey('fraction arithmetic', 'fractions'),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers: build minimal fakes that satisfy the types without jest.mock()
// ---------------------------------------------------------------------------

function makeFact(
  overrides: Partial<{
    id: string;
    profileId: string;
    category: string;
    text: string;
    textNormalized: string;
    embedding: number[] | null;
    supersededBy: string | null;
    confidence: 'low' | 'medium' | 'high';
    metadata: Record<string, unknown>;
    observedAt: Date;
    sourceSessionIds: string[];
    sourceEventIds: string[];
    createdAt: Date;
    updatedAt: Date;
    supersededAt: Date | null;
  }> = {},
) {
  return {
    id: 'fact-1',
    profileId: 'profile-1',
    category: 'interest',
    text: 'likes fractions',
    textNormalized: 'likes fractions',
    embedding: [1, 0],
    supersededBy: null,
    confidence: 'medium' as const,
    metadata: {},
    observedAt: new Date('2026-01-01'),
    sourceSessionIds: [] as string[],
    sourceEventIds: [] as string[],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    supersededAt: null,
    ...overrides,
  };
}

type EmittedEvent = { name: string; data: Record<string, unknown> };

/**
 * Build a minimal fake DedupPassArgs. All DB calls are replaced with
 * no-op or configurable implementations via plain closures — no jest.mock().
 */
function makeArgs(opts: {
  candidates?: ReturnType<typeof makeFact>[];
  neighbours?: ReturnType<typeof makeFact>[];
  memoRow?: {
    decision: 'merge' | 'supersede' | 'keep_both' | 'discard_new';
    mergedText: string | null;
    modelVersion: string;
  } | null;
  llmResult?: DedupLlmResult;
  actionOutcome?: DedupActionOutcome;
  profileId?: string;
  cap?: number;
  threshold?: number;
}): DedupPassArgs & { emitted: EmittedEvent[] } {
  const profileId = opts.profileId ?? 'profile-1';
  const emitted: EmittedEvent[] = [];

  const fakeScopedMemoryFacts = {
    findFirstActive: jest.fn().mockResolvedValue(null),
    findActiveCandidatesWithEmbedding: jest
      .fn()
      .mockResolvedValue(opts.candidates ?? []),
    findRelevant: jest
      .fn()
      .mockResolvedValue(
        opts.neighbours
          ? opts.neighbours.map((n) => ({ ...n, distance: 0.1 }))
          : [],
      ),
    findManyActive: jest.fn().mockResolvedValue([]),
    findCascadeAncestry: jest.fn().mockResolvedValue({ rows: [] }),
  };

  const fakeScoped = {
    memoryFacts: fakeScopedMemoryFacts,
  } as unknown as ScopedRepository;

  const memoSelect = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(opts.memoRow ? [opts.memoRow] : []),
  };

  const insertChain = {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
  };

  const _txSelect = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest
      .fn()
      .mockResolvedValue(
        opts.candidates && opts.candidates.length > 0
          ? [opts.candidates[0]]
          : [],
      ),
  };

  let txSelectCallCount = 0;
  const txSelectFn = jest.fn().mockImplementation(() => {
    txSelectCallCount += 1;
    if (txSelectCallCount % 2 === 1) {
      // first select in transaction = candidate
      return {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue(
            opts.candidates && opts.candidates.length > 0
              ? [opts.candidates[0]]
              : [],
          ),
      };
    }
    // second select = neighbour
    return {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValue(
          opts.neighbours && opts.neighbours.length > 0
            ? [opts.neighbours[0]]
            : [],
        ),
    };
  });

  const _fakeApplyDedupAction = jest
    .fn()
    .mockResolvedValue(opts.actionOutcome ?? { kind: 'keep_both' as const });

  const fakeDb = {
    select: jest.fn().mockReturnValue(memoSelect),
    insert: jest.fn().mockReturnValue(insertChain),
    delete: jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: txSelectFn,
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockResolvedValue(undefined),
          }),
          delete: jest
            .fn()
            .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
          insert: jest
            .fn()
            .mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
        };
        return cb(tx);
      }),
  } as unknown as Database;

  const llmFn = jest
    .fn()
    .mockResolvedValue(
      opts.llmResult ?? { ok: false, reason: 'transient', message: 'test' },
    );

  return {
    emitted,
    db: fakeDb,
    scoped: fakeScoped,
    profileId,
    threshold: opts.threshold ?? 0.5,
    cap: opts.cap ?? 5,
    llm: llmFn,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDedupForProfile', () => {
  it('returns early with empty report when candidates list is empty', async () => {
    const args = makeArgs({ candidates: [] });
    const { report, events } = await runDedupForProfile(args);
    expect(report.candidatesProcessed).toBe(0);
    expect(report.keptAsNew).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('skips candidate with no embedding and emits skipped_no_embedding', async () => {
    const noEmbedding = makeFact({ embedding: null });
    const args = makeArgs({ candidates: [noEmbedding] });
    const { report, events } = await runDedupForProfile(args);
    expect(report.skippedNoEmbedding).toBe(1);
    expect(
      events.some((e) => e.name === 'memory.dedup.skipped_no_embedding'),
    ).toBe(true);
  });

  it('counts keptAsNew when no neighbour within threshold', async () => {
    const candidate = makeFact({ embedding: [1, 0] });
    // neighbour has distance > threshold
    const farNeighbour = {
      ...makeFact({ id: 'fact-2', text: 'something else' }),
      distance: 0.9,
    };
    const fakeScoped = {
      memoryFacts: {
        findFirstActive: jest.fn().mockResolvedValue(null),
        findActiveCandidatesWithEmbedding: jest
          .fn()
          .mockResolvedValue([candidate]),
        findRelevant: jest.fn().mockResolvedValue([farNeighbour]),
      },
    } as unknown as ScopedRepository;

    const fakeDb = {
      select: jest
        .fn()
        .mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
      insert: jest.fn(),
      transaction: jest.fn(),
    } as unknown as Database;

    const { report, events } = await runDedupForProfile({
      db: fakeDb,
      scoped: fakeScoped,
      profileId: 'profile-1',
      threshold: 0.5,
      cap: 5,
    });
    expect(report.keptAsNew).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('increments memoHits and skips LLM when pair already in decisions table', async () => {
    const candidate = makeFact({ id: 'c1', textNormalized: 'fractions' });
    const neighbour = makeFact({
      id: 'n1',
      text: 'fraction work',
      textNormalized: 'fraction work',
    });
    const memoRow = {
      decision: 'keep_both' as const,
      mergedText: null,
      modelVersion: 'memo',
    };

    const args = makeArgs({
      candidates: [candidate],
      neighbours: [neighbour],
      memoRow,
    });

    const { report } = await runDedupForProfile(args);
    expect(report.memoHits).toBe(1);
    expect(report.llmCalls).toBe(0);
  });

  it('does not call LLM when cap is already hit', async () => {
    const candidate = makeFact({ id: 'c1' });
    const neighbour = makeFact({ id: 'n1', text: 'neighbour' });

    const args = makeArgs({
      candidates: [candidate],
      neighbours: [neighbour],
      memoRow: null,
      cap: 0, // cap=0 means any pending pair is immediately capped
      llmResult: {
        ok: true,
        decision: { action: 'keep_both' },
        modelVersion: 'v1',
      },
    });

    const { report, events } = await runDedupForProfile(args);
    expect(report.capHit).toBe(true);
    expect(report.cappedSkipped).toBe(1);
    expect(report.llmCalls).toBe(0);
    expect(events.some((e) => e.name === 'memory.dedup.capped_skip')).toBe(
      true,
    );
    expect(events.some((e) => e.name === 'memory.dedup.cap_hit')).toBe(true);
  });

  it('increments merges when LLM returns merge action', async () => {
    const candidate = makeFact({ id: 'c1', textNormalized: 'fractions' });
    const neighbour = makeFact({
      id: 'n1',
      text: 'fraction arithmetic',
      textNormalized: 'fraction arithmetic',
    });

    const llmResult: DedupLlmResult = {
      ok: true,
      decision: { action: 'merge', merged_text: 'fractions arithmetic' },
      modelVersion: 'v1',
    };

    // Build a tx that returns fresh candidate and fresh neighbour for the in-tx selects
    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({
      id: 'n1',
      text: 'fraction arithmetic',
      supersededBy: null,
    });

    let txSelectCount = 0;
    const fakeDb = {
      select: jest
        .fn()
        .mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
      insert: jest
        .fn()
        .mockReturnValue({
          values: jest.fn().mockReturnThis(),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: jest.fn().mockImplementation(() => ({
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation(() => {
                txSelectCount += 1;
                return Promise.resolve(
                  txSelectCount === 1 ? [freshCandidate] : [freshNeighbour],
                );
              }),
            })),
            insert: jest
              .fn()
              .mockReturnValue({
                values: jest.fn().mockResolvedValue(undefined),
              }),
            update: jest
              .fn()
              .mockReturnValue({
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue(undefined),
              }),
          };
          return cb(tx);
        }),
    } as unknown as Database;

    const fakeScoped = {
      memoryFacts: {
        findActiveCandidatesWithEmbedding: jest
          .fn()
          .mockResolvedValue([candidate]),
        findRelevant: jest
          .fn()
          .mockResolvedValue([{ ...neighbour, distance: 0.1 }]),
        findFirstActive: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ScopedRepository;

    const { report, events } = await runDedupForProfile({
      db: fakeDb,
      scoped: fakeScoped,
      profileId: 'profile-1',
      threshold: 0.5,
      cap: 5,
      llm: jest.fn().mockResolvedValue(llmResult),
    });

    expect(report.merges).toBe(1);
    expect(events.some((e) => e.name === 'memory.fact.merged')).toBe(true);
  });

  it('increments supersedes when LLM returns supersede action', async () => {
    const candidate = makeFact({ id: 'c1', textNormalized: 'fractions v2' });
    const neighbour = makeFact({
      id: 'n1',
      text: 'fractions v1',
      textNormalized: 'fractions v1',
    });

    const llmResult: DedupLlmResult = {
      ok: true,
      decision: { action: 'supersede' },
      modelVersion: 'v1',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest
        .fn()
        .mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
      insert: jest
        .fn()
        .mockReturnValue({
          values: jest.fn().mockReturnThis(),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: jest.fn().mockImplementation(() => ({
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation(() => {
                txSelectCount += 1;
                return Promise.resolve(
                  txSelectCount === 1 ? [freshCandidate] : [freshNeighbour],
                );
              }),
            })),
            insert: jest
              .fn()
              .mockReturnValue({
                values: jest.fn().mockResolvedValue(undefined),
              }),
            update: jest
              .fn()
              .mockReturnValue({
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue(undefined),
              }),
          };
          return cb(tx);
        }),
    } as unknown as Database;

    const fakeScoped = {
      memoryFacts: {
        findActiveCandidatesWithEmbedding: jest
          .fn()
          .mockResolvedValue([candidate]),
        findRelevant: jest
          .fn()
          .mockResolvedValue([{ ...neighbour, distance: 0.1 }]),
        findFirstActive: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ScopedRepository;

    const { report, events } = await runDedupForProfile({
      db: fakeDb,
      scoped: fakeScoped,
      profileId: 'profile-1',
      threshold: 0.5,
      cap: 5,
      llm: jest.fn().mockResolvedValue(llmResult),
    });

    expect(report.supersedes).toBe(1);
    expect(events.some((e) => e.name === 'memory.fact.merged')).toBe(true);
  });

  it('increments keptBoth when LLM returns keep_both action', async () => {
    const candidate = makeFact({ id: 'c1', textNormalized: 'history' });
    const neighbour = makeFact({
      id: 'n1',
      text: 'math struggles',
      textNormalized: 'math struggles',
    });

    const llmResult: DedupLlmResult = {
      ok: true,
      decision: { action: 'keep_both' },
      modelVersion: 'v1',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest
        .fn()
        .mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
      insert: jest
        .fn()
        .mockReturnValue({
          values: jest.fn().mockReturnThis(),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: jest.fn().mockImplementation(() => ({
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation(() => {
                txSelectCount += 1;
                return Promise.resolve(
                  txSelectCount === 1 ? [freshCandidate] : [freshNeighbour],
                );
              }),
            })),
            insert: jest
              .fn()
              .mockReturnValue({
                values: jest.fn().mockResolvedValue(undefined),
              }),
            update: jest
              .fn()
              .mockReturnValue({
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue(undefined),
              }),
          };
          return cb(tx);
        }),
    } as unknown as Database;

    const fakeScoped = {
      memoryFacts: {
        findActiveCandidatesWithEmbedding: jest
          .fn()
          .mockResolvedValue([candidate]),
        findRelevant: jest
          .fn()
          .mockResolvedValue([{ ...neighbour, distance: 0.1 }]),
        findFirstActive: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ScopedRepository;

    const { report } = await runDedupForProfile({
      db: fakeDb,
      scoped: fakeScoped,
      profileId: 'profile-1',
      threshold: 0.5,
      cap: 5,
      llm: jest.fn().mockResolvedValue(llmResult),
    });

    expect(report.keptBoth).toBe(1);
  });

  it('increments discarded when LLM returns discard_new action', async () => {
    const candidate = makeFact({
      id: 'c1',
      textNormalized: 'fractions repeat',
    });
    const neighbour = makeFact({
      id: 'n1',
      text: 'fractions',
      textNormalized: 'fractions',
    });

    const llmResult: DedupLlmResult = {
      ok: true,
      decision: { action: 'discard_new' },
      modelVersion: 'v1',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest
        .fn()
        .mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
      insert: jest
        .fn()
        .mockReturnValue({
          values: jest.fn().mockReturnThis(),
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: jest.fn().mockImplementation(() => ({
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation(() => {
                txSelectCount += 1;
                return Promise.resolve(
                  txSelectCount === 1 ? [freshCandidate] : [freshNeighbour],
                );
              }),
            })),
            insert: jest
              .fn()
              .mockReturnValue({
                values: jest.fn().mockResolvedValue(undefined),
              }),
            update: jest
              .fn()
              .mockReturnValue({
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue(undefined),
              }),
            delete: jest
              .fn()
              .mockReturnValue({
                where: jest.fn().mockResolvedValue(undefined),
              }),
          };
          return cb(tx);
        }),
    } as unknown as Database;

    const fakeScoped = {
      memoryFacts: {
        findActiveCandidatesWithEmbedding: jest
          .fn()
          .mockResolvedValue([candidate]),
        findRelevant: jest
          .fn()
          .mockResolvedValue([{ ...neighbour, distance: 0.1 }]),
        findFirstActive: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ScopedRepository;

    const { report } = await runDedupForProfile({
      db: fakeDb,
      scoped: fakeScoped,
      profileId: 'profile-1',
      threshold: 0.5,
      cap: 5,
      llm: jest.fn().mockResolvedValue(llmResult),
    });

    expect(report.discarded).toBe(1);
  });
});
