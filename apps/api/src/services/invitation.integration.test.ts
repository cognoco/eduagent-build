import { resolve } from 'path';

import { and, count, eq, inArray, like } from 'drizzle-orm';

import {
  accounts,
  createDatabase,
  familyLinks,
  generateUUIDv7,
  learningSessions,
  memberships,
  organizationInvitations,
  organizations,
  profiles,
  subjects,
  type Database,
  type MembershipRole,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { ConflictError, NotFoundError } from '../errors';
import {
  acceptInvitation,
  createClaim,
  createInvitation,
  redeemClaim,
} from './invitation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
const PREFIX = `invitation-service-${RUN_ID}`;

let db: Database;
let counter = 0;

type SeededPerson = {
  accountId: string;
  profileId: string;
  clerkUserId: string;
  email: string;
};

async function cleanup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const cleanupDb = createDatabase(process.env.DATABASE_URL);
  await cleanupDb
    .delete(organizationInvitations)
    .where(like(organizationInvitations.emailHint, `${PREFIX}%`));

  const orgs = await cleanupDb.query.organizations.findMany({
    where: like(organizations.name, `${PREFIX}%`),
    columns: { id: true },
  });
  if (orgs.length > 0) {
    await cleanupDb.delete(organizations).where(
      inArray(
        organizations.id,
        orgs.map((org) => org.id),
      ),
    );
  }

  const accountRows = await cleanupDb.query.accounts.findMany({
    where: like(accounts.clerkUserId, `${PREFIX}%`),
    columns: { id: true },
  });
  if (accountRows.length > 0) {
    await cleanupDb.delete(accounts).where(
      inArray(
        accounts.id,
        accountRows.map((account) => account.id),
      ),
    );
  }
}

async function seedCredentialedPerson(
  label: string,
  opts: { isOwner?: boolean; withHomeMembership?: boolean } = {},
): Promise<SeededPerson> {
  const index = ++counter;
  const clerkUserId = `${PREFIX}-${label}-${index}`;
  const email = `${PREFIX}-${label}-${index}@integration.test`;
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      clerkUserId,
      displayName: `${label} Person`,
      birthYear: 1990,
      isOwner: opts.isOwner ?? true,
    })
    .returning({ id: profiles.id });

  if (opts.withHomeMembership !== false) {
    await db.insert(organizations).values({
      id: account!.id,
      name: `${PREFIX}-${label}-${index}`,
    });
    await db.insert(memberships).values({
      personId: profile!.id,
      organizationId: account!.id,
      roles: opts.isOwner === false ? ['student'] : ['owner', 'student'],
    });
  }

  return {
    accountId: account!.id,
    profileId: profile!.id,
    clerkUserId,
    email,
  };
}

async function seedManagedChild(parent: SeededPerson): Promise<{
  profileId: string;
  subjectId: string;
  sessionId: string;
}> {
  const index = ++counter;
  const [child] = await db
    .insert(profiles)
    .values({
      accountId: parent.accountId,
      clerkUserId: null,
      displayName: `${PREFIX}-managed-child-${index}`,
      birthYear: 2012,
      isOwner: false,
    })
    .returning({ id: profiles.id });
  await db.insert(familyLinks).values({
    parentProfileId: parent.profileId,
    childProfileId: child!.id,
  });
  await db.insert(memberships).values({
    personId: child!.id,
    organizationId: parent.accountId,
    roles: ['student'],
  });
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: child!.id,
      name: `${PREFIX}-history-${index}`,
    })
    .returning({ id: subjects.id });
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: child!.id,
      subjectId: subject!.id,
      exchangeCount: 2,
    })
    .returning({ id: learningSessions.id });

  return {
    profileId: child!.id,
    subjectId: subject!.id,
    sessionId: session!.id,
  };
}

async function profileCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(profiles);
  return Number(row?.n ?? 0);
}

async function countChildHistory(profileId: string): Promise<{
  subjects: number;
  sessions: number;
}> {
  const [subjectRow] = await db
    .select({ n: count() })
    .from(subjects)
    .where(eq(subjects.profileId, profileId));
  const [sessionRow] = await db
    .select({ n: count() })
    .from(learningSessions)
    .where(eq(learningSessions.profileId, profileId));
  return {
    subjects: Number(subjectRow?.n ?? 0),
    sessions: Number(sessionRow?.n ?? 0),
  };
}

function sortedRoles(roles: MembershipRole[]): MembershipRole[] {
  return [...roles].sort();
}

