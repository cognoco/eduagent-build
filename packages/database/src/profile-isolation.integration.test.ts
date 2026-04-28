/**
 * [BUG-750] Profile-isolation integration test against real Postgres.
 *
 * The unit test in `profile-isolation.test.ts` verifies the *shape* of the
 * where clause built by createScopedRepository — but a passing where-clause
 * builder is not the same as a passing isolation guarantee at the DB layer.
 * If a developer ever changes the predicate from
 *   eq(subjects.profileId, profileId)
 * to
 *   eq(subjects.id, profileId)
 * the unit test still passes (it asserts only the SQL fragment shape) while
 * profiles silently see each other's data.
 *
 * This test exercises real INSERTs into Postgres and asserts that the scoped
 * repository's read methods cannot leak across profiles. It auto-skips when
 * DATABASE_URL is not set, mirroring `rls.integration.test.ts`.
 */

import { eq } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import { createScopedRepository } from './repository.js';
import { accounts, profiles, subjects, quizRounds } from './schema/index.js';

function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

const databaseUrl = getDatabaseUrl();
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('[BUG-750] profile isolation — real Postgres', () => {
  let db: Database;
  let accountA: string;
  let accountB: string;
  let profileA: string;
  let profileB: string;
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    db = createDatabase(databaseUrl!);
  });

  beforeEach(async () => {
    // Create two distinct accounts + profiles. Cascade delete in afterEach.
    const suffix = `bug-750-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_a_${suffix}`,
        email: `a_${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    const [b] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_b_${suffix}`,
        email: `b_${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    accountA = a!.id;
    accountB = b!.id;
    createdAccountIds.push(accountA, accountB);

    const [pa] = await db
      .insert(profiles)
      .values({
        accountId: accountA,
        displayName: 'Profile A',
        birthYear: 2010,
      })
      .returning({ id: profiles.id });
    const [pb] = await db
      .insert(profiles)
      .values({
        accountId: accountB,
        displayName: 'Profile B',
        birthYear: 2010,
      })
      .returning({ id: profiles.id });
    profileA = pa!.id;
    profileB = pb!.id;
  });

  afterEach(async () => {
    // Cascade delete via account FK chain.
    while (createdAccountIds.length > 0) {
      const id = createdAccountIds.pop()!;
      await db.delete(accounts).where(eq(accounts.id, id));
    }
  });

  it('subjects.findMany returns only the rows owned by the scoping profile', async () => {
    await db.insert(subjects).values([
      { profileId: profileA, name: 'A-Math' },
      { profileId: profileA, name: 'A-History' },
      { profileId: profileB, name: 'B-Math' },
    ]);

    const repoA = createScopedRepository(db, profileA);
    const repoB = createScopedRepository(db, profileB);

    const seenByA = await repoA.subjects.findMany();
    const seenByB = await repoB.subjects.findMany();

    const namesByA = seenByA.map((s) => s.name).sort();
    const namesByB = seenByB.map((s) => s.name).sort();

    expect(namesByA).toEqual(['A-History', 'A-Math']);
    expect(namesByB).toEqual(['B-Math']);

    // Strong isolation: every row a profile sees must be its own.
    for (const row of seenByA) {
      expect(row.profileId).toBe(profileA);
    }
    for (const row of seenByB) {
      expect(row.profileId).toBe(profileB);
    }
  });

  it("subjects.findFirst cannot return another profile's row even when the id matches", async () => {
    const [aRow] = await db
      .insert(subjects)
      .values({ profileId: profileA, name: 'A-Secret' })
      .returning({ id: subjects.id });

    const repoB = createScopedRepository(db, profileB);

    // Attempt to fetch A's subject by passing its id as an extra filter.
    // The scoped where clause AND'd in the profileId predicate must keep
    // this from leaking — findFirst must return null/undefined.
    const leaked = await repoB.subjects.findFirst(eq(subjects.id, aRow!.id));
    expect(leaked).toBeUndefined();
  });

  it("update with WHERE profileId guard cannot mutate another profile's row", async () => {
    // quizRounds.complete is the closest scoped-write surface today. We
    // insert a quizRound under profileA, then ask the scoped repo for
    // profileB to "complete" it. The atomic UPDATE WHERE id=… AND
    // profileId=… must affect zero rows, leaving the row intact.
    const [round] = await db
      .insert(quizRounds)
      .values({
        profileId: profileA,
        activityType: 'capitals',
        status: 'active',
        theme: 'EU',
        total: 5,
        questions: [],
      })
      .returning({ id: quizRounds.id });

    const repoB = createScopedRepository(db, profileB);

    const result = await repoB.quizRounds.completeActive(round!.id, {
      results: [],
      score: 99,
      xpEarned: 99,
      completedAt: new Date(),
    });

    // No rows updated — the scoped where clause filtered B out.
    expect(result).toBeUndefined();

    // The original row's status must still be 'active'.
    const after = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, round!.id),
    });
    expect(after?.status).toBe('active');
    expect(after?.score).toBeNull();
  });
});
