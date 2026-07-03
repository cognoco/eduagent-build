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
 *
 * [WI-1347] The isolation guarantee under test is keyed on `subjects`/
 * `quizRounds.profileId`, which currently FKs legacy `profiles.id` (not yet
 * re-pointed to `person.id` — WI-586). The seeds below are therefore
 * meaningless once `accounts`/`profiles` are dropped (WI-1306/0130): gated
 * (self-inerting, not retired — this is live BUG-750 coverage while the
 * legacy tables exist) rather than converted, since there is no v2
 * equivalent to convert TO yet. Each `it` bails with an explicit warning
 * (not a silent vacuous pass) if the legacy graph can't be seeded; a true
 * `describe.skip` would require a synchronous pre-check this driver can't
 * do. Disposition (retire vs. re-point) belongs to WI-1306/WI-1364 when the
 * tables actually drop. This suite is not wired into any CI target today
 * (the `database:test` target excludes `*.integration.test.ts`), so this
 * gate is about AC1/claim-accuracy, not corpus breakage.
 */

import { eq, sql } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import { createScopedRepository } from './repository.js';
import { accounts, profiles, subjects, quizRounds } from './schema/index.js';

function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

const databaseUrl = getDatabaseUrl();
const describeIntegration = databaseUrl ? describe : describe.skip;

async function legacyIdentityTablesPresent(db: Database): Promise<boolean> {
  const raw = (await db.execute(
    sql`SELECT to_regclass('public.accounts') AS accounts, to_regclass('public.profiles') AS profiles`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ accounts: string | null; profiles: string | null }>)
    : ((
        raw as {
          rows?: Array<{ accounts: string | null; profiles: string | null }>;
        }
      ).rows ?? []);
  const row = rows[0];
  return row?.accounts != null && row?.profiles != null;
}

describeIntegration('[BUG-750] profile isolation — real Postgres', () => {
  let db: Database;
  let accountA: string;
  let accountB: string;
  let profileA: string;
  let profileB: string;
  let legacyReady = false;
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    db = createDatabase(databaseUrl!);
    legacyReady = await legacyIdentityTablesPresent(db);
    if (!legacyReady) {
      console.warn(
        '[BUG-750] skipping: legacy accounts/profiles tables are absent. ' +
          'This suite tests isolation on the legacy-FK profileId path — ' +
          'meaningless once those tables drop (WI-1306/0130). See file ' +
          'header for disposition.',
      );
    }
  });

  beforeEach(async () => {
    if (!legacyReady) return;
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
    if (!legacyReady) return;
    // Cascade delete via account FK chain.
    while (createdAccountIds.length > 0) {
      const id = createdAccountIds.pop()!;
      await db.delete(accounts).where(eq(accounts.id, id));
    }
  });

  it('subjects.findMany returns only the rows owned by the scoping profile', async () => {
    if (!legacyReady) return;
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
    if (!legacyReady) return;
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
    if (!legacyReady) return;
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
