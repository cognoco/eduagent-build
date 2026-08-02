/**
 * Integration: POST /v1/family-join/invite and /v1/family-join/accept
 *
 * Exercises the production app stack end-to-end: real signed-JWT verification,
 * profile scope, consent middleware, route validation/error mapping, family-join
 * services, and database transactions. Only the Clerk JWKS network boundary is
 * intercepted; no internal service or database module is mocked.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  countryPolicyRegistry,
  familyJoinInvite,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  addFetchHandler,
  installFetchInterceptor,
  restoreFetch,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import {
  buildAuthHeaders,
  setProfileConsentStatusForTest,
} from '../../../../tests/integration/route-fixtures';
import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';
import { createIdentityGraph } from '../services/identity-v2/identity-graph';
import { __resetFamilyJoinInviteRateLimit } from './family-join';

const GUARDIAN_TOKEN_SECRET =
  'family-join-guardian-authority-secret-at-least-32-chars';
const GUARDIAN_VERIFIER_URL = 'https://family-join-guardian.test/verify';
const GUARDIAN_VERIFIER_KEY = 'family-join-guardian-test-key';
const TEST_ENV = {
  ...buildIntegrationEnv(),
  FAMILY_JOIN_ENABLED: 'true',
  GUARDIAN_AUTHORITY_TOKEN_SECRET: GUARDIAN_TOKEN_SECRET,
  GUARDIAN_AUTHORITY_VERIFIER_URL: GUARDIAN_VERIFIER_URL,
  GUARDIAN_AUTHORITY_VERIFIER_KEY: GUARDIAN_VERIFIER_KEY,
};

const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));
addFetchHandler(GUARDIAN_VERIFIER_URL, async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as {
    expected: {
      guardianPersonId: string;
      chargePersonId: string;
      organizationId: string;
      jurisdiction: string;
      policyVersion: string;
      learnerAssentAt: string | null;
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
      learnerAssentAt: body.expected.learnerAssentAt,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

const RUN_ID = randomUUID();
const POLICY_AS_OF = new Date();
const POLICY_VERSION = `wi2534-route-${randomUUID()}`;
const CLOSED_CONTROLLER_GATES = {
  externalPrivacyLegalReview: true,
  aiActClassification: true,
  reliableAgeAndResidence: true,
  childTransparency: true,
  adultCommercialRelationship: true,
  countryAllowlist: true,
  operationalRightsAndIncidents: true,
  launchDayLegalRefresh: true,
};
const CURRENT_YEAR = new Date().getUTCFullYear();
const ADULT_BIRTH_YEAR = CURRENT_YEAR - 40;
const SELF_CONSENT_CAPABLE_BIRTH_YEAR = CURRENT_YEAR - 18;
const CONSENT_REQUIRED_BIRTH_YEAR = CURRENT_YEAR - 14;

interface SeededIdentity {
  clerkUserId: string;
  email: string;
  personId: string;
  organizationId: string;
}

let db: Database;
let policyId: string;
const seededClerkUserIds: string[] = [];
const seededEmails: string[] = [];
const seededPersonIds: string[] = [];
const seededOrganizationIds: string[] = [];

async function seedIdentity(
  label: string,
  birthYear: number,
): Promise<SeededIdentity> {
  const suffix = `${RUN_ID}-${label}-${randomUUID()}`;
  const clerkUserId = `integration-family-join-${suffix}`;
  const email = `family-join-${suffix}@test.invalid`;
  const graph = await createIdentityGraph(db, {
    clerkUserId,
    verifiedEmail: email,
    displayName: `Family join ${label}`,
    birthYear,
    location: 'EU',
    conversationLanguage: 'en',
  });

  seededClerkUserIds.push(clerkUserId);
  seededEmails.push(email);
  seededPersonIds.push(graph.personId);
  seededOrganizationIds.push(graph.organizationId);

  await db
    .update(person)
    .set({
      residenceJurisdiction: 'DE',
      residenceKnowing: {
        method: 'self_report',
        confidence: 0.8,
        assertedAt: new Date().toISOString(),
        corroboratingMethods: ['billing_address'],
      },
      ageKnowing: {
        method: 'verified_credential',
        confidence: 1,
        lastUpdated: new Date().toISOString(),
      },
    })
    .where(eq(person.id, graph.personId));

  return {
    clerkUserId,
    email,
    personId: graph.personId,
    organizationId: graph.organizationId,
  };
}

function authHeaders(identity: SeededIdentity): HeadersInit {
  return buildAuthHeaders(
    { sub: identity.clerkUserId, email: identity.email },
    identity.personId,
  );
}

function post(
  path: string,
  body: unknown,
  identity?: SeededIdentity,
  ipAddress?: string,
): Promise<Response> {
  const headers = new Headers(
    identity ? authHeaders(identity) : { 'Content-Type': 'application/json' },
  );
  if (ipAddress) headers.set('cf-connecting-ip', ipAddress);

  return app.request(
    path,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    TEST_ENV,
  );
}

async function inviteThroughRoute(
  inviter: SeededIdentity,
  invitedEmail = `invited-${randomUUID()}@test.invalid`,
): Promise<{ inviteId: string; token: string; invitedEmail: string }> {
  const response = await post(
    '/v1/family-join/invite',
    { invitedEmail },
    inviter,
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'sent' });

  const row = await db.query.familyJoinInvite.findFirst({
    where: and(
      eq(familyJoinInvite.inviterPersonId, inviter.personId),
      eq(familyJoinInvite.familyOrgId, inviter.organizationId),
    ),
  });
  expect(row).toMatchObject({
    inviterPersonId: inviter.personId,
    familyOrgId: inviter.organizationId,
    invitedEmail,
    status: 'pending',
  });
  if (!row?.token) throw new Error('Family-join route did not persist a token');

  return { inviteId: row.id, token: row.token, invitedEmail };
}

async function deleteInvites(): Promise<void> {
  if (seededPersonIds.length === 0 && seededEmails.length === 0) return;

  await db
    .delete(familyJoinInvite)
    .where(
      or(
        inArray(familyJoinInvite.inviterPersonId, seededPersonIds),
        inArray(familyJoinInvite.invitedEmail, seededEmails),
      ),
    );
}

async function expectFixtureCleanup(): Promise<void> {
  if (seededPersonIds.length === 0) return;

  const [
    invites,
    logins,
    memberships,
    people,
    organizations,
    subscriptions,
    supporterships,
    guardianships,
    consentGrants,
    consentRequests,
  ] = await Promise.all([
    db.query.familyJoinInvite.findMany({
      where: inArray(familyJoinInvite.inviterPersonId, seededPersonIds),
    }),
    db.query.login.findMany({
      where: inArray(login.personId, seededPersonIds),
    }),
    db.query.membership.findMany({
      where: inArray(membership.personId, seededPersonIds),
    }),
    db.query.person.findMany({
      where: inArray(person.id, seededPersonIds),
    }),
    db.query.organization.findMany({
      where: inArray(organization.id, seededOrganizationIds),
    }),
    db.query.subscription.findMany({
      where: inArray(subscription.organizationId, seededOrganizationIds),
    }),
    db.query.supportership.findMany({
      where: or(
        inArray(supportership.supporterPersonId, seededPersonIds),
        inArray(supportership.supporteePersonId, seededPersonIds),
      ),
    }),
    db.query.guardianship.findMany({
      where: or(
        inArray(guardianship.guardianPersonId, seededPersonIds),
        inArray(guardianship.chargePersonId, seededPersonIds),
      ),
    }),
    db.query.consentGrant.findMany({
      where: inArray(consentGrant.chargePersonId, seededPersonIds),
    }),
    db.query.consentRequest.findMany({
      where: inArray(consentRequest.chargePersonId, seededPersonIds),
    }),
  ]);

  expect({
    invites,
    logins,
    memberships,
    people,
    organizations,
    subscriptions,
    supporterships,
    guardianships,
    consentGrants,
    consentRequests,
  }).toEqual({
    invites: [],
    logins: [],
    memberships: [],
    people: [],
    organizations: [],
    subscriptions: [],
    supporterships: [],
    guardianships: [],
    consentGrants: [],
    consentRequests: [],
  });
}

async function cleanupFixtures(): Promise<void> {
  await deleteInvites();
  await cleanupAccounts({
    emails: seededEmails,
    clerkUserIds: seededClerkUserIds,
  });
  await expectFixtureCleanup();

  seededClerkUserIds.length = 0;
  seededEmails.length = 0;
  seededPersonIds.length = 0;
  seededOrganizationIds.length = 0;
}

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
      legalReviewedAt: POLICY_AS_OF,
      legalReviewValidUntil: new Date(
        POLICY_AS_OF.getTime() + 365 * 24 * 60 * 60 * 1000,
      ),
      launchDayReviewRequired: false,
      processingLocationClass: 'eea_only',
      policyVersion: POLICY_VERSION,
      effectiveAt: new Date(POLICY_AS_OF.getTime() - 1),
      expiresAt: null,
      controllerGates: CLOSED_CONTROLLER_GATES,
    })
    .returning({ id: countryPolicyRegistry.id });
  if (!inserted) throw new Error('Allowed DE policy was not inserted');
  policyId = inserted.id;
});

beforeEach(() => {
  clearJWKSCache();
  __resetFamilyJoinInviteRateLimit();
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  if (policyId) {
    await db
      .delete(countryPolicyRegistry)
      .where(eq(countryPolicyRegistry.id, policyId));
  }
  restoreFetch();
});

describe('family-join routes (integration)', () => {
  it('rejects an unauthenticated invite before the route handler runs', async () => {
    const response = await post('/v1/family-join/invite', {
      invitedEmail: 'teen@test.invalid',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('rejects an unauthenticated accept before resolving the invitation', async () => {
    const response = await post('/v1/family-join/accept', {
      token: randomUUID(),
      optInSupportership: false,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('validates both route request contracts before calling their services', async () => {
    const caller = await seedIdentity('validation-caller', ADULT_BIRTH_YEAR);

    const inviteResponse = await post(
      '/v1/family-join/invite',
      { invitedEmail: 'not-an-email', unexpected: true },
      caller,
    );
    const acceptResponse = await post(
      '/v1/family-join/accept',
      { token: randomUUID() },
      caller,
    );

    expect(inviteResponse.status).toBe(400);
    expect(acceptResponse.status).toBe(400);
    expect(
      await db.query.familyJoinInvite.findMany({
        where: eq(familyJoinInvite.inviterPersonId, caller.personId),
      }),
    ).toEqual([]);
  });

  it('maps a real inviter authorization failure to the forbidden envelope', async () => {
    const learner = await seedIdentity('non-admin', ADULT_BIRTH_YEAR);
    await db
      .update(membership)
      .set({ roles: ['learner'] })
      .where(eq(membership.personId, learner.personId));

    const response = await post(
      '/v1/family-join/invite',
      { invitedEmail: 'teen@test.invalid' },
      learner,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Only an organization owner can invite a family member.',
    });
    expect(
      await db.query.familyJoinInvite.findMany({
        where: eq(familyJoinInvite.inviterPersonId, learner.personId),
      }),
    ).toEqual([]);
  });

  it('rate-limits repeated invite attempts by the route-resolved client IP', async () => {
    const learner = await seedIdentity(
      'rate-limited-non-admin',
      ADULT_BIRTH_YEAR,
    );
    await db
      .update(membership)
      .set({ roles: ['learner'] })
      .where(eq(membership.personId, learner.personId));

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await post(
        '/v1/family-join/invite',
        { invitedEmail: 'teen@test.invalid' },
        learner,
        '198.51.100.199',
      );
      expect(response.status).toBe(403);
    }

    const otherIpResponse = await post(
      '/v1/family-join/invite',
      { invitedEmail: 'teen@test.invalid' },
      learner,
      '198.51.100.200',
    );
    expect(otherIpResponse.status).toBe(403);

    const response = await post(
      '/v1/family-join/invite',
      { invitedEmail: 'teen@test.invalid' },
      learner,
      '198.51.100.199',
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many family invite attempts. Try again later.',
    });
  });

  it('returns a neutral success response and persists the caller-bound invitation', async () => {
    const parent = await seedIdentity('inviter', ADULT_BIRTH_YEAR);
    const invitedEmail = `route-success-${randomUUID()}@test.invalid`;

    const invite = await inviteThroughRoute(parent, invitedEmail);

    expect(invite.invitedEmail).toBe(invitedEmail);
    expect(invite.token).toBeTruthy();
  });

  it('maps an unknown invitation token to the not-found envelope', async () => {
    const teen = await seedIdentity(
      'unknown-token-teen',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );

    const response = await post(
      '/v1/family-join/accept',
      { token: randomUUID(), optInSupportership: false },
      teen,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('accepts a valid invitation as the authenticated teen and commits the relationship atomically', async () => {
    const parent = await seedIdentity('success-parent', ADULT_BIRTH_YEAR);
    const teen = await seedIdentity(
      'success-teen',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );
    const teenOrgId = teen.organizationId;
    const invite = await inviteThroughRoute(parent, teen.email);

    const response = await post(
      '/v1/family-join/accept',
      { token: invite.token, optInSupportership: true },
      teen,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      familyOrgId: parent.organizationId,
      alreadyMember: false,
      storeCancelNudge: null,
      visibilityContract: {
        supporterPersonId: parent.personId,
        supporteePersonId: teen.personId,
        relation: 'parent',
        status: 'pending',
        supporterAcceptedAt: null,
        supporteeAcceptedAt: null,
      },
    });

    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, teen.personId),
      }),
    ).resolves.toMatchObject({
      organizationId: parent.organizationId,
      roles: ['learner'],
    });
    await expect(
      db.query.organization.findFirst({
        where: eq(organization.id, teenOrgId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.supportership.findFirst({
        where: and(
          eq(supportership.supporterPersonId, parent.personId),
          eq(supportership.supporteePersonId, teen.personId),
        ),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.guardianship.findFirst({
        where: or(
          eq(guardianship.guardianPersonId, teen.personId),
          eq(guardianship.chargePersonId, teen.personId),
        ),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, invite.inviteId),
      }),
    ).resolves.toMatchObject({ status: 'accepted', token: null });
  });

  it('maps the consent-age refusal and rolls back the invite claim and every relationship write', async () => {
    const parent = await seedIdentity(
      'consent-failure-parent',
      ADULT_BIRTH_YEAR,
    );
    const teen = await seedIdentity(
      'consent-failure-teen',
      CONSENT_REQUIRED_BIRTH_YEAR,
    );
    await setProfileConsentStatusForTest({
      profileId: teen.personId,
      accountId: teen.organizationId,
      status: 'CONSENTED',
    });
    const invite = await inviteThroughRoute(parent, teen.email);

    const response = await post(
      '/v1/family-join/accept',
      { token: invite.token, optInSupportership: true },
      teen,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Accepting teen is not self-consent-capable by age.',
    });
    await expect(
      db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, invite.inviteId),
      }),
    ).resolves.toMatchObject({ status: 'pending', token: invite.token });
    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, teen.personId),
      }),
    ).resolves.toMatchObject({
      organizationId: teen.organizationId,
      roles: ['admin', 'learner'],
    });
    await expect(
      db.query.organization.findFirst({
        where: eq(organization.id, teen.organizationId),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.subscription.findFirst({
        where: eq(subscription.organizationId, teen.organizationId),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.supportership.findFirst({
        where: or(
          eq(supportership.supporterPersonId, teen.personId),
          eq(supportership.supporteePersonId, teen.personId),
        ),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.guardianship.findFirst({
        where: or(
          eq(guardianship.guardianPersonId, teen.personId),
          eq(guardianship.chargePersonId, teen.personId),
        ),
      }),
    ).resolves.toBeUndefined();
  });

  it('maps a real service conflict and leaves the teen and invitation untouched', async () => {
    const parent = await seedIdentity('conflict-parent', ADULT_BIRTH_YEAR);
    const teen = await seedIdentity(
      'conflict-teen',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );
    const invite = await inviteThroughRoute(parent, teen.email);
    await db
      .delete(subscription)
      .where(eq(subscription.organizationId, parent.organizationId));

    const response = await post(
      '/v1/family-join/accept',
      { token: invite.token, optInSupportership: false },
      teen,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: ERROR_CODES.CONFLICT,
      message: 'Target family org has no active subscription.',
    });
    await expect(
      db.query.familyJoinInvite.findFirst({
        where: eq(familyJoinInvite.id, invite.inviteId),
      }),
    ).resolves.toMatchObject({ status: 'pending', token: invite.token });
    await expect(
      db.query.membership.findFirst({
        where: eq(membership.personId, teen.personId),
      }),
    ).resolves.toMatchObject({
      organizationId: teen.organizationId,
      roles: ['admin', 'learner'],
    });
    await expect(
      db.query.organization.findFirst({
        where: eq(organization.id, teen.organizationId),
      }),
    ).resolves.toBeDefined();
  });

  it('runs the authenticated self-consent journey and returns its committed result on retry', async () => {
    const parent = await seedIdentity('journey-self-parent', ADULT_BIRTH_YEAR);
    const learner = await seedIdentity(
      'journey-self-learner',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );
    const issued = await inviteThroughRoute(parent, learner.email);

    const started = await post(
      '/v1/family-join/journey',
      {
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
      },
      learner,
    );
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      status: 'ready_to_join',
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
    });

    const finalized = await post(
      '/v1/family-join/journey/finalize',
      { token: issued.token },
      learner,
    );
    expect(finalized.status).toBe(200);
    await expect(finalized.json()).resolves.toMatchObject({
      status: 'joined',
      familyOrgId: parent.organizationId,
      alreadyMember: false,
      supportershipAuthority: 'learner',
      supportershipDecision: 'accept',
      visibilityContract: {
        supporterPersonId: parent.personId,
        supporteePersonId: learner.personId,
        supporterAcceptedAt: null,
        status: 'pending',
      },
    });

    const resumed = await post(
      '/v1/family-join/journey',
      {
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
      },
      learner,
    );
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toMatchObject({
      status: 'joined',
      alreadyMember: true,
    });
  });

  it('uses an alternate authenticated guardian without turning that guardian into the supporter', async () => {
    const inviter = await seedIdentity(
      'journey-guardian-inviter',
      ADULT_BIRTH_YEAR,
    );
    const learner = await seedIdentity(
      'journey-guardian-learner',
      CONSENT_REQUIRED_BIRTH_YEAR,
    );
    const guardian = await seedIdentity(
      'journey-alternate-guardian',
      ADULT_BIRTH_YEAR,
    );
    await setProfileConsentStatusForTest({
      profileId: learner.personId,
      accountId: learner.organizationId,
      status: 'CONSENTED',
    });
    const issued = await inviteThroughRoute(inviter, learner.email);

    const started = await post(
      '/v1/family-join/journey',
      {
        token: issued.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
      },
      learner,
    );
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      status: 'awaiting_guardian',
      supportershipAuthority: 'guardian',
      supportershipDecision: 'pending',
    });

    const initiation = await post(
      '/v1/family-join/journey/guardian/initiate',
      {
        token: issued.token,
        verificationHandle: `route-verification-${randomUUID()}`,
        authorizeSupportership: false,
      },
      guardian,
    );
    expect(initiation.status).toBe(200);
    const initiationBody = (await initiation.json()) as {
      authorityToken: string;
    };
    expect(initiationBody.authorityToken).toEqual(expect.any(String));

    const completion = await post(
      '/v1/family-join/journey/guardian/complete',
      {
        token: issued.token,
        authorityToken: initiationBody.authorityToken,
        authorizeSupportership: false,
      },
      guardian,
    );
    expect(completion.status).toBe(200);
    await expect(completion.json()).resolves.toMatchObject({
      status: 'ready_to_join',
      supportershipAuthority: 'guardian',
      supportershipDecision: 'decline',
      visibilityContract: null,
    });

    const finalized = await post(
      '/v1/family-join/journey/finalize',
      { token: issued.token },
      learner,
    );
    expect(finalized.status).toBe(200);
    await expect(finalized.json()).resolves.toMatchObject({
      status: 'joined',
      familyOrgId: inviter.organizationId,
      supportershipAuthority: 'guardian',
      supportershipDecision: 'decline',
      visibilityContract: null,
    });
    await expect(
      db.query.guardianship.findFirst({
        where: and(
          eq(guardianship.guardianPersonId, guardian.personId),
          eq(guardianship.chargePersonId, learner.personId),
        ),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.supportership.findFirst({
        where: eq(supportership.supporteePersonId, learner.personId),
      }),
    ).resolves.toBeUndefined();
  });

  it('exposes learner decline and inviter-only withdrawal as separate terminal actions', async () => {
    const declineParent = await seedIdentity(
      'journey-decline-parent',
      ADULT_BIRTH_YEAR,
    );
    const decliningLearner = await seedIdentity(
      'journey-declining-learner',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );
    const declineInvite = await inviteThroughRoute(
      declineParent,
      decliningLearner.email,
    );
    await post(
      '/v1/family-join/journey',
      {
        token: declineInvite.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'decline',
      },
      decliningLearner,
    );
    const declined = await post(
      '/v1/family-join/journey/decline',
      { token: declineInvite.token },
      decliningLearner,
    );
    expect(declined.status).toBe(200);
    await expect(declined.json()).resolves.toEqual({ status: 'declined' });

    const withdrawParent = await seedIdentity(
      'journey-withdraw-parent',
      ADULT_BIRTH_YEAR,
    );
    const withdrawLearner = await seedIdentity(
      'journey-withdraw-learner',
      SELF_CONSENT_CAPABLE_BIRTH_YEAR,
    );
    const withdrawInvite = await inviteThroughRoute(
      withdrawParent,
      withdrawLearner.email,
    );
    await post(
      '/v1/family-join/journey',
      {
        token: withdrawInvite.token,
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'decline',
      },
      withdrawLearner,
    );
    const withdrawn = await post(
      `/v1/family-join/invites/${withdrawInvite.inviteId}/withdraw`,
      {},
      withdrawParent,
    );
    expect(withdrawn.status).toBe(200);
    await expect(withdrawn.json()).resolves.toEqual({ status: 'withdrawn' });

    const wrongActor = await post(
      `/v1/family-join/invites/${withdrawInvite.inviteId}/withdraw`,
      {},
      decliningLearner,
    );
    expect(wrongActor.status).toBe(403);
  });
});
