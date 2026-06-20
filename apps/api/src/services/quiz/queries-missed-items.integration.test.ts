/**
 * Integration break-test for BUG-853:
 *   getRecentMissedItems previously called repo.quizMissedItems.findMany()
 *   without orderBy, then sliced the result in JS. Postgres does not guarantee
 *   row order without ORDER BY, so the "recent" items fed to the LLM prompt
 *   were nondeterministic.
 *
 * Fix: push ORDER BY createdAt DESC + SQL LIMIT into the repository layer.
 *
 * Red-green verification:
 *   1. Write tests — fail without the fix (findMany has no orderBy/limit).
 *   2. Apply fix to repository.ts + queries.ts.
 *   3. Re-run — all assertions pass.
 */
import { inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  profiles,
  quizMissedItems,
  quizRounds,
  subjects,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { getRecentMissedItems } from './queries';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-quiz-missed-items-bug853';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-01`,
  email: `${PREFIX}-01@integration.test`,
};

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.accounts.findMany({
    where: inArray(accounts.email, [ACCOUNT.email]),
  });

  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((row: typeof accounts.$inferSelect) => row.id),
      ),
    );
  }
}

async function seedProfileAndRound() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: ACCOUNT.clerkUserId,
      email: ACCOUNT.email,
    })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Missed Items Integration Profile',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: 'Capitals Practice',
      status: 'active',
      pedagogyMode: 'four_strands',
    })
    .returning();
  // A completed round is required as the FK target for quiz_missed_items.source_round_id.
  const [round] = await db
    .insert(quizRounds)
    .values({
      profileId: profile!.id,
      subjectId: subject!.id,
      activityType: 'capitals',
      theme: 'Europe capitals',
      status: 'completed',
      total: 5,
      score: 3,
      completedAt: new Date(),
    })
    .returning();

  return { db, profile: profile!, round: round! };
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('getRecentMissedItems (integration) [BUG-853]', () => {
  it('break test: returns items ordered most-recent-first, not in insertion order', async () => {
    const { db, profile, round } = await seedProfileAndRound();

    // Insert 3 missed items with DECREASING createdAt (oldest first by insertion).
    // Without ORDER BY createdAt DESC the DB may return them in heap/insertion
    // order. The fix pushes ORDER BY + LIMIT into SQL so the result is always
    // newest-first regardless of physical storage order.
    const now = Date.now();
    await db.insert(quizMissedItems).values([
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'oldest-Q',
        correctAnswer: 'oldest-A',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 3_000),
      },
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'middle-Q',
        correctAnswer: 'middle-A',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 2_000),
      },
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'newest-Q',
        correctAnswer: 'newest-A',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 1_000),
      },
    ]);

    const result = await getRecentMissedItems(db, profile.id, 'capitals', 10);

    expect(result).toHaveLength(3);
    // Most-recent item must come first (createdAt DESC ordering).
    expect(result[0]!.questionText).toBe('newest-Q');
    expect(result[1]!.questionText).toBe('middle-Q');
    expect(result[2]!.questionText).toBe('oldest-Q');
  }, 15_000);

  it('break test: respects the limit at the SQL layer (not JS slice)', async () => {
    const { db, profile, round } = await seedProfileAndRound();

    const now = Date.now();
    await db.insert(quizMissedItems).values([
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'item-1',
        correctAnswer: 'ans-1',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 4_000),
      },
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'item-2',
        correctAnswer: 'ans-2',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 3_000),
      },
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'item-3',
        correctAnswer: 'ans-3',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 2_000),
      },
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'item-4',
        correctAnswer: 'ans-4',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 1_000),
      },
    ]);

    // Request only 2 items. With the fix, SQL LIMIT 2 is applied and only
    // the 2 most-recent rows are returned. Without the fix, all 4 rows are
    // fetched and JS .slice(0, 2) is applied — which also gives 2 rows, but
    // they would be in nondeterministic order because there is no ORDER BY.
    const result = await getRecentMissedItems(db, profile.id, 'capitals', 2);

    expect(result).toHaveLength(2);
    // With fix: newest 2 items returned in DESC order.
    expect(result[0]!.questionText).toBe('item-4');
    expect(result[1]!.questionText).toBe('item-3');
  }, 15_000);

  it('filters by activityType (excludes items for other activity types)', async () => {
    const { db, profile, round } = await seedProfileAndRound();

    const now = Date.now();
    await db.insert(quizMissedItems).values([
      {
        profileId: profile.id,
        activityType: 'capitals',
        questionText: 'caps-Q',
        correctAnswer: 'caps-A',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 1_000),
      },
      {
        profileId: profile.id,
        activityType: 'guess_who',
        questionText: 'gw-Q',
        correctAnswer: 'gw-A',
        sourceRoundId: round.id,
        surfaced: false,
        convertedToTopic: false,
        createdAt: new Date(now - 500),
      },
    ]);

    const result = await getRecentMissedItems(db, profile.id, 'capitals', 10);

    expect(result).toHaveLength(1);
    expect(result[0]!.questionText).toBe('caps-Q');
  }, 15_000);
});
