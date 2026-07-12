// ---------------------------------------------------------------------------
// [WI-1753] acceptFamilyJoin — integration break-tests against the real identity
// graph. acceptFamilyJoin is the single mutation point for the existing-teen
// family join: it REPOINTS the teen's solo membership into the parent's family
// org (roles reset to ['learner']) and tears down the emptied org-of-one, all in
// ONE transaction.
//
// This file carries the NEGATIVE break-test per non-negotiable invariant that is
// exercisable at the service layer (AC-1 anti-enumeration lives on the Phase-2
// invite endpoint and is tested there):
//   AC-2  repoint to family org + roles=['learner'] + org-of-one torn down.
//   AC-3  NEVER an auto-guardianship row; supportership only on explicit opt-in.
//   AC-4  person_id is stable — the teen person survives the join.
//   AC-5  any precondition failure rolls the whole tx back — rows unchanged;
//         the teen is never orphaned (always in exactly one org).
//   AC-6  the active store ref is captured BEFORE the subscription teardown.
//   wrong-target guard: refuse unless a GENUINE solo org-of-one, not a guardian,
//         consent-capable by age; refuse self-join and a family org with no sub.
//
// SEQUENCING (mirror child-profile-v2.integration.test.ts): the happy path writes
// a `profile_quota_usage` satellite (seating the teen on the family sub) and the
// seed graph itself writes one, so every seeded test is gated on
// IDENTITY_V2_REPOINTED and SKIPs otherwise. The self-join guard throws before
// any DB op, so it runs on DATABASE_URL alone.
//
// MIGRATION PREREQUISITE: the seeded tests require the Phase-1 additive column
// `person.migration_pending_at` (migration 0143) to be applied to the target DB.
// The Drizzle `person` schema declares it, so every insert/select on person
// emits the column; a DB without 0143 applied fails the seed at
// createIdentityGraph with `column "migration_pending_at" does not exist`. CI
// applies migrations (db-schema change class) before the integration suite, so
// this is satisfied there; a raw local run against a staging DB that has not yet
// had 0143 applied will fail the seed — that is the environment gap, not the
// accept logic. The self-join guard is unaffected (no DB op).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  consentGrant,
  guardianship,
  login,
  membership,
  organization,
  person,
  profileQuotaUsage,
  quotaPools,
  subscription,
  subscriptionPayers,
  supportership,
  type Database,
} from '@eduagent/database';
import { BadRequestError, ConflictError, ForbiddenError } from '../../errors';
import { getSubscriptionByAccountIdV2 } from '../billing/billing-v2';
import { createIdentityGraph } from './identity-graph';
import { acceptFamilyJoin } from './family-join-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const REPOINTED = process.env['IDENTITY_V2_REPOINTED'] === 'true';
const itGraph = RUN && REPOINTED ? it : it.skip;
const itRun = RUN ? it : it.skip;

// currentYear-anchored birth years: 18y is self-consent-capable (17+), 14y is
// not (still requires GDPR parental consent → refused by the age gate).
const NOW_YEAR = new Date().getUTCFullYear();
const CAPABLE_BIRTH_YEAR = NOW_YEAR - 18;
const NOT_CAPABLE_BIRTH_YEAR = NOW_YEAR - 14;

