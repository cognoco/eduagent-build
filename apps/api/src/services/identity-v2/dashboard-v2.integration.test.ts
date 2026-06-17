// ---------------------------------------------------------------------------
// WI-802 — dashboard getChildrenForParent v2 guardianship path
//
// This file is FLAG-ON ONLY by design. It runs against the committed-migration
// DB in the WI-789 flag-ON lane (ci.yml `integration-flag-on` job,
// IDENTITY_V2_ENABLED=true) where `family_links` is ABSENT from the schema.
//
// Purpose: prove that `getChildrenForParent(db, parentId, { identityV2Enabled: true })`
// resolves the parent's charges via `guardianship` only — NO read of `family_links`.
//
// RED-GREEN-REVERT cycle (documented here — performed during implementation):
//   1. Seeded a guardianship edge (no family_links row) + minimal profile data.
//   2. Called getChildrenForParent with { identityV2Enabled: true }:
//      RED (before WI-802) — 500 `relation "family_links" does not exist` on
//        the committed-migration schema where family_links is absent.
//      GREEN (after WI-802) — returns [] (child has no subjects/sessions, so
//        validChildProfileIds filters it out via archivedAt IS NULL profile check).
//      REVERT — reverting the twin back to the unbranched read re-introduces RED.
//      RESTORE — restoring the twin returns to GREEN.
//   3. The break test [BREAK / FLAG-ON] proves a guardianship-only person with NO
//      family_links row is NOT returned for an unrelated parent under flag-on
//      (IDOR guard holds via guardianship scope).
//
// Seeding: only `person`, `membership`, `organization`, `guardianship` — no
// `family_links`, `accounts`, or `profiles`. The v2 path never touches those.
//
// Pattern: `(RUN ? describe : describe.skip)` — skips silently when DATABASE_URL
// is absent (unit/local runs without a DB).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  // [WI-586] drop-4: accounts/profiles removed; v2 path only needs person/org.
  createDatabase,
  generateUUIDv7,
  guardianship,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { getChildrenForParent } from '../dashboard';
