// ---------------------------------------------------------------------------
// WI-811 createChildProfileV2 — integration tests against the real identity
// graph. createChildProfileV2 is the v2 twin of the legacy add-child path
// (services/profile.ts::createProfileWithLimitCheck): it creates a managed
// child `person` (login_id NULL), a learner `membership`, the owner→child
// `guardianship` edge, the per-profile `profile_quota_usage` satellite, and —
// when the child's age requires it — a CONSENTED `consent_grant`, all in ONE
// transaction (AC#1 atomicity).
//
// SECURITY (AC#5): the organization is ALWAYS the caller's resolved org
// (the route passes account.id = organization.id; there is no org field on the
// create payload), so the child can never be parented under a foreign org or
// to a foreign owner. The cross-org test below is the red-green-revert target:
//   - GREEN: the child's membership.org and guardianship.guardian both resolve
//     to the PASSED org's owner, never the other org's owner.
//   - RED (revert): if getOwnerProfileV2's org filter is dropped, the owner can
//     resolve to a foreign org → the guardian assertion fails.
//
// SEQUENCING (mirror identity-graph.integration.test.ts): createChildProfileV2's
// `profile_quota_usage` insert references the NEW subscription/person, but the
// satellite FKs still target the LEGACY `subscriptions`/`profiles` tables until
// the convergence FK re-point (M-REPOINT, WI-586). So the FULL-write tests
// cannot commit against the pre-M-REPOINT schema and are gated on
// IDENTITY_V2_REPOINTED; they SKIP otherwise. (Flag-off parity is covered by the
// untouched legacy path + its existing profiles-route tests — AC#7.)
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
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
  type Database,
} from '@eduagent/database';
import { ForbiddenError } from '@eduagent/schemas';
import { ConflictError } from '../../errors';
import { ProfileLimitError, ProfileValidationError } from '../profile';
import {
  canAddProfileV2,
  getSubscriptionByAccountIdV2,
} from '../billing/billing-v2';
import { createIdentityGraph } from './identity-graph';
import { createChildProfileV2 } from './child-profile-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
// Full child-create writes a profile_quota_usage satellite whose FK is only
// valid for v2 ids AFTER M-REPOINT. Gate the full-write tests accordingly.
const REPOINTED = process.env['IDENTITY_V2_REPOINTED'] === 'true';
const itGraph = RUN && REPOINTED ? it : it.skip;

