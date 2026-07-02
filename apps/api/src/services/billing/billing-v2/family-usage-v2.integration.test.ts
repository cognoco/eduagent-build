// ---------------------------------------------------------------------------
// WI-722 — coverage for the getUsageBreakdownForProfile v2 twin, against a
// REAL family seeded into BOTH stores.
//
// [WI-1239 / 779-strip] Originally a semantic-equivalence proof against the
// legacy getUsageBreakdownForProfile (family.ts) — that function was deleted
// (routes/billing.ts already dispatched exclusively to -V2), so the
// call-both-and-diff pattern no longer has a legacy side to compare against.
// Converted to direct assertions against getUsageBreakdownForProfileV2 alone,
// using the same concrete expected values the legacy comparison used to
// anchor (family aggregate totals, self-scoped usage counts, visibility
// flags). The dual-store seed (legacy accounts/profiles/family_links/
// family_preferences AND v2 organization/person/membership/subscription/
// guardianship, id-aligned) is UNCHANGED — usage_events and family_preferences
// still FK to / are keyed on the legacy ids (pre-M-REPOINT), and
// family_links stays seeded because other legacy-path tests in this package
// still exercise it.
//
// THE CRUX this suite still guards (shepherd adjustment #3, WI-722 original
// design): "behavior-preserving" is a trap when the new schema models the
// relationship differently. The legacy function read `family_links`
// (parent_profile_id × child_profile_id) to decide hasChildLink / isChild;
// the v2 twin reads the ratified `guardianship` edge (guardian_person_id ×
// charge_person_id, revoked_at IS NULL) via the CUT-B2 reader. The correctness
// risk is whether the twin aggregates usage over the SAME set of profileIds
// the legacy family_links query would have — the adversarial out-of-org-edge
// test below (case 5) is what actually proves that, independent of any
// legacy comparison.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, inArray } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  accounts,
  profiles,
  familyLinks,
  familyPreferences,
  subscriptions,
  usageEvents,
  organization,
  person,
  membership,
  subscription as subscriptionTable,
  guardianship,
  type Database,
} from '@eduagent/database';
import { getUsageBreakdownForProfileV2 } from './family-usage-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'getUsageBreakdownForProfileV2 (integration)',
  () => {
    let db: Database;

    // Deterministic shared ids — the reseed contract makes the legacy and v2
    // primary keys identical, so we explicitly use the same uuid in both stores.
    const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
    const SUB_ID = '22222222-2222-4222-8222-222222222222';
    const OWNER_ID = '33333333-3333-4333-8333-333333333333';
    const COPARENT_ID = '44444444-4444-4444-8444-444444444444';
    const CHILD_ID = '55555555-5555-4555-8555-555555555555';
    // Adversarial: a person + org OUTSIDE the subscription's org, used to seed a
    // guardianship edge whose other endpoint is a non-member. The global
    // guardianship reader returns it; the in-org intersection must exclude it.
    const OTHER_ORG_ID = '66666666-6666-4666-8666-666666666666';
    const OUTSIDER_ID = '77777777-7777-4777-8777-777777777777';

    const CYCLE_START = '2026-05-01T00:00:00.000Z';
    const DAY_START = '2026-05-06T00:00:00.000Z';
    const MONTHLY_LIMIT = 100;

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    async function cleanup() {
      const personIds = [OWNER_ID, COPARENT_ID, CHILD_ID, OUTSIDER_ID];
      await db
        .delete(usageEvents)
        .where(eq(usageEvents.subscriptionId, SUB_ID));
      // v2 store
      await db
        .delete(guardianship)
        .where(inArray(guardianship.guardianPersonId, personIds));
      await db
        .delete(guardianship)
        .where(inArray(guardianship.chargePersonId, personIds));
      await db
        .delete(subscriptionTable)
        .where(eq(subscriptionTable.id, SUB_ID));
      await db
        .delete(membership)
        .where(inArray(membership.personId, personIds));
      await db.delete(person).where(inArray(person.id, personIds));
      await db
        .delete(organization)
        .where(inArray(organization.id, [ACCOUNT_ID, OTHER_ORG_ID]));
      // legacy store
      await db
        .delete(familyPreferences)
        .where(inArray(familyPreferences.ownerProfileId, personIds));
      await db
        .delete(familyLinks)
        .where(inArray(familyLinks.parentProfileId, personIds));
      await db
        .delete(familyLinks)
        .where(inArray(familyLinks.childProfileId, personIds));
      await db.delete(subscriptions).where(eq(subscriptions.id, SUB_ID));
      await db.delete(profiles).where(inArray(profiles.id, personIds));
      await db.delete(accounts).where(eq(accounts.id, ACCOUNT_ID));
    }

    /**
     * Seed the SAME family into both stores. Family of three: an owner-guardian,
     * a non-owner co-parent (also a guardian of the child), and the child.
     * Guardianship edges: owner→child and coparent→child (the v2 image of the
     * two family_links rows). Usage: owner 10/1, coparent 5/2, child 7/3
     * (used/usedToday).
     */
    async function seedFamily(opts: { ownerSharing: boolean }) {
      // ---- legacy store ----
      await db.insert(accounts).values({
        id: ACCOUNT_ID,
        clerkUserId: `clerk_${ACCOUNT_ID}`,
        email: `owner_${ACCOUNT_ID}@test.local`,
      });
      await db.insert(profiles).values([
        {
          id: OWNER_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Owner',
          birthYear: 1985,
          isOwner: true,
        },
        {
          id: COPARENT_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Co-parent',
          birthYear: 1986,
          isOwner: false,
        },
        {
          id: CHILD_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Child',
          birthYear: 2014,
          isOwner: false,
        },
      ]);
      await db.insert(familyLinks).values([
        { parentProfileId: OWNER_ID, childProfileId: CHILD_ID },
        { parentProfileId: COPARENT_ID, childProfileId: CHILD_ID },
      ]);
      await db.insert(subscriptions).values({
        id: SUB_ID,
        accountId: ACCOUNT_ID,
        tier: 'family',
        status: 'active',
      });
      await db.insert(familyPreferences).values({
        ownerProfileId: OWNER_ID,
        poolBreakdownShared: opts.ownerSharing,
      });

      // ---- v2 store (same ids by the reseed contract) ----
      await db.insert(organization).values({ id: ACCOUNT_ID, name: 'Fam' });
      await db.insert(person).values([
        {
          id: OWNER_ID,
          displayName: 'Owner',
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: COPARENT_ID,
          displayName: 'Co-parent',
          birthDate: '1986-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: CHILD_ID,
          displayName: 'Child',
          birthDate: '2014-01-01',
          residenceJurisdiction: 'EU',
        },
      ]);
      await db.insert(membership).values([
        {
          personId: OWNER_ID,
          organizationId: ACCOUNT_ID,
          roles: ['admin', 'learner'],
        },
        {
          personId: COPARENT_ID,
          organizationId: ACCOUNT_ID,
          roles: ['learner'],
        },
        { personId: CHILD_ID, organizationId: ACCOUNT_ID, roles: ['learner'] },
      ]);
      await db.insert(subscriptionTable).values({
        id: SUB_ID,
        organizationId: ACCOUNT_ID,
        planTier: 'family',
        status: 'active',
        payerPersonId: OWNER_ID,
      });
      await db.insert(guardianship).values([
        { guardianPersonId: OWNER_ID, chargePersonId: CHILD_ID },
        { guardianPersonId: COPARENT_ID, chargePersonId: CHILD_ID },
      ]);

      // ---- shared usage_events (FK → legacy subscriptions/profiles; profileId
      // = person.id by the reseed, so the v2 enumeration aggregates the same) ----
      const within = new Date('2026-05-05T12:00:00.000Z'); // in cycle, before DAY_START
      const today = new Date('2026-05-06T12:00:00.000Z'); // in cycle, after DAY_START
      const events: Array<{
        subscriptionId: string;
        profileId: string;
        occurredAt: Date;
        delta: number;
      }> = [];
      const push = (pid: string, used: number, usedToday: number) => {
        for (let i = 0; i < used - usedToday; i++)
          events.push({
            subscriptionId: SUB_ID,
            profileId: pid,
            occurredAt: within,
            delta: 1,
          });
        for (let i = 0; i < usedToday; i++)
          events.push({
            subscriptionId: SUB_ID,
            profileId: pid,
            occurredAt: today,
            delta: 1,
          });
      };
      push(OWNER_ID, 10, 1);
      push(COPARENT_ID, 5, 2);
      push(CHILD_ID, 7, 3);
      await db.insert(usageEvents).values(events);
    }

    afterEach(cleanup);

    function callV2(activeProfileId: string) {
      return getUsageBreakdownForProfileV2(db, {
        subscriptionId: SUB_ID,
        activeProfileId,
        monthlyLimit: MONTHLY_LIMIT,
        cycleStartAt: CYCLE_START,
        dayStartAt: DAY_START,
      });
    }

    // Usage seeded by seedFamily(): owner 10/1, coparent 5/2, child 7/3
    // (used/usedToday) — see its doc comment.

    it('owner-guardian: full family aggregate visible to the admin viewer', async () => {
      await seedFamily({ ownerSharing: false });
      const v2 = await callV2(OWNER_ID);

      expect(v2.isOwnerBreakdownViewer).toBe(true);
      expect(v2.familyAggregate).toEqual({ used: 22, limit: MONTHLY_LIMIT });
      const profileIds = v2.byProfile.map((r) => r.profile_id);
      expect(profileIds).toHaveLength(3);
      expect(profileIds).toContain(OWNER_ID);
      expect(profileIds).toContain(COPARENT_ID);
      expect(profileIds).toContain(CHILD_ID);
      expect(v2.selfUsedToday).toBeNull();
      expect(v2.selfUsedThisMonth).toBeNull();
    });

    it('co-parent with owner sharing ON: sees full breakdown', async () => {
      await seedFamily({ ownerSharing: true });
      const v2 = await callV2(COPARENT_ID);

      expect(v2.isOwnerBreakdownViewer).toBe(true);
      expect(v2.familyAggregate).toEqual({ used: 22, limit: MONTHLY_LIMIT });
      expect(v2.byProfile.map((r) => r.profile_id)).toHaveLength(3);
    });

    it('co-parent with owner sharing OFF: self-scoped only', async () => {
      await seedFamily({ ownerSharing: false });
      const v2 = await callV2(COPARENT_ID);

      expect(v2.isOwnerBreakdownViewer).toBe(false);
      expect(v2.byProfile.map((r) => r.profile_id)).toEqual([COPARENT_ID]);
      expect(v2.familyAggregate).toBeNull();
      expect(v2.selfUsedToday).toBe(2);
      expect(v2.selfUsedThisMonth).toBe(5);
    });

    it('child: no breakdown, self-scoped usage', async () => {
      await seedFamily({ ownerSharing: true });
      const v2 = await callV2(CHILD_ID);

      expect(v2.isOwnerBreakdownViewer).toBe(false);
      expect(v2.byProfile).toHaveLength(0);
      expect(v2.familyAggregate).toBeNull();
      expect(v2.selfUsedToday).toBe(3);
      expect(v2.selfUsedThisMonth).toBe(7);
    });

    // -----------------------------------------------------------------------
    // Adversarial seed (Codex P2 regression). The co-parent has NO in-org
    // family link / guardianship edge — they are a plain non-owner adult — but
    // DOES hold a guardianship edge over a person in ANOTHER org. The global
    // guardianship reader returns that out-of-org charge; without the in-org
    // intersection the v2 twin would compute hasChildLink=true and, with owner
    // sharing ON, leak the FULL current-org family breakdown to a non-owner who
    // legacy treats as self-scoped only. Equivalence here proves the out-of-org
    // edge does NOT flip hasChildLink/isChild.
    // -----------------------------------------------------------------------

    /**
     * Seed a family where the co-parent is a plain non-owner (no in-org child
     * edge), plus an out-of-org guardianship edge from the co-parent to an
     * outsider person in OTHER_ORG_ID. Owner sharing is ON so a leak — if the
     * out-of-org edge wrongly counted — would surface as the full breakdown.
     */
    async function seedAdversarial() {
      // ---- legacy store: only the owner→child link exists in-org ----
      await db.insert(accounts).values({
        id: ACCOUNT_ID,
        clerkUserId: `clerk_${ACCOUNT_ID}`,
        email: `owner_${ACCOUNT_ID}@test.local`,
      });
      await db.insert(profiles).values([
        {
          id: OWNER_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Owner',
          birthYear: 1985,
          isOwner: true,
        },
        {
          id: COPARENT_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Co-parent',
          birthYear: 1986,
          isOwner: false,
        },
        {
          id: CHILD_ID,
          accountId: ACCOUNT_ID,
          displayName: 'Child',
          birthYear: 2014,
          isOwner: false,
        },
      ]);
      // NOTE: no COPARENT→CHILD link — the co-parent has no in-org family link.
      await db
        .insert(familyLinks)
        .values([{ parentProfileId: OWNER_ID, childProfileId: CHILD_ID }]);
      await db.insert(subscriptions).values({
        id: SUB_ID,
        accountId: ACCOUNT_ID,
        tier: 'family',
        status: 'active',
      });
      await db.insert(familyPreferences).values({
        ownerProfileId: OWNER_ID,
        poolBreakdownShared: true, // sharing ON — a leak would surface here
      });

      // ---- v2 store ----
      await db.insert(organization).values([
        { id: ACCOUNT_ID, name: 'Fam' },
        { id: OTHER_ORG_ID, name: 'OtherOrg' },
      ]);
      await db.insert(person).values([
        {
          id: OWNER_ID,
          displayName: 'Owner',
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: COPARENT_ID,
          displayName: 'Co-parent',
          birthDate: '1986-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: CHILD_ID,
          displayName: 'Child',
          birthDate: '2014-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: OUTSIDER_ID,
          displayName: 'Outsider',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        },
      ]);
      await db.insert(membership).values([
        {
          personId: OWNER_ID,
          organizationId: ACCOUNT_ID,
          roles: ['admin', 'learner'],
        },
        {
          personId: COPARENT_ID,
          organizationId: ACCOUNT_ID,
          roles: ['learner'],
        },
        { personId: CHILD_ID, organizationId: ACCOUNT_ID, roles: ['learner'] },
        // The outsider belongs to OTHER_ORG_ID — never a member of ACCOUNT_ID.
        {
          personId: OUTSIDER_ID,
          organizationId: OTHER_ORG_ID,
          roles: ['learner'],
        },
      ]);
      await db.insert(subscriptionTable).values({
        id: SUB_ID,
        organizationId: ACCOUNT_ID,
        planTier: 'family',
        status: 'active',
        payerPersonId: OWNER_ID,
      });
      await db.insert(guardianship).values([
        // in-org: only the owner guards the child.
        { guardianPersonId: OWNER_ID, chargePersonId: CHILD_ID },
        // ADVERSARIAL: the co-parent guards a person in ANOTHER org. Global
        // reader returns this; the in-org intersection must drop it.
        { guardianPersonId: COPARENT_ID, chargePersonId: OUTSIDER_ID },
      ]);

      // ---- shared usage_events (in-org members only) ----
      const within = new Date('2026-05-05T12:00:00.000Z');
      const today = new Date('2026-05-06T12:00:00.000Z');
      const events: Array<{
        subscriptionId: string;
        profileId: string;
        occurredAt: Date;
        delta: number;
      }> = [];
      const push = (pid: string, used: number, usedToday: number) => {
        for (let i = 0; i < used - usedToday; i++)
          events.push({
            subscriptionId: SUB_ID,
            profileId: pid,
            occurredAt: within,
            delta: 1,
          });
        for (let i = 0; i < usedToday; i++)
          events.push({
            subscriptionId: SUB_ID,
            profileId: pid,
            occurredAt: today,
            delta: 1,
          });
      };
      push(OWNER_ID, 10, 1);
      push(COPARENT_ID, 5, 2);
      push(CHILD_ID, 7, 3);
      await db.insert(usageEvents).values(events);
    }

    it('out-of-org guardianship edge does NOT flip hasChildLink: v2 stays self-scoped', async () => {
      await seedAdversarial();
      const v2 = await callV2(COPARENT_ID);

      // The co-parent has no in-org guardianship edge over the child — the
      // out-of-org edge (co-parent → outsider, a different org) must NOT
      // grant the full-family breakdown even with sharing ON. Pins the
      // privacy invariant the CUT-B2 in-org intersection exists to enforce.
      expect(v2.isOwnerBreakdownViewer).toBe(false);
      expect(v2.byProfile.map((r) => r.profile_id)).toEqual([COPARENT_ID]);
      expect(v2.familyAggregate).toBeNull();
      expect(v2.selfUsedToday).toBe(2);
      expect(v2.selfUsedThisMonth).toBe(5);
    });
  },
);
