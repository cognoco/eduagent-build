// ---------------------------------------------------------------------------
// memory-facts-embed-backfill — cursor advancement on failure (BUG-366)
//
// [BUG-366 / CR-2026-05-19-H17] The hourly backfill cron used to advance its
// cursor to the last-scanned row regardless of per-row embedding failures.
// A failed row (Voyage rate limit, transient outage) was therefore skipped
// within the run and not re-attempted until the next hourly tick.
//
// This file covers the post-fix behaviour:
// - A transient failure on row #3 in a 5-row batch must NOT advance the cursor
//   past row #3; the next batch iteration in the same run must re-fetch it.
// - dimension_mismatch is non-retryable (provider/config drift would produce
//   the same wrong-sized vector); the cursor must advance past it.
// - When Voyage is fully down (every row fails), the function must halt to
//   avoid spinning, leaving the rows to the next hourly tick.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { generateUUIDv7, memoryFacts, type Database } from '@eduagent/database';
import {
  seedLearningProfile,
  setupTestDb,
} from '../../../../../tests/integration/helpers/memory-facts';
import * as embeddingsService from '../../services/embeddings';
import { EmbeddingDimensionMismatchError } from '../../services/embeddings';
import { memoryFactsEmbedBackfill } from './memory-facts-embed-backfill';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
let cleanupDb: (() => Promise<void>) | undefined;

const RUN_ID = generateUUIDv7();

const VECTOR_DIM = 1024;
const okVector = (): number[] => new Array(VECTOR_DIM).fill(0.5);

/**
 * Seed N memory_facts rows with NULL embeddings, ordered by uuidv7 id so the
 * backfill cursor walks them in insertion order. Returns the ids in order so
 * tests can reason about "row #3" etc.
 */
async function seedRows(profileId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    // Tiny delay so uuidv7 timestamps differ → stable sort order.
    await new Promise((r) => setTimeout(r, 2));
    const [row] = await db
      .insert(memoryFacts)
      .values({
        profileId,
        category: 'preference',
        text: `fact #${i + 1} ${RUN_ID}`,
        textNormalized: `fact #${i + 1} ${RUN_ID}`,
        observedAt: new Date(),
        embedding: null,
      })
      .returning({ id: memoryFacts.id });
    ids.push(row!.id);
  }
  return ids;
}

function makeStep() {
  // Capture batch step return values so the break test can inspect the cursor
  // (`lastId`) returned by the inner batch — that's the only observable that
  // distinguishes the pre-fix (cursor advances past failure) and post-fix
  // (cursor stays at the row BEFORE the retryable failure) behaviour without
  // seeding >BATCH_SIZE rows.
  const batchResults: Array<{ name: string; result: unknown }> = [];
  const step = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      if (name.startsWith('batch-')) {
        batchResults.push({ name, result });
      }
      return result;
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    batchResults,
  };
  return step;
}

function getHandler() {
  return (memoryFactsEmbedBackfill as any).fn as (ctx: {
    event: { data: Record<string, unknown> };
    step: ReturnType<typeof makeStep>;
  }) => Promise<unknown>;
}

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for memory-facts-embed-backfill integration tests',
    );
  }
  // Ensure the helper sees a Voyage key; the value is irrelevant because we
  // spy on generateEmbedding before any call would actually leave the process.
  process.env['VOYAGE_API_KEY'] ??= 'test-voyage-key';
  const setup = await setupTestDb();
  db = setup.db;
  cleanupDb = setup.cleanup;
}, 30_000);

afterAll(async () => {
  await cleanupDb?.();
}, 30_000);

