// ---------------------------------------------------------------------------
// WI-722 — semantic-equivalence proof for the getUsageBreakdownForProfile v2
// twin, against a REAL family seeded into BOTH stores.
//
// THE CRUX (shepherd adjustment #3). "Behavior-preserving" is a trap when the
// new schema models the relationship differently. The legacy function reads
// `family_links` (parent_profile_id × child_profile_id) to decide hasChildLink
// / isChild; the v2 twin reads the ratified `guardianship` edge
// (guardian_person_id × charge_person_id, revoked_at IS NULL) via the CUT-B2
// reader. The correctness risk is whether the twin aggregates usage over the
// SAME set of profileIds as the legacy family_links query.
//
// This test seeds ONE family into both stores under the reseed identity
// contract (person.id = profiles.id, organization.id = accounts.id,
// subscription.id = subscriptions.id) plus a shared `usage_events` table, then
// asserts getUsageBreakdownForProfileV2(...) deep-equals the legacy
// getUsageBreakdownForProfile(...) for every viewer perspective: the
// owner-guardian, a non-owner co-parent (with and without owner sharing), and
// the child. Equal output ⇒ the profile-set equivalence holds.
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
import { getUsageBreakdownForProfile } from '../family';
import { getUsageBreakdownForProfileV2 } from './family-usage-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'getUsageBreakdownForProfile v2 ≡ legacy (integration)',
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

    function callBoth(activeProfileId: string) {
      const input = {
        subscriptionId: SUB_ID,
        activeProfileId,
        monthlyLimit: MONTHLY_LIMIT,
        cycleStartAt: CYCLE_START,
        dayStartAt: DAY_START,
      };
      return Promise.all([
        getUsageBreakdownForProfile(db, input),
        getUsageBreakdownForProfileV2(db, input),
      ]);
    }

    it('owner-guardian: v2 breakdown equals legacy (full family aggregate)', async () => {
      await seedFamily({ ownerSharing: false });
      const [legacy, v2] = await callBoth(OWNER_ID);

      // Equivalence is the assertion; sanity-anchor a couple of fields so a
      // mutually-broken pair can't pass by both returning empty.
      expect(legacy.isOwnerBreakdownViewer).toBe(true);
      expect(legacy.familyAggregate).toEqual({
        used: 22,
        limit: MONTHLY_LIMIT,
      });
      expect(normalize(v2)).toEqual(normalize(legacy));
    });

    it('co-parent with owner sharing ON: v2 equals legacy (sees full breakdown)', async () => {
      await seedFamily({ ownerSharing: true });
      const [legacy, v2] = await callBoth(COPARENT_ID);

      expect(legacy.isOwnerBreakdownViewer).toBe(true);
      expect(normalize(v2)).toEqual(normalize(legacy));
    });

    it('co-parent with owner sharing OFF: v2 equals legacy (self-scoped only)', async () => {
      await seedFamily({ ownerSharing: false });
      const [legacy, v2] = await callBoth(COPARENT_ID);

      expect(legacy.isOwnerBreakdownViewer).toBe(false);
      expect(legacy.byProfile.map((r) => r.profile_id)).toEqual([COPARENT_ID]);
      expect(normalize(v2)).toEqual(normalize(legacy));
    });

    it('child: v2 equals legacy (no breakdown, self-scoped usage)', async () => {
      await seedFamily({ ownerSharing: true });
      const [legacy, v2] = await callBoth(CHILD_ID);

      expect(legacy.isOwnerBreakdownViewer).toBe(false);
      expect(legacy.byProfile).toHaveLength(0);
      expect(legacy.selfUsedThisMonth).toBe(7);
      expect(normalize(v2)).toEqual(normalize(legacy));
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

    it('out-of-org guardianship edge does NOT flip hasChildLink: v2 stays self-scoped, equals legacy', async () => {
      await seedAdversarial();
      const [legacy, v2] = await callBoth(COPARENT_ID);

      // Legacy: the co-parent has no in-org family link → self-scoped, NOT an
      // owner-breakdown viewer, even with sharing ON. The v2 twin must match —
      // the out-of-org edge must not grant the full-family breakdown.
      expect(legacy.isOwnerBreakdownViewer).toBe(false);
      expect(legacy.byProfile.map((r) => r.profile_id)).toEqual([COPARENT_ID]);
      expect(legacy.familyAggregate).toBeNull();
      expect(normalize(v2)).toEqual(normalize(legacy));
      // Pin the privacy invariant directly: no sibling rows leaked to v2.
      expect(v2.isOwnerBreakdownViewer).toBe(false);
      expect(v2.byProfile.map((r) => r.profile_id)).toEqual([COPARENT_ID]);
    });
  },
);

/**
 * The two functions enumerate members in store-natural order (legacy: profiles
 * scan; v2: person × membership scan), which Postgres does not guarantee to
 * match. Profile-set equivalence — not row order — is what semantic-preservation
 * requires, so sort byProfile by profile_id before comparing.
 */
function normalize<T extends { byProfile: Array<{ profile_id: string }> }>(
  result: T,
): T {
  return {
    ...result,
    byProfile: [...result.byProfile].sort((a, b) =>
      a.profile_id.localeCompare(b.profile_id),
    ),
  };
}
