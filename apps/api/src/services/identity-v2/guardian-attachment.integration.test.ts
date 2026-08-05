import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { and, eq, or, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentReceipt,
  consentRequest,
  countryPolicyRegistry,
  createDatabase,
  guardianAuthorityRedemptions,
  guardianship,
  membership,
  person,
  regimes,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  buildIntegrationEnv,
  cleanupAccounts,
} from '../../../../../tests/integration/helpers';
import {
  addFetchHandler,
  installFetchInterceptor,
  restoreFetch,
} from '../../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../../tests/integration/external-mocks';
import { buildAuthHeaders } from '../../../../../tests/integration/route-fixtures';
import { app } from '../../index';
import { createIdentityGraph } from './identity-graph';
import {
  attachGuardianConsentForCredentialedLearner,
  GuardianAttachmentRejectedError,
} from './guardian-attachment';
import {
  signGuardianAuthorityToken,
  type GuardianAuthorityAssertion,
} from './guardian-attachment-token';
import { resolveConsentSetStatus } from './consent-status-v2';
import { processConsentResponseV2, restoreConsentV2 } from './consent-v2';
import { consentPersonLockKey } from './deletion-v2';
import { initiateGuardianAuthorityVerification } from './guardian-attachment-verifier';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const RUN_ID = randomUUID();
const POLICY_ID = 'c2533000-0000-4000-8000-000000000001';
const UNMAPPED_REGIME_ID = 'c2533000-0000-4000-8000-000000000002';
const US_COPPA_REGIME_ID = 'a1000000-0000-4000-8000-000000000001';
const EU_GDPR_13_REGIME_ID = 'a1000000-0000-4000-8000-000000000013';
const EU_GDPR_14_REGIME_ID = 'a1000000-0000-4000-8000-000000000014';
const EU_GDPR_15_REGIME_ID = 'a1000000-0000-4000-8000-000000000015';
const EU_GDPR_16_REGIME_ID = 'a1000000-0000-4000-8000-000000000016';
const UK_AADC_REGIME_ID = 'a1000000-0000-4000-8000-000000000098';
const ROW_REGIME_ID = 'a1000000-0000-4000-8000-000000000099';
const COUNTRY = 'XG';
const POLICY_VERSION = 'XG-WI-2533-v1';
const AS_OF = new Date('2026-07-30T12:00:00.000Z');
const ROUTE_AS_OF = new Date();
const TOKEN_SECRET = 'guardian-authority-test-secret-at-least-32-chars';
const VERIFIER_URL = 'https://guardian-verifier.test/v1/verify';
const VERIFIER_KEY = 'guardian-verifier-test-key';
const emails: string[] = [];
const clerkUserIds: string[] = [];

interface Identity {
  personId: string;
  organizationId: string;
  email: string;
  clerkUserId: string;
}

let db: Database;
let verifierRequest: {
  authorization: string | null;
  body: Record<string, unknown>;
} | null = null;
let verifierRequestCount = 0;
const nativeFetch = globalThis.fetch;
if (RUN) {
  installFetchInterceptor();
  mockClerkJWKS();
  addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));
}

