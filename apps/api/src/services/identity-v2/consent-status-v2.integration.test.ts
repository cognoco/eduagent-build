// ---------------------------------------------------------------------------
// CUT-B1 consent-status read module — integration tests of the §2.3a reducer
// against the real consent_grant / consent_request tables. Covers every legacy
// mapping (guardrail 2): CONSENTED / WITHDRAWN / PENDING / REQUESTED, the
// legacy-parity denied→WITHDRAWN and expired→PARENTAL_CONSENT_REQUESTED, the
// direct-grant-with-no-request path, the basis-explicit vs AnyBasis variants
// (newer-COPPA-does-not-mask-GDPR under the explicit resolver), and the
// superseded-not-withdrawn current-row windowing.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentRequest,
  createDatabase,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  resolveConsentStatus,
  resolveLatestConsentStatusAnyBasis,
} from './consent-status-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const PURPOSE = 'platform_use';
const GDPR = 'gdpr_parental_consent';
const COPPA = 'coppa_parental_consent';

(RUN ? describe : describe.skip)(
  'consent-status-v2 reducer (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const pid of personIds) {
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db
          .delete(consentRequest)
          .where(eq(consentRequest.chargePersonId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    async function seedPersonOrg(): Promise<{
      personId: string;
      orgId: string;
    }> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'Org' })
        .returning();
      const [p] = await db
        .insert(person)
        .values({
          displayName: 'Child',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      orgIds.push(org!.id);
      return { personId: p!.id, orgId: org!.id };
    }

    it('null when there are no consent rows', async () => {
      const { personId, orgId } = await seedPersonOrg();
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBeNull();
      expect(
        await resolveLatestConsentStatusAnyBasis(db, personId, orgId, PURPOSE),
      ).toBeNull();
    });

    it('PENDING / PARENTAL_CONSENT_REQUESTED map from request status', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentRequest).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'pending',
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PENDING');

      await db
        .update(consentRequest)
        .set({ status: 'requested', requestedAt: new Date() })
        .where(eq(consentRequest.chargePersonId, personId));
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PARENTAL_CONSENT_REQUESTED');
    });

    it('legacy parity: denied→WITHDRAWN, expired→PARENTAL_CONSENT_REQUESTED', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentRequest).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'denied',
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');

      await db
        .update(consentRequest)
        .set({ status: 'expired' })
        .where(eq(consentRequest.chargePersonId, personId));
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PARENTAL_CONSENT_REQUESTED');
    });

    it('CONSENTED for a current grant; direct grant with no request row reduces too', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('CONSENTED');
    });

    it('WITHDRAWN when the current grant has withdrawn_at stamped', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');
    });

    it('current-row windowing: grant₁ → age-transition grant₂ → withdraw grant₂ → WITHDRAWN (grant₁ is superseded, not re-allowing)', async () => {
      const { personId, orgId } = await seedPersonOrg();
      const t1 = new Date(Date.now() - 60_000);
      const t2 = new Date();
      // grant₁ (older, still granted+un-withdrawn — superseded, not withdrawn)
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: t1,
      });
      // grant₂ (current) then withdrawn
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: t2,
        withdrawnAt: new Date(),
      });
      // The current (max granted_at) row is withdrawn → WITHDRAWN, even though
      // grant₁ is still granted+un-withdrawn.
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');
    });

    it('basis-explicit GDPR is NOT masked by a newer COPPA grant (the BUG-466/465 shape)', async () => {
      const { personId, orgId } = await seedPersonOrg();
      // Older GDPR grant (current GDPR state = CONSENTED).
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(Date.now() - 60_000),
      });
      // Newer COPPA grant, withdrawn (current COPPA state = WITHDRAWN).
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: COPPA,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });
      // The GDPR-pinned resolver reports the GDPR state, unaffected by COPPA.
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('CONSENTED');
      // The AnyBasis read, by contrast, picks the latest-requested basis (the
      // deliberately bug-compatible behavior) — COPPA's newer grant wins here.
      expect(
        await resolveLatestConsentStatusAnyBasis(db, personId, orgId, PURPOSE),
      ).toBe('WITHDRAWN');
    });
  },
);
