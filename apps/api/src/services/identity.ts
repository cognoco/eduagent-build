import { and, eq, isNull } from 'drizzle-orm';

import {
  accounts,
  familyLinks,
  memberships,
  organizations,
  profiles,
  type Database,
  type MembershipRole,
} from '@eduagent/database';

import { createLogger } from './logger';

const logger = createLogger();

type AccountForIdentity = Pick<
  typeof accounts.$inferSelect,
  'id' | 'clerkUserId' | 'email' | 'timezone'
>;

function addRole(
  roles: MembershipRole[],
  role: MembershipRole,
): MembershipRole[] {
  return roles.includes(role) ? roles : [...roles, role];
}

async function deriveMembershipRoles(
  db: Database,
  profile: Pick<typeof profiles.$inferSelect, 'id' | 'isOwner'>,
): Promise<MembershipRole[]> {
  let roles: MembershipRole[] = profile.isOwner
    ? ['owner', 'student']
    : ['student'];
  const parentLink = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.parentProfileId, profile.id),
    columns: { id: true },
  });
  if (parentLink) {
    roles = addRole(roles, 'mentor');
  }
  return roles;
}

export async function resolvePersonByClerkId(
  db: Database,
  clerkUserId: string,
): Promise<typeof profiles.$inferSelect | null> {
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.clerkUserId, clerkUserId),
  });
  return row ?? null;
}

export async function ensureIdentityV1(
  db: Database,
  account: AccountForIdentity,
): Promise<void> {
  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.id, account.id),
    columns: { id: true },
  });
  if (existingOrg) return;

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const existingInTx = await txDb.query.organizations.findFirst({
      where: eq(organizations.id, account.id),
      columns: { id: true },
    });
    if (existingInTx) return;

    const accountProfiles = await txDb.query.profiles.findMany({
      where: eq(profiles.accountId, account.id),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    });
    const owner = accountProfiles.find((profile) => profile.isOwner);
    const fallbackName = account.email.split('@')[0] || 'Organization';

    await txDb.insert(organizations).values({
      id: account.id,
      name: owner?.displayName?.trim() || fallbackName,
      timezone: account.timezone,
    });

    await txDb
      .update(profiles)
      .set({ clerkUserId: account.clerkUserId, updatedAt: new Date() })
      .where(
        and(
          eq(profiles.accountId, account.id),
          eq(profiles.isOwner, true),
          isNull(profiles.clerkUserId),
        ),
      );

    for (const profile of accountProfiles) {
      const roles = await deriveMembershipRoles(txDb, profile);
      await txDb
        .insert(memberships)
        .values({
          personId: profile.id,
          organizationId: account.id,
          roles,
        })
        .onConflictDoNothing({
          target: [memberships.personId, memberships.organizationId],
        });
    }
  });
}

export async function resolveActiveMembershipRoles(
  db: Database,
  profileId: string,
  organizationId: string,
): Promise<MembershipRole[]> {
  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.personId, profileId),
      eq(memberships.organizationId, organizationId),
    ),
  });
  if (existing) return existing.roles;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });
  if (!profile) return [];

  const roles = await deriveMembershipRoles(db, profile);
  logger.warn('membership.self_heal', { profileId, organizationId, roles });

  await db
    .insert(memberships)
    .values({ personId: profileId, organizationId, roles })
    .onConflictDoNothing({
      target: [memberships.personId, memberships.organizationId],
    });

  const healed = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.personId, profileId),
      eq(memberships.organizationId, organizationId),
    ),
  });
  return healed?.roles ?? roles;
}