(RUN ? describe : describe.skip)('acceptFamilyJoin (integration)', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];
  const subIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    for (const sid of subIds) {
      await db
        .delete(profileQuotaUsage)
        .where(eq(profileQuotaUsage.subscriptionId, sid));
      await db
        .delete(subscriptionPayers)
        .where(eq(subscriptionPayers.subscriptionId, sid));
      await db.delete(quotaPools).where(eq(quotaPools.subscriptionId, sid));
    }
    for (const pid of personIds) {
      await db
        .delete(supportership)
        .where(eq(supportership.supporterPersonId, pid));
      await db
        .delete(supportership)
        .where(eq(supportership.supporteePersonId, pid));
      await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
      await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
      await db
        .delete(guardianship)
        .where(eq(guardianship.guardianPersonId, pid));
    }
    for (const oid of orgIds) {
      await db.delete(subscription).where(eq(subscription.organizationId, oid));
    }
    for (const pid of personIds) {
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(login).where(eq(login.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
    subIds.length = 0;
  });

  // A fresh identity graph IS a solo org-of-one: org + owner person (admin+learner
  // membership) + login + subscription + quota. Returns the ids the accept path
  // needs.
  async function seedGraph(args: {
    birthYear: number;
    displayName: string;
  }): Promise<{ orgId: string; personId: string; subId: string }> {
    const clerkUserId = `wi1753-${randomUUID()}`;
    const graph = await createIdentityGraph(db, {
      clerkUserId,
      verifiedEmail: `${clerkUserId}@test.local`,
      displayName: args.displayName,
      birthYear: args.birthYear,
      location: 'EU',
      conversationLanguage: 'en',
      pronouns: null,
      avatarUrl: null,
      timezone: null,
    });
    orgIds.push(graph.organizationId);
    personIds.push(graph.personId);
    const sub = await getSubscriptionByAccountIdV2(db, graph.organizationId);
    if (!sub) throw new Error('seed graph missing subscription');
    subIds.push(sub.id);
    return {
      orgId: graph.organizationId,
      personId: graph.personId,
      subId: sub.id,
    };
  }

  async function readMembershipOrg(personId: string): Promise<string | null> {
    const row = await db.query.membership.findFirst({
      where: eq(membership.personId, personId),
    });
    return row?.organizationId ?? null;
  }

  // AC-2 / AC-5 core: the teen ends up in the family org as a learner, and the
  // org-of-one (org + its subscription) is gone. The teen is never orphaned —
  // exactly one membership, now pointing at the family org.
  itGraph(
    'repoints the teen into the family org as learner and tears down the org-of-one',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });

      const result = await acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      });

      expect(result.alreadyMember).toBe(false);
      expect(await readMembershipOrg(teen.personId)).toBe(family.orgId);

      const mem = await db.query.membership.findFirst({
        where: eq(membership.personId, teen.personId),
      });
      expect(mem?.roles).toEqual(['learner']);

      // org-of-one and its subscription are gone.
      expect(
        await db.query.organization.findFirst({
          where: eq(organization.id, teen.orgId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, teen.orgId),
        }),
      ).toBeUndefined();

      // teen seated on the FAMILY subscription's quota.
      const quota = await db.query.profileQuotaUsage.findFirst({
        where: eq(profileQuotaUsage.profileId, teen.personId),
      });
      expect(quota?.subscriptionId).toBe(family.subId);
    },
  );

  // AC-3 (no auto-guardianship) + AC-4 (person_id stable).
  itGraph(
    'never writes a guardianship row and preserves the teen person id',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });

      await acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      });

      // NEVER a guardianship edge in either direction for the teen.
      const asCharge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, teen.personId),
      });
      const asGuardian = await db.query.guardianship.findFirst({
        where: eq(guardianship.guardianPersonId, teen.personId),
      });
      expect(asCharge).toBeUndefined();
      expect(asGuardian).toBeUndefined();

      // AC-4: person id unchanged — no new Person minted.
      const teenPerson = await db.query.person.findFirst({
        where: eq(person.id, teen.personId),
      });
      expect(teenPerson?.id).toBe(teen.personId);
    },
  );

  // AC-3: supportership is appended ONLY on explicit opt-in.
  itGraph('appends a supportership edge only on explicit opt-in', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: true,
    });

    const edge = await db.query.supportership.findFirst({
      where: and(
        eq(supportership.supporterPersonId, family.personId),
        eq(supportership.supporteePersonId, teen.personId),
      ),
    });
    expect(edge).toBeDefined();
    expect(edge?.revokedAt).toBeNull();
  });

  itGraph('writes no supportership edge when opt-in is false', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: false,
    });

    const edge = await db.query.supportership.findFirst({
      where: eq(supportership.supporteePersonId, teen.personId),
    });
    expect(edge).toBeUndefined();
  });

  // AC-6: an ACTIVE store sub on the org-of-one is captured for the self-cancel
  // nudge BEFORE the subscription row is torn down.
  itGraph(
    'captures the active store ref for the cancel nudge before teardown',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });

      // Make the teen's org-of-one sub a live store subscription.
      await db
        .update(subscription)
        .set({
          status: 'active',
          revenuecatOriginalAppUserId: 'rc_wi1753_teen',
        })
        .where(eq(subscription.organizationId, teen.orgId));

      const result = await acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      });

      expect(result.storeCancelNudge).toEqual({
        originalAppUserId: 'rc_wi1753_teen',
      });
      // still torn down — the nudge is about the teen's own store account, not a
      // surviving DB subscription row.
      expect(
        await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, teen.orgId),
        }),
      ).toBeUndefined();
    },
  );

  // Idempotent double-accept: a repeated accept is a clean no-op success.
  itGraph('is idempotent on a repeated accept', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: false,
    });
    const second = await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: false,
    });

    expect(second.alreadyMember).toBe(true);
    expect(second.storeCancelNudge).toBeNull();
    expect(await readMembershipOrg(teen.personId)).toBe(family.orgId);
  });

  // ---- NEGATIVE break-tests: each refuses and leaves every row unchanged. ----

  itRun('refuses a self-join (teen === parent)', async () => {
    const samePerson = randomUUID();
    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: samePerson,
        familyOrgId: randomUUID(),
        parentPersonId: samePerson,
        optInSupportership: false,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  itGraph(
    'refuses a teen whose org has another member (not solo)',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });
      // Repoint a second person INTO the teen's org so it is no longer solo.
      const other = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Other',
      });
      await db
        .update(membership)
        .set({ organizationId: teen.orgId })
        .where(eq(membership.personId, other.personId));

      await expect(
        acceptFamilyJoin(db, {
          teenPersonId: teen.personId,
          familyOrgId: family.orgId,
          parentPersonId: family.personId,
          optInSupportership: false,
        }),
      ).rejects.toThrow(ForbiddenError);

      // rows unchanged — teen still in its own org.
      expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
    },
  );

  itGraph('refuses a teen who is a guardian on any edge', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });
    const charge = await seedGraph({
      birthYear: NOT_CAPABLE_BIRTH_YEAR,
      displayName: 'Charge',
    });
    await db.insert(guardianship).values({
      guardianPersonId: teen.personId,
      chargePersonId: charge.personId,
    });

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });

  itGraph('refuses a teen who is a managed child', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });
    const guardian = await seedGraph({
      birthYear: 1990,
      displayName: 'Guardian',
    });
    await db.insert(guardianship).values({
      guardianPersonId: guardian.personId,
      chargePersonId: teen.personId,
    });

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });

  itGraph('refuses a teen who is not self-consent-capable by age', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: NOT_CAPABLE_BIRTH_YEAR,
      displayName: 'Minor',
    });

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });

  itGraph('refuses when the family org has no subscription', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });
    // Strip the family's subscription so there is no seat to join.
    await db
      .delete(subscriptionPayers)
      .where(eq(subscriptionPayers.subscriptionId, family.subId));
    await db
      .delete(quotaPools)
      .where(eq(quotaPools.subscriptionId, family.subId));
    await db
      .delete(profileQuotaUsage)
      .where(eq(profileQuotaUsage.subscriptionId, family.subId));
    await db
      .delete(subscription)
      .where(eq(subscription.organizationId, family.orgId));

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ConflictError);
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });
});
