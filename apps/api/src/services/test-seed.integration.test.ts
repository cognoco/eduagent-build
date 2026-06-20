// ---------------------------------------------------------------------------
// WI-880 — test-seed teardown FK ordering regression test (real DB).
//
// deleteOrganizationGraph (used by resetDatabase and the idempotent pre-seed
// cleanup in seedScenario) deletes consent_grant rows. consent_request carries
// a back-link FK consent_request.consent_grant_id -> consent_grant.id with NO
// ON DELETE clause (NO ACTION / RESTRICT). After a J-13 approval or J-21
// withdrawal journey an approved/withdrawn consent_request points at a grant, so
// deleting the grant before the request fails with a Postgres FK violation and
// the global teardown leaves seeded accounts behind.
//
// The fix deletes consent_request rows (org-scoped) BEFORE consent_grant rows.
// These tests exercise the REAL resetDatabase against a real DB (no internal
// jest.mock — GC1/GC6) and assert teardown exits cleanly and removes the org,
// person, consent_grant, and consent_request rows for both the approved and the
// withdrawn variant.
//
// Rows are inserted directly (org/person/login/membership/consent_request/
// consent_grant) rather than via seedScenario so the test never touches Clerk —
// the subject under test is the DB teardown ordering, exercised through the real
// resetDatabase. The login uses the clerk_seed_ prefix so resetDatabase
// recognises it as seed-managed.
//
// RED-GREEN proof: revert the consent_request delete in deleteOrganizationGraph
// and these tests fail with `consent_request_consent_grant_id_*` FK violation
// thrown by resetDatabase; with the fix in place they pass.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentRequest,
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { resetDatabase, SEED_CLERK_PREFIX } from './test-seed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'test-seed teardown FK ordering (WI-880, integration)',
  () => {
    let db: Database;
    const createdOrgIds: string[] = [];
    const createdPersonIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    // Belt-and-suspenders: if an assertion throws mid-test (before resetDatabase
    // ran or succeeded), clear our rows directly — request before grant — so the
    // run leaves no residue. No-op once resetDatabase has already removed them.
    afterEach(async () => {
      for (const oid of createdOrgIds) {
        await db
          .delete(consentRequest)
          .where(eq(consentRequest.organizationId, oid));
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.organizationId, oid));
      }
      for (const pid of createdPersonIds) {
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(login).where(eq(login.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of createdOrgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      createdOrgIds.length = 0;
      createdPersonIds.length = 0;
    });

    /**
     * Inserts a real seed-managed org + person + login + membership and an
     * approved/withdrawn consent_request back-linked to a consent_grant —
     * mirroring the runtime state left by a J-13 approval / J-21 withdrawal
     * journey. Returns the ids plus a per-run email prefix scoping the reset.
     */
    async function seedLinkedConsent(opts: { withdrawn: boolean }): Promise<{
      accountId: string;
      profileId: string;
      grantId: string;
      requestId: string;
      prefix: string;
      clerkUserId: string;
    }> {
      const accountId = generateUUIDv7();
      const profileId = generateUUIDv7();
      const grantId = generateUUIDv7();
      const requestId = generateUUIDv7();
      const prefix = `wi880-${generateUUIDv7()}-`;
      const email = `${prefix}consent@example.com`;
      const clerkUserId = `${SEED_CLERK_PREFIX}${generateUUIDv7()}`;

      await db
        .insert(organization)
        .values({ id: accountId, name: `WI-880 org ${accountId.slice(0, 8)}` });
      createdOrgIds.push(accountId);

      await db.insert(person).values({
        id: profileId,
        displayName: 'WI-880 Child',
        birthDate: '2015-01-01',
        residenceJurisdiction: 'ROW',
      });
      createdPersonIds.push(profileId);

      await db.insert(login).values({
        id: generateUUIDv7(),
        personId: profileId,
        clerkUserId,
        email,
      });
      await db.insert(membership).values({
        personId: profileId,
        organizationId: accountId,
        roles: ['learner'],
      });

      await db.insert(consentGrant).values({
        id: grantId,
        chargePersonId: profileId,
        organizationId: accountId,
        purpose: 'platform_use',
        lawfulBasis: 'gdpr_parental_consent',
        granted: !opts.withdrawn,
        ...(opts.withdrawn
          ? { withdrawnAt: new Date(), priorValue: true }
          : {}),
      });

      // The FK edge under test: an approved/withdrawn request back-links the grant.
      await db.insert(consentRequest).values({
        id: requestId,
        chargePersonId: profileId,
        organizationId: accountId,
        purpose: 'platform_use',
        requestedBasis: 'gdpr_parental_consent',
        status: 'approved',
        consentGrantId: grantId,
        requestedAt: new Date(),
        respondedAt: new Date(),
      });

      return { accountId, profileId, grantId, requestId, prefix, clerkUserId };
    }

    it('resetDatabase tears down an APPROVED consent request linked to a grant without FK violation', async () => {
      const { accountId, profileId, grantId, prefix, clerkUserId } =
        await seedLinkedConsent({ withdrawn: false });

      // Sanity: the back-link exists before teardown.
      const linkedBefore = await db
        .select({ id: consentRequest.id })
        .from(consentRequest)
        .where(eq(consentRequest.consentGrantId, grantId));
      expect(linkedBefore.length).toBe(1);

      // The global-teardown path. Pass clerkUserIds so the Clerk REST path is
      // skipped (this is a pure-DB exercise). Must NOT throw a FK violation.
      const result = await resetDatabase(
        db,
        {},
        { prefix, clerkUserIds: [clerkUserId] },
      );
      expect(result.deletedCount).toBe(1);

      // Everything for the org is gone — grant, request, person, org.
      const grantsAfter = await db
        .select({ id: consentGrant.id })
        .from(consentGrant)
        .where(eq(consentGrant.organizationId, accountId));
      const requestsAfter = await db
        .select({ id: consentRequest.id })
        .from(consentRequest)
        .where(eq(consentRequest.organizationId, accountId));
      const personAfter = await db
        .select({ id: person.id })
        .from(person)
        .where(eq(person.id, profileId));
      const orgAfter = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, accountId));

      expect(grantsAfter).toEqual([]);
      expect(requestsAfter).toEqual([]);
      expect(personAfter).toEqual([]);
      expect(orgAfter).toEqual([]);
    });

    it('resetDatabase tears down a WITHDRAWN consent request linked to a grant without FK violation', async () => {
      const { accountId, profileId, prefix, clerkUserId } =
        await seedLinkedConsent({ withdrawn: true });

      const result = await resetDatabase(
        db,
        {},
        { prefix, clerkUserIds: [clerkUserId] },
      );
      expect(result.deletedCount).toBe(1);

      const grantsAfter = await db
        .select({ id: consentGrant.id })
        .from(consentGrant)
        .where(eq(consentGrant.organizationId, accountId));
      const requestsAfter = await db
        .select({ id: consentRequest.id })
        .from(consentRequest)
        .where(eq(consentRequest.organizationId, accountId));
      const personAfter = await db
        .select({ id: person.id })
        .from(person)
        .where(eq(person.id, profileId));
      const orgAfter = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, accountId));

      expect(grantsAfter).toEqual([]);
      expect(requestsAfter).toEqual([]);
      expect(personAfter).toEqual([]);
      expect(orgAfter).toEqual([]);
    });
  },
);
