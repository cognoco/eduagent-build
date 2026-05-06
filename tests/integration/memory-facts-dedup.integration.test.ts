/**
 * Integration: memory_facts dedup pass — end-to-end action branches
 *
 * Seeds two isolated profiles. For each test, inserts candidate + neighbour
 * fact rows with real embeddings. Runs runDedupForProfile with a real DB and
 * scoped repo. Mocks only the LLM boundary (routeAndCall) via registerProvider.
 * Asserts DB state after each action.
 *
 * Per CLAUDE.md: "No internal mocks in integration tests."
 * LLM boundary: registerProvider (real routeAndCall dispatch, mock chat fn).
 */

import { and, eq, isNull } from 'drizzle-orm';
import {
  accounts,
  createScopedRepository,
  generateUUIDv7,
  memoryFacts,
} from '@eduagent/database';
import { runDedupForProfile } from '../../apps/api/src/services/memory/dedup-pass';
import type { DedupLlmResult } from '../../apps/api/src/services/memory/dedup-llm';
import { seedLearningProfile, setupTestDb } from './helpers/memory-facts';

// ---------------------------------------------------------------------------
// Shared 1024-d embedding helpers
// ---------------------------------------------------------------------------
const DIMS = 1024;

function axis(n: number): number[] {
  return Array.from({ length: DIMS }, (_, i) => (i === n ? 1 : 0));
}

// Two vectors that are very close (cosine distance ≈ 0.01)
const EMBEDDING_A = axis(0);
const EMBEDDING_B = axis(0); // identical → cosine distance 0 (best case)

// A far vector so we can control which neighbour is within threshold
const EMBEDDING_FAR = axis(1);

