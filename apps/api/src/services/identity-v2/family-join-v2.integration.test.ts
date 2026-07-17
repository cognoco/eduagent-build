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
import { and, eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  consentGrant,
  familyJoinInvite,
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
  const inviteIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    // Invites first — family_join_invite FKs the inviter person.
    for (const iid of inviteIds) {
      await db.delete(familyJoinInvite).where(eq(familyJoinInvite.id, iid));
    }
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
    inviteIds.length = 0;
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

  // Every accept REDEEMS an invite: acceptFamilyJoin claims the invite row
  // atomically inside its transaction (single-use), so each accept needs a real
  // pending invite row. The (inviter, family-org) unique means one slot per
  // inviter — a second invite into the same family org needs a different inviter.
  async function seedInvite(args: {
    inviterPersonId: string;
    familyOrgId: string;
    /** Override the expiry — a past Date seeds an already-expired token. */
    tokenExpiresAt?: Date;
  }): Promise<{ inviteId: string; inviteToken: string }> {
    const token = randomUUID();
    const [row] = await db
      .insert(familyJoinInvite)
      .values({
        inviterPersonId: args.inviterPersonId,
        familyOrgId: args.familyOrgId,
        invitedEmail: `wi1753-${randomUUID()}@test.local`,
        status: 'pending',
        token,
        tokenExpiresAt:
          args.tokenExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: familyJoinInvite.id });
    if (!row) throw new Error('seed invite insert did not return a row');
    inviteIds.push(row.id);
    return { inviteId: row.id, inviteToken: token };
  }

  /**
   * Rotate an invite's token, as a resend/retarget does. Returns the NEW token;
   * the previously-issued one is now superseded and must no longer redeem.
   */
  async function rotateInviteToken(inviteId: string): Promise<string> {
    const next = randomUUID();
    await db
      .update(familyJoinInvite)
      .set({ token: next, updatedAt: sql`now()` })
      .where(eq(familyJoinInvite.id, inviteId));
    return next;
  }

  /** Retarget a seeded plan's tier/status/period — drives the capacity gate. */
  async function setPlan(
    subId: string,
    plan: { planTier: string; status: string; periodEndAt?: Date },
  ): Promise<void> {
    await db
      .update(subscription)
      .set({
        planTier: plan.planTier,
        status: plan.status,
        ...(plan.periodEndAt ? { periodEndAt: plan.periodEndAt } : {}),
      })
      .where(eq(subscription.id, subId));
  }

  /**
   * Add a bare extra person to an org. The capacity gate counts PERSONS in the
   * org (getProfileCountForSubscriptionV2), so this is how a plan is driven to
   * its seat cap.
   */
  async function addPersonToOrg(orgId: string): Promise<void> {
    const [p] = await db
      .insert(person)
      .values({
        displayName: `Filler-${randomUUID().slice(0, 8)}`,
        birthDate: '1990-01-01',
        residenceJurisdiction: 'EU',
        conversationLanguage: 'en',
      })
      .returning({ id: person.id });
    if (!p) throw new Error('filler person insert did not return a row');
    personIds.push(p.id);
    await db
      .insert(membership)
      .values({ personId: p.id, organizationId: orgId, roles: ['learner'] });
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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

  // [WI-1193] CAPABLE_BIRTH_YEAR (18) is a genuine adult by the codebase's
  // adult threshold, and createIdentityGraph now writes 'adult_self_consent'
  // consent_grant rows for a self-registered adult owner at signup — so the
  // accepting person here (self-consent-capable at 17+, admitting real 18+
  // adults too) arrives holding their own consent grants. Before WI-1193's
  // family-join-v2.ts fix, the teardown asserted zero consent_grant rows for
  // the org-of-one and THREW ConflictError, refusing every such adult's join.
  // GREEN: the grants survive, re-pointed at the family org — not stranded,
  // not silently dropped (GDPR Art 5(2)/7(1) accountability).
  itGraph(
    '[WI-1193] an adult self-registered owner holding consent_grant rows joins cleanly — grants re-homed to the family org, not stranded',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const adultTeen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Adult Teen',
      });

      // Precondition: the seed graph really did write the adult's own consent
      // grants under the org-of-one (else this test would vacuously pass).
      const preJoinGrants = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, adultTeen.personId),
      });
      expect(preJoinGrants.length).toBeGreaterThan(0);
      for (const g of preJoinGrants) {
        expect(g.organizationId).toBe(adultTeen.orgId);
      }

      await acceptFamilyJoin(db, {
        teenPersonId: adultTeen.personId,
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      });

      // Grants survive, re-pointed at the family org — same rows (same count,
      // same purposes/basis), not re-created and not left stranded.
      const postJoinGrants = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, adultTeen.personId),
      });
      expect(postJoinGrants).toHaveLength(preJoinGrants.length);
      for (const g of postJoinGrants) {
        expect(g.organizationId).toBe(family.orgId);
      }
      expect(postJoinGrants.map((g) => g.id).sort()).toEqual(
        preJoinGrants.map((g) => g.id).sort(),
      );

      // The org-of-one is still cleanly torn down (RESTRICT satisfied by the
      // re-home, not by a delete).
      expect(
        await db.query.organization.findFirst({
          where: eq(organization.id, adultTeen.orgId),
        }),
      ).toBeUndefined();
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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
      ...(await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
      })),
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
      ...(await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
      })),
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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

  // Idempotent double-accept: an accept by a teen who is ALREADY in the family
  // org is a clean no-op success. This is now necessarily a SECOND invite — the
  // same invite cannot be redeemed twice (see the single-use tests below), and
  // the (inviter, family-org) unique means a second invite into the same org
  // comes from a different inviter (e.g. the other parent re-invites a teen who
  // has already joined).
  itGraph('is idempotent on a repeated accept', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const otherParent = await seedGraph({
      birthYear: 1990,
      displayName: 'Other parent',
    });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      ...(await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
      })),
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: false,
    });
    const second = await acceptFamilyJoin(db, {
      teenPersonId: teen.personId,
      ...(await seedInvite({
        inviterPersonId: otherParent.personId,
        familyOrgId: family.orgId,
      })),
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
        // Never read — the self-join guard throws before the transaction opens.
        inviteId: randomUUID(),
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
          ...(await seedInvite({
            inviterPersonId: family.personId,
            familyOrgId: family.orgId,
          })),
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
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
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ConflictError);
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });

  // ---- Single-use: one invite token redeems exactly once. ----

  // THE TOCTOU REGRESSION. Two different authenticated teens race the SAME
  // invite token. Both clear the route's `resolveFamilyJoinInviteByToken` read
  // (it is advisory), so single-use can only be enforced by the in-transaction
  // claim. Before the fix — which consumed the invite AFTER a successful accept —
  // both accepts committed and one token repointed TWO teens.
  //
  // The family plan is deliberately raised to `family` (4 seats) so it has room
  // for BOTH teens: capacity therefore cannot be what stops the second one, and
  // a pass here can only mean the invite claim did its job.
  itGraph(
    'admits exactly one teen when two race the same invite token',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      await setPlan(family.subId, { planTier: 'family', status: 'active' });
      const teenA = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen A',
      });
      const teenB = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen B',
      });

      // ONE invite, redeemed concurrently by two different teens.
      const { inviteId, inviteToken } = await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
      });

      const settled = await Promise.allSettled([
        acceptFamilyJoin(db, {
          teenPersonId: teenA.personId,
          inviteId,
          inviteToken,
          familyOrgId: family.orgId,
          parentPersonId: family.personId,
          optInSupportership: false,
        }),
        acceptFamilyJoin(db, {
          teenPersonId: teenB.personId,
          inviteId,
          inviteToken,
          familyOrgId: family.orgId,
          parentPersonId: family.personId,
          optInSupportership: false,
        }),
      ]);

      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictError,
      );

      // Exactly ONE teen was repointed into the family org...
      const orgA = await readMembershipOrg(teenA.personId);
      const orgB = await readMembershipOrg(teenB.personId);
      expect([orgA, orgB].filter((o) => o === family.orgId)).toHaveLength(1);

      // ...and the loser is untouched in their OWN org-of-one (full rollback —
      // never orphaned, never half-joined).
      const loserOrg = orgA === family.orgId ? orgB : orgA;
      const loserOwnOrg = orgA === family.orgId ? teenB.orgId : teenA.orgId;
      expect(loserOrg).toBe(loserOwnOrg);

      // The invite is terminal and its token is burned.
      const invite = await db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, inviteId),
      });
      expect(invite?.status).toBe('accepted');
      expect(invite?.token).toBeNull();
    },
  );

  // The sequential twin of the race: a redeemed invite is terminal.
  itGraph('refuses a second redemption of an already-used invite', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    await setPlan(family.subId, { planTier: 'family', status: 'active' });
    const teenA = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen A',
    });
    const teenB = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen B',
    });
    const { inviteId, inviteToken } = await seedInvite({
      inviterPersonId: family.personId,
      familyOrgId: family.orgId,
    });

    await acceptFamilyJoin(db, {
      teenPersonId: teenA.personId,
      inviteId,
      inviteToken,
      familyOrgId: family.orgId,
      parentPersonId: family.personId,
      optInSupportership: false,
    });

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teenB.personId,
        inviteId,
        inviteToken,
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ConflictError);

    // teen B never moved.
    expect(await readMembershipOrg(teenB.personId)).toBe(teenB.orgId);
  });

  // ---- Token binding: the claim authorizes on the PRESENTED token, not the id. ----
  //
  // The claim's WHERE is the whole authorization. Matching on `id` + `status`
  // alone left two holes, both exercised below as negative break-tests: a token
  // the invite no longer carries (rotated away by a resend/retarget) and a token
  // past its expiry would each still redeem, because a pending row keeps its id.

  itGraph(
    'refuses a SUPERSEDED token — a resend rotates the token, and the old one cannot redeem',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });
      const { inviteId, inviteToken: staleToken } = await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
      });

      // The parent resends/retargets: the row keeps its id and stays 'pending',
      // but now carries a DIFFERENT token. `staleToken` is revoked.
      const freshToken = await rotateInviteToken(inviteId);
      expect(freshToken).not.toBe(staleToken);

      await expect(
        acceptFamilyJoin(db, {
          teenPersonId: teen.personId,
          inviteId,
          inviteToken: staleToken,
          familyOrgId: family.orgId,
          parentPersonId: family.personId,
          optInSupportership: false,
        }),
      ).rejects.toThrow(ConflictError);

      // The revoked token repointed nothing — the teen is still in their own org.
      expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);

      // …and the invite is untouched: still pending, still redeemable by the
      // token the recipient actually holds. A rejected stale token must not
      // burn the live invite.
      const row = await db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, inviteId),
      });
      expect(row?.status).toBe('pending');
      expect(row?.token).toBe(freshToken);
    },
  );

  itGraph(
    'refuses an EXPIRED token even while the invite is pending',
    async () => {
      const family = await seedGraph({
        birthYear: 1990,
        displayName: 'Parent',
      });
      const teen = await seedGraph({
        birthYear: CAPABLE_BIRTH_YEAR,
        displayName: 'Teen',
      });
      // Pending, correct token — but its expiry is in the past.
      const { inviteId, inviteToken } = await seedInvite({
        inviterPersonId: family.personId,
        familyOrgId: family.orgId,
        tokenExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        acceptFamilyJoin(db, {
          teenPersonId: teen.personId,
          inviteId,
          inviteToken,
          familyOrgId: family.orgId,
          parentPersonId: family.personId,
          optInSupportership: false,
        }),
      ).rejects.toThrow(ConflictError);

      // No repoint, and the expired invite was not consumed.
      expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
      const row = await db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, inviteId),
      });
      expect(row?.status).toBe('pending');
    },
  );

  // ---- Family-plan capacity: a seat must actually exist BEFORE the repoint. ----

  // A plan at its per-tier cap has no seat. Before the fix the accept only
  // checked that SOME subscription row existed, so a full plan repointed the
  // teen's membership and only then failed on the quota insert.
  itGraph('refuses when the family plan is at its seat cap', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    // family tier seats 4. Parent + 3 fillers = 4 → full.
    await setPlan(family.subId, { planTier: 'family', status: 'active' });
    await addPersonToOrg(family.orgId);
    await addPersonToOrg(family.orgId);
    await addPersonToOrg(family.orgId);

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ConflictError);

    // No half-mutation: the teen is still a solo org-of-one, org intact.
    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
    expect(
      await db.query.organization.findFirst({
        where: eq(organization.id, teen.orgId),
      }),
    ).toBeDefined();
  });

  // An EXPIRED plan confers only its fallback tier, whatever it was sold as.
  // Here the plan is `family` (4 seats) but expired, so resolveEffectiveAccessTier
  // collapses it to free (2 seats) and the org's 2 persons already fill it. The
  // same org on an ACTIVE family plan admits the teen (the happy path above) —
  // so it is the EXPIRY, not the head-count, that refuses here.
  itGraph('refuses when the family plan has expired', async () => {
    const family = await seedGraph({ birthYear: 1990, displayName: 'Parent' });
    const teen = await seedGraph({
      birthYear: CAPABLE_BIRTH_YEAR,
      displayName: 'Teen',
    });

    await setPlan(family.subId, {
      planTier: 'family',
      status: 'expired',
      periodEndAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await addPersonToOrg(family.orgId); // parent + 1 = 2 = the free-tier cap

    await expect(
      acceptFamilyJoin(db, {
        teenPersonId: teen.personId,
        ...(await seedInvite({
          inviterPersonId: family.personId,
          familyOrgId: family.orgId,
        })),
        familyOrgId: family.orgId,
        parentPersonId: family.personId,
        optInSupportership: false,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await readMembershipOrg(teen.personId)).toBe(teen.orgId);
  });
});
