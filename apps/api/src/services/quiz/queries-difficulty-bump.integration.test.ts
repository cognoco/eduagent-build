import { inArray } from 'drizzle-orm';
import {
  createDatabase,
  person,
  quizRounds,
  subjects,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { getRecentCompletedByActivity } from './queries';
import { shouldApplyDifficultyBump } from './difficulty-bump';

// Integration break test for CR-2026-05-19-H10:
//   Difficulty-bump query previously fetched the 3 most-recent rounds of ANY
//   status and filtered to status === 'completed' in application code. When
//   the 3 most-recent rows were abandoned (e.g. prefetched rounds the user
//   never played), the filter discarded them and the bump silently never
//   fired even though the learner had a genuine perfect streak just past
//   position 3.
//
// Without the fix (status filter in the SQL WHERE), this test would fail:
// the query would return 3 abandoned rows, the application-side filter would
// discard them, and `shouldApplyDifficultyBump` would receive an empty array
// and return false. With the fix, the SQL returns only the 3 completed
// perfect-score rounds and the bump fires.

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

const PREFIX = 'integration-quiz-difficulty-bump';
const PROFILE_DISPLAY_NAME = `${PREFIX}-profile`;

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.person.findMany({
    where: inArray(person.displayName, [PROFILE_DISPLAY_NAME]),
  });

  if (rows.length > 0) {
    await db.delete(person).where(
      inArray(
        person.id,
        rows.map((row: typeof person.$inferSelect) => row.id),
      ),
    );
  }
}

async function seedProfileAndSubject() {
  const db = createIntegrationDb();
  const [profile] = await db
    .insert(person)
    .values({
      displayName: PROFILE_DISPLAY_NAME,
      birthDate: '2012-01-01',
      residenceJurisdiction: 'EU',
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

  return {
    db,
    profile: profile!,
    subject: subject!,
  };
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('getRecentCompletedByActivity (integration) [CR-2026-05-19-H10]', () => {
  it('break test: 3 abandoned rounds + 0 completed → bump does NOT fire and query returns nothing', async () => {
    const { db, profile, subject } = await seedProfileAndSubject();

    // Seed 3 abandoned rounds (e.g. prefetched but never played). These are
    // the 3 most-recent rows by createdAt.
    const now = Date.now();
    const baseRow = {
      profileId: profile.id,
      subjectId: subject.id,
      activityType: 'capitals' as const,
      theme: 'Europe capitals',
      total: 5,
    };
    await db.insert(quizRounds).values([
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 1_000),
      },
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 2_000),
      },
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 3_000),
      },
    ]);

    const rows = await getRecentCompletedByActivity(
      db,
      profile.id,
      'capitals',
      3,
    );

    // With the fix: SQL filters status = 'completed' → 0 rows returned.
    // Without the fix: 3 abandoned rows returned, application-side filter
    // discards them, bump still does not fire (but for the wrong reason).
    expect(rows).toHaveLength(0);

    const bump = shouldApplyDifficultyBump(
      rows.map((r) => ({
        score: r.score,
        total: r.total,
        completedAt: r.completedAt,
      })),
    );
    expect(bump).toBe(false);
  }, 15_000);

  it('break test: 3 abandoned rounds (most recent) + 3 perfect completed rounds → bump FIRES with fix; would NOT fire without it', async () => {
    const { db, profile, subject } = await seedProfileAndSubject();

    // This is the canonical bug repro: the 3 most-recent rows by createdAt
    // are abandoned (prefetched-but-never-played), so a query that fetches
    // "the 3 most recent of ANY status" returns only those — and an
    // application-side filter to status === 'completed' discards them all,
    // returning an empty array. shouldApplyDifficultyBump then returns false
    // even though the learner has 3 perfect completed rounds just behind the
    // abandoned ones.
    //
    // With the SQL-level status filter (the fix), the abandoned rows are
    // never returned and the 3 perfect completed rounds occupy the limit=3
    // window. The bump fires.
    const now = Date.now();
    const baseRow = {
      profileId: profile.id,
      subjectId: subject.id,
      activityType: 'capitals' as const,
      theme: 'Europe capitals',
      total: 5,
    };

    // Three older perfect completed rounds (within the 14-day window).
    const completedAt1 = new Date(now - 60_000);
    const completedAt2 = new Date(now - 70_000);
    const completedAt3 = new Date(now - 80_000);
    await db.insert(quizRounds).values([
      {
        ...baseRow,
        status: 'completed',
        score: 5,
        completedAt: completedAt1,
        createdAt: new Date(now - 60_000),
      },
      {
        ...baseRow,
        status: 'completed',
        score: 5,
        completedAt: completedAt2,
        createdAt: new Date(now - 70_000),
      },
      {
        ...baseRow,
        status: 'completed',
        score: 5,
        completedAt: completedAt3,
        createdAt: new Date(now - 80_000),
      },
    ]);

    // Three MORE-RECENT abandoned rounds (the prefetched-but-never-played
    // class that triggered the original bug).
    await db.insert(quizRounds).values([
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 1_000),
      },
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 2_000),
      },
      {
        ...baseRow,
        status: 'abandoned',
        score: null,
        completedAt: null,
        createdAt: new Date(now - 3_000),
      },
    ]);

    const rows = await getRecentCompletedByActivity(
      db,
      profile.id,
      'capitals',
      3,
    );

    // With the fix: 3 completed rounds returned (abandoned rounds filtered
    // in SQL). Without the fix: 3 abandoned rounds returned.
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);

    const bump = shouldApplyDifficultyBump(
      rows.map((r) => ({
        score: r.score,
        total: r.total,
        completedAt: r.completedAt,
      })),
    );
    // With the fix, the bump fires because all 3 returned rows are perfect
    // completed rounds. This assertion is the load-bearing one: it fails
    // without the SQL-level status filter.
    expect(bump).toBe(true);
  }, 15_000);
});
