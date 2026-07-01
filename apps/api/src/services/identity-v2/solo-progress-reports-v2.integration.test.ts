// ---------------------------------------------------------------------------
// WI-905 (seam a) — listEligibleSelfReportPersonIdsV2 integration twin.
//
// The [WI-961] unit test (solo-progress-reports-v2.test.ts) fully mocks the
// Database object, so the real SQL this function issues — the activity scan
// (status/exchangeCount/window filters on learning_sessions) and the owner
// candidates join (person × membership, roles @> ARRAY['admin']::text[],
// archivedAt IS NULL, age) — has never run against a real Postgres. This file
// exercises that SQL directly; the guardian-exclusion and consent-gating
// branches call through to the real getGuardianPersonIds /
// resolveConsentStatus (already integration-covered elsewhere — see
// ownership-v2.integration.test.ts and consent-status-v2.integration.test.ts)
// so no internal mock is needed anywhere in this file.
//
// Seeding: learning_sessions and subjects FK legacy profiles.id (pre-repoint
// schema), so each person eligible for the activity scan needs a legacy
// profile twin — the same pattern recap-parent-detail-v2.integration.test.ts
// uses (profiles.id = personId).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  consentGrant,
  createDatabase,
  generateUUIDv7,
  guardianship,
  learningSessions,
  membership,
  organization,
  person,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { listEligibleSelfReportPersonIdsV2 } from './solo-progress-reports-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

const WINDOW = {
  start: new Date('2026-06-01T00:00:00.000Z'),
  endExclusive: new Date('2026-06-08T00:00:00.000Z'),
};
const IN_WINDOW = new Date('2026-06-03T12:00:00.000Z');
const OUT_OF_WINDOW = new Date('2026-06-09T12:00:00.000Z');
const ADULT_BIRTH_DATE = '1990-01-01';
// MINIMUM_AGE is 13 (PROFILE_MINIMUM_AGE) and listEligibleSelfReportPersonIdsV2
// computes age as currentYear - birthYear — a birth year 10 years ago is
// reliably under the floor regardless of the current date.
const UNDER_MINIMUM_AGE_BIRTH_DATE = `${new Date().getUTCFullYear() - 10}-01-01`;

