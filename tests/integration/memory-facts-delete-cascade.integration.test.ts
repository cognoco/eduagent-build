/**
 * Integration: cascade-delete — real DB chain traversal + cross-profile break test
 *
 * Seeds a chain of merged facts (A merged into B merged into C) on profile 1
 * and a parallel chain on profile 2. Calls cascadeDeleteFactWithAncestry on
 * profile 1's root; asserts profile 1's chain is deleted and profile 2's
 * chain is intact.
 *
 * Per CLAUDE.md: "No internal mocks in integration tests."
 * The existing cascade-delete.test.ts mocks db.execute — this test uses the
 * real DB to exercise the actual recursive CTE query.
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  generateUUIDv7,
  memoryFacts,
} from '@eduagent/database';

import { cascadeDeleteFactWithAncestry } from '../../apps/api/src/services/memory/cascade-delete';
import { seedLearningProfile, setupTestDb } from './helpers/memory-facts';

/** Build a minimal fact row (no embedding needed for cascade-delete tests). */
function factRow(profileId: string, text: string, supersededBy?: string) {
  return {
    id: generateUUIDv7(),
    profileId,
    category: 'interest' as const,
    text,
    textNormalized: text.toLowerCase(),
    metadata: {},
    observedAt: new Date(),
    confidence: 'medium' as const,
    supersededBy: supersededBy ?? null,
  };
}

describe('cascadeDeleteFactWithAncestry (real DB)', () => {
  it('deletes all facts in the ancestry chain for profile 1', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    // Build chain: A → B → C (A superseded by B, B superseded by C)
    const rootId = generateUUIDv7();
    const midId = generateUUIDv7();
    const leafId = generateUUIDv7();

    await db.insert(memoryFacts).values([
      { ...factRow(profileId, 'root fact'), id: rootId },
      { ...factRow(profileId, 'mid fact', rootId), id: midId },
      { ...factRow(profileId, 'leaf fact', midId), id: leafId },
    ]);

    const emitted: string[] = [];
    await cascadeDeleteFactWithAncestry(db, profileId, rootId, {
      emit: (name) => { emitted.push(name); },
    });

    const remaining = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, profileId),
    });
    expect(remaining).toHaveLength(0);
    expect(emitted).toContain('memory.fact.deleted');

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('does not delete facts from a different profile (cross-profile break test)', async () => {
    const { db } = await setupTestDb();
    const { profileId: p1, accountId: a1 } = await seedLearningProfile(db, {});
    const { profileId: p2, accountId: a2 } = await seedLearningProfile(db, {});

    // Profile 1 chain
    const p1RootId = generateUUIDv7();
    const p1MidId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      { ...factRow(p1, 'p1 root'), id: p1RootId },
      { ...factRow(p1, 'p1 child', p1RootId), id: p1MidId },
    ]);

    // Profile 2 chain (should survive)
    const p2RootId = generateUUIDv7();
    const p2ChildId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      { ...factRow(p2, 'p2 root'), id: p2RootId },
      { ...factRow(p2, 'p2 child', p2RootId), id: p2ChildId },
    ]);

    await cascadeDeleteFactWithAncestry(db, p1, p1RootId, {
      emit: () => undefined,
    });

    // Profile 1 chain gone
    const p1Facts = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, p1),
    });
    expect(p1Facts).toHaveLength(0);

    // Profile 2 chain intact
    const p2Facts = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, p2),
    });
    expect(p2Facts.map((r) => r.id).sort()).toEqual([p2RootId, p2ChildId].sort());

    await db.delete(accounts).where(eq(accounts.id, a1));
    await db.delete(accounts).where(eq(accounts.id, a2));
  });

  it('deletes only the targeted subtree when root has siblings', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    // Two independent facts — cascade-delete one, other must survive
    const targetId = generateUUIDv7();
    const siblingId = generateUUIDv7();
    await db.insert(memoryFacts).values([
      { ...factRow(profileId, 'target fact'), id: targetId },
      { ...factRow(profileId, 'sibling fact'), id: siblingId },
    ]);

    await cascadeDeleteFactWithAncestry(db, profileId, targetId, {
      emit: () => undefined,
    });

    const remaining = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, profileId),
    });
    expect(remaining.map((r) => r.id)).toEqual([siblingId]);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });
});
