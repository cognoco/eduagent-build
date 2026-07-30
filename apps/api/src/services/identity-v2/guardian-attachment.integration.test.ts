import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { and, eq, or } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  countryPolicyRegistry,
  createDatabase,
  guardianship,
  person,
  regimes,
  supportership,
  type Database,
} from '@eduagent/database';
import { cleanupAccounts } from '../../../../../tests/integration/helpers';
import { createIdentityGraph } from './identity-graph';
import {
  attachGuardianConsentForCredentialedLearner,
  GuardianAttachmentRejectedError,
} from './guardian-attachment';
import type { GuardianAuthorityAssertion } from './guardian-attachment-token';
import { resolveConsentSetStatus } from './consent-status-v2';
import { restoreConsentV2 } from './consent-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const RUN_ID = randomUUID();
const POLICY_ID = 'c2533000-0000-4000-8000-000000000001';
const REGIME_ID = 'c2533000-0000-4000-8000-000000000002';
const COUNTRY = 'XG';
const POLICY_VERSION = 'XG-WI-2533-v1';
const AS_OF = new Date('2026-07-30T12:00:00.000Z');
const emails: string[] = [];
const clerkUserIds: string[] = [];

interface Identity {
  personId: string;
  organizationId: string;
}

let db: Database;

async function seedIdentity(label: string, age: number): Promise<Identity> {
  const email = `wi-2533-${RUN_ID}-${label}@test.invalid`;
  const clerkUserId = `wi-2533-${RUN_ID}-${label}`;
  emails.push(email);
  clerkUserIds.push(clerkUserId);
  const graph = await createIdentityGraph(db, {
    clerkUserId,
    verifiedEmail: email,
    displayName: `WI-2533 ${label}`,
    birthYear: AS_OF.getUTCFullYear() - age,
    location: 'EU',
    conversationLanguage: 'en',
  });
  await db
    .update(person)
    .set({
      birthDate: `${AS_OF.getUTCFullYear() - age}-01-01`,
      residenceJurisdiction: COUNTRY,
      residenceKnowing: {
        method: 'verified_credential',
        confidence: 1,
        assertedAt: AS_OF.toISOString(),
        corroboratingMethods: ['billing_address'],
      },
      ageKnowing: {
        method: 'verified_credential',
        confidence: 1,
        lastUpdated: AS_OF.toISOString(),
      },
    })
    .where(eq(person.id, graph.personId));
  return graph;
}

function assertion(
  guardianPersonId: string,
  chargePersonId: string,
  overrides: Partial<GuardianAuthorityAssertion> = {},
): GuardianAuthorityAssertion {
  return {
    guardianPersonId,
    chargePersonId,
    jurisdiction: COUNTRY,
    policyVersion: POLICY_VERSION,
    assuranceMethod: 'verified_parental_responsibility_credential',
    evidenceId: `vpc:${randomUUID()}`,
    qualification: 'biological_parent',
    decision: 'approved',
    learnerAssentAt: null,
    expiresAt: new Date('2026-07-30T12:15:00.000Z'),
    ...overrides,
  };
}

