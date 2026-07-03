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
    birthMonth?: number;
    birthDay?: number;
  }): Promise<{ organizationId: string; ownerPersonId: string }> {
    const clerkUserId = `wi811-${crypto.randomUUID()}`;
    const graph = await createIdentityGraph(db, {
      clerkUserId,
      verifiedEmail: `${clerkUserId}@test.local`,
      displayName: 'Owner',
      birthYear: args.birthYear,
      birthMonth: args.birthMonth,
      birthDay: args.birthDay,
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

  // [WI-367 / SECURITY] Exact-date adult-owner gate. Year-only math
  // (currentYear - birthYear) overestimates age by up to 11 months: an owner
  // born Dec 31 of (currentYear - 18) reads as 18 by year-only math but is
  // still 17 for all of the current year except a Dec-31 run. The gate must
  // use the owner's exact birth date (when present) so a not-yet-18 owner
  // cannot add a child. Red-green-revert: swap calculateAgeFromParts back to
  // calculateAge(owner.birthYear) in child-profile-v2.ts and this stops
  // throwing (a 17-year-old owner adds a child).
  //
  // Pinned system time so this is deterministic year-round (not just every
  // day but Dec 31, when a real Dec-31 test run would otherwise see the
  // birthday as "already passed"). Fakes ONLY Date/performance.now — never
  // setTimeout/setInterval, which the Neon HTTP driver relies on internally;
  // a full jest.useFakeTimers() hangs it (see vocabulary.integration.test.ts).
  itGraph(
    '[SECURITY] throws ADULT_OWNER_REQUIRED for an owner whose exact age is still 17 (year-only reads 18)',
    async () => {
      jest.useFakeTimers({
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'nextTick',
          'queueMicrotask',
        ],
      });
      jest.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
      try {
        const { organizationId } = await seedOwnerGraph({
          birthYear: 2008,
          birthMonth: 12,
          birthDay: 31,
        });
        // Child birthYear passes the child's OWN >=13 minimum-age floor so a
        // masked bug can't hide behind a ProfileValidationError from the
        // unrelated child-age check — this isolates the adult-owner gate as
        // the only possible rejection reason.
        await expect(
          addChild(organizationId, {
            displayName: 'Kid',
            birthYear: 2013,
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      } finally {
        jest.useRealTimers();
      }
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

  // [WI-1128, port of BUG-862] Concurrent-create cap race, ported from the
  // legacy pg_advisory_xact_lock proof (services/profile.integration.test.ts).
  // createChildProfileV2 takes the SAME per-org advisory lock
  // (hashtext(organizationId)) inside its transaction, so this is the v2
  // analog of the legacy concurrency proof. 'plus' tier caps at 2 profiles;
  // the owner already occupies slot 1, so exactly one slot remains — firing 3
  // concurrent creates for that one slot is a tighter race than legacy's
  // cap-1-of-4 setup, but proves the same invariant.
  itGraph(
    '[BUG-862] concurrent createChildProfileV2 calls for the same org do not exceed the per-tier cap',
    async () => {
      const { organizationId } = await seedOwnerGraph({ birthYear: 1988 });
      const sub = await getSubscriptionByAccountIdV2(db, organizationId);
      expect(sub).not.toBeNull();
      expect(await canAddProfileV2(db, sub!.id)).toBe(true);

      const results = await Promise.allSettled([
        addChild(organizationId, {
          displayName: 'Racing Child A',
          birthYear: 2012,
        }),
        addChild(organizationId, {
          displayName: 'Racing Child B',
          birthYear: 2012,
        }),
        addChild(organizationId, {
          displayName: 'Racing Child C',
          birthYear: 2012,
        }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const limitErrors = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof ProfileLimitError,
      );
      const unexpectedErrors = results.filter(
        (r) =>
          r.status === 'rejected' && !(r.reason instanceof ProfileLimitError),
      );

      // No unexpected errors.
      expect(unexpectedErrors).toHaveLength(0);

      // Hard invariant: total membership count must not exceed the tier cap (2).
      const members = await db.query.membership.findMany({
        where: eq(membership.organizationId, organizationId),
      });
      expect(members.length).toBeLessThanOrEqual(2);

      if (successes.length > 1) {
        console.warn(
          `[BUG-862] ${successes.length} out of 3 concurrent creates succeeded ` +
            `(expected 1). Final membership count: ${members.length}/2. ` +
            'The per-org advisory lock may not be scoped to a real transaction.',
        );
      }

      // Advisory: every attempt is accounted for (succeeded or capped).
      expect(successes.length + limitErrors.length).toBe(3);
    },
  );

  // [WI-1128, port of OPT-C boundary] Positive counterpart to the twin's
  // existing negative/exact-17 adult-owner-gate cases: a year-only owner at
  // EXACTLY 18 (no birthMonth/birthDay persisted, so calculateAgeFromParts
  // falls back to year-diff) must still be allowed to add a child.
  itGraph(
    '[OPT-C boundary] allows child creation when owner is exactly 18 (year-only, no month/day)',
    async () => {
      const currentYear = new Date().getFullYear();
      const { organizationId } = await seedOwnerGraph({
        birthYear: currentYear - 18,
      });

      await expect(
        addChild(organizationId, { displayName: 'Kid', birthYear: 2012 }),
      ).resolves.toMatchObject({ id: expect.any(String) });
    },
  );

  // [WI-1128, port of OPT-C flag-off] The twin's addChild() helper always
  // passes adultOwnerGateEnabled:true; this is the only coverage of the
  // flag-off path — an underage owner must still be allowed to add a child
  // when the gate is explicitly disabled (identical to pre-OPT-C behaviour).
  itGraph(
    '[OPT-C flag-off] allows child creation regardless of owner age when the gate is disabled',
    async () => {
      // Owner born 2010 → underage (~16), same as the ADULT_OWNER_REQUIRED test.
      const { organizationId } = await seedOwnerGraph({ birthYear: 2010 });

      const child = await createChildProfileV2(db, {
        organizationId,
        input: {
          displayName: 'Kid',
          birthYear: 2012,
          location: 'EU',
          conversationLanguage: 'en',
        },
        adultOwnerGateEnabled: false,
      });
      personIds.push(child.id);

      expect(child.id).toEqual(expect.any(String));
    },
  );

  // [WI-1128, P3] WI-367 full birth-date persistence for the CHILD-create
  // path (buildValidatedBirthDate in child-profile-v2.ts:166-174) — no
  // existing test exercises this; addChild() never passes birthMonth/
  // birthDay. Ported intent from the retired profile.integration.test.ts's
  // "[WI-367 persistence] stores birth_month / birth_day on the created
  // profile" (there, exercised via the OWNER path; here, the CHILD path,
  // since createChildProfileV2 is what actually calls
  // buildValidatedBirthDate for a child).
  itGraph(
    '[WI-367 persistence] stores the full birth date (month/day) on the created child',
    async () => {
      const { organizationId } = await seedOwnerGraph({ birthYear: 1985 });

      const child = await createChildProfileV2(db, {
        organizationId,
        input: {
          displayName: 'Kid',
          birthYear: 2012,
          birthMonth: 7,
          birthDay: 22,
          location: 'EU',
          conversationLanguage: 'en',
        },
        adultOwnerGateEnabled: true,
      });
      personIds.push(child.id);

      const personRow = await db.query.person.findFirst({
        where: eq(person.id, child.id),
        columns: { birthDate: true },
      });
      expect(personRow?.birthDate).toBe('2012-07-22');
    },
  );
});