describeIfDb('invitation service (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('accepts an invite by linking the accepter person to the inviting org without creating a duplicate profile', async () => {
    const inviter = await seedCredentialedPerson('inviter');
    const accepter = await seedCredentialedPerson('accepter');
    const beforeProfiles = await profileCount();
    const { invitation, rawToken } = await createInvitation(
      db,
      inviter.accountId,
      ['mentor'],
      { email: `${PREFIX}-mentor@example.test` },
    );

    expect(rawToken).not.toBe(invitation.tokenHash);
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const result = await acceptInvitation(
      db,
      rawToken,
      accepter.clerkUserId,
      accepter.email,
    );

    expect(result.organizationId).toBe(inviter.accountId);
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.personId, accepter.profileId),
        eq(memberships.organizationId, inviter.accountId),
      ),
    });
    expect(membership).toBeDefined();
    expect(sortedRoles(membership!.roles)).toEqual(['mentor']);
    await expect(profileCount()).resolves.toBe(beforeProfiles);

    const storedInvite = await db.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.id, invitation.id),
    });
    expect(storedInvite?.status).toBe('accepted');
    expect(storedInvite?.acceptedByProfileId).toBe(accepter.profileId);
  });

  it('merges invited roles into an existing membership when accepting an invite', async () => {
    const inviter = await seedCredentialedPerson('inviter-merge');
    const accepter = await seedCredentialedPerson('accepter-merge');
    await db.insert(memberships).values({
      personId: accepter.profileId,
      organizationId: inviter.accountId,
      roles: ['student'],
    });
    const { rawToken } = await createInvitation(
      db,
      inviter.accountId,
      ['mentor', 'student'],
      { email: `${PREFIX}-merge@example.test` },
    );

    const result = await acceptInvitation(
      db,
      rawToken,
      accepter.clerkUserId,
      accepter.email,
    );

    const membership = await db.query.memberships.findFirst({
      where: eq(memberships.id, result.membershipId),
    });
    expect(sortedRoles(membership!.roles)).toEqual(['mentor', 'student']);
  });

  it('redeems a managed-profile claim by attaching the Clerk sub while preserving learning history', async () => {
    const parent = await seedCredentialedPerson('parent');
    const child = await seedManagedChild(parent);
    const beforeHistory = await countChildHistory(child.profileId);
    const { rawToken } = await createClaim(
      db,
      parent.accountId,
      child.profileId,
      {
        email: `${PREFIX}-claim@example.test`,
      },
    );

    const result = await redeemClaim(db, rawToken, `${PREFIX}-graduated-sub`);

    expect(result.graduatedProfileId).toBe(child.profileId);
    const storedChild = await db.query.profiles.findFirst({
      where: eq(profiles.id, child.profileId),
      columns: { clerkUserId: true },
    });
    expect(storedChild?.clerkUserId).toBe(`${PREFIX}-graduated-sub`);
    await expect(countChildHistory(child.profileId)).resolves.toEqual(
      beforeHistory,
    );
  });

  it('rejects redeeming an already-accepted claim token', async () => {
    const parent = await seedCredentialedPerson('parent-accepted');
    const child = await seedManagedChild(parent);
    const { rawToken } = await createClaim(
      db,
      parent.accountId,
      child.profileId,
      { email: `${PREFIX}-accepted@example.test` },
    );
    await redeemClaim(db, rawToken, `${PREFIX}-first-redeemer`);

    await expect(
      redeemClaim(db, rawToken, `${PREFIX}-second-redeemer`),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a claim when the target profile is already credentialed before redemption', async () => {
    const parent = await seedCredentialedPerson('parent-credentialed');
    const child = await seedManagedChild(parent);
    const { rawToken } = await createClaim(
      db,
      parent.accountId,
      child.profileId,
      { email: `${PREFIX}-credentialed@example.test` },
    );
    await db
      .update(profiles)
      .set({ clerkUserId: `${PREFIX}-already-credentialed` })
      .where(eq(profiles.id, child.profileId));

    await expect(
      redeemClaim(db, rawToken, `${PREFIX}-new-redeemer`),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a claim when the redeemer sub already belongs to another profile', async () => {
    const parent = await seedCredentialedPerson('parent-duplicate');
    const child = await seedManagedChild(parent);
    const existing = await seedCredentialedPerson('existing-redeemer');
    const { rawToken } = await createClaim(
      db,
      parent.accountId,
      child.profileId,
      {
        email: `${PREFIX}-duplicate@example.test`,
      },
    );

    await expect(
      redeemClaim(db, rawToken, existing.clerkUserId),
    ).rejects.toBeInstanceOf(ConflictError);

    const target = await db.query.profiles.findFirst({
      where: eq(profiles.id, child.profileId),
      columns: { clerkUserId: true },
    });
    expect(target?.clerkUserId).toBeNull();
  });

  it('rejects expired invite and claim tokens', async () => {
    const inviter = await seedCredentialedPerson('expired-inviter');
    const accepter = await seedCredentialedPerson('expired-accepter');
    const expiredInvite = await createInvitation(
      db,
      inviter.accountId,
      ['mentor'],
      { email: `${PREFIX}-expired-invite@example.test`, ttlHours: -1 },
    );

    await expect(
      acceptInvitation(
        db,
        expiredInvite.rawToken,
        accepter.clerkUserId,
        accepter.email,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const child = await seedManagedChild(inviter);
    const expiredClaim = await createClaim(
      db,
      inviter.accountId,
      child.profileId,
      {
        email: `${PREFIX}-expired-claim@example.test`,
        ttlHours: -1,
      },
    );

    await expect(
      redeemClaim(db, expiredClaim.rawToken, `${PREFIX}-expired-redeemer`),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects unknown invitation tokens', async () => {
    await expect(
      acceptInvitation(db, 'missing-token', `${PREFIX}-missing`, undefined),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
