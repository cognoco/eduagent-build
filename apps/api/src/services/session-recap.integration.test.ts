/**
 * Integration: Session-Recap Profile Scoping (CR-124-SCOPE)
 *
 * Proves that resolveNextTopic and matchFreeformTopic cannot read another
 * profile's curriculum topics, even when passed cross-profile IDs directly.
 *
 * Uses a real database. No mocks of repository, services, or schema.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  retentionCards,
  createDatabase,
  createScopedRepository,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { resolveNextTopic, matchFreeformTopic } from './session-recap';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// Single source of truth for test identifiers — do not hand-maintain parallel
// lists of emails and clerk IDs.
const PREFIX = 'integration-recap-scope';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-a`, email: `${PREFIX}-a@integration.test` },
  { clerkUserId: `${PREFIX}-b`, email: `${PREFIX}-b@integration.test` },
] as const;
const ALL_EMAILS = TEST_ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = TEST_ACCOUNTS.map((a) => a.clerkUserId);

interface SeededTree {
  profileId: string;
  subjectId: string;
  bookId: string;
  topicIds: string[]; // ordered by sortOrder ascending
}

async function seedProfileWithCurriculum(
  index: number,
  topicTitles: string[]
): Promise<SeededTree> {
  const db = createIntegrationDb();
  const acc = TEST_ACCOUNTS[index]!;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: acc.clerkUserId, email: acc.email })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Recap Scope ${index}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Subject ${index}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning();
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${index}`,
      sortOrder: 0,
    })
    .returning();

  // Sequential inserts — Promise.all would work but obscures the fact that
  // topicIds[i] must correspond to sortOrder i. Sequential loop makes the
  // invariant visible to future readers.
  const topicIds: string[] = [];
  for (const [order, title] of topicTitles.entries()) {
    const [row] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title,
        description: `${title} description`,
        sortOrder: order,
        estimatedMinutes: 30,
      })
      .returning();
    topicIds.push(row!.id);
  }

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    bookId: book!.id,
    topicIds,
  };
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const byEmail = await db.query.accounts.findMany({
    where: inArray(accounts.email, ALL_EMAILS),
  });
  const byClerk = await db.query.accounts.findMany({
    where: inArray(accounts.clerkUserId, ALL_CLERK_IDS),
  });
  const ids = [...new Set([...byEmail, ...byClerk].map((r) => r.id))];
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('session-recap profile scoping (integration)', () => {
  it('[CR-124-SCOPE] resolveNextTopic returns null for a topicId owned by another profile', async () => {
    const a = await seedProfileWithCurriculum(0, ['Cells', 'Mitosis']);
    const b = await seedProfileWithCurriculum(1, ['Atoms', 'Molecules']);

    const repoA = createScopedRepository(createIntegrationDb(), a.profileId);
    const leak = await resolveNextTopic(repoA, b.topicIds[0]!);
    expect(leak).toBeNull();

    // Sanity: repoA with A's own topic finds the next topic.
    const ownNext = await resolveNextTopic(repoA, a.topicIds[0]!);
    expect(ownNext).not.toBeNull();
    expect(ownNext!.id).toBe(a.topicIds[1]);
  });

  it('[CR-124-SCOPE] resolveNextTopic also blocks the reverse direction', async () => {
    const a = await seedProfileWithCurriculum(0, ['Cells', 'Mitosis']);
    const b = await seedProfileWithCurriculum(1, ['Atoms']);

    const repoB = createScopedRepository(createIntegrationDb(), b.profileId);
    const leak = await resolveNextTopic(repoB, a.topicIds[0]!);
    expect(leak).toBeNull();
  });

  it('[CR-124-SCOPE] matchFreeformTopic returns null for a subjectId owned by another profile', async () => {
    const a = await seedProfileWithCurriculum(0, ['Photosynthesis']);
    const b = await seedProfileWithCurriculum(1, ['Photosynthesis']);

    const repoA = createScopedRepository(createIntegrationDb(), a.profileId);
    const leak = await matchFreeformTopic(repoA, b.subjectId, [
      'explored photosynthesis in detail',
    ]);
    expect(leak).toBeNull();

    // Sanity: repoA with its own subject + matching keyword returns A's row.
    const ownMatch = await matchFreeformTopic(repoA, a.subjectId, [
      'explored photosynthesis in detail',
    ]);
    expect(ownMatch).not.toBeNull();
    expect(ownMatch!.id).toBe(a.topicIds[0]);
  });
});

describe('session-recap completion gating (integration)', () => {
  // The previous semantics treated *any* learning_session row with a non-null
  // topicId as "completed", and any retention_cards row at all as "retained".
  // Both are too aggressive: a 30-second exploratory session and a fresh probe
  // card both create rows but represent zero learning. The filter below locks
  // in the corrected boundaries so a regression to touch-equals-done cannot
  // ship silently.

  it('touch session (active, low exchange count) does not lock the topic out of suggestions', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(learningSessions).values({
      profileId: a.profileId,
      subjectId: a.subjectId,
      topicId: a.topicIds[1]!,
      status: 'active',
      exchangeCount: 1,
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[1]);
  });

  it('completed session above the exchange threshold excludes the topic', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(learningSessions).values({
      profileId: a.profileId,
      subjectId: a.subjectId,
      topicId: a.topicIds[1]!,
      status: 'completed',
      exchangeCount: 5,
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[2]);
  });

  it('paused session does not exclude the topic — learner has not finished', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(learningSessions).values({
      profileId: a.profileId,
      subjectId: a.subjectId,
      topicId: a.topicIds[1]!,
      status: 'paused',
      exchangeCount: 8,
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[1]);
  });

  it('fresh retention card (repetitions=0, no review) does not lock the topic out', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(retentionCards).values({
      profileId: a.profileId,
      topicId: a.topicIds[1]!,
      repetitions: 0,
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[1]);
  });

  it('retention card with repetitions > 0 excludes the topic', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(retentionCards).values({
      profileId: a.profileId,
      topicId: a.topicIds[1]!,
      repetitions: 2,
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[2]);
  });

  it('retention card with lastReviewedAt set excludes the topic', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db.insert(retentionCards).values({
      profileId: a.profileId,
      topicId: a.topicIds[1]!,
      repetitions: 0,
      lastReviewedAt: new Date(),
    });

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[2]);
  });
});

describe('session-recap topic selection coverage (integration)', () => {
  // Locks in P2 (cross-book fallback) and P3 (skipped filter) so the recap
  // does not silently drop the "Up next" card at book boundaries and does
  // not resurface topics the learner explicitly skipped.

  it('falls through to the next book when the current book is exhausted', async () => {
    const db = createIntegrationDb();
    const acc = TEST_ACCOUNTS[0]!;

    const [account] = await db
      .insert(accounts)
      .values({ clerkUserId: acc.clerkUserId, email: acc.email })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Cross-Book',
        birthYear: 2010,
        isOwner: true,
      })
      .returning();
    const [subject] = await db
      .insert(subjects)
      .values({
        profileId: profile!.id,
        name: 'Biology',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning();
    const [curriculum] = await db
      .insert(curricula)
      .values({ subjectId: subject!.id, version: 1 })
      .returning();
    const [bookOne] = await db
      .insert(curriculumBooks)
      .values({ subjectId: subject!.id, title: 'Book 1', sortOrder: 0 })
      .returning();
    const [bookTwo] = await db
      .insert(curriculumBooks)
      .values({ subjectId: subject!.id, title: 'Book 2', sortOrder: 1 })
      .returning();

    const [bookOneLast] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: bookOne!.id,
        title: 'Mitosis',
        description: 'Last topic of book 1',
        sortOrder: 0,
        estimatedMinutes: 30,
      })
      .returning();
    const [bookTwoFirst] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: bookTwo!.id,
        title: 'Atoms',
        description: 'First topic of book 2',
        sortOrder: 0,
        estimatedMinutes: 30,
      })
      .returning();

    const repo = createScopedRepository(db, profile!.id);
    const next = await resolveNextTopic(repo, bookOneLast!.id);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(bookTwoFirst!.id);
  });

  it('returns null at the end of the curriculum (no later books)', async () => {
    const a = await seedProfileWithCurriculum(0, ['Cells', 'Mitosis']);
    const repo = createScopedRepository(createIntegrationDb(), a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[1]!);
    expect(next).toBeNull();
  });

  it('does not suggest a topic the learner explicitly skipped', async () => {
    const a = await seedProfileWithCurriculum(0, [
      'Cells',
      'Mitosis',
      'Meiosis',
    ]);
    const db = createIntegrationDb();

    await db
      .update(curriculumTopics)
      .set({ skipped: true })
      .where(eq(curriculumTopics.id, a.topicIds[1]!));

    const repo = createScopedRepository(db, a.profileId);
    const next = await resolveNextTopic(repo, a.topicIds[0]!);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(a.topicIds[2]);
  });
});
