// ---------------------------------------------------------------------------
// memory-facts-embed-backfill — focused config tests
//
// [BUG-155] The hourly cron must not overlap when a prior run is still
// chewing through a Voyage backlog; without a concurrency cap two runs both
// pick rows-with-NULL-embedding and double-call the Voyage API per fact. The
// UPDATE … WHERE embedding IS NULL means only one write lands, but the
// duplicate Voyage spend is real.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WI-113: per-batch consent-eligibility filter
//
// The embed-backfill must NOT send `row.text` to Voyage for profiles that no
// longer have memory consent granted or are archived. The fix adds an
// eligibility query inside the batch step that checks
// learning_profiles.memoryConsentStatus = 'granted' AND
// profiles.archivedAt IS NULL for the batch's distinct profileIds.
// ---------------------------------------------------------------------------

// Mocks must be declared before imports (jest hoisting).
//
// We deliberately do NOT mock @eduagent/database: the SUT only imports plain
// schema/util values (memoryFacts, learningProfiles, profiles, vectorToDriver)
// which are passed as args to the per-test-stubbed select() chain — no DB
// connection is opened at import time. We also use the REAL embedFactText; it
// merely calls the embedding function we hand it, so mocking generateEmbedding
// (the Voyage external boundary) alone gives full control. Mirrors the
// real-import pattern in post-session-suggestions.test.ts.

// Minimal stub for the db handle returned by getStepDatabase().
// select() is set up per-test via mockReturnValueOnce so each test can
// control what the count-backlog query, the candidate-row query, and the
// eligibility query each return.
const mockDb: Record<string, any> = {
  select: jest.fn(),
  execute: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockDb,
    getStepVoyageApiKey: () => 'test-voyage-key',
  };
});

const mockGenerateEmbedding = jest.fn();
jest.mock(
  '../../services/embeddings' /* gc1-allow: external boundary — Voyage API */,
  () => {
    const actual = jest.requireActual(
      '../../services/embeddings',
    ) as typeof import('../../services/embeddings');
    return {
      ...actual,
      generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
    };
  },
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { memoryFactsEmbedBackfill } from './memory-facts-embed-backfill';

async function execute(): Promise<{ result: any }> {
  const runner = createInngestStepRunner();
  const handler = (memoryFactsEmbedBackfill as any).fn;
  const result = await handler({
    event: { data: {}, name: 'scheduled/memory-facts-embed-backfill' },
    step: runner.step,
  });
  return { result };
}

// ---------------------------------------------------------------------------
// Helper: build a fluent select chain that resolves to `rows`.
// The chain is also thenable so callers can `await db.select(...).from(...).where(...)`
// directly (without a trailing .limit()) — the eligibility query does this.
// ---------------------------------------------------------------------------
function makeSelectChain(rows: unknown[]) {
  // Use Record<string, any> to avoid jest.Mock type-compatibility noise on
  // the manually-defined `then` property.
  const chain: Record<string, any> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  // Make the chain thenable so `await chain` resolves to `rows` when no
  // terminal method (limit) is called — used by the eligibility query.
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

// ---------------------------------------------------------------------------
// Config tests (existing, kept verbatim)
// ---------------------------------------------------------------------------

describe('memoryFactsEmbedBackfill configuration', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect(
      (memoryFactsEmbedBackfill as { opts?: { id?: string } }).opts?.id,
    ).toBe('memory-facts-embed-backfill');
  });

  it('runs on the hourly cron schedule', () => {
    const triggers = (memoryFactsEmbedBackfill as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 * * * *' })]),
    );
  });

  // [BUG-155] Two simultaneous cron fires would each iterate the backlog and
  // each call Voyage on the same row — UPDATE-IS-NULL makes the write
  // idempotent but the embedding spend is doubled.
  it('[BUG-155] caps function-level concurrency to 1', () => {
    const opts = (memoryFactsEmbedBackfill as any).opts;
    expect(opts.concurrency).toEqual({ limit: 1 });
  });
});

// ---------------------------------------------------------------------------
// WI-113: per-batch consent-eligibility filter
// ---------------------------------------------------------------------------

describe('memoryFactsEmbedBackfill [WI-113] consent-eligibility filter', () => {
  beforeEach(() => {
    // resetAllMocks clears mockReturnValueOnce queues so tests don't bleed.
    jest.resetAllMocks();
    mockDb.execute.mockResolvedValue(undefined);

    // The REAL embedFactText is used: it calls generateEmbedding(text, key)
    // (mocked here, the Voyage boundary) and returns { ok: true, vector }.
    // generateEmbedding returns an EmbeddingResult-shaped object.
    mockGenerateEmbedding.mockResolvedValue({ vector: [0.1, 0.2, 0.3] });
  });

  it('[WI-113] does not embed rows whose profile has declined consent', async () => {
    const rowA = {
      id: 'fact-aaa',
      profileId: 'profile-eligible',
      category: 'interest',
      text: 'loves astronomy',
    };
    const rowB = {
      id: 'fact-bbb',
      profileId: 'profile-declined',
      category: 'interest',
      text: 'likes chess',
    };

    // Select call 1: count-backlog query → returns count=2
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
      // Select call 2: candidate rows in batch-0
      .mockReturnValueOnce(makeSelectChain([rowA, rowB]))
      // Select call 3: eligibility query — only profile-eligible qualifies
      .mockReturnValueOnce(
        makeSelectChain([{ profileId: 'profile-eligible' }]),
      );

    await execute();

    // generateEmbedding must only be called for the eligible row (rowA).
    // Without the fix it is called for both rows.
    const calledWith = mockGenerateEmbedding.mock.calls.map(
      ([text]: [string]) => text,
    );
    expect(calledWith).toContain(rowA.text);
    expect(calledWith).not.toContain(rowB.text);
  });

  it('[WI-113] does not embed rows whose profile is archived', async () => {
    const rowA = {
      id: 'fact-ccc',
      profileId: 'profile-active',
      category: 'strength',
      text: 'strong in algebra',
    };
    const rowB = {
      id: 'fact-ddd',
      profileId: 'profile-archived',
      category: 'strength',
      text: 'good at writing',
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(makeSelectChain([rowA, rowB]))
      // Eligibility: profile-archived is excluded (archivedAt IS NOT NULL)
      .mockReturnValueOnce(makeSelectChain([{ profileId: 'profile-active' }]));

    await execute();

    const calledWith = mockGenerateEmbedding.mock.calls.map(
      ([text]: [string]) => text,
    );
    expect(calledWith).toContain(rowA.text);
    expect(calledWith).not.toContain(rowB.text);
  });
});