describe('memory-facts-embed-backfill cursor on failure (BUG-366)', () => {
  let generateEmbeddingSpy: jest.SpiedFunction<
    typeof embeddingsService.generateEmbedding
  >;

  beforeEach(async () => {
    // The backfill is GLOBAL (WHERE embedding IS NULL, eligibility-gated by a
    // person row + granted consent). These tests assert on the function's global
    // counters, so any pre-existing NULL-embedding memory_facts left by other
    // suites sharing this DB would inflate the counts. Neutralise them (set a
    // sentinel vector) so the backfill only ever processes THIS test's freshly
    // seeded rows. (Surfaced under IDENTITY_V2_ENABLED: the v2-identity seeding
    // in sibling suites makes more profiles backfill-eligible.)
    await db
      .update(memoryFacts)
      .set({ embedding: okVector() })
      .where(isNull(memoryFacts.embedding));
  });

  afterEach(() => {
    generateEmbeddingSpy?.mockRestore();
  });

  // [BUG-366 break test] Seed 5 rows; make row #3 throw a transient error
  // (Voyage 503-style). Cursor must NOT advance past row #3 — when the inner
  // loop iterates again it must re-fetch row #3 plus anything still NULL.
  it('[BUG-366] does not advance cursor past a transient failure within the run', async () => {
    const { profileId } = await seedLearningProfile(db);
    const ids = await seedRows(profileId, 5);
    const row3Id = ids[2]!;

    // Make row #3 fail transiently on EVERY call so cursor must not advance
    // past it even if the function retries within the run.
    const failingText = `fact #3 ${RUN_ID}`;
    generateEmbeddingSpy = jest
      .spyOn(embeddingsService, 'generateEmbedding')
      .mockImplementation(async (text: string) => {
        if (text === failingText) {
          throw new Error('Voyage AI embedding request failed (503): upstream');
        }
        return {
          vector: okVector(),
          dimensions: VECTOR_DIM,
          model: 'voyage-3.5',
          provider: 'voyage',
        };
      });

    const step = makeStep();
    const result = (await getHandler()({
      event: { data: {} },
      step,
    })) as { totalEmbedded: number; totalFailed: number };

    // Rows 1, 2, 4, 5 should be embedded; row 3 must remain NULL.
    const allRows = await db
      .select({ id: memoryFacts.id, embedding: memoryFacts.embedding })
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, profileId))
      .orderBy(asc(memoryFacts.id));

    const embeddingByIndex = allRows.map((r) => r.embedding !== null);
    expect(embeddingByIndex).toEqual([true, true, false, true, true]);

    // Row #3 still NULL — proving the cursor did not advance past it (if it
    // had, the row would have been silently stranded until the next tick).
    const row3 = allRows.find((r) => r.id === row3Id);
    expect(row3?.embedding).toBeNull();

    // The function's own counters should reflect at least one failure.
    expect(result.totalFailed).toBeGreaterThanOrEqual(1);
    expect(result.totalEmbedded).toBe(4);

    // [BUG-366 break-test core assertion] Inspect the inner batch's returned
    // cursor. Pre-fix behaviour: `lastId === ids[4]` (advanced past failure).
    // Post-fix behaviour: `lastId === ids[1]` (the row BEFORE the failed
    // row #3), so the next batch within the run re-fetches row #3. This is
    // the assertion that fails on the original buggy code.
    expect(step.batchResults).toHaveLength(1);
    const batch0 = step.batchResults[0]!.result as {
      lastId: string | null;
      haltedByRetryableFailure: boolean;
    };
    expect(batch0.haltedByRetryableFailure).toBe(true);
    expect(batch0.lastId).toBe(ids[1]); // row #2 — BEFORE the failed row #3
    expect(batch0.lastId).not.toBe(ids[4]); // must NOT be the last-scanned row
  }, 30_000);

  // dimension_mismatch is non-retryable — provider/config drift will produce
  // the same wrong-sized vector. Cursor advances past the row, but the row
  // remains NULL and is surfaced via the log/metric for ops.
  it('[BUG-366] advances cursor past a dimension_mismatch failure', async () => {
    const { profileId } = await seedLearningProfile(db);
    const ids = await seedRows(profileId, 3);
    const row2Id = ids[1]!;
    const failingText = `fact #2 ${RUN_ID}`;

    generateEmbeddingSpy = jest
      .spyOn(embeddingsService, 'generateEmbedding')
      .mockImplementation(async (text: string) => {
        if (text === failingText) {
          throw new EmbeddingDimensionMismatchError(
            'Voyage returned vector of length 768; expected 1024',
            { expected: VECTOR_DIM, got: 768 },
          );
        }
        return {
          vector: okVector(),
          dimensions: VECTOR_DIM,
          model: 'voyage-3.5',
          provider: 'voyage',
        };
      });

    const step = makeStep();
    await getHandler()({ event: { data: {} }, step });

    // Rows 1, 3 embedded; row 2 stays NULL (dimension mismatch is skipped).
    const rows = await db
      .select({ id: memoryFacts.id, embedding: memoryFacts.embedding })
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, profileId))
      .orderBy(asc(memoryFacts.id));
    expect(rows.map((r) => r.embedding !== null)).toEqual([true, false, true]);

    // Critically: row #3 (which comes AFTER the dimension_mismatch row) got
    // processed — the cursor advanced past row #2 unlike the transient case.
    const row2 = rows.find((r) => r.id === row2Id);
    expect(row2?.embedding).toBeNull();
  }, 30_000);

  // When Voyage is fully down (every row fails transiently), the function
  // must halt to avoid spinning forever on the same first row.
  it('[BUG-366] halts when no forward progress is possible (Voyage fully down)', async () => {
    const { profileId } = await seedLearningProfile(db);
    await seedRows(profileId, 3);

    generateEmbeddingSpy = jest
      .spyOn(embeddingsService, 'generateEmbedding')
      .mockImplementation(async () => {
        throw new Error('Voyage AI embedding request failed (503): outage');
      });

    const step = makeStep();
    const result = (await getHandler()({
      event: { data: {} },
      step,
    })) as { totalEmbedded: number; totalFailed: number };

    // No embeddings written; all rows remain NULL for the next cron tick.
    const stillNull = await db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, profileId));
    expect(stillNull).toHaveLength(3);

    const embedded = await db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(isNotNull(memoryFacts.embedding));
    // No rows from THIS profile were embedded.
    expect(
      embedded.every((r) => !stillNull.some((seeded) => seeded.id === r.id)),
    ).toBe(true);

    expect(result.totalEmbedded).toBe(0);
    expect(result.totalFailed).toBeGreaterThanOrEqual(1);

    // The function returned (didn't hang) — implicit in reaching this line.
  }, 30_000);
});