(RUN ? describe : describe.skip)('createChildProfileV2 (integration)', () => {
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

  // Seed a real owner identity graph (org + owner person + admin/learner
  // membership + login + plus subscription + quota_pools) via the production
  // bootstrap, then return the ids the child orchestrator needs.
  async function seedOwnerGraph(args: {
    birthYear: number;
  }): Promise<{ organizationId: string; ownerPersonId: string }> {
    const clerkUserId = `wi811-${crypto.randomUUID()}`;
    const graph = await createIdentityGraph(db, {
      clerkUserId,
      verifiedEmail: `${clerkUserId}@test.local`,
      displayName: 'Owner',
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
    if (sub) subIds.push(sub.id);
    return {
      organizationId: graph.organizationId,
      ownerPersonId: graph.personId,
    };
  }

  async function addChild(
    organizationId: string,
    args: { displayName: string; birthYear: number },
  ) {
    const child = await createChildProfileV2(db, {
      organizationId,
      input: {
        displayName: args.displayName,
        birthYear: args.birthYear,
        location: 'EU',
        conversationLanguage: 'en',
      },
      adultOwnerGateEnabled: true,
    });
    personIds.push(child.id);
    return child;
  }

  // AC#1 — atomic child create: managed person + learner membership +
  // owner→child guardianship + per-profile quota + consent (minor).
  itGraph(
    'creates a managed child with learner membership, guardianship edge, quota, and a consent grant (minor)',
    async () => {
      const { organizationId, ownerPersonId } = await seedOwnerGraph({
        birthYear: 1990,
      });

      // Age must be >=13 (v1 floor, now enforced by createChildProfileV2) and
      // <=16 so consent is still required → a grant is written. 2012 ≈ age 14.
      const child = await addChild(organizationId, {
        displayName: 'Kid',
        birthYear: 2012,
      });

      expect(child.isOwner).toBe(false);
      expect(child.displayName).toBe('Kid');

      // managed person — no login binding.
      const personRow = await db.query.person.findFirst({
        where: eq(person.id, child.id),
      });
      expect(personRow?.loginId).toBeNull();

      // learner membership scoped to the caller's org.
      const mem = await db.query.membership.findFirst({
        where: eq(membership.personId, child.id),
      });
      expect(mem?.organizationId).toBe(organizationId);
      expect(mem?.roles).toEqual(['learner']);

      // owner→child guardianship edge.
      const edge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, child.id),
      });
      expect(edge?.guardianPersonId).toBe(ownerPersonId);

      // per-profile quota row (role child).
      const quota = await db.query.profileQuotaUsage.findFirst({
        where: eq(profileQuotaUsage.profileId, child.id),
      });
      expect(quota?.role).toBe('child');

      // consent grant: granted, parent-created audit fact, snapshot age.
      const grant = await db.query.consentGrant.findFirst({
        where: eq(consentGrant.chargePersonId, child.id),
      });
      expect(grant?.granted).toBe(true);
      expect(grant?.organizationId).toBe(organizationId);
      expect(grant?.auditFact).toMatchObject({
        source: 'parent_created_child',
        guardianPersonId: ownerPersonId,
      });
      expect(grant?.snapshotAgeAtGrant).not.toBeNull();
    },
  );

  // AC#5 SECURITY — cross-org isolation / ownership. The child is parented to
  // the PASSED org's owner only; a second org's owner is never selected.
  // NOTE: this is NOT a reliable red-green-revert target on its own — if the
  // org filter is merely REMOVED, getOwnerProfileV2's `LIMIT 1` over all admins
  // could still return org A's owner and the test would stay green. The
  // deterministic revert target is the next test
  // ('[SECURITY] refuses ... when the caller org has no owner'), which goes RED
  // whenever the org scope is broken regardless of row ordering.
  itGraph(
    "[SECURITY] parents the child to the caller org's owner, never another org's owner",
    async () => {
      const a = await seedOwnerGraph({ birthYear: 1985 });
      const b = await seedOwnerGraph({ birthYear: 1980 });

      const child = await addChild(a.organizationId, {
        displayName: 'Kid A',
        birthYear: 2012, // >=13 floor (now enforced); minor with consent
      });

      const mem = await db.query.membership.findFirst({
        where: eq(membership.personId, child.id),
      });
      expect(mem?.organizationId).toBe(a.organizationId);

      const edge = await db.query.guardianship.findFirst({
        where: eq(guardianship.chargePersonId, child.id),
      });
      expect(edge?.guardianPersonId).toBe(a.ownerPersonId);
      expect(edge?.guardianPersonId).not.toBe(b.ownerPersonId);

      const grant = await db.query.consentGrant.findFirst({
        where: eq(consentGrant.chargePersonId, child.id),
      });
      expect(grant?.organizationId).toBe(a.organizationId);
    },
  );

  // AC#5 SECURITY — DETERMINISTIC red-green-revert on the org-scoped owner
  // lookup. Org A has a subscription but NO admin owner (its bootstrap owner is
  // demoted to learner); org B has an admin owner. A correctly org-scoped
  // getOwnerProfileV2(A) returns null → createChildProfileV2 throws ConflictError
  // and writes NOTHING. If the org filter were dropped, the lookup would grab
  // org B's owner and parent a cross-org child — so this fails RED on the revert
  // deterministically (no limit(1)/ORDER-BY nondeterminism, unlike asserting a
  // specific owner id with two admins present).
  itGraph(
    '[SECURITY] refuses (no cross-org owner leak) when the caller org has no owner',
    async () => {
      const a = await seedOwnerGraph({ birthYear: 1985 });
      const b = await seedOwnerGraph({ birthYear: 1980 });
      // Demote org A's only admin → org A now has a subscription but no owner.
      await db
        .update(membership)
        .set({ roles: ['learner'] })
        .where(eq(membership.personId, a.ownerPersonId));

      await expect(
        createChildProfileV2(db, {
          organizationId: a.organizationId,
          input: { displayName: 'Leak', birthYear: 2016, location: 'EU' },
          adultOwnerGateEnabled: true,
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      // No child leaked into org B (the foreign owner was never selected).
      const bMembers = await db.query.membership.findMany({
        where: eq(membership.organizationId, b.organizationId),
      });
      expect(bMembers).toHaveLength(1); // only org B's own owner
      const bEdges = await db.query.guardianship.findMany({
        where: eq(guardianship.guardianPersonId, b.ownerPersonId),
      });
      expect(bEdges).toHaveLength(0); // org B's owner parents nothing
    },
  );

  // AC#2a — per-tier limit. Fill to capacity, then the next create throws.
  itGraph(
    'throws ProfileLimitError when the subscription is at capacity',
    async () => {
      const { organizationId } = await seedOwnerGraph({ birthYear: 1988 });
      const sub = await getSubscriptionByAccountIdV2(db, organizationId);
      expect(sub).not.toBeNull();

      let guard = 0;
      while (await canAddProfileV2(db, sub!.id)) {
        await addChild(organizationId, {
          displayName: `Kid ${guard}`,
          birthYear: 2012, // >=13 floor (now enforced)
        });
        guard += 1;
        if (guard > 25) throw new Error('capacity never reached — check tier');
      }

      await expect(
        addChild(organizationId, { displayName: 'Over', birthYear: 2012 }),
      ).rejects.toBeInstanceOf(ProfileLimitError);
    },
  );

  // AC#2b — adult-owner gate. A non-adult owner cannot add a child.
  itGraph(
    'throws ADULT_OWNER_REQUIRED when the owner is under 18',
    async () => {
      // Owner born 2010 → ~16 in 2026 (>=13 birthYear floor, < adult bracket).
      const { organizationId } = await seedOwnerGraph({ birthYear: 2010 });
      await expect(
        addChild(organizationId, { displayName: 'Kid', birthYear: 2018 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  // [WI-811 review / Codex P1] Minimum-age floor (WI-570: v1 13+). The exact
  // full date catches what the year-only schema cannot: birthYear = currentYear-13
  // PASSES birthYearSchema (year-only age 13) but a late-in-year birthday means
  // the child is still 12 by exact date → checkConsentRequiredFromDate flags
  // belowMinimumAge → the orchestrator must REJECT before any write (parity with
  // legacy createProfile). Throws ProfileValidationError; writes nothing.
  // Red-green-revert: drop the belowMinimumAge guard in child-profile-v2.ts and
  // this stops throwing (a sub-13 child is created + consented).
  itGraph(
    '[SECURITY] rejects a below-minimum-age child (exact date under 13) and writes nothing',
    async () => {
      const { organizationId, ownerPersonId } = await seedOwnerGraph({
        birthYear: 1985,
      });
      // currentYear-13 passes the year-only floor; Dec-31 birthday keeps the
      // exact age at 12 for all of the current year (except a Dec-31 run).
      const currentYear = new Date().getFullYear();

      await expect(
        createChildProfileV2(db, {
          organizationId,
          input: {
            displayName: 'TooYoung',
            birthYear: currentYear - 13,
            birthMonth: 12,
            birthDay: 31,
            location: 'EU',
            conversationLanguage: 'en',
          },
          adultOwnerGateEnabled: true,
        }),
      ).rejects.toBeInstanceOf(ProfileValidationError);

      // Nothing leaked: the org still has only its owner; no guardianship edge.
      const members = await db.query.membership.findMany({
        where: eq(membership.organizationId, organizationId),
      });
      expect(members).toHaveLength(1);
      const edges = await db.query.guardianship.findMany({
        where: eq(guardianship.guardianPersonId, ownerPersonId),
      });
      expect(edges).toHaveLength(0);
    },
  );

  // AC#6 — consent only when age requires it. A 17+ child gets NO grant.
  itGraph('writes no consent grant for a 17+ child', async () => {
    const { organizationId } = await seedOwnerGraph({ birthYear: 1975 });
    // birthYear 2007 → ~19 in 2026 (>16 → consent not required).
    const teen = await addChild(organizationId, {
      displayName: 'Teen',
      birthYear: 2007,
    });
    const grant = await db.query.consentGrant.findFirst({
      where: eq(consentGrant.chargePersonId, teen.id),
    });
    expect(grant).toBeUndefined();
  });
});