async function seedIdentity(
  label: string,
  age: number,
  referenceDate = AS_OF,
): Promise<Identity> {
  const email = `wi-2533-${RUN_ID}-${label}@test.invalid`;
  const clerkUserId = `wi-2533-${RUN_ID}-${label}`;
  emails.push(email);
  clerkUserIds.push(clerkUserId);
  const graph = await createIdentityGraph(db, {
    clerkUserId,
    verifiedEmail: email,
    displayName: `WI-2533 ${label}`,
    birthYear: referenceDate.getUTCFullYear() - age,
    location: 'EU',
    conversationLanguage: 'en',
  });
  await db
    .update(person)
    .set({
      birthDate: `${referenceDate.getUTCFullYear() - age}-01-01`,
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
  return { ...graph, email, clerkUserId };
}

function assertion(
  guardianPersonId: string,
  chargePersonId: string,
  organizationId: string,
  overrides: Partial<GuardianAuthorityAssertion> = {},
): GuardianAuthorityAssertion {
  return {
    redemptionId: randomUUID(),
    guardianPersonId,
    chargePersonId,
    organizationId,
    jurisdiction: COUNTRY,
    policyVersion: POLICY_VERSION,
    assuranceMethod: 'verified_parental_responsibility_credential',
    evidenceId: `vpc:${randomUUID()}`,
    qualification: 'biological_parent',
    decision: 'approved',
    learnerAssentAt: null,
    issuedAt: AS_OF,
    notBefore: AS_OF,
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
        id: UNMAPPED_REGIME_ID,
        code: `WI_2533_${RUN_ID}`,
        description: 'WI-2533 integration fixture',
      });
      await db.insert(countryPolicyRegistry).values({
        id: POLICY_ID,
        countryCode: COUNTRY,
        countryName: 'Guardian attachment test country',
        regimeId: EU_GDPR_16_REGIME_ID,
        article8Threshold: 16,
        authorizationForm: 'guardian',
        launchStatus: 'enabled',
        launchBlockReason: null,
        legalVerificationStatus: 'verified',
        legalReviewedAt: new Date('2000-01-01T00:00:00.000Z'),
        legalReviewValidUntil: new Date('2099-01-01T00:00:00.000Z'),
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
      addFetchHandler(VERIFIER_URL, async (_url, init) => {
        verifierRequestCount += 1;
        const body = JSON.parse(String(init?.body)) as {
          verificationHandle: string;
          expected: {
            guardianPersonId: string;
            chargePersonId: string;
            organizationId: string;
            jurisdiction: string;
            policyVersion: string;
          };
        };
        verifierRequest = {
          authorization: new Headers(init?.headers).get('Authorization'),
          body: body as unknown as Record<string, unknown>,
        };
        return new Response(
          JSON.stringify({
            decision: body.verificationHandle.startsWith('denied-')
              ? 'denied'
              : 'approved',
            guardianPersonId: body.expected.guardianPersonId,
            chargePersonId: body.expected.chargePersonId,
            organizationId: body.expected.organizationId,
            jurisdiction: body.expected.jurisdiction,
            policyVersion: body.expected.policyVersion,
            assuranceLevel: 'VPC_VERIFIED',
            assuranceMethod: 'verified_parental_responsibility_credential',
            evidenceId: `vpc:${randomUUID()}`,
            qualification: 'biological_parent',
            learnerAssentAt: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });
    });

    afterAll(async () => {
      await cleanupAccounts({ emails, clerkUserIds });
      await db
        .delete(countryPolicyRegistry)
        .where(eq(countryPolicyRegistry.id, POLICY_ID));
      await db.delete(regimes).where(eq(regimes.id, UNMAPPED_REGIME_ID));
      restoreFetch();
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
      const staleEmailToken = randomUUID();
      await db
        .update(consentRequest)
        .set({
          status: 'requested',
          token: staleEmailToken,
          tokenExpiresAt: new Date('2026-07-31T12:00:00.000Z'),
        })
        .where(eq(consentRequest.chargePersonId, learner.personId));

      const result = await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority: assertion(
          adult.personId,
          learner.personId,
          learner.organizationId,
        ),
        asOf: AS_OF,
      });

      expect(result).toEqual({
        status: 'attached',
        consentSatisfied: true,
      });
      const [edge, grants, requests, supporters] = await Promise.all([
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
        db.query.consentRequest.findMany({
          where: eq(consentRequest.chargePersonId, learner.personId),
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
          lawfulBasis: grant.lawfulBasis,
          jurisdiction: grant.snapshotJurisdictionAtGrant,
          method: grant.assuranceMethod,
          evidence: grant.assuranceToken,
          audit: grant.auditFact,
        })),
      ).toEqual(
        Array(2).fill({
          lawfulBasis: 'gdpr_parental_consent',
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
      expect(requests).toHaveLength(2);
      expect(
        requests.map((request) => ({
          status: request.status,
          guardianPersonId: request.guardianPersonId,
          token: request.token,
          tokenExpiresAt: request.tokenExpiresAt,
          grantId: request.consentGrantId,
        })),
      ).toEqual(
        Array(2).fill({
          status: 'approved',
          guardianPersonId: adult.personId,
          token: null,
          tokenExpiresAt: null,
          grantId: expect.any(String),
        }),
      );
      expect(
        new Set(requests.map((request) => request.consentGrantId)),
      ).toEqual(new Set(grants.map((grant) => grant.id)));
      await expect(
        processConsentResponseV2(db, staleEmailToken, true),
      ).rejects.toThrow('Invalid consent token');
      await expect(
        db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, learner.personId),
        }),
      ).resolves.toEqual(
        expect.arrayContaining(
          grants.map((grant) =>
            expect.objectContaining({
              id: grant.id,
              assuranceToken: expect.stringMatching(/^vpc:/),
              snapshotJurisdictionAtGrant: COUNTRY,
            }),
          ),
        ),
      );
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

    it.each([
      ['EU_GDPR_13', EU_GDPR_13_REGIME_ID],
      ['EU_GDPR_14', EU_GDPR_14_REGIME_ID],
      ['EU_GDPR_15', EU_GDPR_15_REGIME_ID],
      ['UK_AADC', UK_AADC_REGIME_ID],
    ])(
      'persists the GDPR basis for the explicit %s regime',
      async (label, regimeId) => {
        const adult = await seedIdentity(`adult-${label}`, 40);
        const learner = await seedIdentity(`learner-${label}`, 14);
        await db
          .update(countryPolicyRegistry)
          .set({ regimeId })
          .where(eq(countryPolicyRegistry.id, POLICY_ID));

        try {
          await attachGuardianConsentForCredentialedLearner(db, {
            callerPersonId: adult.personId,
            chargePersonId: learner.personId,
            authority: assertion(
              adult.personId,
              learner.personId,
              learner.organizationId,
            ),
            asOf: AS_OF,
          });

          const grants = await db.query.consentGrant.findMany({
            where: eq(consentGrant.chargePersonId, learner.personId),
          });
          expect(grants).toHaveLength(2);
          expect(
            grants.every(
              (grant) => grant.lawfulBasis === 'gdpr_parental_consent',
            ),
          ).toBe(true);
        } finally {
          await db
            .update(countryPolicyRegistry)
            .set({ regimeId: EU_GDPR_16_REGIME_ID })
            .where(eq(countryPolicyRegistry.id, POLICY_ID));
        }
      },
    );

    it('persists the COPPA basis for the explicit US_COPPA regime', async () => {
      const adult = await seedIdentity('adult-US_COPPA', 40);
      const learner = await seedIdentity('learner-US_COPPA', 14);
      // Keep this synthetic country at its guardian-required threshold of 16.
      // The canonical US threshold is 13, but the product does not admit
      // under-13 credentialed learners. This case isolates the transaction's
      // regime-to-basis mapping without pretending to exercise US admission.
      await db
        .update(countryPolicyRegistry)
        .set({ regimeId: US_COPPA_REGIME_ID })
        .where(eq(countryPolicyRegistry.id, POLICY_ID));
      await db
        .update(consentRequest)
        .set({ requestedBasis: 'coppa_parental_consent' })
        .where(eq(consentRequest.chargePersonId, learner.personId));

      try {
        await attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority: assertion(
            adult.personId,
            learner.personId,
            learner.organizationId,
          ),
          asOf: AS_OF,
        });

        const grants = await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, learner.personId),
        });
        expect(grants).toHaveLength(2);
        expect(
          grants.every(
            (grant) => grant.lawfulBasis === 'coppa_parental_consent',
          ),
        ).toBe(true);
      } finally {
        await db
          .update(countryPolicyRegistry)
          .set({
            regimeId: EU_GDPR_16_REGIME_ID,
            article8Threshold: 16,
          })
          .where(eq(countryPolicyRegistry.id, POLICY_ID));
      }
    });

    it('confirms an identical retry without duplicating edge or grants', async () => {
      const adult = await seedIdentity('adult-retry', 40);
      const learner = await seedIdentity('learner-retry', 14);
      const authority = assertion(
        adult.personId,
        learner.personId,
        learner.organizationId,
      );
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
      const authority = assertion(
        adult.personId,
        learner.personId,
        learner.organizationId,
      );

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
          authority: assertion(
            adult.personId,
            learner.personId,
            learner.organizationId,
          ),
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

    it.each([
      ['ROW', ROW_REGIME_ID],
      ['an unknown future regime', UNMAPPED_REGIME_ID],
    ])(
      'rejects %s before guardianship or consent writes survive',
      async (_label, regimeId) => {
        const adult = await seedIdentity(`adult-${regimeId}`, 40);
        const learner = await seedIdentity(`learner-${regimeId}`, 14);
        const requestsBefore = await db.query.consentRequest.findMany({
          where: eq(consentRequest.chargePersonId, learner.personId),
          orderBy: (request, { asc }) => [asc(request.purpose)],
        });

        await db
          .update(countryPolicyRegistry)
          .set({ regimeId })
          .where(eq(countryPolicyRegistry.id, POLICY_ID));

        try {
          await expect(
            attachGuardianConsentForCredentialedLearner(db, {
              callerPersonId: adult.personId,
              chargePersonId: learner.personId,
              authority: assertion(
                adult.personId,
                learner.personId,
                learner.organizationId,
              ),
              asOf: AS_OF,
            }),
          ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

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
          await expect(
            db.query.consentRequest.findMany({
              where: eq(consentRequest.chargePersonId, learner.personId),
              orderBy: (request, { asc }) => [asc(request.purpose)],
            }),
          ).resolves.toEqual(requestsBefore);
        } finally {
          await db
            .update(countryPolicyRegistry)
            .set({ regimeId: EU_GDPR_16_REGIME_ID })
            .where(eq(countryPolicyRegistry.id, POLICY_ID));
        }
      },
    );

    it('rejects a minor caller and a different existing valid guardian', async () => {
      const minor = await seedIdentity('minor-caller', 16);
      const adult = await seedIdentity('adult-existing', 40);
      const differentAdult = await seedIdentity('different-adult-existing', 42);
      const learner = await seedIdentity('learner-existing', 14);
      await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority: assertion(
          adult.personId,
          learner.personId,
          learner.organizationId,
        ),
        asOf: AS_OF,
      });

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: minor.personId,
          chargePersonId: learner.personId,
          authority: assertion(
            minor.personId,
            learner.personId,
            learner.organizationId,
          ),
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: differentAdult.personId,
          chargePersonId: learner.personId,
          authority: assertion(
            differentAdult.personId,
            learner.personId,
            learner.organizationId,
          ),
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
    });

    it('rejects an assertion after the learner moves organizations', async () => {
      const adult = await seedIdentity('adult-org-move', 40);
      const learner = await seedIdentity('learner-org-move', 14);
      const destination = await seedIdentity('destination-org', 40);
      const authority = assertion(
        adult.personId,
        learner.personId,
        learner.organizationId,
      );

      await db
        .update(membership)
        .set({ organizationId: destination.organizationId })
        .where(eq(membership.personId, learner.personId));

      await expect(
        attachGuardianConsentForCredentialedLearner(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority,
          asOf: AS_OF,
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
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

    it('requires present, non-future learner assent for joint-child-guardian policy', async () => {
      const adult = await seedIdentity('adult-joint-assent', 40);
      const learner = await seedIdentity('learner-joint-assent', 14);
      await db
        .update(countryPolicyRegistry)
        .set({ authorizationForm: 'joint_child_guardian' })
        .where(eq(countryPolicyRegistry.id, POLICY_ID));

      const verifierResponse =
        (learnerAssentAt: string | null) =>
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            expected: {
              guardianPersonId: string;
              chargePersonId: string;
              organizationId: string;
              jurisdiction: string;
              policyVersion: string;
            };
          };
          return new Response(
            JSON.stringify({
              decision: 'approved',
              guardianPersonId: body.expected.guardianPersonId,
              chargePersonId: body.expected.chargePersonId,
              organizationId: body.expected.organizationId,
              jurisdiction: body.expected.jurisdiction,
              policyVersion: body.expected.policyVersion,
              assuranceLevel: 'VPC_VERIFIED',
              assuranceMethod: 'verified_parental_responsibility_credential',
              evidenceId: `vpc:${randomUUID()}`,
              qualification: 'biological_parent',
              learnerAssentAt,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        };

      try {
        await expect(
          initiateGuardianAuthorityVerification(db, {
            callerPersonId: adult.personId,
            chargePersonId: learner.personId,
            verificationHandle: `joint-null-${randomUUID()}`,
            verifierUrl: VERIFIER_URL,
            verifierKey: VERIFIER_KEY,
            tokenSecret: TOKEN_SECRET,
            now: AS_OF,
            fetchImpl: verifierResponse(null),
          }),
        ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
        await expect(
          initiateGuardianAuthorityVerification(db, {
            callerPersonId: adult.personId,
            chargePersonId: learner.personId,
            verificationHandle: `joint-future-${randomUUID()}`,
            verifierUrl: VERIFIER_URL,
            verifierKey: VERIFIER_KEY,
            tokenSecret: TOKEN_SECRET,
            now: AS_OF,
            fetchImpl: verifierResponse(
              new Date(AS_OF.getTime() + 60_000).toISOString(),
            ),
          }),
        ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
        await expect(
          attachGuardianConsentForCredentialedLearner(db, {
            callerPersonId: adult.personId,
            chargePersonId: learner.personId,
            authority: assertion(
              adult.personId,
              learner.personId,
              learner.organizationId,
              { learnerAssentAt: null },
            ),
            asOf: AS_OF,
          }),
        ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
        await expect(
          attachGuardianConsentForCredentialedLearner(db, {
            callerPersonId: adult.personId,
            chargePersonId: learner.personId,
            authority: assertion(
              adult.personId,
              learner.personId,
              learner.organizationId,
              { learnerAssentAt: new Date(AS_OF.getTime() + 60_000) },
            ),
            asOf: AS_OF,
          }),
        ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
      } finally {
        await db
          .update(countryPolicyRegistry)
          .set({ authorizationForm: 'guardian' })
          .where(eq(countryPolicyRegistry.id, POLICY_ID));
      }
    });

    it('serializes on the canonical consent lock across two database connections', async () => {
      const adult = await seedIdentity('adult-concurrency', 40);
      const learner = await seedIdentity('learner-concurrency', 14);
      const secondConnection = createDatabase(process.env.DATABASE_URL!);
      let releaseBlocker!: () => void;
      let signalReady!: () => void;
      const blockerReady = new Promise<void>((resolveReady) => {
        signalReady = resolveReady;
      });
      const release = new Promise<void>((resolveRelease) => {
        releaseBlocker = resolveRelease;
      });

      const blocker = db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(
            learner.personId,
          )}, 0))`,
        );
        signalReady();
        await release;
      });
      await blockerReady;

      let settled = false;
      const attachment = attachGuardianConsentForCredentialedLearner(
        secondConnection,
        {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          authority: assertion(
            adult.personId,
            learner.personId,
            learner.organizationId,
          ),
          asOf: AS_OF,
        },
      ).finally(() => {
        settled = true;
      });

      let waiterObserved = false;
      for (let attempt = 0; attempt < 20 && !waiterObserved; attempt += 1) {
        const lockResult = await db.execute(sql`
          WITH target AS (
            SELECT hashtextextended(${consentPersonLockKey(
              learner.personId,
            )}, 0) AS lock_key
          )
          SELECT EXISTS (
            SELECT 1
            FROM pg_locks, target
            WHERE locktype = 'advisory'
              AND granted = false
              AND classid::bigint = ((lock_key >> 32) & 4294967295)
              AND objid::bigint = (lock_key & 4294967295)
          ) AS waiting
        `);
        const rows =
          (lockResult as unknown as { rows?: Array<{ waiting: boolean }> })
            .rows ?? (lockResult as unknown as Array<{ waiting: boolean }>);
        waiterObserved = rows[0]?.waiting === true;
        if (!waiterObserved) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 25));
        }
      }
      expect(waiterObserved).toBe(true);
      expect(settled).toBe(false);
      releaseBlocker();
      await expect(attachment).resolves.toEqual({
        status: 'attached',
        consentSatisfied: true,
      });
      await blocker;
    });

    it('executes the authenticated verifier-mint-redemption HTTP path and invalidates the email token', async () => {
      const adult = await seedIdentity('adult-route', 40, ROUTE_AS_OF);
      const learner = await seedIdentity('learner-route', 14, ROUTE_AS_OF);
      const staleEmailToken = randomUUID();
      await db
        .update(consentRequest)
        .set({
          status: 'requested',
          token: staleEmailToken,
          tokenExpiresAt: new Date(ROUTE_AS_OF.getTime() + 60 * 60 * 1000),
        })
        .where(eq(consentRequest.chargePersonId, learner.personId));

      verifierRequest = null;

      const env = {
        ...buildIntegrationEnv(),
        DATABASE_URL: process.env.DATABASE_URL!,
        GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
        GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
        GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
      };
      const headers = buildAuthHeaders(
        {
          sub: adult.clerkUserId,
          email: adult.email,
        },
        adult.personId,
      );
      const initiation = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            verificationHandle: `verification-${randomUUID()}`,
          }),
        },
        env,
      );
      expect(initiation.status).toBe(200);
      const initiationBody = (await initiation.json()) as {
        authorityToken: string;
      };
      expect(initiationBody.authorityToken).toEqual(expect.any(String));
      expect(verifierRequest).toEqual({
        authorization: `Bearer ${VERIFIER_KEY}`,
        body: expect.objectContaining({
          expected: expect.objectContaining({
            guardianPersonId: adult.personId,
            chargePersonId: learner.personId,
            organizationId: learner.organizationId,
            jurisdiction: COUNTRY,
            policyVersion: POLICY_VERSION,
            requiredAssuranceLevel: 'VPC_VERIFIED',
          }),
        }),
      });

      const redemption = await app.request(
        '/v1/consent/guardian-attachment',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            authorityToken: initiationBody.authorityToken,
          }),
        },
        env,
      );
      expect(redemption.status).toBe(200);
      await expect(redemption.json()).resolves.toEqual({
        status: 'attached',
        consentSatisfied: true,
      });
      const routeRequests = await db.query.consentRequest.findMany({
        where: eq(consentRequest.chargePersonId, learner.personId),
      });
      const routeGrantsBeforeStaleApproval =
        await db.query.consentGrant.findMany({
          where: eq(consentGrant.chargePersonId, learner.personId),
        });
      expect(routeRequests).toHaveLength(2);
      expect(
        routeRequests.every(
          (request) =>
            request.status === 'approved' &&
            request.guardianPersonId === adult.personId &&
            request.token === null &&
            request.tokenExpiresAt === null &&
            routeGrantsBeforeStaleApproval.some(
              (grant) => grant.id === request.consentGrantId,
            ),
        ),
      ).toBe(true);

      const staleApproval = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: staleEmailToken, approved: true }),
        },
        env,
      );
      expect(staleApproval.status).toBe(404);
      const routeGrants = await db.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, learner.personId),
      });
      expect(routeGrants).toHaveLength(2);
      expect(
        routeGrants.every(
          (grant) =>
            grant.assuranceMethod ===
              'verified_parental_responsibility_credential' &&
            grant.assuranceToken?.startsWith('vpc:'),
        ),
      ).toBe(true);
    });

    it('[WI-2534] recovers pre-assent-binding authority after response loss without redeeming the handle twice', async () => {
      const adult = await seedIdentity('adult-response-loss', 40, ROUTE_AS_OF);
      const learner = await seedIdentity(
        'learner-response-loss',
        14,
        ROUTE_AS_OF,
      );
      const verificationHandle = `verification-${randomUUID()}`;
      const env = {
        ...buildIntegrationEnv(),
        DATABASE_URL: process.env.DATABASE_URL!,
        GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
        GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
        GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
      };
      const request = {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: adult.clerkUserId, email: adult.email },
          adult.personId,
        ),
        body: JSON.stringify({
          chargePersonId: learner.personId,
          verificationHandle,
        }),
      };
      const callsBefore = verifierRequestCount;

      const first = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        request,
        env,
      );
      expect(first.status).toBe(200);
      const [reservation] = await db
        .select()
        .from(guardianAuthorityRedemptions)
        .where(
          and(
            eq(guardianAuthorityRedemptions.guardianPersonId, adult.personId),
            eq(guardianAuthorityRedemptions.chargePersonId, learner.personId),
          ),
        );
      if (!reservation) throw new Error('authority reservation was not issued');
      const bindingBase = {
        guardianPersonId: reservation.guardianPersonId,
        chargePersonId: reservation.chargePersonId,
        organizationId: reservation.organizationId,
        jurisdiction: reservation.jurisdiction,
        policyVersion: reservation.policyVersion,
        authorizationForm: reservation.authorizationForm,
      };
      const requiredAssuranceLevel = ['SELF_DECLARED', 'VERIFIED'].find(
        (candidate) =>
          createHmac('sha256', TOKEN_SECRET)
            .update(
              JSON.stringify({
                ...bindingBase,
                requiredAssuranceLevel: candidate,
                purposeSetDigest: reservation.purposeSetDigest,
                learnerAssentAt: null,
              }),
              'utf8',
            )
            .digest('hex') === reservation.commandBindingDigest,
      );
      if (!requiredAssuranceLevel) {
        throw new Error('current authority command binding was not recognized');
      }
      const legacyCommandBindingDigest = createHmac('sha256', TOKEN_SECRET)
        .update(
          JSON.stringify({
            ...bindingBase,
            requiredAssuranceLevel,
            purposeSetDigest: reservation.purposeSetDigest,
          }),
          'utf8',
        )
        .digest('hex');
      await db
        .update(guardianAuthorityRedemptions)
        .set({ commandBindingDigest: legacyCommandBindingDigest })
        .where(eq(guardianAuthorityRedemptions.id, reservation.id));
      const second = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        request,
        env,
      );

      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toEqual(await first.json());
      expect(verifierRequestCount - callsBefore).toBe(1);
    });

    it('[WI-2986] releases a transient verifier reservation so the same ceremony can retry', async () => {
      const adult = await seedIdentity('adult-verifier-retry', 40);
      const learner = await seedIdentity('learner-verifier-retry', 14);
      const verificationHandle = `verification-${randomUUID()}`;
      let attempts = 0;
      const fetchImpl: typeof fetch = async (_input, init) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('simulated verifier transport failure');
        }
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        const body = JSON.parse(String(init?.body)) as {
          expected: {
            guardianPersonId: string;
            chargePersonId: string;
            organizationId: string;
            jurisdiction: string;
            policyVersion: string;
          };
        };
        return new Response(
          JSON.stringify({
            decision: 'approved',
            guardianPersonId: body.expected.guardianPersonId,
            chargePersonId: body.expected.chargePersonId,
            organizationId: body.expected.organizationId,
            jurisdiction: body.expected.jurisdiction,
            policyVersion: body.expected.policyVersion,
            assuranceLevel: 'VPC_VERIFIED',
            assuranceMethod: 'verified_parental_responsibility_credential',
            evidenceId: `vpc:${randomUUID()}`,
            qualification: 'biological_parent',
            learnerAssentAt: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };
      const input = {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        verificationHandle,
        verifierUrl: VERIFIER_URL,
        verifierKey: VERIFIER_KEY,
        tokenSecret: TOKEN_SECRET,
        now: AS_OF,
        fetchImpl,
      };

      await expect(
        initiateGuardianAuthorityVerification(db, input),
      ).rejects.toThrow();
      await expect(
        initiateGuardianAuthorityVerification(db, input),
      ).resolves.toEqual({ authorityToken: expect.any(String) });
      expect(attempts).toBe(2);
    });

    it('[WI-2986] rejects a verifier handle replayed against a different learner tuple', async () => {
      const adult = await seedIdentity('adult-mutated-replay', 40, ROUTE_AS_OF);
      const firstLearner = await seedIdentity(
        'learner-mutated-replay-a',
        14,
        ROUTE_AS_OF,
      );
      const secondLearner = await seedIdentity(
        'learner-mutated-replay-b',
        14,
        ROUTE_AS_OF,
      );
      const verificationHandle = `verification-${randomUUID()}`;
      const env = {
        ...buildIntegrationEnv(),
        DATABASE_URL: process.env.DATABASE_URL!,
        GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
        GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
        GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
      };
      const headers = buildAuthHeaders(
        { sub: adult.clerkUserId, email: adult.email },
        adult.personId,
      );
      const callsBefore = verifierRequestCount;

      const first = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: firstLearner.personId,
            verificationHandle,
          }),
        },
        env,
      );
      const mutated = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: secondLearner.personId,
            verificationHandle,
          }),
        },
        env,
      );

      expect(first.status).toBe(200);
      expect(mutated.status).toBe(403);
      expect(verifierRequestCount - callsBefore).toBe(1);
    });

    it('[WI-2986] lets only one database connection redeem a concurrent duplicate handle', async () => {
      const adult = await seedIdentity('adult-verifier-contention', 40);
      const learner = await seedIdentity('learner-verifier-contention', 14);
      const secondConnection = createDatabase(process.env.DATABASE_URL!);
      const verificationHandle = `verification-${randomUUID()}`;
      let providerCalls = 0;
      let releaseProvider!: () => void;
      let signalProviderStarted!: () => void;
      const providerStarted = new Promise<void>((resolveStarted) => {
        signalProviderStarted = resolveStarted;
      });
      const providerRelease = new Promise<void>((resolveRelease) => {
        releaseProvider = resolveRelease;
      });
      const fetchImpl: typeof fetch = async (_input, init) => {
        providerCalls += 1;
        const body = JSON.parse(String(init?.body)) as {
          expected: {
            guardianPersonId: string;
            chargePersonId: string;
            organizationId: string;
            jurisdiction: string;
            policyVersion: string;
          };
        };
        signalProviderStarted();
        await providerRelease;
        return new Response(
          JSON.stringify({
            decision: 'approved',
            guardianPersonId: body.expected.guardianPersonId,
            chargePersonId: body.expected.chargePersonId,
            organizationId: body.expected.organizationId,
            jurisdiction: body.expected.jurisdiction,
            policyVersion: body.expected.policyVersion,
            assuranceLevel: 'VPC_VERIFIED',
            assuranceMethod: 'verified_parental_responsibility_credential',
            evidenceId: `vpc:${randomUUID()}`,
            qualification: 'biological_parent',
            learnerAssentAt: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };
      const input = {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        verificationHandle,
        verifierUrl: VERIFIER_URL,
        verifierKey: VERIFIER_KEY,
        tokenSecret: TOKEN_SECRET,
        now: AS_OF,
        fetchImpl,
      };

      const winner = initiateGuardianAuthorityVerification(db, input);
      await providerStarted;
      await expect(
        initiateGuardianAuthorityVerification(secondConnection, input),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
      expect(providerCalls).toBe(1);
      releaseProvider();
      await expect(winner).resolves.toEqual({
        authorityToken: expect.any(String),
      });
    });

    it('[WI-2986] returns no authority when persistence disappears after provider success', async () => {
      const adult = await seedIdentity('adult-persist-failure', 40);
      const learner = await seedIdentity('learner-persist-failure', 14);
      let providerApproved = false;

      await expect(
        initiateGuardianAuthorityVerification(db, {
          callerPersonId: adult.personId,
          chargePersonId: learner.personId,
          verificationHandle: `verification-${randomUUID()}`,
          verifierUrl: VERIFIER_URL,
          verifierKey: VERIFIER_KEY,
          tokenSecret: TOKEN_SECRET,
          now: AS_OF,
          fetchImpl: async (_input, init) => {
            const body = JSON.parse(String(init?.body)) as {
              expected: {
                guardianPersonId: string;
                chargePersonId: string;
                organizationId: string;
                jurisdiction: string;
                policyVersion: string;
              };
            };
            providerApproved = true;
            await db
              .delete(guardianAuthorityRedemptions)
              .where(
                and(
                  eq(
                    guardianAuthorityRedemptions.guardianPersonId,
                    adult.personId,
                  ),
                  eq(
                    guardianAuthorityRedemptions.chargePersonId,
                    learner.personId,
                  ),
                  eq(guardianAuthorityRedemptions.status, 'redeeming'),
                ),
              );
            return new Response(
              JSON.stringify({
                decision: 'approved',
                guardianPersonId: body.expected.guardianPersonId,
                chargePersonId: body.expected.chargePersonId,
                organizationId: body.expected.organizationId,
                jurisdiction: body.expected.jurisdiction,
                policyVersion: body.expected.policyVersion,
                assuranceLevel: 'VPC_VERIFIED',
                assuranceMethod: 'verified_parental_responsibility_credential',
                evidenceId: `vpc:${randomUUID()}`,
                qualification: 'biological_parent',
                learnerAssentAt: null,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        }),
      ).rejects.toBeInstanceOf(GuardianAttachmentRejectedError);
      expect(providerApproved).toBe(true);
      await expect(
        db
          .select()
          .from(guardianAuthorityRedemptions)
          .where(
            and(
              eq(guardianAuthorityRedemptions.guardianPersonId, adult.personId),
              eq(guardianAuthorityRedemptions.chargePersonId, learner.personId),
            ),
          ),
      ).resolves.toEqual([]);
    });

    it('[WI-2986] rejects a correctly signed token without its durable redemption receipt', async () => {
      const adult = await seedIdentity(
        'adult-missing-receipt',
        40,
        ROUTE_AS_OF,
      );
      const learner = await seedIdentity(
        'learner-missing-receipt',
        14,
        ROUTE_AS_OF,
      );
      const issuedAt = ROUTE_AS_OF;
      const token = signGuardianAuthorityToken(
        assertion(adult.personId, learner.personId, learner.organizationId, {
          issuedAt,
          notBefore: issuedAt,
          expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
        }),
        TOKEN_SECRET,
      );

      const response = await app.request(
        '/v1/consent/guardian-attachment',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: adult.clerkUserId, email: adult.email },
            adult.personId,
          ),
          body: JSON.stringify({
            chargePersonId: learner.personId,
            authorityToken: token,
          }),
        },
        {
          ...buildIntegrationEnv(),
          DATABASE_URL: process.env.DATABASE_URL!,
          GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
          GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
          GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
        },
      );

      expect(response.status).toBe(403);
      await expect(
        db.query.guardianship.findMany({
          where: eq(guardianship.chargePersonId, learner.personId),
        }),
      ).resolves.toEqual([]);
    });

    it('requires a fresh organization-specific HTTP ceremony after an org move', async () => {
      const adult = await seedIdentity('adult-route-org-move', 40, ROUTE_AS_OF);
      const learner = await seedIdentity(
        'learner-route-org-move',
        14,
        ROUTE_AS_OF,
      );
      const destination = await seedIdentity(
        'route-destination-org',
        40,
        ROUTE_AS_OF,
      );
      const env = {
        ...buildIntegrationEnv(),
        DATABASE_URL: process.env.DATABASE_URL!,
        GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
        GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
        GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
      };
      const headers = buildAuthHeaders(
        { sub: adult.clerkUserId, email: adult.email },
        adult.personId,
      );
      const initiation = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            verificationHandle: `verification-${randomUUID()}`,
          }),
        },
        env,
      );
      expect(initiation.status).toBe(200);
      const { authorityToken } = (await initiation.json()) as {
        authorityToken: string;
      };

      await db
        .update(membership)
        .set({ organizationId: destination.organizationId })
        .where(eq(membership.personId, learner.personId));

      const redemption = await app.request(
        '/v1/consent/guardian-attachment',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            authorityToken,
          }),
        },
        env,
      );
      expect(redemption.status).toBe(403);
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

    it('fails closed at the authenticated initiation route for a denied VPC result', async () => {
      const adult = await seedIdentity('adult-route-denied', 40, ROUTE_AS_OF);
      const learner = await seedIdentity(
        'learner-route-denied',
        14,
        ROUTE_AS_OF,
      );
      const env = {
        ...buildIntegrationEnv(),
        DATABASE_URL: process.env.DATABASE_URL!,
        GUARDIAN_AUTHORITY_TOKEN_SECRET: TOKEN_SECRET,
        GUARDIAN_AUTHORITY_VERIFIER_URL: VERIFIER_URL,
        GUARDIAN_AUTHORITY_VERIFIER_KEY: VERIFIER_KEY,
      };
      const response = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: adult.clerkUserId, email: adult.email },
            adult.personId,
          ),
          body: JSON.stringify({
            chargePersonId: learner.personId,
            verificationHandle: `denied-${randomUUID()}`,
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
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

    it('reports guardian-authority server configuration gaps as unavailable', async () => {
      const adult = await seedIdentity('adult-route-config', 40, ROUTE_AS_OF);
      const learner = await seedIdentity(
        'learner-route-config',
        14,
        ROUTE_AS_OF,
      );
      const headers = buildAuthHeaders(
        { sub: adult.clerkUserId, email: adult.email },
        adult.personId,
      );

      const initiation = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            verificationHandle: `verification-${randomUUID()}`,
          }),
        },
        {
          ...buildIntegrationEnv(),
          DATABASE_URL: process.env.DATABASE_URL!,
        },
      );
      const attachment = await app.request(
        '/v1/consent/guardian-attachment',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chargePersonId: learner.personId,
            authorityToken: 'not-a-token',
          }),
        },
        {
          ...buildIntegrationEnv(),
          DATABASE_URL: process.env.DATABASE_URL!,
        },
      );

      expect(initiation.status).toBe(503);
      expect(attachment.status).toBe(503);
    });

    // [WI-2929] AC-1 is about the moment consent is TAKEN, not about the files
    // the original change happened to edit. This writer creates a production
    // consent_grant and was missed by the first pass: it wrote neither a
    // grant-time consent_receipt nor the promoted policy_version column, so a
    // guardian revocation would still have destroyed its version (which lived
    // only in the destructible audit_fact JSONB).
    it('[WI-2929] writes a grant-time receipt and the promoted policy_version for the credentialed attachment', async () => {
      const adult = await seedIdentity('adult-wi2929', 40);
      const learner = await seedIdentity('learner-wi2929', 14);

      await attachGuardianConsentForCredentialedLearner(db, {
        callerPersonId: adult.personId,
        chargePersonId: learner.personId,
        authority: assertion(
          adult.personId,
          learner.personId,
          learner.organizationId,
        ),
        asOf: AS_OF,
      });

      const grants = await db.query.consentGrant.findMany({
        where: and(
          eq(consentGrant.chargePersonId, learner.personId),
          eq(consentGrant.organizationId, learner.organizationId),
        ),
      });
      expect(grants).toHaveLength(2);
      // The promoted column, not just the audit_fact copy.
      expect(grants.every((g) => g.policyVersion === POLICY_VERSION)).toBe(
        true,
      );

      // The receipt exists NOW, while the grants are live — no deletion has
      // happened, so nothing has re-homed anything.
      const receipts = await db.query.consentReceipt.findMany({
        where: eq(consentReceipt.personId, learner.personId),
      });
      expect(receipts).toHaveLength(2);
      expect(new Set(receipts.map((r) => r.consentGrantId))).toEqual(
        new Set(grants.map((g) => g.id)),
      );
      expect(receipts.every((r) => r.granted)).toBe(true);
      expect(receipts.every((r) => r.withdrawnAt === null)).toBe(true);
      expect(receipts.every((r) => r.policyVersion === POLICY_VERSION)).toBe(
        true,
      );
      expect(
        receipts.every((r) => r.organizationId === learner.organizationId),
      ).toBe(true);
    });
  },
);
