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

const TEST_ENV = {
  ...buildIntegrationEnv(),
  FAMILY_JOIN_ENABLED: 'true',
};

const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

const RUN_ID = randomUUID();
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
  path: '/v1/family-join/invite' | '/v1/family-join/accept',
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

beforeAll(() => {
  db = createIntegrationDb();
});

beforeEach(() => {
  clearJWKSCache();
  __resetFamilyJoinInviteRateLimit();
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(() => {
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
    await expect(response.json()).resolves.toEqual({
      familyOrgId: parent.organizationId,
      alreadyMember: false,
      storeCancelNudge: null,
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
});