(RUN ? describe : describe.skip)(
  'listEligibleSelfReportPersonIdsV2 (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];
    const accountIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // accounts → profiles (cascade) → learning_sessions + subjects (cascade).
      for (const aid of accountIds) {
        await db.delete(accounts).where(eq(accounts.id, aid));
      }
      accountIds.length = 0;
      for (const pid of personIds) {
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      personIds.length = 0;
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      orgIds.length = 0;
    });

    async function seedOrg(): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'WI-905a Org' })
        .returning();
      orgIds.push(org!.id);
      return org!.id;
    }

    async function seedPerson(
      orgId: string,
      opts: {
        roles: string[];
        birthDate?: string;
        archived?: boolean;
      },
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: 'TestPerson',
          birthDate: opts.birthDate ?? ADULT_BIRTH_DATE,
          residenceJurisdiction: 'EU',
          archivedAt: opts.archived ? new Date() : null,
        })
        .returning();
      personIds.push(p!.id);
      await db
        .insert(membership)
        .values({ personId: p!.id, organizationId: orgId, roles: opts.roles });
      return p!.id;
    }

    /** Legacy profile twin so learning_sessions/subjects FKs resolve. */
    async function seedLegacyProfileTwin(personId: string): Promise<void> {
      const accountId = generateUUIDv7();
      await db.insert(accounts).values({
        id: accountId,
        clerkUserId: `wi905a-acct-${accountId}`,
        email: `wi905a-acct-${accountId}@integration.test`,
      });
      await db.insert(profiles).values({
        id: personId,
        accountId,
        displayName: 'WI905a-Twin',
        birthYear: 1990,
        isOwner: false,
      });
      accountIds.push(accountId);
    }

    /** Seed one qualifying (or deliberately disqualifying) session for a person. */
    async function seedSession(
      personId: string,
      opts: {
        status?: 'active' | 'paused' | 'completed' | 'auto_closed';
        exchangeCount?: number;
        startedAt?: Date;
      } = {},
    ): Promise<void> {
      await seedLegacyProfileTwin(personId);
      const [subject] = await db
        .insert(subjects)
        .values({ profileId: personId, name: 'WI905a-Subject' })
        .returning();
      await db.insert(learningSessions).values({
        profileId: personId,
        subjectId: subject!.id,
        status: opts.status ?? 'completed',
        exchangeCount: opts.exchangeCount ?? 1,
        startedAt: opts.startedAt ?? IN_WINDOW,
      });
    }

    // -------------------------------------------------------------------------
    // Happy path — proves the full real SQL chain (activity scan + owner join)
    // resolves an eligible self-managed owner.
    // -------------------------------------------------------------------------
    it('includes an admin owner with a qualifying session, no guardian edge, no consent row', async () => {
      const org = await seedOrg();
      const owner = await seedPerson(org, { roles: ['admin'] });
      await seedSession(owner);

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).toContain(owner);
    });

    // -------------------------------------------------------------------------
    // The owner-candidates join: roles @> ARRAY['admin']::text[].
    // -------------------------------------------------------------------------
    it('excludes a member with a qualifying session but no admin role', async () => {
      const org = await seedOrg();
      const learner = await seedPerson(org, { roles: ['learner'] });
      await seedSession(learner);

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(learner);
    });

    // -------------------------------------------------------------------------
    // The owner-candidates join: age filter (MINIMUM_AGE).
    // -------------------------------------------------------------------------
    it('excludes an admin owner younger than MINIMUM_AGE', async () => {
      const org = await seedOrg();
      const minor = await seedPerson(org, {
        roles: ['admin'],
        birthDate: UNDER_MINIMUM_AGE_BIRTH_DATE,
      });
      await seedSession(minor);

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(minor);
    });

    // -------------------------------------------------------------------------
    // The owner-candidates join: isNull(person.archivedAt).
    // -------------------------------------------------------------------------
    it('excludes an archived admin owner', async () => {
      const org = await seedOrg();
      const archived = await seedPerson(org, {
        roles: ['admin'],
        archived: true,
      });
      await seedSession(archived);

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(archived);
    });

    // -------------------------------------------------------------------------
    // The activity scan: status not in ['completed','auto_closed'], zero
    // exchangeCount, and outside the window each independently disqualify.
    // -------------------------------------------------------------------------
    it('activity scan excludes wrong status, zero exchangeCount, and out-of-window sessions', async () => {
      const org = await seedOrg();
      const activeStatus = await seedPerson(org, { roles: ['admin'] });
      await seedSession(activeStatus, { status: 'active' });

      const zeroExchanges = await seedPerson(org, { roles: ['admin'] });
      await seedSession(zeroExchanges, { exchangeCount: 0 });

      const outOfWindow = await seedPerson(org, { roles: ['admin'] });
      await seedSession(outOfWindow, { startedAt: OUT_OF_WINDOW });

      const qualifies = await seedPerson(org, { roles: ['admin'] });
      await seedSession(qualifies);

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(activeStatus);
      expect(result).not.toContain(zeroExchanges);
      expect(result).not.toContain(outOfWindow);
      expect(result).toContain(qualifies);
    });

    // -------------------------------------------------------------------------
    // Linked-child exclusion — real getGuardianPersonIds call, real
    // guardianship edge.
    // -------------------------------------------------------------------------
    it('excludes an owner who is the charge of an active guardianship edge (linked child)', async () => {
      const org = await seedOrg();
      const guardian = await seedPerson(org, { roles: ['admin'] });
      const charge = await seedPerson(org, { roles: ['admin'] });
      await seedSession(charge);
      await db
        .insert(guardianship)
        .values({ guardianPersonId: guardian, chargePersonId: charge });

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(charge);
    });

    // -------------------------------------------------------------------------
    // GDPR consent gate — real resolveConsentStatus call. WITHDRAWN excludes,
    // CONSENTED includes.
    // -------------------------------------------------------------------------
    it('excludes an owner with WITHDRAWN GDPR consent; includes CONSENTED', async () => {
      const org = await seedOrg();
      const withdrawn = await seedPerson(org, { roles: ['admin'] });
      await seedSession(withdrawn);
      await db.insert(consentGrant).values({
        chargePersonId: withdrawn,
        organizationId: org,
        purpose: 'platform_use',
        lawfulBasis: 'gdpr_parental_consent',
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });

      const consented = await seedPerson(org, { roles: ['admin'] });
      await seedSession(consented);
      await db.insert(consentGrant).values({
        chargePersonId: consented,
        organizationId: org,
        purpose: 'platform_use',
        lawfulBasis: 'gdpr_parental_consent',
        granted: true,
        grantedAt: new Date(),
      });

      const result = await listEligibleSelfReportPersonIdsV2(db, WINDOW);

      expect(result).not.toContain(withdrawn);
      expect(result).toContain(consented);
    });
  },
);
