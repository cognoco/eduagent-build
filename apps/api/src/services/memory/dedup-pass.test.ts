jest.mock(
  '../llm' /* gc1-allow: mocks the routeAndCall LLM boundary so the memo-path test can assert the independent judge is never CONSULTED. routeAndCall cannot be exercised without a provider registration, and real-router coverage lives in the llm/router suite. */,
  () => {
    const actual = jest.requireActual('../llm') as typeof import('../llm');
    return { ...actual, routeAndCall: jest.fn() };
  },
);

import {
  memoryDedupDecisions as _memoryDedupDecisions,
  memoryFacts as _memoryFacts,
  type Database,
  type ScopedRepository,
} from '@eduagent/database';

import { routeAndCall } from '../llm';
import type { DedupActionOutcome } from './dedup-actions';
import type { DedupLlmResult } from './dedup-llm';
import {
  dedupPairKey,
  runDedupForProfile,
  type DedupPassArgs,
  type DedupEventTuple,
} from './dedup-pass';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

beforeEach(() => {
  mockRouteAndCall.mockReset();
});

describe('dedupPairKey', () => {
  it('is independent of pair order', () => {
    expect(dedupPairKey('interest', 'fractions', 'fraction arithmetic')).toBe(
      dedupPairKey('interest', 'fraction arithmetic', 'fractions'),
    );
  });

  // [BUG-363] Break test: same text pair in different categories must NOT produce
  // the same key — a 'strength' decision must not shadow an 'interest' decision.
  it('[BUG-363] produces DIFFERENT keys for same text pair in different categories', () => {
    const interestKey = dedupPairKey('interest', 'fractions', 'fraction work');
    const strengthKey = dedupPairKey('strength', 'fractions', 'fraction work');
    expect(interestKey).not.toBe(strengthKey);
  });

  // Same category must still produce the same key (memo lookup must work).
  it('[BUG-363] produces the SAME key for same text pair in the same category', () => {
    expect(dedupPairKey('struggle', 'algebra', 'algebra basics')).toBe(
      dedupPairKey('struggle', 'algebra basics', 'algebra'),
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
  /**
   * The row the post-insert BUG-402 re-read finds, when it differs from the row
   * this pass tried to insert — i.e. a concurrent dedup pass won the
   * `onConflictDoNothing`. Unset leaves the re-read behaving as before.
   */
  postInsertRow?: {
    decision: 'merge' | 'supersede' | 'keep_both' | 'discard_new';
    mergedText: string | null;
    modelVersion: string;
  };
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
    // findCascadeAncestry now returns MemoryFactRow[] directly (no .rows wrapper)
    // following the CR-2026-05-21-168 fix that validates rows via memoryFactsRowSchema.
    findCascadeAncestry: jest.fn().mockResolvedValue([]),
  };

  const fakeScoped = {
    memoryFacts: fakeScopedMemoryFacts,
  } as unknown as ScopedRepository;

  // Call 1 is the memo lookup; call 2 is the post-insert BUG-402 re-read. They are
  // separable so a test can model a LOST race — no memo, then a different row
  // landing under `onConflictDoNothing`.
  let memoSelectCallCount = 0;
  const memoSelect = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => {
      memoSelectCallCount += 1;
      if (memoSelectCallCount > 1 && opts.postInsertRow) {
        return Promise.resolve([opts.postInsertRow]);
      }
      return Promise.resolve(opts.memoRow ? [opts.memoRow] : []);
    }),
  };

  const insertChain = {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
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
          insert: jest.fn().mockReturnValue({
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
      events.some(
        (e: DedupEventTuple) => e.name === 'memory.dedup.skipped_no_embedding',
      ),
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
      select: jest.fn().mockReturnValue({
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

  // [WI-2628] A memo hit stores only `model_version` — the producing VENDOR is not
  // persisted and is therefore unrecoverable. The gate must then treat the producer
  // as unknown and fail CLOSED, rather than asserting a vendor it cannot
  // substantiate (the previous code passed the literal 'memo', which is not a vendor
  // at all and excluded nothing from the judge pool).
  //
  // Both cases below keep `merged_text`'s tokens inside the two source facts. That
  // is load-bearing: `findNewContentTokens` rejects a merge introducing new tokens
  // BEFORE the gate is consulted, so a merged string built from unrelated words
  // fails for that reason instead and the test would assert nothing about the gate.
  it('drops a memo-hit merge whose text needs the judge, because the producing vendor is unrecoverable', async () => {
    const merged = 'Dyslexia is a reading difference that affects decoding.';
    const candidate = makeFact({
      id: 'c1',
      text: merged,
      textNormalized: 'dyslexia is a reading difference that affects decoding',
    });
    const neighbour = makeFact({
      id: 'n1',
      text: 'Dyslexia affects decoding.',
      textNormalized: 'dyslexia affects decoding',
    });
    const args = makeArgs({
      candidates: [candidate],
      neighbours: [neighbour],
      memoRow: {
        decision: 'merge' as const,
        // Ambiguous EDUCATIONAL text: a protected lexeme with no person attributed,
        // so the deterministic scan returns `refer` and the verdict belongs to the
        // judge. With no producer vendor the referral cannot be constructed, so it
        // resolves unsafe — the fail-closed behaviour under assertion.
        mergedText: merged,
        modelVersion: 'memo',
      },
    });

    const { report } = await runDedupForProfile(args);
    expect(report.memoHits).toBe(1);
    expect(report.merges).toBe(0);
    expect(report.failures).toBe(1);
    // Pins the MECHANISM, not just the outcome. Dropping the merge is also what a
    // consulted-but-unavailable judge produces, so the outcome alone cannot tell
    // "the referral was never constructed" from "the referral failed". Asserting
    // the judge boundary is never reached is what makes this test detect a future
    // change that starts consulting the judge with an unknown producer.
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  // [WI-2628] BUG-402 race. `onConflictDoNothing` means a concurrent pass can win,
  // and the re-read then re-points `decision` at THAT row — so the text about to be
  // gated was produced by a call this pass never made, and this pass's provider does
  // not describe it. The vendor must be dropped, which shows up as the judge never
  // being consulted even though the LLM path ran and returned a real vendor.
  it('drops the producing vendor when a concurrent pass won the insert', async () => {
    const ourText = 'Dyslexia affects decoding.';
    const landedText =
      'Dyslexia is a reading difference that affects decoding.';
    const candidate = makeFact({
      id: 'c1',
      text: landedText,
      textNormalized: 'dyslexia is a reading difference that affects decoding',
    });
    const neighbour = makeFact({
      id: 'n1',
      text: ourText,
      textNormalized: 'dyslexia affects decoding',
    });

    const args = makeArgs({
      candidates: [candidate],
      neighbours: [neighbour],
      memoRow: null,
      llmResult: {
        ok: true,
        decision: { action: 'merge', merged_text: ourText },
        modelVersion: 'v1',
        provider: 'anthropic',
      },
      // A DIFFERENT merge text landed — the concurrent winner's.
      postInsertRow: {
        decision: 'merge',
        mergedText: landedText,
        modelVersion: 'v-other',
      },
    });

    const { report } = await runDedupForProfile(args);
    expect(report.llmCalls).toBe(1);
    expect(report.merges).toBe(0);
    expect(report.failures).toBe(1);
    // The discriminating assertion: our vendor was real, so without the race check
    // the referral would be constructed and the judge consulted.
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  // The control that makes the case above about the GATE rather than about memo hits
  // in general: an otherwise identical memo-hit merge whose text carries no protected
  // lexeme still merges. Without this pair, "every memo-hit merge is broken" would
  // satisfy the assertion above just as well.
  it('still applies a memo-hit merge when the text needs no judge at all', async () => {
    const merged = 'We read two chapters about volcanoes today.';
    const candidate = makeFact({
      id: 'c1',
      text: merged,
      textNormalized: 'we read two chapters about volcanoes today',
    });
    const neighbour = makeFact({
      id: 'n1',
      text: 'We read about volcanoes.',
      textNormalized: 'we read about volcanoes',
    });
    const args = makeArgs({
      candidates: [candidate],
      neighbours: [neighbour],
      memoRow: {
        decision: 'merge' as const,
        mergedText: merged,
        modelVersion: 'memo',
      },
    });

    const { report } = await runDedupForProfile(args);
    expect(report.memoHits).toBe(1);
    expect(report.failures).toBe(0);
    expect(report.merges).toBe(1);
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
        provider: 'anthropic',
      },
    });

    const { report, events } = await runDedupForProfile(args);
    expect(report.capHit).toBe(true);
    expect(report.cappedSkipped).toBe(1);
    expect(report.llmCalls).toBe(0);
    expect(
      events.some(
        (e: DedupEventTuple) => e.name === 'memory.dedup.capped_skip',
      ),
    ).toBe(true);
    expect(
      events.some((e: DedupEventTuple) => e.name === 'memory.dedup.cap_hit'),
    ).toBe(true);
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
      provider: 'anthropic',
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
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
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
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
            update: jest.fn().mockReturnValue({
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
    expect(
      events.some((e: DedupEventTuple) => e.name === 'memory.fact.merged'),
    ).toBe(true);
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
      provider: 'anthropic',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
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
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
            update: jest.fn().mockReturnValue({
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
    expect(
      events.some((e: DedupEventTuple) => e.name === 'memory.fact.merged'),
    ).toBe(true);
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
      provider: 'anthropic',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
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
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
            update: jest.fn().mockReturnValue({
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
      provider: 'anthropic',
    };

    const freshCandidate = makeFact({ id: 'c1', supersededBy: null });
    const freshNeighbour = makeFact({ id: 'n1', supersededBy: null });
    let txSelectCount = 0;

    const fakeDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
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
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
            update: jest.fn().mockReturnValue({
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockResolvedValue(undefined),
            }),
            delete: jest.fn().mockReturnValue({
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
