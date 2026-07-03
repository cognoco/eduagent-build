// ---------------------------------------------------------------------------
// WI-905 (seam c) — child-cap-notifications v2 integration twin.
//
// CUT-B3 (WI-693) shipped child-cap-notifications-v2.ts with no integration
// coverage: the owner-resolution SQL (findOwnerPersonId /
// findOwnerPersonIdBySubscription — person × membership admin-role scan),
// the in-org membership check (childBelongsToSubscriptionOrg), the
// dedup-on-conflict insert, and the listActiveChildCapNotificationsV2 join +
// schema-parse were all exercised only via a fully-mocked Database in the
// unit test (or not at all). This file runs the real SQL against the real
// identity graph (person/membership/organization/subscription) plus the
// legacy profiles twins that child_cap_notifications still FKs.
//
// Seeding: child_cap_notifications.owner_profile_id / child_profile_id FK
// legacy profiles.id (pre-repoint schema — same twin requirement as
// family-usage-v2.integration.test.ts, the sibling file this lives beside).
// The reseed identity contract (person.id = profiles.id,
// organization.id = accounts.id) lets one pair of ids seed both stores.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  childCapNotifications,
  createDatabase,
  generateUUIDv7,
  membership,
  organization,
  person,
  profiles,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import {
  listActiveChildCapNotificationsV2,
  recordChildCapNotificationForAccountV2,
  recordChildCapNotificationForSubscriptionV2,
} from './child-cap-notifications-v2';
import { legacyIdentityTableExistsForTest } from '../../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'child-cap-notifications-v2 (integration)',
  () => {
    let db: Database;

    // Reseed-contract shared ids: organization.id = accounts.id, and each
    // person/profile pair shares an id (person.id = profiles.id).
    const ORG_ID = generateUUIDv7();
    const OWNER_ID = generateUUIDv7();
    const CHILD_ID = generateUUIDv7();
    const SUB_ID = generateUUIDv7();

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    async function seedGraph(): Promise<void> {
      // [WI-1128] Legacy `accounts`/`profiles` may already be dropped
      // (post-M-DROP); after M-REPOINT, child_cap_notifications FKs `person`
      // directly, so this legacy twin mirror is a no-op there instead of
      // hard-failing.
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.insert(accounts).values({
          id: ORG_ID,
          clerkUserId: `clerk_${ORG_ID}`,
          email: `owner_${ORG_ID}@test.local`,
        });
      }
      if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
        await db.insert(profiles).values([
          {
            id: OWNER_ID,
            accountId: ORG_ID,
            displayName: 'Owner',
            birthYear: 1985,
            isOwner: true,
          },
          {
            id: CHILD_ID,
            accountId: ORG_ID,
            displayName: 'Child',
            birthYear: 2014,
            isOwner: false,
          },
        ]);
      }

      // v2 graph.
      await db.insert(organization).values({ id: ORG_ID, name: 'WI-905 Fam' });
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
      ]);
      await db.insert(membership).values([
        { personId: OWNER_ID, organizationId: ORG_ID, roles: ['admin'] },
        { personId: CHILD_ID, organizationId: ORG_ID, roles: ['learner'] },
      ]);
    }

    afterEach(async () => {
      await db
        .delete(childCapNotifications)
        .where(eq(childCapNotifications.ownerProfileId, OWNER_ID));
      await db
        .delete(subscriptionTable)
        .where(eq(subscriptionTable.id, SUB_ID));
      await db.delete(membership).where(eq(membership.organizationId, ORG_ID));
      await db.delete(person).where(eq(person.id, OWNER_ID));
      await db.delete(person).where(eq(person.id, CHILD_ID));
      await db.delete(organization).where(eq(organization.id, ORG_ID));
      // [WI-1128] Legacy `accounts`/`profiles` may already be dropped
      // (post-M-DROP); skip cleanup there instead of hard-failing.
      if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
        await db.delete(profiles).where(eq(profiles.accountId, ORG_ID));
      }
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.delete(accounts).where(eq(accounts.id, ORG_ID));
      }
    });

    // -------------------------------------------------------------------------
    // recordChildCapNotificationForAccountV2 — accountId = organization.id.
    // Exercises findOwnerPersonId (person × membership admin-role SQL) and the
    // real insert.
    // -------------------------------------------------------------------------
    it('recordChildCapNotificationForAccountV2 resolves the real admin owner and inserts the row', async () => {
      await seedGraph();
      const occurredAt = '2026-06-15T09:00:00.000Z';
      const resetsAt = '2026-06-16T00:00:00.000Z';

      const result = await recordChildCapNotificationForAccountV2(db, {
        accountId: ORG_ID,
        childProfileId: CHILD_ID,
        kind: 'daily_exceeded',
        occurredAt,
        resetsAt,
      });

      expect(result).toEqual({ inserted: true });

      const row = await db.query.childCapNotifications.findFirst({
        where: eq(childCapNotifications.childProfileId, CHILD_ID),
      });
      expect(row?.ownerProfileId).toBe(OWNER_ID);
      expect(row?.kind).toBe('daily_exceeded');
      expect(row?.occurredOn).toBe('2026-06-15');
    });

    it('dedups on (owner, child, kind, occurredOn): the second insert is a no-op', async () => {
      await seedGraph();
      const input = {
        accountId: ORG_ID,
        childProfileId: CHILD_ID,
        kind: 'daily_exceeded' as const,
        occurredAt: '2026-06-15T09:00:00.000Z',
        resetsAt: '2026-06-16T00:00:00.000Z',
      };

      const first = await recordChildCapNotificationForAccountV2(db, input);
      const second = await recordChildCapNotificationForAccountV2(db, input);

      expect(first).toEqual({ inserted: true });
      expect(second).toEqual({ inserted: false });

      const rows = await db.query.childCapNotifications.findMany({
        where: eq(childCapNotifications.childProfileId, CHILD_ID),
      });
      expect(rows).toHaveLength(1);
    });

    // -------------------------------------------------------------------------
    // recordChildCapNotificationForSubscriptionV2 — resolves owner via
    // subscription → organization, and checks the child belongs to that org.
    // -------------------------------------------------------------------------
    it('recordChildCapNotificationForSubscriptionV2 resolves the owner via the subscription and inserts', async () => {
      await seedGraph();
      await db.insert(subscriptionTable).values({
        id: SUB_ID,
        organizationId: ORG_ID,
        planTier: 'family',
        status: 'active',
        payerPersonId: OWNER_ID,
      });

      const result = await recordChildCapNotificationForSubscriptionV2(db, {
        subscriptionId: SUB_ID,
        childProfileId: CHILD_ID,
        kind: 'monthly_exceeded',
        occurredAt: '2026-06-20T09:00:00.000Z',
        resetsAt: '2026-07-01T00:00:00.000Z',
      });

      expect(result).toEqual({ inserted: true });
      const row = await db.query.childCapNotifications.findFirst({
        where: eq(childCapNotifications.childProfileId, CHILD_ID),
      });
      expect(row?.ownerProfileId).toBe(OWNER_ID);
      expect(row?.kind).toBe('monthly_exceeded');
    });

    it('recordChildCapNotificationForSubscriptionV2 refuses a child outside the subscription org', async () => {
      await seedGraph();
      await db.insert(subscriptionTable).values({
        id: SUB_ID,
        organizationId: ORG_ID,
        planTier: 'family',
        status: 'active',
        payerPersonId: OWNER_ID,
      });
      const outsiderId = generateUUIDv7(); // never a member of ORG_ID.

      const result = await recordChildCapNotificationForSubscriptionV2(db, {
        subscriptionId: SUB_ID,
        childProfileId: outsiderId,
        kind: 'monthly_exceeded',
        occurredAt: '2026-06-20T09:00:00.000Z',
        resetsAt: '2026-07-01T00:00:00.000Z',
      });

      expect(result).toEqual({
        inserted: false,
        reason: 'child_not_in_subscription_account',
      });
    });

    it('recordChildCapNotificationForSubscriptionV2 reports owner_not_found for an unknown subscription', async () => {
      await seedGraph();
      const result = await recordChildCapNotificationForSubscriptionV2(db, {
        subscriptionId: generateUUIDv7(), // no subscription row seeded.
        childProfileId: CHILD_ID,
        kind: 'daily_exceeded',
        occurredAt: '2026-06-20T09:00:00.000Z',
        resetsAt: '2026-07-01T00:00:00.000Z',
      });

      expect(result).toEqual({ inserted: false, reason: 'owner_not_found' });
    });

    // -------------------------------------------------------------------------
    // listActiveChildCapNotificationsV2 — the person join for childDisplayName
    // + the dismissedAt filter, against real rows.
    // -------------------------------------------------------------------------
    it('listActiveChildCapNotificationsV2 returns only non-dismissed rows with the real child display name', async () => {
      await seedGraph();
      const active = await recordChildCapNotificationForAccountV2(db, {
        accountId: ORG_ID,
        childProfileId: CHILD_ID,
        kind: 'daily_exceeded',
        occurredAt: '2026-06-15T09:00:00.000Z',
        resetsAt: '2026-06-16T00:00:00.000Z',
      });
      expect(active).toEqual({ inserted: true });
      const dismissed = await recordChildCapNotificationForAccountV2(db, {
        accountId: ORG_ID,
        childProfileId: CHILD_ID,
        kind: 'monthly_exceeded',
        occurredAt: '2026-06-15T09:00:00.000Z',
        resetsAt: '2026-07-01T00:00:00.000Z',
      });
      expect(dismissed).toEqual({ inserted: true });
      await db
        .update(childCapNotifications)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(childCapNotifications.ownerProfileId, OWNER_ID),
            eq(childCapNotifications.kind, 'monthly_exceeded'),
          ),
        );

      const list = await listActiveChildCapNotificationsV2(db, OWNER_ID);

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        ownerProfileId: OWNER_ID,
        childProfileId: CHILD_ID,
        childDisplayName: 'Child',
        kind: 'daily_exceeded',
        occurredOn: '2026-06-15',
      });
    });

    // -------------------------------------------------------------------------
    // [WI-1128, CC1] listActiveChildCapNotificationsV2 — 2-owner isolation.
    // The test above only exercises a single owner/family; this proves the
    // WHERE ownerProfileId scoping actually isolates across two distinct real
    // families, not just a single-tenant happy path.
    // -------------------------------------------------------------------------
    it('listActiveChildCapNotificationsV2 isolates notifications across two distinct owners', async () => {
      await seedGraph(); // family A: ORG_ID / OWNER_ID / CHILD_ID.

      // Family B — a second, independent org/owner/child.
      const orgB = generateUUIDv7();
      const ownerB = generateUUIDv7();
      const childB = generateUUIDv7();
      if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
        await db.insert(accounts).values({
          id: orgB,
          clerkUserId: `clerk_${orgB}`,
          email: `owner_${orgB}@test.local`,
        });
      }
      if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
        await db.insert(profiles).values([
          {
            id: ownerB,
            accountId: orgB,
            displayName: 'Owner B',
            birthYear: 1980,
            isOwner: true,
          },
          {
            id: childB,
            accountId: orgB,
            displayName: 'Child B',
            birthYear: 2015,
            isOwner: false,
          },
        ]);
      }
      await db.insert(organization).values({ id: orgB, name: 'WI-905 Fam B' });
      await db.insert(person).values([
        {
          id: ownerB,
          displayName: 'Owner B',
          birthDate: '1980-01-01',
          residenceJurisdiction: 'EU',
        },
        {
          id: childB,
          displayName: 'Child B',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        },
      ]);
      await db.insert(membership).values([
        { personId: ownerB, organizationId: orgB, roles: ['admin'] },
        { personId: childB, organizationId: orgB, roles: ['learner'] },
      ]);

      try {
        const resultA = await recordChildCapNotificationForAccountV2(db, {
          accountId: ORG_ID,
          childProfileId: CHILD_ID,
          kind: 'daily_exceeded',
          occurredAt: '2026-06-15T09:00:00.000Z',
          resetsAt: '2026-06-16T00:00:00.000Z',
        });
        expect(resultA).toEqual({ inserted: true });

        const resultB = await recordChildCapNotificationForAccountV2(db, {
          accountId: orgB,
          childProfileId: childB,
          kind: 'daily_exceeded',
          occurredAt: '2026-06-15T09:00:00.000Z',
          resetsAt: '2026-06-16T00:00:00.000Z',
        });
        expect(resultB).toEqual({ inserted: true });

        const listA = await listActiveChildCapNotificationsV2(db, OWNER_ID);
        expect(listA).toHaveLength(1);
        expect(listA[0]).toMatchObject({
          ownerProfileId: OWNER_ID,
          childProfileId: CHILD_ID,
        });

        const listB = await listActiveChildCapNotificationsV2(db, ownerB);
        expect(listB).toHaveLength(1);
        expect(listB[0]).toMatchObject({
          ownerProfileId: ownerB,
          childProfileId: childB,
        });
      } finally {
        await db
          .delete(childCapNotifications)
          .where(eq(childCapNotifications.ownerProfileId, ownerB));
        await db.delete(membership).where(eq(membership.organizationId, orgB));
        await db.delete(person).where(eq(person.id, ownerB));
        await db.delete(person).where(eq(person.id, childB));
        await db.delete(organization).where(eq(organization.id, orgB));
        if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
          await db.delete(profiles).where(eq(profiles.accountId, orgB));
        }
        if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
          await db.delete(accounts).where(eq(accounts.id, orgB));
        }
      }
    });
  },
);
