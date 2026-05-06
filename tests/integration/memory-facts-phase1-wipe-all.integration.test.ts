/**
 * Integration: replaceActiveMemoryFactsForProfile — wipes active + superseded rows
 *
 * Seeds a profile with both active and superseded memory_facts rows.
 * Calls replaceActiveMemoryFactsForProfile with a new projection.
 * Asserts that BOTH active and superseded rows are deleted and replaced by
 * the new set.
 *
 * Per CLAUDE.md: "No internal mocks in integration tests."
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  generateUUIDv7,
  memoryFacts,
} from '@eduagent/database';

import {
  replaceActiveMemoryFactsForProfile,
} from '../../apps/api/src/services/memory/memory-facts';
import { seedLearningProfile, setupTestDb } from './helpers/memory-facts';
import type { MemoryProjection } from '../../apps/api/src/services/memory/backfill-mapping';

const EMPTY_PROJECTION: MemoryProjection = {
  strengths: [],
  struggles: [],
  interests: [],
  communicationNotes: [],
  suppressedInferences: [],
  interestTimestamps: {},
  createdAt: new Date('2026-01-01'),
};

describe('replaceActiveMemoryFactsForProfile (real DB)', () => {
  it('deletes all rows (active and superseded) for the profile and inserts the new projection', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const activeId = generateUUIDv7();
    const supersededId = generateUUIDv7();
    const supersedingId = generateUUIDv7();
    const now = new Date();

    // Seed: active row + a superseded chain
    await db.insert(memoryFacts).values([
      {
        id: activeId,
        profileId,
        category: 'interest',
        text: 'likes chess',
        textNormalized: 'likes chess',
        metadata: {},
        observedAt: now,
        confidence: 'medium',
      },
      {
        id: supersededId,
        profileId,
        category: 'interest',
        text: 'old chess interest',
        textNormalized: 'old chess interest',
        metadata: {},
        observedAt: now,
        confidence: 'low',
        supersededBy: supersedingId,
        supersededAt: now,
      },
      {
        id: supersedingId,
        profileId,
        category: 'interest',
        text: 'merged chess interest',
        textNormalized: 'merged chess interest',
        metadata: {},
        observedAt: now,
        confidence: 'high',
      },
    ]);

    // Replace with a projection containing one strength
    const projection: MemoryProjection = {
      ...EMPTY_PROJECTION,
      strengths: [
        {
          subject: 'Mathematics',
          topics: ['algebra'],
          confidence: 'high',
        },
      ],
    };

    await replaceActiveMemoryFactsForProfile(db, profileId, projection);

    const remaining = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, profileId),
    });

    // All three old rows must be gone
    const oldIds = remaining.map((r) => r.id);
    expect(oldIds).not.toContain(activeId);
    expect(oldIds).not.toContain(supersededId);
    expect(oldIds).not.toContain(supersedingId);

    // New row must exist
    expect(remaining.length).toBeGreaterThan(0);
    const strengthRow = remaining.find((r) => r.category === 'strength');
    expect(strengthRow).toBeDefined();
    expect(strengthRow?.text).toContain('algebra');

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('results in zero rows when projection is empty', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    await db.insert(memoryFacts).values({
      id: generateUUIDv7(),
      profileId,
      category: 'communication_note',
      text: 'speaks slowly',
      textNormalized: 'speaks slowly',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
    });

    await replaceActiveMemoryFactsForProfile(db, profileId, EMPTY_PROJECTION);

    const remaining = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, profileId),
    });
    expect(remaining).toHaveLength(0);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('cross-profile: does not delete rows for other profiles', async () => {
    const { db } = await setupTestDb();
    const { profileId: p1, accountId: a1 } = await seedLearningProfile(db, {});
    const { profileId: p2, accountId: a2 } = await seedLearningProfile(db, {});

    const p2Id = generateUUIDv7();
    await db.insert(memoryFacts).values({
      id: p2Id,
      profileId: p2,
      category: 'interest',
      text: 'p2 fact',
      textNormalized: 'p2 fact',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
    });

    // Replace only profile 1 (empty projection)
    await replaceActiveMemoryFactsForProfile(db, p1, EMPTY_PROJECTION);

    const p2Remaining = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, p2),
    });
    expect(p2Remaining.map((r) => r.id)).toContain(p2Id);

    await db.delete(accounts).where(eq(accounts.id, a1));
    await db.delete(accounts).where(eq(accounts.id, a2));
  });
});
