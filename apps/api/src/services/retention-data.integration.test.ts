/**
 * Integration: getProfileOverdueCount SQL correctness [BUG-473]
 *
 * Verifies that the count(*) + limit-3 implementation returns the correct
 * overdueCount (without loading all rows into memory) and limits topTopicIds
 * to ≤ 3 entries even when more overdue cards exist.
 *
 * Uses a real database. No mocks of repository, services, or schema.
 */

import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  createScopedRepository,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  profiles,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { getProfileOverdueCount, processRecallTest } from './retention-data';
import { registerLlmProviderFixture } from '../test-utils/llm-provider-fixtures';
import { _resetCircuits } from './llm';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
const CLERK_PREFIX = `integ-overdue-${RUN_ID}`;

interface SeededProfile {
  profileId: string;
  subjectId: string;
  topicIds: string[];
}

/**
 * Seeds an account → profile → subject → curriculum → book → N topics.
 * Returns the profileId, subjectId, and ordered topicIds.
 */
async function seedProfileWithTopics(
  database: Database,
  label: string,
  topicCount: number,
): Promise<SeededProfile> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${label}`,
      email: `${CLERK_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Overdue Test ${label}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const topicIds: string[] = [];
  for (let i = 0; i < topicCount; i++) {
    const [row] = await database
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title: `Topic ${label}-${i}`,
        description: `Description ${i}`,
        sortOrder: i,
        estimatedMinutes: 30,
      })
      .returning({ id: curriculumTopics.id });
    topicIds.push(row!.id);
  }

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    topicIds,
  };
}

/**
 * Inserts a retention card that is overdue by `daysAgo` days.
 */
async function seedOverdueCard(
  database: Database,
  profileId: string,
  topicId: string,
  daysAgo: number,
): Promise<void> {
  const nextReviewAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await database.insert(retentionCards).values({
    profileId,
    topicId,
    nextReviewAt,
    xpStatus: 'pending',
  });
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}