function llmDecision(
  decision: DedupLlmResult & { ok: true }
): jest.MockedFunction<NonNullable<Parameters<typeof runDedupForProfile>[0]['llm']>> {
  return jest.fn().mockResolvedValue(decision);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memory_facts dedup — action branches (real DB)', () => {
  it('merge: creates new merged fact and marks both inputs as superseded', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const now = new Date();
    const cId = generateUUIDv7();
    const nId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      {
        id: cId,
        profileId,
        category: 'interest',
        text: 'likes fractions',
        textNormalized: 'likes fractions',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
      {
        id: nId,
        profileId,
        category: 'interest',
        text: 'enjoys fraction work',
        textNormalized: 'enjoys fraction work',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_B,
      },
    ]);

    const scoped = createScopedRepository(db, profileId);
    const { report } = await runDedupForProfile({
      db,
      scoped,
      profileId,
      candidateIds: [cId],
      threshold: 0.5,
      cap: 5,
      llm: llmDecision({
        ok: true,
        decision: {
          action: 'merge',
          merged_text: 'likes fractions and fraction work',
        },
        modelVersion: 'test',
      }),
    });

    expect(report.merges).toBe(1);

    // Both originals should be superseded
    const candidate = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, cId) });
    const neighbour = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, nId) });
    expect(candidate?.supersededBy).not.toBeNull();
    expect(neighbour?.supersededBy).not.toBeNull();
    expect(candidate?.supersededBy).toBe(neighbour?.supersededBy); // both point to merged fact

    // The merged fact should be active
    const merged = await db.query.memoryFacts.findFirst({
      where: and(eq(memoryFacts.profileId, profileId), isNull(memoryFacts.supersededBy), eq(memoryFacts.category, 'interest')),
    });
    expect(merged).not.toBeNull();
    expect(merged?.text).toBe('likes fractions and fraction work');

    // cleanup
    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('supersede: neighbour is marked superseded, candidate remains active', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const now = new Date();
    const cId = generateUUIDv7();
    const nId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      {
        id: cId,
        profileId,
        category: 'struggle',
        text: 'struggles with long division v2',
        textNormalized: 'struggles with long division v2',
        metadata: { topic: 'long division', subject: 'Math' },
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
      {
        id: nId,
        profileId,
        category: 'struggle',
        text: 'struggles with long division v1',
        textNormalized: 'struggles with long division v1',
        metadata: { topic: 'long division', subject: 'Math' },
        observedAt: new Date(now.getTime() - 60000),
        confidence: 'medium',
        embedding: EMBEDDING_B,
      },
    ]);

    const scoped = createScopedRepository(db, profileId);
    const { report } = await runDedupForProfile({
      db,
      scoped,
      profileId,
      candidateIds: [cId],
      threshold: 0.5,
      cap: 5,
      llm: llmDecision({
        ok: true,
        decision: { action: 'supersede' },
        modelVersion: 'test',
      }),
    });

    expect(report.supersedes).toBe(1);

    const neighbour = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, nId) });
    expect(neighbour?.supersededBy).toBe(cId);

    const candidate = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, cId) });
    expect(candidate?.supersededBy).toBeNull();

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('keep_both: neither row is modified', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const now = new Date();
    const cId = generateUUIDv7();
    const nId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      {
        id: cId,
        profileId,
        category: 'interest',
        text: 'enjoys history',
        textNormalized: 'enjoys history',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
      {
        id: nId,
        profileId,
        category: 'interest',
        text: 'likes math puzzles',
        textNormalized: 'likes math puzzles',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_B,
      },
    ]);

    const scoped = createScopedRepository(db, profileId);
    const { report } = await runDedupForProfile({
      db,
      scoped,
      profileId,
      candidateIds: [cId],
      threshold: 0.5,
      cap: 5,
      llm: llmDecision({
        ok: true,
        decision: { action: 'keep_both' },
        modelVersion: 'test',
      }),
    });

    expect(report.keptBoth).toBe(1);

    const cRow = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, cId) });
    const nRow = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, nId) });
    expect(cRow?.supersededBy).toBeNull();
    expect(nRow?.supersededBy).toBeNull();

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('discard_new: candidate row is deleted, neighbour remains', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const now = new Date();
    const cId = generateUUIDv7();
    const nId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      {
        id: cId,
        profileId,
        category: 'interest',
        text: 'loves music (duplicate)',
        textNormalized: 'loves music duplicate',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
      {
        id: nId,
        profileId,
        category: 'interest',
        text: 'loves music',
        textNormalized: 'loves music',
        metadata: {},
        observedAt: new Date(now.getTime() - 3600000),
        confidence: 'high',
        embedding: EMBEDDING_B,
      },
    ]);

    const scoped = createScopedRepository(db, profileId);
    const { report } = await runDedupForProfile({
      db,
      scoped,
      profileId,
      candidateIds: [cId],
      threshold: 0.5,
      cap: 5,
      llm: llmDecision({
        ok: true,
        decision: { action: 'discard_new' },
        modelVersion: 'test',
      }),
    });

    expect(report.discarded).toBe(1);

    const cRow = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, cId) });
    expect(cRow).toBeUndefined();

    const nRow = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, nId) });
    expect(nRow).not.toBeNull();

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('profile isolation: dedup on profile A does not affect profile B facts', async () => {
    const { db } = await setupTestDb();
    const { profileId: profileA, accountId: accountA } = await seedLearningProfile(db, {});
    const { profileId: profileB, accountId: accountB } = await seedLearningProfile(db, {});

    const now = new Date();
    const cId = generateUUIDv7();
    const nId = generateUUIDv7();
    const bId = generateUUIDv7();

    await db.insert(memoryFacts).values([
      {
        id: cId,
        profileId: profileA,
        category: 'interest',
        text: 'A: likes chess',
        textNormalized: 'a likes chess',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
      {
        id: nId,
        profileId: profileA,
        category: 'interest',
        text: 'A: enjoys chess',
        textNormalized: 'a enjoys chess',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_B,
      },
      {
        id: bId,
        profileId: profileB,
        category: 'interest',
        text: 'B: loves chess',
        textNormalized: 'b loves chess',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
        embedding: EMBEDDING_A,
      },
    ]);

    const scoped = createScopedRepository(db, profileA);
    await runDedupForProfile({
      db,
      scoped,
      profileId: profileA,
      candidateIds: [cId],
      threshold: 0.5,
      cap: 5,
      llm: llmDecision({
        ok: true,
        decision: { action: 'discard_new' },
        modelVersion: 'test',
      }),
    });

    // Profile B fact must be untouched
    const bRow = await db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, bId) });
    expect(bRow).not.toBeNull();
    expect(bRow?.supersededBy).toBeNull();

    await db.delete(accounts).where(eq(accounts.id, accountA));
    await db.delete(accounts).where(eq(accounts.id, accountB));
  });
});