(RUN ? describe : describe.skip)(
  'credentialed learner guardian attachment (integration)',
  () => {
    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      await db.insert(regimes).values({
        id: REGIME_ID,
        code: `WI_2533_${RUN_ID}`,
        description: 'WI-2533 integration fixture',
      });
      await db.insert(countryPolicyRegistry).values({
        id: POLICY_ID,
        countryCode: COUNTRY,
        countryName: 'Guardian attachment test country',
        regimeId: REGIME_ID,
        article8Threshold: 16,
        authorizationForm: 'guardian',
        launchStatus: 'enabled',
        launchBlockReason: null,
        legalVerificationStatus: 'verified',
        legalReviewedAt: new Date('2026-07-01T00:00:00.000Z'),
        legalReviewValidUntil: new Date('2027-07-01T00:00:00.000Z'),
        launchDayReviewRequired: false,
        processingLocationClass: 'eea_only',
        policyVersion: POLICY_VERSION,
        effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
        expiresAt: null,
        sourceProvenance: [
          {
            title: 'WI-2533 integration fixture',
            url: null,
            checkedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        controllerGates: {
          externalPrivacyLegalReview: true,
          aiActClassification: true,
          reliableAgeAndResidence: true,
          childTransparency: true,
          adultCommercialRelationship: true,
          countryAllowlist: true,
          operationalRightsAndIncidents: true,
          launchDayLegalRefresh: true,
        },
      });
    });

    afterAll(async () => {
      await cleanupAccounts({ emails, clerkUserIds });
      await db
        .delete(countryPolicyRegistry)
        .where(eq(countryPolicyRegistry.id, POLICY_ID));
      await db.delete(regimes).where(eq(regimes.id, REGIME_ID));
    });

    it('atomically attaches authority and stamped grants without supporter visibility', async () => {
      const adult = await seedIdentity('adult-success', 40);
      const learner = await seedIdentity('learner-success', 14);

      await expect(
        resolveConsentSetStatus(
          db,
          learner.personId,
          learner.organizationId,
          'gdpr_parental_consent',
        ),
      ).resolves.toBe('PENDING');
      const learnerBefore = await db.query.person.findFirst({
        where: eq(person.id, learner.personId),
        columns: { id: true, loginId: true },
      });

      const result = await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority: assertion(adult.personId, learner.personId),
        asOf: AS_OF,
      });

      expect(result).toEqual({
        status: 'attached',
        consentSatisfied: true,
      });
      const [edge, grants, supporters] = await Promise.all([
        db.query.guardianship.findFirst({
          where: and(
            eq(guardianship.guardianPersonId, adult.personId),
            eq(guardianship.chargePersonId, learner.personId),
          ),
        }),
        db.query.consentGrant.findMany({
          where: and(
            eq(consentGrant.chargePersonId, learner.personId),
            eq(consentGrant.organizationId, learner.organizationId),
          ),
        }),
        db.query.supportership.findMany({
          where: or(
            eq(supportership.supporterPersonId, adult.personId),
            eq(supportership.supporteePersonId, learner.personId),
          ),
        }),
      ]);
      expect(edge?.qualification).toBe('biological_parent');
      expect(grants).toHaveLength(2);
      expect(
        grants.map((grant) => ({
          jurisdiction: grant.snapshotJurisdictionAtGrant,
          method: grant.assuranceMethod,
          evidence: grant.assuranceToken,
          audit: grant.auditFact,
        })),
      ).toEqual(
        Array(2).fill({
          jurisdiction: COUNTRY,
          method: 'verified_parental_responsibility_credential',
          evidence: expect.stringMatching(/^vpc:/),
          audit: expect.objectContaining({
            source: 'credentialed_learner_guardian_attachment',
            policyVersion: POLICY_VERSION,
            guardianPersonId: adult.personId,
          }),
        }),
      );
      expect(supporters).toEqual([]);
      await expect(
        db.query.person.findFirst({
          where: eq(person.id, learner.personId),
          columns: { id: true, loginId: true },
        }),
      ).resolves.toEqual(learnerBefore);
      await expect(
        resolveConsentSetStatus(
          db,
          learner.personId,
          learner.organizationId,
          'gdpr_parental_consent',
        ),
      ).resolves.toBe('CONSENTED');
    });

    it('confirms an identical retry without duplicating edge or grants', async () => {
      const adult = await seedIdentity('adult-retry', 40);
      const learner = await seedIdentity('learner-retry', 14);
      const authority = assertion(adult.personId, learner.personId);
      await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority,
        asOf: AS_OF,
      });

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).resolves.toEqual({
        status: 'already_satisfied',
        consentSatisfied: true,
      });

      await expect(
        db.query.guardianship.findMany({
          where: eq(guardianship.chargePersonId, learner.personId),
        }),
      ).resolves.toHaveLength(1);
      await expect(
        db.query.consentGrant.findMany({
          where: and(
            eq(consentGrant.chargePersonId, learner.personId),
            eq(consentGrant.organizationId, learner.organizationId),
          ),
        }),
      ).resolves.toHaveLength(2);
    });

    it('fails closed for the wrong adult, residence change, and a withdrawn grant', async () => {
      const adult = await seedIdentity('adult-fail-closed', 40);
      const wrongAdult = await seedIdentity('wrong-adult', 41);
      const learner = await seedIdentity('learner-fail-closed', 14);
      const authority = assertion(adult.personId, learner.personId);

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: wrongAdult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

      await db
        .update(person)
        .set({ residenceJurisdiction: 'NO' })
        .where(eq(person.id, learner.personId));
      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

      await db
        .update(person)
        .set({ residenceJurisdiction: COUNTRY })
        .where(eq(person.id, learner.personId));
      await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority,
        asOf: AS_OF,
      });
      await db
        .update(consentGrant)
        .set({ withdrawnAt: AS_OF })
        .where(eq(consentGrant.chargePersonId, learner.personId));

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

      await restoreConsentV2(
        db,
        learner.personId,
        adult.personId,
        learner.organizationId,
        'GDPR',
      );
      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
    });

    it('rolls back the guardianship if grant creation fails', async () => {
      const adult = await seedIdentity('adult-rollback', 40);
      const learner = await seedIdentity('learner-rollback', 14);

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority: assertion(adult.personId, learner.personId),
          asOf: AS_OF,
          afterGuardianWrite: () => {
            throw new Error('simulated grant failure');
          },
        }),
      ).rejects.toThrow('simulated grant failure');

      await expect(
        db.query.guardianship.findMany({
          where: eq(guardianship.chargePersonId, learner.personId),
        }),
      ).resolves.toEqual([]);
      await expect(
        db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, learner.personId),
        }),
      ).resolves.toEqual([]);
    });

    it('rejects a minor caller and a different existing valid guardian', async () => {
      const minor = await seedIdentity('minor-caller', 16);
      const adult = await seedIdentity('adult-existing', 40);
      const differentAdult = await seedIdentity('different-adult-existing', 42);
      const learner = await seedIdentity('learner-existing', 14);
      await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority: assertion(adult.personId, learner.personId),
        asOf: AS_OF,
      });

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: minor.personId,
          chargePersonId: learner.personId,
          authority: assertion(minor.personId, learner.personId),
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: differentAdult.personId,
          chargePersonId: learner.personId,
          authority: assertion(differentAdult.personId, learner.personId),
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
    });
  },
);
