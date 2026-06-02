/**
 * [Identity T1] Forward invariants + the CHECK break test.
 *
 * Auto-skips when DATABASE_URL is not set (real Postgres required — the CHECK
 * constraint can only be exercised at the DB layer).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { eq, sql } from 'drizzle-orm';
import { createDatabase, type Database } from './client.js';
import {
  accounts,
  profiles,
  organizations,
  memberships,
} from './schema/index.js';

const BACKFILL_SQL = readFileSync(
  join(__dirname, 'migrations/identity-t1-backfill.sql'),
  'utf8',
);

const databaseUrl = process.env.DATABASE_URL ?? null;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('[Identity T1] membership invariants', () => {
  let db: Database;
  const createdAccountIds: string[] = [];
  // Orgs created directly by a test (not via the backfill). The backfill makes
  // an org-of-one whose id equals the account id, so those are cleaned via the
  // account loop below; standalone orgs (CHECK/multi-org tests) need their own
  // list so they don't leak between tests.
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    db = createDatabase(databaseUrl!);
  });

  afterEach(async () => {
    for (const id of createdAccountIds) {
      await db.delete(accounts).where(eq(accounts.id, id));
      // Backfill reuses account.id as the org-of-one id — delete that org too.
      await db.delete(organizations).where(eq(organizations.id, id));
    }
    for (const id of createdOrganizationIds) {
      await db.delete(organizations).where(eq(organizations.id, id));
    }
    createdAccountIds.length = 0;
    createdOrganizationIds.length = 0;
  });

  async function seedAccountWithOwnerAndChild(): Promise<{
    owner: string;
    child: string;
  }> {
    const suffix = `t1inv-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    const [owner] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'Owner',
        birthYear: 1990,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    const [child] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'Child',
        birthYear: 2012,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    await db.execute(sql.raw(BACKFILL_SQL));
    return { owner: owner!.id, child: child!.id };
  }

  it('every person has at least one membership', async () => {
    // Seed two persons, run the backfill, and assert BOTH got a membership.
    // Red-verify: temporarily delete the step-2 membership INSERT from
    // identity-t1-backfill.sql and re-run — this assertion goes red because the
    // child (and owner) end up with zero memberships.
    const { owner, child } = await seedAccountWithOwnerAndChild();
    for (const personId of [owner, child]) {
      const rows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.personId, personId));
      expect(rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every membership has a non-empty role set', async () => {
    await seedAccountWithOwnerAndChild();
    // Global invariant — the CHECK guarantees it, so this reads 0 and would
    // catch a future migration that drops/weakens memberships_roles_non_empty.
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM memberships WHERE cardinality(roles) < 1`,
    );
    const n = (result as unknown as { rows: { n: number }[] }).rows[0]!.n;
    expect(n).toBe(0);
  });

  it('empty roles array is rejected by the CHECK constraint', async () => {
    // The break test for CRITICAL-1. Fails (no error thrown) if the constraint
    // is written with array_length(roles, 1) instead of cardinality(roles),
    // which is exactly the regression it guards: array_length on '{}' returns
    // NULL, so `NULL >= 1` is UNKNOWN and the empty array would slip through.
    const suffix = `t1chk-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    const [person] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'Person',
        birthYear: 1990,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org' })
      .returning({ id: organizations.id });
    createdOrganizationIds.push(org!.id);

    await expect(
      db.insert(memberships).values({
        personId: person!.id,
        organizationId: org!.id,
        roles: [], // empty set — must be rejected by memberships_roles_non_empty
      }),
    ).rejects.toThrow();
  });

  it('a roles array containing NULL is rejected by the CHECK constraint', async () => {
    // Break test for the ARRAY[NULL] gap: cardinality(ARRAY[NULL]) = 1, so the
    // memberships_roles_non_empty CHECK alone would let a role-less row through.
    // The companion memberships_roles_no_null CHECK must reject it. Red-verify:
    // drop that constraint and this stops throwing.
    const suffix = `t1null-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    const [person] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'Person',
        birthYear: 1990,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org' })
      .returning({ id: organizations.id });
    createdOrganizationIds.push(org!.id);

    // Raw SQL: a NULL array element can't be expressed through the typed
    // drizzle insert (roles is membership_role[], not (membership_role|null)[]).
    await expect(
      db.execute(sql`
        INSERT INTO memberships (id, person_id, organization_id, roles)
        VALUES (
          gen_random_uuid(),
          ${person!.id},
          ${org!.id},
          ARRAY[NULL]::membership_role[]
        )
      `),
    ).rejects.toThrow();
  });

  it('a person can hold >=2 memberships in different orgs with different role sets', async () => {
    // Program-plan T1 done-when: the whole point of the model is that one person
    // belongs to multiple orgs with editable, per-org role sets. The backfill
    // only ever makes an org-of-one, so this proves the SCHEMA supports the
    // multi-membership shape the later phases depend on. The (person_id,
    // organization_id) unique constraint permits N orgs per person.
    const suffix = `t1multi-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    const [person] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'Multi-Org Person',
        birthYear: 1990,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    const [orgA] = await db
      .insert(organizations)
      .values({ name: 'Org A' })
      .returning({ id: organizations.id });
    const [orgB] = await db
      .insert(organizations)
      .values({ name: 'Org B' })
      .returning({ id: organizations.id });
    createdOrganizationIds.push(orgA!.id, orgB!.id);

    await db.insert(memberships).values({
      personId: person!.id,
      organizationId: orgA!.id,
      roles: ['owner', 'student'],
    });
    await db.insert(memberships).values({
      personId: person!.id,
      organizationId: orgB!.id,
      roles: ['mentor', 'student'],
    });

    const rows = await db
      .select({
        organizationId: memberships.organizationId,
        roles: memberships.roles,
      })
      .from(memberships)
      .where(eq(memberships.personId, person!.id));
    expect(rows.length).toBe(2);
    const byOrg = Object.fromEntries(
      rows.map((r) => [r.organizationId, r.roles.slice().sort()]),
    );
    expect(byOrg[orgA!.id]).toEqual(['owner', 'student']);
    expect(byOrg[orgB!.id]).toEqual(['mentor', 'student']);
  });

  it('the one-owner guard RAISEs when an account has >1 owner (active + archived)', async () => {
    // [H2] The guard's whole job is to abort before step 3 duplicate-keys
    // profiles.clerk_user_id. An account with one active + one archived owner
    // has TWO is_owner rows — the guard counts archived owners too, so it must
    // raise. Untested, this abort path could silently regress (e.g. a later
    // edit adding `AND archived_at IS NULL` to the guard would let it through).
    const suffix = `t1guard-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    await db.insert(profiles).values({
      accountId: a!.id,
      displayName: 'Active Owner',
      birthYear: 1985,
      isOwner: true,
    });
    await db.insert(profiles).values({
      accountId: a!.id,
      displayName: 'Archived Owner',
      birthYear: 1986,
      isOwner: true,
      archivedAt: new Date(),
    });

    await expect(db.execute(sql.raw(BACKFILL_SQL))).rejects.toThrow(
      /more than one|>1 is_owner|account\(s\) with/i,
    );
  });

  it('a zero-owner account is allowed: every profile gets {student}, no credential copied', async () => {
    // [M2] The guard only catches >1 owner — a zero-owner account is permitted.
    // Pin the resulting behavior so it is a conscious contract: the org name
    // falls back to the email local-part, every profile is {student}, and no
    // clerk_user_id is copied (no owner to copy it to).
    const suffix = `t1zero-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [a] = await db
      .insert(accounts)
      .values({
        clerkUserId: `user_${suffix}`,
        email: `zeroowner_${suffix}@example.test`,
      })
      .returning({ id: accounts.id });
    createdAccountIds.push(a!.id);
    const [p] = await db
      .insert(profiles)
      .values({
        accountId: a!.id,
        displayName: 'No-Owner Person',
        birthYear: 2011,
        isOwner: false,
      })
      .returning({ id: profiles.id });

    await db.execute(sql.raw(BACKFILL_SQL));

    const [m] = await db
      .select({ roles: memberships.roles })
      .from(memberships)
      .where(eq(memberships.personId, p!.id));
    expect((m?.roles ?? []).slice().sort()).toEqual(['student']);

    const [prof] = await db
      .select({ clerkUserId: profiles.clerkUserId })
      .from(profiles)
      .where(eq(profiles.id, p!.id));
    expect(prof!.clerkUserId).toBeNull();

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, a!.id));
    expect(org!.name).toBe(`zeroowner_${suffix}`); // email local-part fallback
  });
});
