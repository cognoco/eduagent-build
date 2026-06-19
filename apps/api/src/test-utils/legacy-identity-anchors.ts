import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  accounts,
  generateUUIDv7,
  guardianship,
  login,
  membership,
  organization,
  person,
  profiles,
  subscriptions,
  type Database,
} from '@eduagent/database';

const tableExistsCache = new Map<string, boolean>();

type LegacyIdentityTableName =
  | 'accounts'
  | 'profiles'
  | 'family_links'
  | 'subscriptions';

async function tableExists(db: Database, table: LegacyIdentityTableName) {
  const cached = tableExistsCache.get(table);
  if (cached !== undefined) return cached;

  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  const exists = rows[0]?.reg != null;
  tableExistsCache.set(table, exists);
  return exists;
}

export async function legacyIdentityTableExistsForTest(
  db: Database,
  table: LegacyIdentityTableName,
): Promise<boolean> {
  return tableExists(db, table);
}

export async function ensureLegacyProfileAnchorForTest(
  db: Database,
  input: {
    profileId: string;
    accountId?: string;
    displayName?: string;
    birthYear?: number;
    isOwner?: boolean;
    email?: string;
    clerkUserId?: string;
  },
): Promise<void> {
  const accountId = input.accountId ?? input.profileId;

  if (await tableExists(db, 'accounts')) {
    await db
      .insert(accounts)
      .values({
        id: accountId,
        clerkUserId: input.clerkUserId ?? `clerk_legacy_anchor_${accountId}`,
        email: input.email ?? `legacy-anchor-${accountId}@test.local`,
      })
      .onConflictDoNothing();
  }

  if (await tableExists(db, 'profiles')) {
    await db
      .insert(profiles)
      .values({
        id: input.profileId,
        accountId,
        displayName: input.displayName ?? 'Test Learner',
        birthYear: input.birthYear ?? 2005,
        isOwner: input.isOwner ?? false,
      })
      .onConflictDoNothing();
  }
}

export async function ensureLegacySubscriptionAnchorForTest(
  db: Database,
  input: {
    subscriptionId: string;
    accountId: string;
    tier?: 'free' | 'plus' | 'family' | 'pro';
    status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
  },
): Promise<void> {
  if (!(await tableExists(db, 'subscriptions'))) return;

  await db
    .insert(subscriptions)
    .values({
      id: input.subscriptionId,
      accountId: input.accountId,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      tier: input.tier ?? 'free',
      status: input.status ?? 'active',
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    })
    .onConflictDoNothing();
}

export async function deleteLegacyAccountsForTest(
  db: Database,
  accountIds: string[],
): Promise<void> {
  if (accountIds.length === 0) return;
  if (!(await tableExists(db, 'accounts'))) return;

  await db.delete(accounts).where(inArray(accounts.id, accountIds));
}

export async function ensureV2IdentityForLegacyProfileTest(
  db: Database,
  input: {
    accountId: string;
    profileId: string;
    displayName: string;
    birthYear: number;
    clerkUserId: string;
    email: string;
    isOwner?: boolean;
  },
): Promise<void> {
  await db
    .insert(organization)
    .values({
      id: input.accountId,
      name: `Test org ${input.accountId.slice(0, 8)}`,
    })
    .onConflictDoNothing();

  await db
    .insert(person)
    .values({
      id: input.profileId,
      displayName: input.displayName,
      birthDate: `${input.birthYear}-01-01`,
      residenceJurisdiction: 'EU',
    })
    .onConflictDoNothing();

  if (input.isOwner ?? true) {
    const loginId = generateUUIDv7();
    await db
      .insert(login)
      .values({
        id: loginId,
        personId: input.profileId,
        clerkUserId: input.clerkUserId,
        email: input.email,
      })
      .onConflictDoNothing();

    const loginRow = await db.query.login.findFirst({
      where: eq(login.clerkUserId, input.clerkUserId),
      columns: { id: true },
    });
    if (loginRow) {
      await db
        .update(person)
        .set({ loginId: loginRow.id })
        .where(eq(person.id, input.profileId));
    }
  }

  const existingMembership = await db.query.membership.findFirst({
    where: and(
      eq(membership.personId, input.profileId),
      eq(membership.organizationId, input.accountId),
    ),
    columns: { id: true },
  });
  if (!existingMembership) {
    await db.insert(membership).values({
      personId: input.profileId,
      organizationId: input.accountId,
      roles: (input.isOwner ?? true) ? ['admin', 'learner'] : ['learner'],
    });
  }
}

export async function deleteV2IdentitiesForTest(
  db: Database,
  input: { accountIds?: string[]; profileIds?: string[] },
): Promise<void> {
  const profileIds = input.profileIds ?? [];
  const accountIds = input.accountIds ?? [];

  if (profileIds.length > 0) {
    await db
      .delete(guardianship)
      .where(
        or(
          inArray(guardianship.guardianPersonId, profileIds),
          inArray(guardianship.chargePersonId, profileIds),
        ),
      );
    await db.delete(membership).where(inArray(membership.personId, profileIds));
    await db.delete(login).where(inArray(login.personId, profileIds));
    await db.delete(person).where(inArray(person.id, profileIds));
  }

  if (accountIds.length > 0) {
    await db
      .delete(membership)
      .where(inArray(membership.organizationId, accountIds));
    await db.delete(organization).where(inArray(organization.id, accountIds));
  }
}
