/**
 * WI-2128 — joined learner credentials stay bound to their own Person.
 *
 * This is the durable real-database regression for the authority-substitution
 * bug. It creates two independent Clerk subjects and org-of-one identity
 * graphs, runs the real family-join transaction, then exercises the real
 * JWT → accountMiddleware → profileScopeMiddleware → route chain.
 *
 * Named failure mode: after the learner membership moves into the family org,
 * a headerless request must resolve login.person_id (the learner), never the
 * organization's admin/owner Person.
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  familyJoinInvite,
  guardianship,
  learningSessions,
  login,
  membership,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';

import { app } from '../../apps/api/src/index';
import { getSubscriptionByAccountIdV2 } from '../../apps/api/src/services/billing/billing-v2';
import { acceptFamilyJoin } from '../../apps/api/src/services/identity-v2/family-join-v2';
import { createIdentityGraph } from '../../apps/api/src/services/identity-v2/identity-graph';
import {
  createSubjectWithCurriculum,
  insertSessionWithRecap,
} from '../../apps/api/src/services/test-seed';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  requireDatabaseUrl,
} from './helpers';
import { clearFetchCalls } from './fetch-interceptor';
import { mockInngestEvents } from './mocks';
import { buildAuthHeaders } from './test-keys';

const TEST_ENV = buildIntegrationEnv();
const RUN_ID = randomUUID();
const CURRENT_YEAR = new Date().getUTCFullYear();

const OWNER_CLERK_ID = `wi2128-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi2128-owner-${RUN_ID}@integration.test`;
const LEARNER_CLERK_ID = `wi2128-learner-${RUN_ID}`;
const LEARNER_EMAIL = `wi2128-learner-${RUN_ID}@integration.test`;
const SIBLING_CLERK_ID = `wi2128-sibling-${RUN_ID}`;
const SIBLING_EMAIL = `wi2128-sibling-${RUN_ID}@integration.test`;
const OUTSIDER_CLERK_ID = `wi2128-outsider-${RUN_ID}`;
const OUTSIDER_EMAIL = `wi2128-outsider-${RUN_ID}@integration.test`;

interface IdentityFixture {
  ownerPersonId: string;
  learnerPersonId: string;
  siblingPersonId: string;
  managedChargePersonId: string;
  outsiderPersonId: string;
  familyOrgId: string;
  familySubscriptionId: string;
  learnerHistorySessionId: string;
  inviteId: string;
}

let db: Database;
let fixture: IdentityFixture;

async function createGraph(input: {
  clerkUserId: string;
  email: string;
  displayName: string;
  birthYear: number;
}) {
  return createIdentityGraph(db, {
    clerkUserId: input.clerkUserId,
    verifiedEmail: input.email,
    displayName: input.displayName,
    birthYear: input.birthYear,
    location: 'EU',
    conversationLanguage: 'en',
    pronouns: null,
    avatarUrl: null,
    timezone: 'Europe/Oslo',
    consentPolicyVersion: 'wi2128-integration',
  });
}

async function requestAs(input: {
  clerkUserId: string;
  email: string;
  path: string;
  profileId?: string;
  method?: string;
  body?: unknown;
  fva?: [number, number];
}) {
  return app.request(
    input.path,
    {
      method: input.method ?? 'GET',
      headers: buildAuthHeaders(
        {
          sub: input.clerkUserId,
          email: input.email,
          ...(input.fva ? { fva: input.fva } : {}),
        },
        input.profileId,
      ),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    },
    TEST_ENV,
  );
}

beforeAll(async () => {
  mockInngestEvents();
  db = createDatabase(requireDatabaseUrl());

  await cleanupAccounts({
    emails: [OWNER_EMAIL, LEARNER_EMAIL, SIBLING_EMAIL, OUTSIDER_EMAIL],
    clerkUserIds: [
      OWNER_CLERK_ID,
      LEARNER_CLERK_ID,
      SIBLING_CLERK_ID,
      OUTSIDER_CLERK_ID,
    ],
  });

  const owner = await createGraph({
    clerkUserId: OWNER_CLERK_ID,
    email: OWNER_EMAIL,
    displayName: 'WI-2128 Owner',
    birthYear: 1985,
  });
  const learner = await createGraph({
    clerkUserId: LEARNER_CLERK_ID,
    email: LEARNER_EMAIL,
    displayName: 'WI-2128 Joined Learner',
    birthYear: CURRENT_YEAR - 18,
  });
  const outsider = await createGraph({
    clerkUserId: OUTSIDER_CLERK_ID,
    email: OUTSIDER_EMAIL,
    displayName: 'WI-2128 Outsider',
    birthYear: 1990,
  });

  const familySubscription = await getSubscriptionByAccountIdV2(
    db,
    owner.organizationId,
  );
  if (!familySubscription) {
    throw new Error('Owner graph did not provision a family subscription.');
  }
  await db
    .update(subscription)
    .set({ planTier: 'family', status: 'active' })
    .where(eq(subscription.id, familySubscription.id));

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    learner.personId,
    'WI-2128 stable learner history',
  );
  const { sessionId: learnerHistorySessionId } = await insertSessionWithRecap(
    db,
    {
      profileId: learner.personId,
      subjectId,
      topicId: topicIds[0]!,
      recapContent: 'WI-2128 person-scoped history survives family join.',
    },
  );

  const inviteToken = randomUUID();
  const [invite] = await db
    .insert(familyJoinInvite)
    .values({
      inviterPersonId: owner.personId,
      familyOrgId: owner.organizationId,
      invitedEmail: LEARNER_EMAIL,
      status: 'pending',
      token: inviteToken,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning({ id: familyJoinInvite.id });
  if (!invite) throw new Error('Family-join invite insert returned no row.');

  await acceptFamilyJoin(db, {
    teenPersonId: learner.personId,
    inviteId: invite.id,
    inviteToken,
    familyOrgId: owner.organizationId,
    parentPersonId: owner.personId,
    optInSupportership: true,
  });

  const [sibling] = await db
    .insert(person)
    .values({
      displayName: 'WI-2128 Credentialed Sibling',
      birthDate: `${CURRENT_YEAR - 19}-01-01`,
      residenceJurisdiction: 'EU',
      conversationLanguage: 'en',
    })
    .returning({ id: person.id });
  if (!sibling) throw new Error('Credentialed sibling insert returned no row.');
  await db.insert(login).values({
    personId: sibling.id,
    clerkUserId: SIBLING_CLERK_ID,
    email: SIBLING_EMAIL,
  });
  await db.insert(membership).values({
    personId: sibling.id,
    organizationId: owner.organizationId,
    roles: ['learner'],
  });
  await db.insert(guardianship).values({
    guardianPersonId: owner.personId,
    chargePersonId: sibling.id,
  });

  const [managedCharge] = await db
    .insert(person)
    .values({
      displayName: 'WI-2128 Managed Charge',
      birthDate: `${CURRENT_YEAR - 13}-01-01`,
      residenceJurisdiction: 'EU',
      conversationLanguage: 'en',
    })
    .returning({ id: person.id });
  if (!managedCharge) throw new Error('Managed charge insert returned no row.');
  await db.insert(membership).values({
    personId: managedCharge.id,
    organizationId: owner.organizationId,
    roles: ['learner'],
  });
  await db.insert(guardianship).values({
    guardianPersonId: owner.personId,
    chargePersonId: managedCharge.id,
  });

  fixture = {
    ownerPersonId: owner.personId,
    learnerPersonId: learner.personId,
    siblingPersonId: sibling.id,
    managedChargePersonId: managedCharge.id,
    outsiderPersonId: outsider.personId,
    familyOrgId: owner.organizationId,
    familySubscriptionId: familySubscription.id,
    learnerHistorySessionId,
    inviteId: invite.id,
  };
  clearFetchCalls();
});

describe('WI-2128 joined-learner credential authority', () => {
  afterAll(async () => {
    if (db && fixture?.inviteId) {
      await db
        .delete(familyJoinInvite)
        .where(eq(familyJoinInvite.id, fixture.inviteId));
    }
    await cleanupAccounts({
      emails: [OWNER_EMAIL, LEARNER_EMAIL, SIBLING_EMAIL, OUTSIDER_EMAIL],
      clerkUserIds: [
        OWNER_CLERK_ID,
        LEARNER_CLERK_ID,
        SIBLING_CLERK_ID,
        OUTSIDER_CLERK_ID,
      ],
    });
  });

  it('[MANDATORY][RED-GREEN-REVERT] resolves a headerless learner request to the learner Person, never the family owner', async () => {
    const response = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/learner-profile',
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(fixture.ownerPersonId);
  });

  it('keeps the owner credential bound to the owner on the same headerless route', async () => {
    const response = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: '/v1/learner-profile',
    });

    expect(response.status).toBe(200);
  });

  it('returns only profiles the authenticated learner may operate and retains the owner managed-charge set', async () => {
    const learnerResponse = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/profiles',
    });
    expect(learnerResponse.status).toBe(200);
    const learnerBody = (await learnerResponse.json()) as {
      profiles: Array<{ id: string }>;
    };
    expect(learnerBody.profiles.map((profile) => profile.id)).toEqual([
      fixture.learnerPersonId,
    ]);

    const ownerResponse = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: '/v1/profiles',
    });
    expect(ownerResponse.status).toBe(200);
    const ownerBody = (await ownerResponse.json()) as {
      profiles: Array<{ id: string }>;
    };
    expect(ownerBody.profiles.map((profile) => profile.id).sort()).toEqual(
      [fixture.ownerPersonId, fixture.managedChargePersonId].sort(),
    );
  });

  it.each([
    ['family owner', () => fixture.ownerPersonId],
    ['credentialed sibling', () => fixture.siblingPersonId],
    ['unrelated Person', () => fixture.outsiderPersonId],
  ])(
    'fails closed when the learner supplies X-Profile-Id for the %s',
    async (_label, profileId) => {
      const response = await requestAs({
        clerkUserId: LEARNER_CLERK_ID,
        email: LEARNER_EMAIL,
        path: '/v1/learner-profile',
        profileId: profileId(),
      });

      expect(response.status).toBe(403);
    },
  );

  it('accepts the learner own header and preserves guardian operation of an uncredentialed managed charge', async () => {
    const learnerResponse = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/learner-profile',
      profileId: fixture.learnerPersonId,
    });
    expect(learnerResponse.status).toBe(200);

    const ownerResponse = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: '/v1/learner-profile',
      profileId: fixture.managedChargePersonId,
    });
    expect(ownerResponse.status).toBe(200);
  });

  it('[MANDATORY][WI-2128] allows a joined learner self-write while rejecting guardian proxy writes', async () => {
    const learnerResponse = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/settings/notifications',
      profileId: fixture.learnerPersonId,
      method: 'PUT',
      body: {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: false,
      },
    });
    expect(learnerResponse.status).toBe(200);

    const ownerProxyResponse = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: '/v1/settings/notifications',
      profileId: fixture.managedChargePersonId,
      method: 'PUT',
      body: {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: false,
      },
    });
    expect(ownerProxyResponse.status).toBe(403);
  });

  it('[WI-2128] rejects an owner guardianship capability when the charge has credentials', async () => {
    const response = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: '/v1/learner-profile',
      profileId: fixture.siblingPersonId,
    });

    expect(response.status).toBe(403);
  });

  it('[MANDATORY][WI-2128] does not disclose the owner through a learner profile-create replay', async () => {
    const response = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/profiles',
      profileId: fixture.learnerPersonId,
      method: 'POST',
      body: {
        displayName: 'WI-2128 replay probe',
        birthYear: CURRENT_YEAR - 18,
        location: 'EU',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(fixture.ownerPersonId);
  });

  it('fails closed on a non-owned profile route parameter while preserving guardian access', async () => {
    const learnerResponse = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: `/v1/profiles/${fixture.managedChargePersonId}`,
    });
    expect(learnerResponse.status).toBe(403);

    const ownerResponse = await requestAs({
      clerkUserId: OWNER_CLERK_ID,
      email: OWNER_EMAIL,
      path: `/v1/profiles/${fixture.managedChargePersonId}`,
    });
    expect(ownerResponse.status).toBe(200);
  });

  it('does not let the learner fresh-factor token elevate into the owner Person', async () => {
    const response = await requestAs({
      clerkUserId: LEARNER_CLERK_ID,
      email: LEARNER_EMAIL,
      path: '/v1/profiles/switch',
      profileId: fixture.learnerPersonId,
      method: 'POST',
      body: { profileId: fixture.ownerPersonId },
      fva: [0, -1],
    });

    expect(response.status).toBe(403);
  });

  it('preserves Person, history, family membership, supportership, and billing relationships across the join', async () => {
    const learnerLogin = await db.query.login.findFirst({
      where: eq(login.clerkUserId, LEARNER_CLERK_ID),
    });
    expect(learnerLogin?.personId).toBe(fixture.learnerPersonId);

    const learnerMembership = await db.query.membership.findFirst({
      where: eq(membership.personId, fixture.learnerPersonId),
    });
    expect(learnerMembership).toMatchObject({
      organizationId: fixture.familyOrgId,
      roles: ['learner'],
    });

    const history = await db.query.learningSessions.findFirst({
      where: and(
        eq(learningSessions.id, fixture.learnerHistorySessionId),
        eq(learningSessions.profileId, fixture.learnerPersonId),
      ),
    });
    expect(history).toBeDefined();

    const edge = await db.query.supportership.findFirst({
      where: and(
        eq(supportership.supporterPersonId, fixture.ownerPersonId),
        eq(supportership.supporteePersonId, fixture.learnerPersonId),
      ),
    });
    expect(edge?.revokedAt).toBeNull();

    const familySubscription = await db.query.subscription.findFirst({
      where: eq(subscription.id, fixture.familySubscriptionId),
    });
    expect(familySubscription).toMatchObject({
      organizationId: fixture.familyOrgId,
      payerPersonId: fixture.ownerPersonId,
      planTier: 'family',
      status: 'active',
    });
  });
});
