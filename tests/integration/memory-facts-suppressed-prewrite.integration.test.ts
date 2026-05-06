/**
 * Integration: suppressed-prewrite guard (real DB)
 *
 * Confirms that a fact whose normalized text matches a 'suppressed' row
 * in memory_facts is correctly identified as suppressed by isSuppressedFact,
 * and that the dedup pass skips (does not delete) such facts when they reach
 * the pass via the candidateIds path.
 *
 * Per CLAUDE.md: "No internal mocks in integration tests."
 * No LLM calls needed for these tests.
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  createScopedRepository,
  generateUUIDv7,
  memoryFacts,
} from '@eduagent/database';

import { isSuppressedFact } from '../../apps/api/src/services/memory/suppressed-prewrite';
import { runDedupForProfile } from '../../apps/api/src/services/memory/dedup-pass';
import { seedLearningProfile, setupTestDb } from './helpers/memory-facts';

describe('suppressed-prewrite guard (real DB)', () => {
  it('isSuppressedFact returns true when normalized text matches a suppressed row', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const suppressedId = generateUUIDv7();
    await db.insert(memoryFacts).values({
      id: suppressedId,
      profileId,
      category: 'suppressed',
      text: 'Fractions',
      textNormalized: 'fractions',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
    });

    const scoped = createScopedRepository(db, profileId);
    const result = await isSuppressedFact(scoped, 'FRACTIONS');
    expect(result).toBe(true);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('isSuppressedFact returns false when no suppressed row matches', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const scoped = createScopedRepository(db, profileId);
    const result = await isSuppressedFact(scoped, 'anything not suppressed');
    expect(result).toBe(false);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('isSuppressedFact returns false for an active (non-suppressed) fact with matching text', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    await db.insert(memoryFacts).values({
      id: generateUUIDv7(),
      profileId,
      category: 'interest', // NOT suppressed
      text: 'fractions',
      textNormalized: 'fractions',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
    });

    const scoped = createScopedRepository(db, profileId);
    const result = await isSuppressedFact(scoped, 'fractions');
    expect(result).toBe(false);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('dedup pass skips (does not delete) suppressed candidate, emits warning event', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    // A suppressed row in the DB (used for lookup)
    const suppressedId = generateUUIDv7();
    await db.insert(memoryFacts).values({
      id: suppressedId,
      profileId,
      category: 'suppressed',
      text: 'ignore this',
      textNormalized: 'ignore this',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
    });

    // A separate candidate that matches the suppressed text (simulates a prewrite
    // that slipped through — e.g. passed via candidateIds from a stale list)
    const candidateId = generateUUIDv7();
    await db.insert(memoryFacts).values({
      id: candidateId,
      profileId,
      category: 'interest',
      text: 'ignore this',
      textNormalized: 'ignore this',
      metadata: {},
      observedAt: new Date(),
      confidence: 'medium',
      embedding: Array.from({ length: 1024 }, () => 0.1),
    });

    const scoped = createScopedRepository(db, profileId);
    const { report, events } = await runDedupForProfile({
      db,
      scoped,
      profileId,
      candidateIds: [candidateId],
      threshold: 0.5,
      cap: 5,
    });

    expect(report.suppressedSkips).toBe(1);

    // Candidate must NOT have been deleted (defence-in-depth: skip, not delete)
    const candidateRow = await db.query.memoryFacts.findFirst({
      where: eq(memoryFacts.id, candidateId),
    });
    expect(candidateRow).not.toBeNull();

    // Event must carry the warning flag
    const suppressEvent = events.find((e) => e.name === 'memory.fact.suppressed_skip');
    expect(suppressEvent).toBeDefined();
    expect(suppressEvent?.data['warning']).toBe('suppressed_fact_reached_dedup_pass');

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it('suppressed rows are excluded from findActiveCandidatesWithEmbedding (C3 break test)', async () => {
    const { db } = await setupTestDb();
    const { profileId, accountId } = await seedLearningProfile(db, {});

    const suppressedId = generateUUIDv7();
    const activeId = generateUUIDv7();

    await db.insert(memoryFacts).values([
      {
        id: suppressedId,
        profileId,
        category: 'suppressed',
        text: 'suppressed fact',
        textNormalized: 'suppressed fact',
        metadata: {},
        observedAt: new Date(),
        confidence: 'medium',
        embedding: Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)),
      },
      {
        id: activeId,
        profileId,
        category: 'interest',
        text: 'active fact',
        textNormalized: 'active fact',
        metadata: {},
        observedAt: new Date(),
        confidence: 'medium',
        embedding: Array.from({ length: 1024 }, (_, i) => (i === 1 ? 1 : 0)),
      },
    ]);

    const scoped = createScopedRepository(db, profileId);
    const candidates = await scoped.memoryFacts.findActiveCandidatesWithEmbedding();

    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(suppressedId);

    await db.delete(accounts).where(eq(accounts.id, accountId));
  });
});