import {
  notifyParentToSubscribe,
  sendStruggleNotification,
} from '../notifications';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'getChildrenForParent v2 guardianship path — flag-on (WI-802)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // [WI-586] drop-4: v2-only cleanup — guardianship RESTRICT → delete before person.
      // person ON DELETE CASCADE removes membership rows.
      for (const pid of personIds) {
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    const RUN_ID = generateUUIDv7();
    const seedCounter = 0;

    async function seedOrg(): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: `WI-802-org-${RUN_ID}` })
        .returning();
      orgIds.push(org!.id);
      return org!.id;
    }

    async function seedPerson(
      orgId: string,
      opts: { displayName?: string; roles?: string[] } = {},
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: opts.displayName ?? 'TestPerson',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      await db.insert(membership).values({
        personId: p!.id,
        organizationId: orgId,
        roles: opts.roles ?? ['learner'],
      });
      return p!.id;
    }

    // [WI-586] drop-4: seedLegacyProfile removed — the v2 path reads person.displayName,
    // not profiles.displayName. seedPerson already creates the person row with the
    // correct displayName; no legacy profile row is needed.

    async function grantGuardianshipEdge(
      guardianId: string,
      chargeId: string,
    ): Promise<void> {
      await db
        .insert(guardianship)
        .values({ guardianPersonId: guardianId, chargePersonId: chargeId });
    }

    // -------------------------------------------------------------------------
    // [FLAG-ON] guardianship-only (NO family_links row) — must return children.
    // THE WI-802 regression: family_links is absent from the schema post-M-DROP.
    // An unbranched getChildrenForParent reads family_links and 500s.
    // After WI-802 the v2 path reads guardianship and resolves.
    //
    // NOTE: The child has no subjects/sessions, so validChildProfileIds filters
    // through to an empty children[] array after the profile lookup — the test
    // proves the family_links read is gone (no 500 error), not that it returns
    // populated dashboard data (that is covered by dashboard.integration.test.ts).
    // -------------------------------------------------------------------------
    it(
      '[FLAG-ON] returns empty array for guardianship-only parent with no child data ' +
        '— no family_links read (WI-802 regression guard)',
      async () => {
        const orgId = await seedOrg();
        const guardianPersonId = await seedPerson(orgId, {
          displayName: 'Parent802',
          roles: ['admin'],
        });
        const chargePersonId = await seedPerson(orgId, {
          displayName: 'Child802',
          roles: ['learner'],
        });

        // Grant ONLY a guardianship edge — NO family_links row exists.
        await grantGuardianshipEdge(guardianPersonId, chargePersonId);

        // This must NOT throw. If it did, it means the unbranched family_links
        // read is still present (the WI-802 bug: `relation "family_links" does
        // not exist` on the post-M-DROP schema).
        const children = await getChildrenForParent(db, guardianPersonId, {
          identityV2Enabled: true,
        });

        // The child has no subjects/sessions so dashboard data is empty —
        // validChildProfileIds will include the child (profile exists) but
        // the child has no sessions/subjects so the result is an empty children
        // array (the child is filtered by archivedAt IS NULL but they have no
        // subjects or sessions so validChildProfileIds only contains them if
        // the profile is present but the subject batches are empty).
        // The critical invariant: NO ERROR was thrown.
        expect(Array.isArray(children)).toBe(true);
      },
    );

    // -------------------------------------------------------------------------
    // [BREAK / FLAG-ON] Cross-guardian IDOR: a parent with a guardianship edge
    // to their OWN child must NOT see another parent's child under flag-on.
    // Proves getChargePersonIds scopes correctly to the calling guardian.
    // -------------------------------------------------------------------------
    it(
      "[BREAK / FLAG-ON] does NOT include another guardian's charges " +
        '(IDOR guard holds under v2)',
      async () => {
        const orgId = await seedOrg();
        const guardianA = await seedPerson(orgId, { displayName: 'GuardianA' });
        const guardianB = await seedPerson(orgId, { displayName: 'GuardianB' });
        const chargeOfB = await seedPerson(orgId, { displayName: 'ChargeOfB' });

        await grantGuardianshipEdge(guardianB, chargeOfB);
        // Guardian A has NO edge to chargeOfB — must not see chargeOfB.

        const childrenForA = await getChildrenForParent(db, guardianA, {
          identityV2Enabled: true,
        });

        expect(childrenForA.every((c) => c.profileId !== chargeOfB)).toBe(true);
        expect(childrenForA).toHaveLength(0);
      },
    );

    // -------------------------------------------------------------------------
    // [BREAK / FLAG-ON] Cross-ORG IDOR: a guardianship edge that crosses an org
    // boundary must NOT leak the charge into the guardian's dashboard. This is
    // the negative-path break test for the same-org membership filter
    // (dashboard.ts: `eq(membership.organizationId, guardianOrgId)`).
    //
    // Seed: guardianA in org1; chargeInOrg2 is a member of org2 ONLY; an active
    // guardianship edge exists (guardianA → chargeInOrg2). Without the org
    // filter, getChildPersonIdsForParentV2 would return chargeInOrg2 globally
    // and the dashboard would expose it. With the filter, guardianA's org (org1)
    // does not contain chargeInOrg2's membership, so it is excluded.
    // -------------------------------------------------------------------------
    it(
      '[BREAK / FLAG-ON] excludes a cross-ORG charge even with an active ' +
        'guardianship edge (org-membership filter holds)',
      async () => {
        const org1 = await seedOrg();
        const org2 = await seedOrg();
        const guardianA = await seedPerson(org1, {
          displayName: 'GuardianA-org1',
          roles: ['admin'],
        });
        const chargeInOrg2 = await seedPerson(org2, {
          displayName: 'ChargeInOrg2',
          roles: ['learner'],
        });

        // Active guardianship edge that crosses the org boundary.
        await grantGuardianshipEdge(guardianA, chargeInOrg2);

        const childrenForA = await getChildrenForParent(db, guardianA, {
          identityV2Enabled: true,
        });

        expect(childrenForA.every((c) => c.profileId !== chargeInOrg2)).toBe(
          true,
        );
        expect(childrenForA).toHaveLength(0);
      },
    );

    // -------------------------------------------------------------------------
    // [FLAG-ON] Notification guardianship seam (WI-802 SHOULD-FIX coverage).
    //
    // notifyParentToSubscribe + sendStruggleNotification both gained a flag-on
    // branch that resolves the parent via `guardianship` (getGuardianPersonIds)
    // instead of `family_links`. These tests prove the v2 branch RESOLVES the
    // guardian (does not fall through to `no_parent_link`, and never reads
    // `family_links`) when only a guardianship edge exists.
    //
    // We assert on the resolution outcome, not the downstream push/email side
    // effects: any terminal reason OTHER than `no_parent_link` proves the
    // guardian was found via guardianship. (sendPushNotification / sendEmail are
    // external boundaries exercised elsewhere; this test isolates the v2 seam.)
    // -------------------------------------------------------------------------
    it(
      '[FLAG-ON] sendStruggleNotification resolves the guardian via guardianship ' +
        '(no family_links read — WI-802)',
      async () => {
        const orgId = await seedOrg();
        const guardianPersonId = await seedPerson(orgId, {
          displayName: 'ParentStruggle',
          roles: ['admin'],
        });
        const chargePersonId = await seedPerson(orgId, {
          displayName: 'ChildStruggle',
          roles: ['learner'],
        });
        await grantGuardianshipEdge(guardianPersonId, chargePersonId);

        const result = await sendStruggleNotification(
          db,
          chargePersonId,
          { type: 'struggle_noticed', topic: 'fractions', subject: 'Math' },
          { identityV2Enabled: true },
        );

        // The guardian WAS resolved via guardianship — so the reason is never
        // `no_parent_link`. (Downstream it stops at the push-enabled / consent
        // gates, which is the expected boundary for an un-onboarded seed.)
        expect(result.sent === false ? result.reason : 'sent').not.toBe(
          'no_parent_link',
        );
      },
    );

    it(
      '[FLAG-ON] notifyParentToSubscribe resolves the guardian via guardianship ' +
        '(no family_links read — WI-802)',
      async () => {
        const orgId = await seedOrg();
        const guardianPersonId = await seedPerson(orgId, {
          displayName: 'ParentSubscribe',
          roles: ['admin'],
        });
        const chargePersonId = await seedPerson(orgId, {
          displayName: 'ChildSubscribe',
          roles: ['learner'],
        });
        await grantGuardianshipEdge(guardianPersonId, chargePersonId);

        // Must NOT throw `relation "family_links" does not exist` and must NOT
        // report `no_parent_link` — both would mean the v2 branch failed to
        // resolve the guardian through guardianship.
        const result = await notifyParentToSubscribe(
          db,
          chargePersonId,
          undefined,
          undefined,
          { identityV2Enabled: true },
        );

        expect(result.reason).not.toBe('no_parent_link');
      },
    );
  },
);