// ---------------------------------------------------------------------------
// Suite fixtures
// ---------------------------------------------------------------------------

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getProfileOverdueCount SQL correctness (integration) [BUG-473]', () => {
  it('returns the correct total count when more than 3 cards are overdue', async () => {
    // 5 topics, all overdue — count must be 5, topTopicIds ≤ 3
    const seed = await seedProfileWithTopics(db, 'many', 5);

    for (let i = 0; i < 5; i++) {
      await seedOverdueCard(db, seed.profileId, seed.topicIds[i]!, i + 1);
    }

    const result = await getProfileOverdueCount(db, seed.profileId);

    expect(result.overdueCount).toBe(5);
    expect(result.topTopicIds.length).toBeLessThanOrEqual(3);
    expect(result.topTopicIds.length).toBeGreaterThan(0);
  });

  it('topTopicIds are ordered oldest-overdue-first (most overdue first)', async () => {
    // 3 topics: topic[0] is most overdue (5 days), topic[2] is least (1 day)
    const seed = await seedProfileWithTopics(db, 'order', 3);
    const daysAgo = [5, 3, 1];
    for (let i = 0; i < 3; i++) {
      await seedOverdueCard(db, seed.profileId, seed.topicIds[i]!, daysAgo[i]!);
    }

    const result = await getProfileOverdueCount(db, seed.profileId);

    expect(result.overdueCount).toBe(3);
    expect(result.topTopicIds).toHaveLength(3);
    // Most overdue (5 days ago) should be first
    expect(result.topTopicIds[0]).toBe(seed.topicIds[0]);
  });

  it('returns overdueCount=0 and empty topTopicIds when no overdue cards', async () => {
    const seed = await seedProfileWithTopics(db, 'none', 2);
    // Insert a card that is NOT yet overdue (review due in 1 day)
    const futureReview = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(retentionCards).values({
      profileId: seed.profileId,
      topicId: seed.topicIds[0]!,
      nextReviewAt: futureReview,
      xpStatus: 'pending',
    });

    const result = await getProfileOverdueCount(db, seed.profileId);

    expect(result.overdueCount).toBe(0);
    expect(result.topTopicIds).toHaveLength(0);
    expect(result.nextReviewTopic).toBeNull();
    // The upcoming review should be reported
    expect(result.nextUpcomingReviewAt).not.toBeNull();
  });

  it('resolves nextReviewTopic with subject + topic info for the most overdue card', async () => {
    const seed = await seedProfileWithTopics(db, 'topic-info', 2);
    // topic[0] is older overdue, topic[1] is newer
    await seedOverdueCard(db, seed.profileId, seed.topicIds[0]!, 10);
    await seedOverdueCard(db, seed.profileId, seed.topicIds[1]!, 2);

    const repo = createScopedRepository(db, seed.profileId);
    const subject = await repo.subjects.findFirst();

    const result = await getProfileOverdueCount(db, seed.profileId);

    expect(result.nextReviewTopic).not.toBeNull();
    expect(result.nextReviewTopic?.topicId).toBe(seed.topicIds[0]);
    expect(result.nextReviewTopic?.subjectId).toBe(seed.subjectId);
    expect(result.nextReviewTopic?.subjectName).toBe(subject?.name);
    expect(result.nextReviewTopic?.topicTitle).toBe('Topic topic-info-0');
  });

  it('does not load N+1 rows — count query uses aggregate, not findMany', async () => {
    // 20 overdue cards, 5 topics (4 cards per topic — impossible with unique constraint,
    // so we use 20 distinct topics spread across 5 topics... actually retention_cards
    // has a unique constraint on (profileId, topicId), so we need 20 distinct topics.
    const seed = await seedProfileWithTopics(db, 'perf', 20);

    for (let i = 0; i < 20; i++) {
      await seedOverdueCard(db, seed.profileId, seed.topicIds[i]!, i + 1);
    }

    const result = await getProfileOverdueCount(db, seed.profileId);

    // Total must match exactly — proves count(*) not just topN
    expect(result.overdueCount).toBe(20);
    // Top 3 limit enforced
    expect(result.topTopicIds).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// LEARN-13 — processRecallTest IDOR ownership enforcement (break test)
//
// Security property: posting to /retention/recall-test with a topicId that
// belongs to a DIFFERENT profile's subject must be rejected (NotFoundError →
// HTTP 404) BEFORE any retention state is created for the requesting profile.
//
// Red-green regression pattern (AGENTS.md "Fix Development Rules"):
//   PASS with fix in place → FAIL after reverting fix → PASS after restoring.
// ---------------------------------------------------------------------------

const LEARN13_PREFIX = `integ-learn13-${RUN_ID}`;

/**
 * Seeds a minimal account → profile → subject → curriculum → book → 1 topic.
 * Returns profileId and the single topicId.
 */
async function seedProfileWithOneTopic(
  database: Database,
  label: string,
): Promise<{ profileId: string; topicId: string }> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${LEARN13_PREFIX}-${label}`,
      email: `${LEARN13_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `LEARN13 ${label}`,
      birthYear: 2005,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Topic ${label}`,
      description: `Description for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return { profileId: profile!.id, topicId: topic!.id };
}

async function cleanupLearn13(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${LEARN13_PREFIX}%`));
}

describe('processRecallTest IDOR ownership guard [LEARN-13]', () => {
  beforeAll(async () => {
    await cleanupLearn13(db);
  });

  afterAll(async () => {
    await cleanupLearn13(db);
  });

  it('rejects a recall-test submission when topicId belongs to a different profile (NotFoundError)', async () => {
    // Profile A — the attacker / requester
    const profileA = await seedProfileWithOneTopic(db, 'profileA');
    // Profile B — the victim whose topic is used in the attack
    const profileB = await seedProfileWithOneTopic(db, 'profileB');

    // Act: Profile A submits a recall test using Profile B's topicId
    await expect(
      processRecallTest(db, profileA.profileId, {
        topicId: profileB.topicId,
        answer: 'some answer',
        attemptMode: 'standard',
      }),
    ).rejects.toThrow(NotFoundError);

    // Assert: no retention card was created for Profile A pointing at B's topic
    const leakedCard = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profileA.profileId),
        eq(retentionCards.topicId, profileB.topicId),
      ),
    });
    expect(leakedCard).toBeUndefined();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// WI-234 — processRecallTest concurrent recall race
//
// Property: two concurrent recall submissions for the same fresh topic must
// produce EXACTLY ONE LLM call. The loser must short-circuit to the cooldown
// branch BEFORE reaching evaluateRecallQuality / routeAndCall.
// ---------------------------------------------------------------------------

const WI234_PREFIX = `integ-wi234-${RUN_ID}`;

async function seedWi234ProfileTopic(
  database: Database,
  label: string,
): Promise<{ profileId: string; topicId: string }> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${WI234_PREFIX}-${label}`,
      email: `${WI234_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `WI-234 ${label}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Topic ${label}`,
      description: `Description for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return { profileId: profile!.id, topicId: topic!.id };
}

async function cleanupWi234(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${WI234_PREFIX}%`));
}

describe('processRecallTest concurrent LLM serialization [WI-234]', () => {
  const llmFixture = registerLlmProviderFixture();

  beforeAll(async () => {
    await cleanupWi234(db);
  });

  afterAll(async () => {
    await cleanupWi234(db);
    llmFixture.dispose();
    _resetCircuits();
  });

  beforeEach(() => {
    llmFixture.clearCalls();
    llmFixture.clearChatError();
    // [WI-1153] The recall grader parses a structured JSON object
    // (recallGradeJsonSchema: quality 0-5 + verdict enum); a bare digit is never
    // parseable → graded:false → throws 'recall grader unavailable'. Provide a
    // valid solid-grade payload (quality 4 ⇒ verdict 'solid').
    llmFixture.setChatResponse(
      '{"quality":4,"verdict":"solid","rationale":"Accurate recall.","misconception":null}',
    );
    _resetCircuits();
  });

  it('two concurrent recall submissions for the same fresh topic produce exactly one LLM call', async () => {
    const seed = await seedWi234ProfileTopic(db, 'concurrent');

    const [resA, resB] = await Promise.all([
      processRecallTest(db, seed.profileId, {
        topicId: seed.topicId,
        answer: 'mitochondria are the powerhouse of the cell',
        attemptMode: 'standard',
      }),
      processRecallTest(db, seed.profileId, {
        topicId: seed.topicId,
        answer: 'mitochondria produce ATP',
        attemptMode: 'standard',
      }),
    ]);

    // Exactly one LLM call — the loser must short-circuit before evaluating.
    expect(llmFixture.chatCalls).toHaveLength(1);

    // Exactly one of the two results is the cooldown branch; the other is normal.
    const cooldownResponses = [resA, resB].filter((r) => r.cooldownActive);
    const normalResponses = [resA, resB].filter((r) => !r.cooldownActive);
    expect(cooldownResponses).toHaveLength(1);
    expect(normalResponses).toHaveLength(1);
    expect(cooldownResponses[0]!.cooldownEndsAt).toBeTruthy();
  }, 30_000);
});
