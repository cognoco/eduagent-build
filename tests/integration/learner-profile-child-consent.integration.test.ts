/**
 * Integration: WI-156 — Child consent gate on /v1/learner-profile/:profileId routes
 *
 * Validates:
 * 1. GET /v1/learner-profile/:childId → 200 when child consent is CONSENTED
 * 2. [BREAK] GET /v1/learner-profile/:childId → 403 when child consent is PENDING
 * 3. [BREAK] GET /v1/learner-profile/:childId → 403 when child consent is WITHDRAWN
 *
 * Seeding approach:
 * - Parent profile created via createProfileViaRoute (adult, birthYear=1985, no consent needed).
 * - Child profile inserted directly in DB (bypasses subscription-tier limit), isOwner=false.
 * - Family link inserted directly in DB.
 * - Consent state set directly via DB upsert.
 *
 * No internal mocks — real DB via doppler run -c dev DATABASE_URL.
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  consentStates,
  familyLinks,
  profiles,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders, createProfileViaRoute } from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const PARENT_USER = {
  userId: 'integration-wi156-parent-user',
  email: 'integration-wi156-parent@integration.test',
};

/** Creates a child profile row directly in the DB (bypasses sub-tier limit). */
async function createChildProfileDirect(
  parentProfileId: string,
  displayName: string,
  birthYear: number,
): Promise<string> {
  const db = createIntegrationDb();
  const [parent] = await db
    .select({ accountId: profiles.accountId })
    .from(profiles)
    .where(eq(profiles.id, parentProfileId));
  if (!parent) throw new Error(`Parent profile ${parentProfileId} not found`);

  const [child] = await db
    .insert(profiles)
    .values({
      accountId: parent.accountId,
      displayName,
      birthYear,
      isOwner: false,
    })
    .returning({ id: profiles.id });
  if (!child) throw new Error('Child profile insert returned no row');
  return child.id;
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  const db = createIntegrationDb();
  await db
    .insert(familyLinks)
    .values({ parentProfileId, childProfileId })
    .onConflictDoNothing();
}

async function setChildConsentStatus(
  childProfileId: string,
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN',
): Promise<void> {
  const db = createIntegrationDb();
  await db
    .delete(consentStates)
    .where(eq(consentStates.profileId, childProfileId));
  await db.insert(consentStates).values({
    profileId: childProfileId,
    consentType: 'GDPR',
    status,
    parentEmail: PARENT_USER.email,
    consentToken: `wi156-token-${childProfileId}-${status}`,
    respondedAt:
      status === 'CONSENTED' || status === 'WITHDRAWN' ? new Date() : null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PARENT_USER.email],
    clerkUserIds: [PARENT_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PARENT_USER.email],
    clerkUserIds: [PARENT_USER.userId],
  });
});

describe('Integration: WI-156 — learner-profile child consent gate', () => {
  it('GET /v1/learner-profile/:childId → 200 when child consent is CONSENTED', async () => {
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PARENT_USER,
      displayName: 'Parent Owner',
      birthYear: 1985,
    });

    const childProfileId = await createChildProfileDirect(
      parentProfile.id,
      'Consented Child',
      2012,
    );
    await seedFamilyLink(parentProfile.id, childProfileId);
    await setChildConsentStatus(childProfileId, 'CONSENTED');

    const res = await app.request(
      `/v1/learner-profile/${childProfileId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentProfile.id,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
  });

  it('[BREAK] GET /v1/learner-profile/:childId → 403 when child consent is PENDING', async () => {
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PARENT_USER,
      displayName: 'Parent Owner',
      birthYear: 1985,
    });

    const childProfileId = await createChildProfileDirect(
      parentProfile.id,
      'Pending Child',
      2012,
    );
    await seedFamilyLink(parentProfile.id, childProfileId);
    await setChildConsentStatus(childProfileId, 'PENDING');

    const res = await app.request(
      `/v1/learner-profile/${childProfileId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentProfile.id,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('[BREAK] GET /v1/learner-profile/:childId → 403 when child consent is WITHDRAWN', async () => {
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PARENT_USER,
      displayName: 'Parent Owner',
      birthYear: 1985,
    });

    const childProfileId = await createChildProfileDirect(
      parentProfile.id,
      'Withdrawn Child',
      2012,
    );
    await seedFamilyLink(parentProfile.id, childProfileId);
    await setChildConsentStatus(childProfileId, 'WITHDRAWN');

    const res = await app.request(
      `/v1/learner-profile/${childProfileId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentProfile.id,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});
