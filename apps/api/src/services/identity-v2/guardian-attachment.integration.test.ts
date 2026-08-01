import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { and, eq, or, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
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
const REGIME_ID = 'c2533000-0000-4000-8000-000000000002';
const COUNTRY = 'XG';
const POLICY_VERSION = 'XG-WI-2533-v1';
const AS_OF = new Date('2026-07-30T12:00:00.000Z');
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
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

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
      await db.delete(regimes).where(eq(regimes.id, REGIME_ID));
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

      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      expect(settled).toBe(false);
      releaseBlocker();
      await expect(attachment).resolves.toEqual({
        status: 'attached',
        consentSatisfied: true,
      });
      await blocker;
    });

    it('executes the authenticated verifier-mint-redemption HTTP path and invalidates the email token', async () => {
      const adult = await seedIdentity('adult-route', 40);
      const learner = await seedIdentity('learner-route', 14);
      const staleEmailToken = randomUUID();
      await db
        .update(consentRequest)
        .set({
          status: 'requested',
          token: staleEmailToken,
          tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
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

    it('[WI-2986] recovers the original authority after response loss without redeeming the handle twice', async () => {
      const adult = await seedIdentity('adult-response-loss', 40);
      const learner = await seedIdentity('learner-response-loss', 14);
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
      const second = await app.request(
        '/v1/consent/guardian-attachment/initiate',
        request,
        env,
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toEqual(await first.json());
      expect(verifierRequestCount - callsBefore).toBe(1);
    });

    it('[WI-2986] rejects a verifier handle replayed against a different learner tuple', async () => {
      const adult = await seedIdentity('adult-mutated-replay', 40);
      const firstLearner = await seedIdentity('learner-mutated-replay-a', 14);
      const secondLearner = await seedIdentity('learner-mutated-replay-b', 14);
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
      const adult = await seedIdentity('adult-missing-receipt', 40);
      const learner = await seedIdentity('learner-missing-receipt', 14);
      const issuedAt = new Date();
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
      const adult = await seedIdentity('adult-route-org-move', 40);
      const learner = await seedIdentity('learner-route-org-move', 14);
      const destination = await seedIdentity('route-destination-org', 40);
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
      const adult = await seedIdentity('adult-route-denied', 40);
      const learner = await seedIdentity('learner-route-denied', 14);
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
  },
);
