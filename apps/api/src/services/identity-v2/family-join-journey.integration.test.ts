import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  consentRequest,
  consentGrant,
  consentReceipt,
  countryPolicyRegistry,
  familyJoinInvite,
  familyJoinJourney,
  guardianship,
  membership,
  organization,
  person,
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  subscription,
  type Database,
} from '@eduagent/database';
import { CONSENT_PURPOSES } from '@eduagent/schemas';

import {
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../../tests/integration/helpers';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors';
import { createIdentityGraph } from './identity-graph';
import {
  declineFamilyJoinJourney,
  completeFamilyJoinGuardianStep,
  finalizeFamilyJoinJourney,
  initiateFamilyJoinGuardianVerification,
  startOrResumeFamilyJoinJourney,
  withdrawFamilyJoinJourney,
} from './family-join-journey';
import {
  acceptLink,
  findAcceptedContractForSupportee,
} from '../linking-ceremony';

const AS_OF = new Date('2026-08-01T12:00:00.000Z');
// Invite redemption deliberately rechecks expiry against PostgreSQL now().
// Keep ordinary fixtures live independent of the wall-clock date on which the
// suite runs; expiry-specific cases pass an explicit boundary instead.
function liveInviteExpiresAt(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
const POLICY_EFFECTIVE_AT = new Date(AS_OF.getTime() - 1);
const POLICY_VERSION = `wi2534-${randomUUID()}`;
const CLOSED_GATES = {
  externalPrivacyLegalReview: true,
  aiActClassification: true,
  reliableAgeAndResidence: true,
  childTransparency: true,
  adultCommercialRelationship: true,
  countryAllowlist: true,
  operationalRightsAndIncidents: true,
  launchDayLegalRefresh: true,
};

let db: Database;
let policyId: string;
const clerkUserIds: string[] = [];
const personIds: string[] = [];

async function identity(label: string, birthYear: number) {
  const suffix = `${label}-${randomUUID()}`;
  const clerkUserId = `wi2534-${suffix}`;
  const email = `${suffix}@test.invalid`;
  const graph = await createIdentityGraph(db, {
    clerkUserId,
    verifiedEmail: email,
    displayName: `WI-2534 ${label}`,
    birthYear,
    location: 'EU',
  });
  clerkUserIds.push(clerkUserId);
  personIds.push(graph.personId);
  await db
    .update(person)
    .set({
      residenceJurisdiction: 'DE',
      residenceKnowing: {
        method: 'self_report',
        confidence: 0.8,
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
  return { ...graph, clerkUserId, email };
}

async function invite(
  inviterPersonId: string,
  familyOrgId: string,
  invitedEmail: string,
  expiresAt = liveInviteExpiresAt(),
) {
  const token = randomUUID();
  const [row] = await db
    .insert(familyJoinInvite)
    .values({
      inviterPersonId,
      familyOrgId,
      invitedEmail,
      status: 'pending',
      token,
      tokenExpiresAt: expiresAt,
    })
    .returning();
  if (!row) throw new Error('family invite fixture was not inserted');
  return { row, token };
}

async function completeGuardianJourney(
  inviter: Awaited<ReturnType<typeof identity>>,
  learner: Awaited<ReturnType<typeof identity>>,
  guardian: Awaited<ReturnType<typeof identity>>,
  authorizeSupportership = true,
) {
  const issued = await invite(
    inviter.personId,
    inviter.organizationId,
    learner.email,
  );
  const holding = await startOrResumeFamilyJoinJourney(db, {
    callerPersonId: learner.personId,
    token: issued.token,
    familyMembershipDecision: 'accept',
    destinationProcessingAssent: true,
    supportershipDecision: authorizeSupportership ? 'accept' : 'decline',
    asOf: AS_OF,
  });
  if (holding.status !== 'awaiting_guardian') {
    throw new Error('guardian fixture did not enter its holding state');
  }
  const initiated = await initiateFamilyJoinGuardianVerification(db, {
    callerPersonId: guardian.personId,
    token: issued.token,
    verificationHandle: `guardian-fixture-${randomUUID()}`,
    verifierUrl: 'https://guardian-verifier.test/verify',
    verifierKey: 'guardian-verifier-test-key',
    tokenSecret: 'wi2534-guardian-authority-secret-at-least-32-chars',
    now: AS_OF,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        expected: Record<string, unknown>;
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
          learnerAssentAt:
            holding.authorizationForm === 'joint_child_guardian'
              ? AS_OF.toISOString()
              : null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  const completed = await completeFamilyJoinGuardianStep(db, {
    callerPersonId: guardian.personId,
    token: issued.token,
    authorityToken: initiated.authorityToken,
    authorizeSupportership,
    tokenSecret: 'wi2534-guardian-authority-secret-at-least-32-chars',
    asOf: AS_OF,
  });
  return { issued, completed };
}

describe('startOrResumeFamilyJoinJourney (PostgreSQL)', () => {
  beforeAll(async () => {
    db = createIntegrationDb();
    const basePolicy = await db.query.countryPolicyRegistry.findFirst({
      where: eq(countryPolicyRegistry.countryCode, 'DE'),
    });
    if (!basePolicy) throw new Error('DE policy fixture is missing');
    const { id: _id, createdAt: _createdAt, ...copy } = basePolicy;
    const [inserted] = await db
      .insert(countryPolicyRegistry)
      .values({
        ...copy,
        launchStatus: 'enabled',
        launchBlockReason: null,
        legalVerificationStatus: 'verified',
        legalReviewedAt: AS_OF,
        legalReviewValidUntil: new Date('2027-08-01T00:00:00.000Z'),
        launchDayReviewRequired: false,
        processingLocationClass: 'eea_only',
        policyVersion: POLICY_VERSION,
        effectiveAt: POLICY_EFFECTIVE_AT,
        expiresAt: null,
        controllerGates: CLOSED_GATES,
      })
      .returning({ id: countryPolicyRegistry.id });
    if (!inserted) throw new Error('allowed DE policy was not inserted');
    policyId = inserted.id;
  });

  afterAll(async () => {
    if (personIds.length > 0) {
      await db
        .delete(familyJoinInvite)
        .where(inArray(familyJoinInvite.inviterPersonId, personIds));
    }
    await cleanupAccounts({ clerkUserIds });
    if (policyId) {
      await db
        .delete(countryPolicyRegistry)
        .where(eq(countryPolicyRegistry.id, policyId));
    }
  });

  it('rejects a forwarded code, binds the invited learner once, and re-resolves authority after the threshold birthday', async () => {
    const inviter = await identity('inviter', 1980);
    const learner = await identity('learner', 2012);
    const forwarder = await identity('forwarder', 2012);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );

    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: forwarder.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const holding = await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });
    expect(holding).toMatchObject({
      status: 'awaiting_guardian',
      familyOrgId: inviter.organizationId,
      supportershipAuthority: 'guardian',
      supportershipDecision: 'pending',
      visibilityContract: null,
    });

    const exactRetry = await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });
    expect(exactRetry).toEqual(holding);
    const rows = await db.query.familyJoinJourney.findMany({
      where: eq(familyJoinJourney.inviteId, issued.row.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chargePersonId: learner.personId,
      familyOrgId: inviter.organizationId,
      state: 'awaiting_guardian',
      supportershipAuthority: 'guardian',
      supportershipDecision: null,
      learnerSupportershipPreference: 'accept',
    });
    const destinationRequests = await db.query.consentRequest.findMany({
      where: and(
        eq(consentRequest.chargePersonId, learner.personId),
        eq(consentRequest.organizationId, inviter.organizationId),
      ),
    });
    expect(destinationRequests).toHaveLength(CONSENT_PURPOSES.length);
    expect(
      destinationRequests.every(
        (request) =>
          request.organizationId === inviter.organizationId &&
          request.status === 'pending' &&
          request.requestedBasis === 'gdpr_parental_consent',
      ),
    ).toBe(true);
    expect(
      new Set(destinationRequests.map((request) => request.purpose)),
    ).toEqual(new Set(CONSENT_PURPOSES));

    await db
      .update(person)
      .set({ birthDate: '2010-01-01' })
      .where(eq(person.id, learner.personId));
    const afterBirthday = await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'decline',
      asOf: AS_OF,
    });
    expect(afterBirthday).toMatchObject({
      status: 'ready_to_join',
      authorizationForm: 'self',
      supportershipAuthority: 'learner',
      supportershipDecision: 'decline',
      visibilityContract: null,
    });
    await expect(
      db.query.consentRequest.findMany({
        where: and(
          eq(consentRequest.chargePersonId, learner.personId),
          eq(consentRequest.organizationId, inviter.organizationId),
        ),
      }),
    ).resolves.toHaveLength(0);
  });

  it('returns the typed expired state without creating a journey', async () => {
    const inviter = await identity('expired-inviter', 1980);
    const learner = await identity('expired-learner', 2012);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
      new Date(AS_OF.getTime() - 1),
    );

    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'expired' });
    await expect(
      db.query.familyJoinJourney.findFirst({
        where: eq(familyJoinJourney.inviteId, issued.row.id),
      }),
    ).resolves.toBeUndefined();
  });

  it('returns a controlled conflict when another invite already owns the learner active-journey slot', async () => {
    const firstInviter = await identity('active-first-inviter', 1980);
    const secondInviter = await identity('active-second-inviter', 1980);
    const learner = await identity('active-journey-learner', 2012);
    const first = await invite(
      firstInviter.personId,
      firstInviter.organizationId,
      learner.email,
    );
    const second = await invite(
      secondInviter.personId,
      secondInviter.organizationId,
      learner.email,
    );
    const request = {
      callerPersonId: learner.personId,
      familyMembershipDecision: 'accept' as const,
      destinationProcessingAssent: true,
      supportershipDecision: 'accept' as const,
      asOf: AS_OF,
    };

    await expect(
      startOrResumeFamilyJoinJourney(db, { ...request, token: first.token }),
    ).resolves.toMatchObject({ status: 'awaiting_guardian' });
    await expect(
      startOrResumeFamilyJoinJourney(db, { ...request, token: second.token }),
    ).rejects.toThrow(
      'An unfinished family join already exists for this learner.',
    );
  });

  it('lets only the invited learner decline and clears unresolved destination consent', async () => {
    const inviter = await identity('decline-inviter', 1980);
    const learner = await identity('decline-learner', 2012);
    const forwarder = await identity('decline-forwarder', 2012);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });

    await expect(
      declineFamilyJoinJourney(db, {
        callerPersonId: forwarder.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      declineFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'declined' });
    await expect(
      declineFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'declined' });

    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'declined' });
    await expect(
      db.query.consentRequest.findMany({
        where: and(
          eq(consentRequest.chargePersonId, learner.personId),
          eq(consentRequest.organizationId, inviter.organizationId),
        ),
      }),
    ).resolves.toHaveLength(0);
  });

  it('lets only the inviter withdraw a partially completed journey', async () => {
    const inviter = await identity('withdraw-inviter', 1980);
    const learner = await identity('withdraw-learner', 2012);
    const stranger = await identity('withdraw-stranger', 1980);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });

    await expect(
      withdrawFamilyJoinJourney(db, {
        callerPersonId: stranger.personId,
        inviteId: issued.row.id,
        asOf: AS_OF,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withdrawFamilyJoinJourney(db, {
        callerPersonId: inviter.personId,
        inviteId: issued.row.id,
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'withdrawn' });
    await expect(
      withdrawFamilyJoinJourney(db, {
        callerPersonId: inviter.personId,
        inviteId: issued.row.id,
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'withdrawn' });
    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ status: 'withdrawn' });
  });

  it('preserves the approved destination consent set when a completed guardian step resumes under the same posture', async () => {
    const inviter = await identity('preserved-resume-inviter', 1980);
    const learner = await identity('preserved-resume-learner', 2012);
    const guardian = await identity('preserved-resume-guardian', 1978);
    const { issued, completed } = await completeGuardianJourney(
      inviter,
      learner,
      guardian,
      false,
    );
    expect(completed.status).toBe('ready_to_join');
    const requestWhere = and(
      eq(consentRequest.chargePersonId, learner.personId),
      eq(consentRequest.organizationId, inviter.organizationId),
    );
    const before = await db.query.consentRequest.findMany({
      where: requestWhere,
    });
    expect(before).toHaveLength(CONSENT_PURPOSES.length);
    expect(before.every((request) => request.status === 'approved')).toBe(true);

    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'decline',
        asOf: new Date(AS_OF.getTime() + 1_000),
      }),
    ).resolves.toMatchObject({ status: 'ready_to_join' });

    const after = await db.query.consentRequest.findMany({
      where: requestWhere,
    });
    const comparable = (requests: Array<(typeof after)[number]>) =>
      requests
        .map(({ id, status, consentGrantId }) => ({
          id,
          status,
          consentGrantId,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    expect(comparable(after)).toEqual(comparable(before));
  });

  it.each(['decline', 'withdraw', 'expire', 'decline_expired'] as const)(
    'revokes journey-created consent and visibility when a guardian-completed join ends by %s',
    async (terminalAction) => {
      const inviter = await identity(`${terminalAction}-cleanup-inviter`, 1980);
      const learner = await identity(`${terminalAction}-cleanup-learner`, 2012);
      const guardian = await identity(
        `${terminalAction}-cleanup-guardian`,
        1978,
      );
      const { issued, completed } = await completeGuardianJourney(
        inviter,
        learner,
        guardian,
      );
      if (
        completed.status !== 'ready_to_join' ||
        !completed.visibilityContract
      ) {
        throw new Error(
          'guardian fixture did not create a visibility contract',
        );
      }
      const contractId = completed.visibilityContract.id;
      await acceptLink(db, contractId, {
        actorPersonId: inviter.personId,
        audience: 'supporter',
        contractVersion: completed.visibilityContract.contractVersion,
        now: AS_OF,
      });
      await expect(
        findAcceptedContractForSupportee(db, {
          supporterPersonId: inviter.personId,
          supporteePersonId: learner.personId,
        }),
      ).resolves.toMatchObject({ id: contractId });

      const terminalAt = new Date(AS_OF.getTime() + 2_000);
      if (terminalAction === 'decline') {
        await expect(
          declineFamilyJoinJourney(db, {
            callerPersonId: learner.personId,
            token: issued.token,
            asOf: terminalAt,
          }),
        ).resolves.toEqual({ status: 'declined' });
      } else if (terminalAction === 'withdraw') {
        await expect(
          withdrawFamilyJoinJourney(db, {
            callerPersonId: inviter.personId,
            inviteId: issued.row.id,
            asOf: terminalAt,
          }),
        ).resolves.toEqual({ status: 'withdrawn' });
      } else {
        await db
          .update(familyJoinInvite)
          .set({ tokenExpiresAt: new Date(AS_OF.getTime() + 1_000) })
          .where(eq(familyJoinInvite.id, issued.row.id));
        const expiredResult =
          terminalAction === 'decline_expired'
            ? declineFamilyJoinJourney(db, {
                callerPersonId: learner.personId,
                token: issued.token,
                asOf: terminalAt,
              })
            : startOrResumeFamilyJoinJourney(db, {
                callerPersonId: learner.personId,
                token: issued.token,
                familyMembershipDecision: 'accept',
                destinationProcessingAssent: true,
                supportershipDecision: 'accept',
                asOf: terminalAt,
              });
        await expect(expiredResult).resolves.toEqual({ status: 'expired' });
      }

      await expect(
        db.query.supportVisibilityContracts.findFirst({
          where: eq(supportVisibilityContracts.id, contractId),
        }),
      ).resolves.toMatchObject({
        status: 'revoked',
        supporterAcceptedAt: null,
        supporteeAcceptedAt: null,
      });
      const grants = await db.query.consentGrant.findMany({
        where: and(
          eq(consentGrant.chargePersonId, learner.personId),
          eq(consentGrant.organizationId, inviter.organizationId),
        ),
      });
      expect(grants).toHaveLength(CONSENT_PURPOSES.length);
      expect(
        grants.every(
          (grant) => grant.withdrawnAt?.getTime() === terminalAt.getTime(),
        ),
      ).toBe(true);
      await expect(
        findAcceptedContractForSupportee(db, {
          supporterPersonId: inviter.personId,
          supporteePersonId: learner.personId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      if (terminalAction === 'expire' || terminalAction === 'decline_expired') {
        await expect(
          db.query.familyJoinJourney.findFirst({
            where: eq(familyJoinJourney.inviteId, issued.row.id),
          }),
        ).resolves.toBeUndefined();
      }
    },
  );

  it('preserves newer independent consent when a guardian-completed journey terminates', async () => {
    const inviter = await identity('independent-consent-inviter', 1980);
    const learner = await identity('independent-consent-learner', 2012);
    const guardian = await identity('independent-consent-guardian', 1978);
    const { issued } = await completeGuardianJourney(
      inviter,
      learner,
      guardian,
      false,
    );
    const journeyGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
      ),
    });
    expect(journeyGrants).toHaveLength(CONSENT_PURPOSES.length);
    const source = journeyGrants[0];
    if (!source) throw new Error('guardian fixture did not create consent');
    const independentAt = new Date(AS_OF.getTime() + 1_000);
    const [independent] = await db
      .insert(consentGrant)
      .values({
        chargePersonId: source.chargePersonId,
        organizationId: source.organizationId,
        purpose: source.purpose,
        lawfulBasis: source.lawfulBasis,
        granted: true,
        grantedAt: independentAt,
        priorValue: true,
        assuranceToken: `independent:${randomUUID()}`,
        assuranceMethod: source.assuranceMethod,
        snapshotAgeAtGrant: source.snapshotAgeAtGrant,
        snapshotJurisdictionAtGrant: source.snapshotJurisdictionAtGrant,
        auditFact: {
          ...(source.auditFact as Record<string, unknown>),
          source: 'independent_guardian_reconsent',
          guardianPersonId: guardian.personId,
        },
      })
      .returning();
    if (!independent) throw new Error('independent consent was not inserted');

    const declinedAt = new Date(AS_OF.getTime() + 2_000);
    await declineFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      asOf: declinedAt,
    });

    const retiredJourneyGrants = await db.query.consentGrant.findMany({
      where: inArray(
        consentGrant.id,
        journeyGrants.map((grant) => grant.id),
      ),
    });
    expect(
      retiredJourneyGrants.every(
        (grant) => grant.withdrawnAt?.getTime() === declinedAt.getTime(),
      ),
    ).toBe(true);
    await expect(
      db.query.consentGrant.findFirst({
        where: eq(consentGrant.id, independent.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: null });
  });

  it('binds an alternate verified guardian to the destination and keeps supporter acceptance pending', async () => {
    const inviter = await identity('guardian-inviter', 1980);
    const guardian = await identity('alternate-guardian', 1978);
    const learner = await identity('guardian-learner', 2012);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    const holding = await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });
    expect(holding.status).toBe('awaiting_guardian');

    let verifierExpected: Record<string, unknown> | undefined;
    const initiated = await initiateFamilyJoinGuardianVerification(db, {
      callerPersonId: guardian.personId,
      token: issued.token,
      verificationHandle: `wi2534-${randomUUID()}`,
      verifierUrl: 'https://guardian-verifier.test/v1/verify',
      verifierKey: 'guardian-verifier-test-key',
      tokenSecret: 'wi2534-guardian-authority-secret-at-least-32-chars',
      now: AS_OF,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          expected: Record<string, unknown>;
        };
        verifierExpected = body.expected;
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
            learnerAssentAt:
              holding.status === 'awaiting_guardian' &&
              holding.authorizationForm === 'joint_child_guardian'
                ? AS_OF.toISOString()
                : null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    expect(verifierExpected).toMatchObject({
      guardianPersonId: guardian.personId,
      chargePersonId: learner.personId,
      organizationId: inviter.organizationId,
    });

    const completed = await completeFamilyJoinGuardianStep(db, {
      callerPersonId: guardian.personId,
      token: issued.token,
      authorityToken: initiated.authorityToken,
      authorizeSupportership: true,
      tokenSecret: 'wi2534-guardian-authority-secret-at-least-32-chars',
      asOf: AS_OF,
    });
    expect(completed).toMatchObject({
      status: 'ready_to_join',
      familyOrgId: inviter.organizationId,
      supportershipAuthority: 'guardian',
      supportershipDecision: 'accept',
      visibilityContract: {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
        supporterAcceptedAt: null,
        status: 'pending',
      },
    });
    if (completed.status !== 'ready_to_join' || !completed.visibilityContract) {
      throw new Error(
        'guardian completion did not return a visibility contract',
      );
    }
    expect(completed.visibilityContract.supporteeAcceptedAt).not.toBeNull();

    await expect(
      db.query.guardianship.findFirst({
        where: and(
          eq(guardianship.guardianPersonId, guardian.personId),
          eq(guardianship.chargePersonId, learner.personId),
        ),
      }),
    ).resolves.toBeDefined();
    const destinationGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
      ),
    });
    expect(destinationGrants).toHaveLength(CONSENT_PURPOSES.length);
    const contract = await db.query.supportVisibilityContracts.findFirst({
      where: eq(supportVisibilityContracts.id, completed.visibilityContract.id),
    });
    expect(contract?.supporteeAcceptedAt).toEqual(AS_OF);
    expect(contract?.supporterAcceptedAt).toBeNull();
    await expect(
      db.query.supportVisibilityAuditEvents.findFirst({
        where: and(
          eq(
            supportVisibilityAuditEvents.contractId,
            completed.visibilityContract.id,
          ),
          eq(supportVisibilityAuditEvents.actorPersonId, guardian.personId),
        ),
      }),
    ).resolves.toBeDefined();

    await expect(
      findAcceptedContractForSupportee(db, {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const joined = await finalizeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      asOf: AS_OF,
    });
    expect(joined).toMatchObject({
      status: 'joined',
      familyOrgId: inviter.organizationId,
      alreadyMember: false,
      supportershipAuthority: 'guardian',
      supportershipDecision: 'accept',
    });
    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, learner.personId),
      }),
    ).resolves.toMatchObject({ organizationId: inviter.organizationId });
    await expect(
      findAcceptedContractForSupportee(db, {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const accepted = await acceptLink(db, completed.visibilityContract.id, {
      actorPersonId: inviter.personId,
      audience: 'supporter',
      contractVersion: completed.visibilityContract.contractVersion,
      now: AS_OF,
    });
    expect(accepted.status).toBe('accepted');
    await expect(
      findAcceptedContractForSupportee(db, {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
      }),
    ).resolves.toMatchObject({ id: completed.visibilityContract.id });
    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).resolves.toMatchObject({
      status: 'joined',
      alreadyMember: true,
      visibilityContract: { status: 'accepted' },
    });
    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).resolves.toMatchObject({
      status: 'joined',
      alreadyMember: true,
      visibilityContract: { status: 'accepted' },
    });
  });

  it('invalidates guardian authority when the learner reaches self-consent age and requires fresh learner decisions', async () => {
    const inviter = await identity('birthday-inviter', 1980);
    const guardian = await identity('birthday-guardian', 1978);
    const learner = await identity('birthday-learner', 2010);
    await db
      .update(person)
      .set({ birthDate: '2010-08-02' })
      .where(eq(person.id, learner.personId));

    const { issued, completed } = await completeGuardianJourney(
      inviter,
      learner,
      guardian,
      true,
    );
    if (completed.status !== 'ready_to_join' || !completed.visibilityContract) {
      throw new Error(
        'guardian fixture did not create its visibility contract',
      );
    }
    const guardianContractId = completed.visibilityContract.id;
    const afterBirthday = new Date('2026-08-02T12:00:00.000Z');
    await db
      .update(familyJoinInvite)
      .set({ tokenExpiresAt: liveInviteExpiresAt() })
      .where(eq(familyJoinInvite.id, issued.row.id));

    const resumed = await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: afterBirthday,
    });
    expect(resumed).toMatchObject({
      status: 'ready_to_join',
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
      visibilityContract: null,
    });

    await expect(
      db.query.supportVisibilityContracts.findFirst({
        where: eq(supportVisibilityContracts.id, guardianContractId),
      }),
    ).resolves.toMatchObject({
      status: 'revoked',
      supporterAcceptedAt: null,
      supporteeAcceptedAt: null,
    });
    const staleGuardianGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
        inArray(consentGrant.lawfulBasis, [
          'gdpr_parental_consent',
          'coppa_parental_consent',
        ]),
      ),
    });
    expect(staleGuardianGrants).toHaveLength(CONSENT_PURPOSES.length);
    expect(
      staleGuardianGrants.every((grant) => grant.withdrawnAt != null),
    ).toBe(true);
    await expect(
      db.query.familyJoinJourney.findFirst({
        where: eq(familyJoinJourney.inviteId, issued.row.id),
      }),
    ).resolves.toMatchObject({
      supportershipAuthority: 'learner',
      guardianPersonId: guardian.personId,
      guardianAuthorityRedemptionId: null,
      guardianCompletedAt: null,
      visibilityContractId: null,
    });

    const joined = await finalizeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      asOf: afterBirthday,
    });
    expect(joined).toMatchObject({
      status: 'joined',
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
      visibilityContract: {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
        supporterAcceptedAt: null,
        supporteeAcceptedAt: afterBirthday.toISOString(),
      },
    });
    if (joined.status !== 'joined' || !joined.visibilityContract) {
      throw new Error('self-consent recovery did not create a new contract');
    }
    expect(joined.visibilityContract.id).not.toBe(guardianContractId);

    const liveDestinationGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
        eq(consentGrant.lawfulBasis, 'art6_1_a'),
      ),
    });
    expect(liveDestinationGrants).toHaveLength(CONSENT_PURPOSES.length);
    expect(liveDestinationGrants.every((grant) => !grant.withdrawnAt)).toBe(
      true,
    );
  });

  it('archives the old solo grant set and creates fresh destination grants for a self-consent join', async () => {
    const inviter = await identity('self-inviter', 1980);
    const learner = await identity('self-learner', 2000);
    const oldOrganizationId = learner.organizationId;
    const oldGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, oldOrganizationId),
      ),
    });
    expect(oldGrants).toHaveLength(CONSENT_PURPOSES.length);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: AS_OF,
      }),
    ).resolves.toMatchObject({
      status: 'ready_to_join',
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
    });

    const joined = await finalizeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      asOf: AS_OF,
    });
    expect(joined).toMatchObject({
      status: 'joined',
      familyOrgId: inviter.organizationId,
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
      visibilityContract: {
        supporterPersonId: inviter.personId,
        supporteePersonId: learner.personId,
        supporterAcceptedAt: null,
        status: 'pending',
      },
    });
    if (joined.status !== 'joined' || !joined.visibilityContract) {
      throw new Error('self-consent join did not return a visibility contract');
    }
    expect(joined.visibilityContract.supporteeAcceptedAt).not.toBeNull();

    await expect(
      db.query.organization.findFirst({
        where: eq(organization.id, oldOrganizationId),
      }),
    ).resolves.toBeUndefined();
    const receipts = await db.query.consentReceipt.findMany({
      where: eq(consentReceipt.personId, learner.personId),
    });
    expect(
      receipts.filter(
        (receipt) => receipt.organizationId === oldOrganizationId,
      ),
    ).toHaveLength(CONSENT_PURPOSES.length);
    const destinationGrants = await db.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
      ),
    });
    expect(destinationGrants).toHaveLength(CONSENT_PURPOSES.length);
    expect(
      destinationGrants.every(
        (grant) =>
          grant.auditFact !== null &&
          typeof grant.auditFact === 'object' &&
          (grant.auditFact as Record<string, unknown>).source ===
            'family_join_destination_self_consent',
      ),
    ).toBe(true);
  });

  it('keeps a completed join resumable after the invitation expires', async () => {
    const inviter = await identity('joined-retry-inviter', 1980);
    const learner = await identity('joined-retry-learner', 2000);
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    if (!issued.row.tokenExpiresAt) {
      throw new Error('family invite fixture has no expiry');
    }
    const afterExpiry = new Date(issued.row.tokenExpiresAt.getTime() + 1);

    await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });
    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).resolves.toMatchObject({ status: 'joined', alreadyMember: false });

    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: afterExpiry,
      }),
    ).resolves.toMatchObject({ status: 'joined', alreadyMember: true });
    await expect(
      startOrResumeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        asOf: afterExpiry,
      }),
    ).resolves.toMatchObject({ status: 'joined', alreadyMember: true });
  });

  it('rolls back destination consent, visibility, and invite redemption when the membership move fails', async () => {
    const inviter = await identity('rollback-inviter', 1980);
    const learner = await identity('rollback-learner', 2000);
    const oldOrganizationId = learner.organizationId;
    const issued = await invite(
      inviter.personId,
      inviter.organizationId,
      learner.email,
    );
    await startOrResumeFamilyJoinJourney(db, {
      callerPersonId: learner.personId,
      token: issued.token,
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'accept',
      asOf: AS_OF,
    });
    await db
      .delete(subscription)
      .where(eq(subscription.organizationId, inviter.organizationId));

    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: AS_OF,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, learner.personId),
      }),
    ).resolves.toMatchObject({ organizationId: oldOrganizationId });
    await expect(
      db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, issued.row.id),
      }),
    ).resolves.toMatchObject({ status: 'bound' });
    await expect(
      db.query.familyJoinJourney.findFirst({
        where: eq(familyJoinJourney.inviteId, issued.row.id),
      }),
    ).resolves.toMatchObject({ state: 'ready_to_join' });
    await expect(
      db.query.consentGrant.findMany({
        where: and(
          eq(consentGrant.chargePersonId, learner.personId),
          eq(consentGrant.organizationId, inviter.organizationId),
        ),
      }),
    ).resolves.toHaveLength(0);
    await expect(
      db.query.supportVisibilityContracts.findMany({
        where: eq(
          supportVisibilityContracts.supporteePersonId,
          learner.personId,
        ),
      }),
    ).resolves.toHaveLength(0);
  });

  it('bounces finalization after destination-consent withdrawal or guardian revocation', async () => {
    const inviter = await identity('revocation-inviter', 1980);
    const learner = await identity('revocation-learner', 2011);
    const guardian = await identity('revocation-guardian', 1982);
    const { issued } = await completeGuardianJourney(
      inviter,
      learner,
      guardian,
    );
    const originalMembership = await db.query.membership.findFirst({
      where: eq(membership.personId, learner.personId),
    });
    const grant = await db.query.consentGrant.findFirst({
      where: and(
        eq(consentGrant.chargePersonId, learner.personId),
        eq(consentGrant.organizationId, inviter.organizationId),
        eq(consentGrant.purpose, CONSENT_PURPOSES[0]),
      ),
    });
    if (!grant)
      throw new Error('guardian fixture did not create consent grants');

    await db
      .update(consentGrant)
      .set({ withdrawnAt: new Date(AS_OF.getTime() + 1_000) })
      .where(eq(consentGrant.id, grant.id));
    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: new Date(AS_OF.getTime() + 2_000),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await db
      .update(consentGrant)
      .set({ withdrawnAt: null })
      .where(eq(consentGrant.id, grant.id));
    await db
      .update(guardianship)
      .set({ revokedAt: new Date(AS_OF.getTime() + 3_000) })
      .where(
        and(
          eq(guardianship.guardianPersonId, guardian.personId),
          eq(guardianship.chargePersonId, learner.personId),
        ),
      );
    await expect(
      finalizeFamilyJoinJourney(db, {
        callerPersonId: learner.personId,
        token: issued.token,
        asOf: new Date(AS_OF.getTime() + 4_000),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, learner.personId),
      }),
    ).resolves.toMatchObject({
      organizationId: originalMembership?.organizationId,
    });
  });
});
