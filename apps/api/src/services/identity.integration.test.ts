import { eq, inArray, and } from 'drizzle-orm';
import { resolve } from 'path';

import {
  accounts,
  createDatabase,
  familyLinks,
  memberships,
  organizations,
  profiles,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import {
  ensureIdentityV1,
  resolveActiveMembershipRoles,
  resolvePersonByClerkId,
} from './identity';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const PREFIX = `identity-t2-${Date.now()}`;
const createdAccountIds: string[] = [];

describeIfDb('Identity V1 service (integration)', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await db
        .delete(accounts)
        .where(inArray(accounts.id, [...createdAccountIds]));
      await db
        .delete(organizations)
        .where(inArray(organizations.id, [...createdAccountIds]));
      createdAccountIds.length = 0;
    }
  });

  async function seedAccount(tag: string) {
    const [account] = await db
      .insert(accounts)
      .values({
        clerkUserId: `${PREFIX}-${tag}-clerk`,
        email: `${PREFIX}-${tag}@integration.test`,
        timezone: 'Europe/Oslo',
      })
      .returning();
    createdAccountIds.push(account!.id);
    return account!;
  }

  async function seedProfile(input: {
    accountId: string;
    tag: string;
    isOwner: boolean;
    clerkUserId?: string | null;
  }) {
    const [profile] = await db
      .insert(profiles)
      .values({
        accountId: input.accountId,
        displayName: `Profile ${input.tag}`,
        birthYear: input.isOwner ? 1990 : 2014,
        isOwner: input.isOwner,
        clerkUserId: input.clerkUserId ?? null,
      })
      .returning();
    return profile!;
  }

  it('resolvePersonByClerkId returns the matching profile and null otherwise', async () => {
    const account = await seedAccount('resolve');
    const profile = await seedProfile({
      accountId: account.id,
      tag: 'resolve',
      isOwner: true,
      clerkUserId: 'clerk-person-resolve',
    });

    await expect(
      resolvePersonByClerkId(db, 'clerk-person-resolve'),
    ).resolves.toMatchObject({ id: profile.id });
    await expect(resolvePersonByClerkId(db, 'missing-sub')).resolves.toBeNull();
  });

  it('ensureIdentityV1 creates home org, copies owner credential, creates roles, and is idempotent', async () => {
    const account = await seedAccount('ensure');
    const owner = await seedProfile({
      accountId: account.id,
      tag: 'owner',
      isOwner: true,
    });
    const child = await seedProfile({
      accountId: account.id,
      tag: 'child',
      isOwner: false,
    });
    await db.insert(familyLinks).values({
      parentProfileId: owner.id,
      childProfileId: child.id,
    });

    await ensureIdentityV1(db, account);
    await ensureIdentityV1(db, account);

    const orgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, account.id));
    expect(orgs).toHaveLength(1);
    expect(orgs[0]!.id).toBe(account.id);

    const storedOwner = await db.query.profiles.findFirst({
      where: eq(profiles.id, owner.id),
      columns: { clerkUserId: true },
    });
    const storedChild = await db.query.profiles.findFirst({
      where: eq(profiles.id, child.id),
      columns: { clerkUserId: true },
    });
    expect(storedOwner?.clerkUserId).toBe(account.clerkUserId);
    expect(storedChild?.clerkUserId).toBeNull();

    const rows = await db
      .select({ personId: memberships.personId, roles: memberships.roles })
      .from(memberships)
      .where(eq(memberships.organizationId, account.id));
    expect(rows).toHaveLength(2);
    const byPerson = Object.fromEntries(
      rows.map((row) => [row.personId, row.roles.slice().sort()]),
    );
    expect(byPerson[owner.id]).toEqual(['mentor', 'owner', 'student']);
    expect(byPerson[child.id]).toEqual(['student']);
  });

  it('resolveActiveMembershipRoles returns existing roles without rewriting', async () => {
    const account = await seedAccount('existing-roles');
    const person = await seedProfile({
      accountId: account.id,
      tag: 'existing',
      isOwner: false,
    });
    await db.insert(organizations).values({
      id: account.id,
      name: 'Existing Roles Org',
    });
    await db.insert(memberships).values({
      personId: person.id,
      organizationId: account.id,
      roles: ['mentor', 'student'],
    });

    await expect(
      resolveActiveMembershipRoles(db, person.id, account.id),
    ).resolves.toEqual(['mentor', 'student']);
  });

  it('resolveActiveMembershipRoles self-heals missing non-owner and owner memberships idempotently', async () => {
    const account = await seedAccount('self-heal');
    await db.insert(organizations).values({
      id: account.id,
      name: 'Self Heal Org',
    });
    const owner = await seedProfile({
      accountId: account.id,
      tag: 'heal-owner',
      isOwner: true,
    });
    const child = await seedProfile({
      accountId: account.id,
      tag: 'heal-child',
      isOwner: false,
    });

    await expect(
      resolveActiveMembershipRoles(db, child.id, account.id),
    ).resolves.toEqual(['student']);
    await expect(
      resolveActiveMembershipRoles(db, owner.id, account.id),
    ).resolves.toEqual(['owner', 'student']);
    await resolveActiveMembershipRoles(db, child.id, account.id);

    const rows = await db
      .select({ id: memberships.id, personId: memberships.personId })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, account.id),
          inArray(memberships.personId, [owner.id, child.id]),
        ),
      );
    expect(rows).toHaveLength(2);
  });
});
