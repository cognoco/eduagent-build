import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  profiles,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  applyRetentionUpdate,
  insertRetentionCardIfAbsent,
  resetRetentionCardForRelearn,
} from './apply-retention-update';

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

interface SeededTopic {
  profileId: string;
  topicId: string;
}

async function seedTopic(
  database: Database,
  label: string,
): Promise<SeededTopic> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${label}`,
      email: `${CLERK_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });
  if (!account) throw new Error('account insert failed');

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account.id,
      displayName: `Apply Retention ${label}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  if (!profile) throw new Error('profile insert failed');

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile.id,
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

  return { profileId: profile.id, topicId: topic.id };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
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
