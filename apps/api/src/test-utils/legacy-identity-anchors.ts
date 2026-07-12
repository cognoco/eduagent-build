import { and, eq, inArray, or } from 'drizzle-orm';
import {
  generateUUIDv7,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription as subscriptionTable,
  subscriptionPayers,
  type Database,
} from '@eduagent/database';

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
    /**
     * [WI-1145] Seed a baseline free v2 `subscription` for the owner. Default
     * true — most suites want the post-collapse billing / metering reads to
     * resolve a row. Suites that own the full subscription lifecycle in their
     * own seed (e.g. billing-lifecycle, whose "repair a missing subscription"
     * case requires NO pre-existing sub) pass false and insert their own v2
     * subscription with a specific id.
     */
    seedBaselineSubscription?: boolean;
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

  // [WI-1145] Seed a baseline v2 `subscription` for the owner so v2 billing/
  // metering reads (getSubscriptionByAccountIdV2 / ensureFreeSubscriptionV2)
  // resolve a row on the post-collapse main lane, and so
  // setSubscriptionTierForProfile's v2 UPDATE has a row to mutate.
  if ((input.isOwner ?? true) && (input.seedBaselineSubscription ?? true)) {
    const [existingSubscription] = await db
      .select({ id: subscriptionTable.id })
      .from(subscriptionTable)
      .where(eq(subscriptionTable.organizationId, input.accountId))
      .limit(1);
    if (!existingSubscription) {
      await db.insert(subscriptionTable).values({
        id: generateUUIDv7(),
        organizationId: input.accountId,
        planTier: 'free',
        status: 'active',
        payerPersonId: input.profileId,
      });
    }
  }
}

export async function deleteV2IdentitiesForTest(
  db: Database,
  input: { accountIds?: string[]; profileIds?: string[] },
): Promise<void> {
  const profileIds = input.profileIds ?? [];
  const accountIds = input.accountIds ?? [];

  if (accountIds.length > 0) {
    await db
      .delete(subscriptionTable)
      .where(inArray(subscriptionTable.organizationId, accountIds));
  }

  if (profileIds.length > 0) {
    await db
      .delete(subscriptionTable)
      .where(inArray(subscriptionTable.payerPersonId, profileIds));
    await db
      .delete(subscriptionPayers)
      .where(inArray(subscriptionPayers.personId, profileIds));
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
