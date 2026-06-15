// ---------------------------------------------------------------------------
// WI-776 (WP-7) — IDOR break test for the isPersonUnderSubscriptionV2
// quota-enforcement guard (enumeration §4.6, HIGH).
//
// THE CRUX. The legacy metering guard verifyProfileInSubscriptionAccount answers
// "does this profile belong to the account that owns this subscription?" via
// `profiles × subscriptions ON account_id`. The v2 twin re-keys that onto
// `person × membership × subscription` via organization_id. The security risk is
// that a naive re-implementation could let a profileId from ANOTHER organization
// resolve true against this subscription — a cross-org IDOR that would draw this
// subscription's quota for an unrelated person.
//
// This test seeds the v2 store only (the legacy identity tables are dropped at
// the cutover — this guard exists precisely for the post-DROP world), under the
// reseed identity contract (person.id = profiles.id, organization.id =
// accounts.id, subscription.id = subscriptions.id), with an org of an owner +
// child PLUS an adversarial outsider person in a DIFFERENT org, then asserts:
//   (1) in-org members resolve TRUE (a member can draw the subscription's quota);
//   (2) the out-of-org outsider resolves FALSE against this subscription — the
//       break test (red before green: a join that drops the membership /
//       organization scope would return TRUE here);
//   (3) an archived person resolves FALSE;
//   (4) an unknown subscription resolves FALSE.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, inArray } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  organization,
  person,
  membership,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import { isPersonUnderSubscriptionV2 } from './metering-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'isPersonUnderSubscriptionV2 (integration)',
  () => {
    let db: Database;

    // Deterministic ids (unique prefix so parallel suites don't collide).
    const ORG_ID = 'b1111111-1111-4111-8111-111111111111';
    const SUB_ID = 'b2222222-2222-4222-8222-222222222222';
    const OWNER_ID = 'b3333333-3333-4333-8333-333333333333';
    const CHILD_ID = 'b4444444-4444-4444-8444-444444444444';
    const ARCHIVED_ID = 'b5555555-5555-4555-8555-555555555555';
    // Adversarial: a person in a DIFFERENT org. Holds NO membership in ORG_ID.
    // The cross-org IDOR guard must keep this person OUT of SUB_ID's quota.
    const OTHER_ORG_ID = 'b6666666-6666-4666-8666-666666666666';
    const OUTSIDER_ID = 'b7777777-7777-4777-8777-777777777777';
    const UNKNOWN_SUB_ID = 'b8888888-8888-4888-8888-888888888888';
    // A person with NO membership in any org (the orphan case — the join's
    // inner-join on membership must drop them).
    const ORPHAN_ID = 'b9999999-9999-4999-8999-999999999999';

    const PERSON_IDS = [
      OWNER_ID,
      CHILD_ID,
      ARCHIVED_ID,
      OUTSIDER_ID,
      ORPHAN_ID,
    ];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    async function cleanup() {
      await db
        .delete(subscriptionTable)
        .where(eq(subscriptionTable.id, SUB_ID));
      await db
        .delete(membership)
        .where(inArray(membership.personId, PERSON_IDS));
      await db.delete(person).where(inArray(person.id, PERSON_IDS));
      await db
        .delete(organization)
        .where(inArray(organization.id, [ORG_ID, OTHER_ORG_ID]));
    }

    async function seed() {
      await db.insert(organization).values([
        { id: ORG_ID, name: 'Fam' },
        { id: OTHER_ORG_ID, name: 'Other' },
      ]);
      await db.insert(person).values([
        {
          id: OWNER_ID,
          displayName: 'Owner',
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: CHILD_ID,
          displayName: 'Child',
          birthDate: '2014-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: ARCHIVED_ID,
          displayName: 'Archived',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
          archivedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: OUTSIDER_ID,
          displayName: 'Outsider',
          birthDate: '1991-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: ORPHAN_ID,
          displayName: 'Orphan',
          birthDate: '1992-01-01',
          residenceJurisdiction: 'EU',
        },
      ]);
      await db.insert(membership).values([
        {
          personId: OWNER_ID,
          organizationId: ORG_ID,
          roles: ['admin', 'learner'],
        },
        { personId: CHILD_ID, organizationId: ORG_ID, roles: ['learner'] },
        // Archived person IS a member of the org (so only archivedAt — not a
        // missing membership — can make the read return false).
        { personId: ARCHIVED_ID, organizationId: ORG_ID, roles: ['learner'] },
        // Outsider is a member of a DIFFERENT org only.
        {
          personId: OUTSIDER_ID,
          organizationId: OTHER_ORG_ID,
          roles: ['learner'],
        },
      ]);
      // status: 'active' — subscription status (trial/active/expired/cancelled)
      // is enforced upstream in the metering middleware, not in this ownership
      // guard, so status variants are intentionally not exercised here. This
      // guard answers only "is the person a member of the sub's org?".
      await db.insert(subscriptionTable).values({
        id: SUB_ID,
        organizationId: ORG_ID,
        planTier: 'family',
        status: 'active',
        payerPersonId: OWNER_ID,
      });
    }

    beforeEach(async () => {
      await cleanup();
      await seed();
    });

    afterAll(cleanup);

    it('in-org owner is under the subscription (true)', async () => {
      expect(await isPersonUnderSubscriptionV2(db, SUB_ID, OWNER_ID)).toBe(
        true,
      );
    });

    it('in-org child is under the subscription (true)', async () => {
      expect(await isPersonUnderSubscriptionV2(db, SUB_ID, CHILD_ID)).toBe(
        true,
      );
    });

    // -----------------------------------------------------------------------
    // THE BREAK TEST (§4.6 cross-org IDOR guard). The outsider holds a
    // membership in OTHER_ORG_ID only — never in ORG_ID, which owns SUB_ID.
    // A correct membership-scoped join returns NO row → false. A wrong join
    // that drops the organization_id scope (e.g. joining person→subscription
    // without the membership predicate, or matching on the wrong key) would
    // return true here and leak SUB_ID's quota to an unrelated person.
    // RED BEFORE GREEN: reverting isPersonUnderSubscriptionV2 to an unscoped
    // form makes THIS assertion fail.
    // -----------------------------------------------------------------------
    it('out-of-org person is NOT under the subscription (false — cross-org IDOR guard)', async () => {
      expect(await isPersonUnderSubscriptionV2(db, SUB_ID, OUTSIDER_ID)).toBe(
        false,
      );
    });

    it('person with no membership in any org is NOT under the subscription (false)', async () => {
      expect(await isPersonUnderSubscriptionV2(db, SUB_ID, ORPHAN_ID)).toBe(
        false,
      );
    });

    it('archived in-org person is NOT under the subscription (false)', async () => {
      expect(await isPersonUnderSubscriptionV2(db, SUB_ID, ARCHIVED_ID)).toBe(
        false,
      );
    });

    it('unknown subscription resolves false', async () => {
      expect(
        await isPersonUnderSubscriptionV2(db, UNKNOWN_SUB_ID, OWNER_ID),
      ).toBe(false);
    });
  },
);
