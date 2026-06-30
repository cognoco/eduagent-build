import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  retentionCards,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import {
  applyRetentionUpdate,
  insertRetentionCardIfAbsent,
  resetRetentionCardForRelearn,
} from './apply-retention-update';
import {
  processRecallTest,
  updateRetentionFromSession,
} from './retention-data';
import { stampMasteryOnVerify } from './retention-mastery';
import { processEvaluateCompletion } from './verification-completion';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-apply-retention-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

interface SeededTopic {
  profileId: string;
  topicId: string;
}

async function seedTopic(
  database: Database,
  label: string,
): Promise<SeededTopic> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureLegacyProfileAnchorForTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Apply Retention ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Apply Retention ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('subject insert failed');

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject.id, version: 1 })
    .returning({ id: curricula.id });
  if (!curriculum) throw new Error('curriculum insert failed');

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });
  if (!book) throw new Error('book insert failed');

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: `Topic ${label}`,
      description: `Description ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  return { profileId, topicId: topic.id };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  await deleteLegacyAccountsForTest(database, seededAccountIds);
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

async function readCard(database: Database, cardId: string) {
  const [row] = await database
    .select()
    .from(retentionCards)
    .where(eq(retentionCards.id, cardId))
    .limit(1);
  if (!row) throw new Error(`retention card ${cardId} not found`);
  return row;
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('applyRetentionUpdate integration', () => {
  it('updates only provided columns and preserves omitted retention fields', async () => {
    const { profileId, topicId } = await seedTopic(db, 'partial-set');
    const reviewedAt = new Date('2026-06-01T10:00:00.000Z');
    const nextReviewAt = new Date('2026-06-08T10:00:00.000Z');
    const [inserted] = await db
      .insert(retentionCards)
      .values({
        profileId,
        topicId,
        easeFactor: 2.7,
        intervalDays: 9,
        repetitions: 4,
        lastReviewedAt: reviewedAt,
        nextReviewAt,
        failureCount: 2,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        evaluateDifficultyRung: 2,
      })
      .returning({ id: retentionCards.id });
    if (!inserted) throw new Error('retention card insert failed');

    const updatedAt = new Date('2026-06-02T12:00:00.000Z');
    const result = await applyRetentionUpdate({
      db,
      profileId,
      cardId: inserted.id,
      set: { evaluateDifficultyRung: 3 },
      guard: { kind: 'none' },
      updatedAt,
    });

    expect(result).toEqual({ updated: true });
    const row = await readCard(db, inserted.id);
    expect(row.evaluateDifficultyRung).toBe(3);
    expect(row.updatedAt.toISOString()).toBe(updatedAt.toISOString());
    expect(row.easeFactor).toBe(2.7);
    expect(row.intervalDays).toBe(9);
    expect(row.repetitions).toBe(4);
    expect(row.lastReviewedAt?.toISOString()).toBe(reviewedAt.toISOString());
    expect(row.nextReviewAt?.toISOString()).toBe(nextReviewAt.toISOString());
    expect(row.failureCount).toBe(2);
    expect(row.consecutiveSuccesses).toBe(1);
    expect(row.xpStatus).toBe('verified');
  });

  it.each([
    {
      name: 'updatedAtEquals',
      guard: {
        kind: 'updatedAtEquals' as const,
        updatedAt: new Date('2026-06-03T10:00:00.000Z'),
      },
    },
    {
      name: 'optimisticLock',
      guard: {
        kind: 'optimisticLock' as const,
        updatedAt: new Date('2026-06-03T10:00:00.000Z'),
      },
    },
    {
      name: 'cooldownClaim',
      guard: {
        kind: 'cooldownClaim' as const,
        cooldownThreshold: new Date('2026-06-02T10:00:00.000Z'),
      },
    },
    { name: 'masteredAtNull', guard: { kind: 'masteredAtNull' as const } },
    { name: 'repetitionsZero', guard: { kind: 'repetitionsZero' as const } },
  ])(
    'returns updated=false when $name guard does not match',
    async ({ guard }) => {
      const { profileId, topicId } = await seedTopic(db, `guard-${guard.kind}`);
      const movedAt = new Date('2026-06-04T10:00:00.000Z');
      const [inserted] = await db
        .insert(retentionCards)
        .values({
          profileId,
          topicId,
          repetitions: 2,
          lastReviewedAt: new Date('2026-06-03T10:00:00.000Z'),
          masteredAt: new Date('2026-06-03T10:00:00.000Z'),
          updatedAt: movedAt,
        })
        .returning({ id: retentionCards.id });
      if (!inserted) throw new Error('retention card insert failed');

      const result = await applyRetentionUpdate({
        db,
        profileId,
        cardId: inserted.id,
        set: { intervalDays: 12 },
        guard,
        updatedAt: new Date('2026-06-05T10:00:00.000Z'),
      });

      expect(result).toEqual({ updated: false });
      const row = await readCard(db, inserted.id);
      expect(row.intervalDays).toBe(1);
      expect(row.updatedAt.toISOString()).toBe(movedAt.toISOString());
    },
  );

  it('allows cooldown claim when lastReviewedAt is the caller-owned event timestamp', async () => {
    const { profileId, topicId } = await seedTopic(db, 'cooldown-reentry');
    const eventAt = new Date('2026-06-03T10:00:00.000Z');
    const updatedAt = new Date('2026-06-03T10:05:00.000Z');
    const [inserted] = await db
      .insert(retentionCards)
      .values({
        profileId,
        topicId,
        lastReviewedAt: eventAt,
        updatedAt: eventAt,
      })
      .returning({ id: retentionCards.id });
    if (!inserted) throw new Error('retention card insert failed');

    const result = await applyRetentionUpdate({
      db,
      profileId,
      cardId: inserted.id,
      set: { lastReviewedAt: eventAt },
      guard: {
        kind: 'cooldownClaim',
        cooldownThreshold: new Date('2026-06-02T10:00:00.000Z'),
        allowLastReviewedAt: eventAt,
      },
      updatedAt,
    });

    expect(result).toEqual({ updated: true });
    const row = await readCard(db, inserted.id);
    expect(row.lastReviewedAt?.toISOString()).toBe(eventAt.toISOString());
    expect(row.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });

  it('inserts a retention card only once for a profile/topic pair', async () => {
    const { profileId, topicId } = await seedTopic(db, 'insert-once');

    await insertRetentionCardIfAbsent({ db, profileId, topicId });
    await insertRetentionCardIfAbsent({ db, profileId, topicId });

    const rows = await db
      .select()
      .from(retentionCards)
      .where(
        and(
          eq(retentionCards.profileId, profileId),
          eq(retentionCards.topicId, topicId),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      lastReviewedAt: null,
      nextReviewAt: null,
      masteredAt: null,
      evaluateDifficultyRung: null,
    });
  });

  it('resets relearn retention fields without changing updatedAt', async () => {
    const { profileId, topicId } = await seedTopic(db, 'relearn-reset');
    const updatedAt = new Date('2026-06-06T10:00:00.000Z');
    const [inserted] = await db
      .insert(retentionCards)
      .values({
        profileId,
        topicId,
        easeFactor: 2.8,
        intervalDays: 12,
        repetitions: 5,
        lastReviewedAt: new Date('2026-06-05T10:00:00.000Z'),
        nextReviewAt: new Date('2026-06-17T10:00:00.000Z'),
        failureCount: 3,
        consecutiveSuccesses: 2,
        xpStatus: 'verified',
        updatedAt,
      })
      .returning({ id: retentionCards.id });
    if (!inserted) throw new Error('retention card insert failed');

    await resetRetentionCardForRelearn({ db, profileId, topicId });

    const row = await readCard(db, inserted.id);
    expect(row).toMatchObject({
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      lastReviewedAt: null,
      nextReviewAt: null,
    });
    expect(row.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });
});

// ---------------------------------------------------------------------------
// T10 — cross-writer lifecycle integration test
// ---------------------------------------------------------------------------
// Drives one (profile, topic) through the full writer chain via the
// applyRetentionUpdate chokepoint:
//   W1  insertRetentionCardIfAbsent  → seed (lastReviewedAt: null)
//   W2/W3 processRecallTest (dont_remember) → recall SM-2 (quality 0, no LLM,
//          no cooldown because lastReviewedAt is null; guard: none → JS updatedAt)
//   W4  updateRetentionFromSession   → session SM-2 (reads JS updatedAt from W3,
//          optimistic lock works; quality=4 → repetitions advance)
//   W9  stampMasteryOnVerify         → mastery stamp
//   W9  (second call)               → idempotent (masteredAtNull guard blocks)
//   W6  processEvaluateCompletion    → evaluate rung
//
// Writer order rationale: W3 must precede W4 in this test because the 24-hour
// anti-cramming cooldown (FR54) blocks recall when lastReviewedAt is recent. W1
// seeds a card with lastReviewedAt: null → W3 runs without hitting the cooldown.
// After W3 writes updatedAt in JS (ms-precision), W4's optimistic lock can match
// it exactly (JS Date round-trips through Neon timestamptz losslessly).
//
// Snapshots the final retention_cards row against an INLINE baseline fixture.
// Also verifies second-stamp idempotency (W9 returns without changing masteredAt).
//
// Red/green proof: a deliberately broken chokepoint (applyRetentionUpdate
// returning { updated: false } on every call) is confirmed to make the test
// fail. Restore makes it green.
// ---------------------------------------------------------------------------

describe('T10 — cross-writer lifecycle', () => {
  it('drives seed → recall → session-SM-2 → mastery-stamp → evaluate-rung through the chokepoint', async () => {
    const { profileId, topicId } = await seedTopic(db, 't10-lifecycle');

    // ---- W1: seed the card (lastReviewedAt: null → no cooldown for W3) ----
    await insertRetentionCardIfAbsent({ db, profileId, topicId });
    const seeded = (
      await db
        .select()
        .from(retentionCards)
        .where(
          and(
            eq(retentionCards.profileId, profileId),
            eq(retentionCards.topicId, topicId),
          ),
        )
        .limit(1)
    )[0];
    if (!seeded) throw new Error('card not seeded by W1');
    // W1 defaults: SM-2 initial state, no timestamps
    expect(seeded.easeFactor).toBe(2.5);
    expect(seeded.intervalDays).toBe(1);
    expect(seeded.repetitions).toBe(0);
    expect(seeded.masteredAt).toBeNull();
    expect(seeded.evaluateDifficultyRung).toBeNull();
    expect(seeded.lastReviewedAt).toBeNull();

    // ---- W2/W3: recall test (dont_remember = quality 0, no LLM call) ----
    // lastReviewedAt is null → canRetestTopic returns true → no cooldown.
    // dont_remember uses guard: { kind: 'none' } → writes updatedAt in JS ms.
    const recallResult = await processRecallTestNoLlm(db, profileId, topicId);
    expect(recallResult.xpChange).toBeDefined();

    const afterRecall = (
      await db
        .select()
        .from(retentionCards)
        .where(eq(retentionCards.id, seeded.id))
        .limit(1)
    )[0];
    if (!afterRecall) throw new Error('card missing after recall');
    // dont_remember = quality 0 → failure path: failureCount increments, xpStatus decays
    expect(afterRecall.failureCount).toBeGreaterThan(0);
    expect(afterRecall.xpStatus).toBe('decayed');

    // ---- W4: session SM-2 (quality=4 → ease/interval/repetitions advance) ----
    // Card now has JS-generated updatedAt from W3 (ms-precision).
    // updateRetentionFromSession reads it with isNew=false → optimisticLock(card.updatedAt).
    // JS Date round-trips through Neon timestamptz without microsecond truncation.
    await updateRetentionFromSession(db, profileId, topicId, 4);

    const afterSession = (
      await db
        .select()
        .from(retentionCards)
        .where(eq(retentionCards.id, seeded.id))
        .limit(1)
    )[0];
    if (!afterSession) throw new Error('card missing after W4');
    // SM-2 with quality 4 on a card at repetitions=0 → repetitions advances to 1
    expect(afterSession.repetitions).toBeGreaterThan(0);

    // ---- W9: mastery stamp + second-stamp idempotency ----
    const masteredAt = new Date('2026-06-15T10:00:00.000Z');
    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId: seeded.id,
      xpChange: 'verified',
      masteredAt,
    });

    const afterStamp1 = (
      await db
        .select()
        .from(retentionCards)
        .where(eq(retentionCards.id, seeded.id))
        .limit(1)
    )[0];
    if (!afterStamp1) throw new Error('card missing after first stamp');
    expect(afterStamp1.masteredAt?.toISOString()).toBe(masteredAt.toISOString());

    // Second stamp must be a no-op (masteredAtNull guard blocks)
    const laterAt = new Date('2026-06-16T10:00:00.000Z');
    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId: seeded.id,
      xpChange: 'verified',
      masteredAt: laterAt,
    });
    const afterStamp2 = (
      await db
        .select()
        .from(retentionCards)
        .where(eq(retentionCards.id, seeded.id))
        .limit(1)
    )[0];
    if (!afterStamp2) throw new Error('card missing after second stamp');
    expect(afterStamp2.masteredAt?.toISOString()).toBe(
      masteredAt.toISOString(),
      'second stampMasteryOnVerify must NOT overwrite masteredAt',
    );

    // ---- W6: evaluate rung via processEvaluateCompletion ----
    // Seed a learning session and an ai_response event with an evaluate signal.
    const { sessionId } = await seedEvaluateSession(db, profileId, topicId);
    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    const afterEvaluate = (
      await db
        .select()
        .from(retentionCards)
        .where(eq(retentionCards.id, seeded.id))
        .limit(1)
    )[0];
    if (!afterEvaluate) throw new Error('card missing after evaluate');

    // ---- Inline baseline fixture ----
    // The final row must satisfy the full lifecycle contract:
    expect(afterEvaluate.profileId).toBe(profileId);
    expect(afterEvaluate.topicId).toBe(topicId);
    // masteredAt from W9 is preserved
    expect(afterEvaluate.masteredAt?.toISOString()).toBe(
      masteredAt.toISOString(),
    );
    // evaluateDifficultyRung was set to 2 by processEvaluateCompletion (rung 1→2
    // on challenge_passed=true with flaw_identified)
    expect(afterEvaluate.evaluateDifficultyRung).toBe(2);
    // failureCount from W3 recall (dont_remember) is preserved through all subsequent writes
    expect(afterEvaluate.failureCount).toBeGreaterThan(0);
    // SM-2 repetitions were advanced by W4 session writer
    expect(afterEvaluate.repetitions).toBeGreaterThan(0);
    // xpStatus was set to 'decayed' by W3 recall, preserved through W4/W9/W6
    // (W4 does NOT write xpStatus; W9 only writes masteredAt/updatedAt; W6 only writes evaluateDifficultyRung)
    expect(afterEvaluate.xpStatus).toBe('decayed');
  });
});

// ---------------------------------------------------------------------------
// Helpers for T10
// ---------------------------------------------------------------------------

/**
 * Calls processRecallTest with dont_remember mode (no LLM call, quality=0).
 * Returns the response so callers can inspect xpChange etc.
 */
async function processRecallTestNoLlm(
  database: Database,
  profileId: string,
  topicId: string,
) {
  return processRecallTest(database, profileId, {
    topicId,
    attemptMode: 'dont_remember',
  });
}

/**
 * Seeds a learning session + one ai_response event with a passing EVALUATE
 * assessment signal (challenge_passed=true, flaw_identified set → rung advances).
 */
async function seedEvaluateSession(
  database: Database,
  profileId: string,
  topicId: string,
): Promise<{ sessionId: string }> {
  // Get subject for the topic via subject chain
  const [topicRow] = await database
    .select({ bookId: curriculumTopics.bookId })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);
  if (!topicRow) throw new Error('topic not found');

  const [bookRow] = await database
    .select({ subjectId: curriculumBooks.subjectId })
    .from(curriculumBooks)
    .where(eq(curriculumBooks.id, topicRow.bookId))
    .limit(1);
  if (!bookRow) throw new Error('book not found');

  const subjectId = bookRow.subjectId;

  const [session] = await database
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
      verificationType: 'EVALUATE',
      status: 'completed',
    })
    .returning({ id: learningSessions.id });
  if (!session) throw new Error('session insert failed');

  // Seed an ai_response event with the evaluate_assessment signal in metadata
  await database.insert(sessionEvents).values({
    sessionId: session.id,
    profileId,
    subjectId,
    topicId,
    eventType: 'ai_response',
    content: 'Evaluate response content',
    metadata: {
      signals: {
        evaluate_assessment: {
          challenge_passed: true,
          quality: 4,
          flaw_identified: 'The answer incorrectly described the mechanism.',
        },
      },
    },
  });

  return { sessionId: session.id };
}
