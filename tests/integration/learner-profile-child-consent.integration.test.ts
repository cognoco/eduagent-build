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
import { profiles } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
  setProfileConsentStatusForTest,
} from './route-fixtures';

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

  const child = await seedDirectChildProfileForTest({
    parentProfileId,
    accountId: parent.accountId,
    displayName,
    birthYear,
  });
  return child.id;
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await seedFamilyLinkForTest({ parentProfileId, childProfileId });
}

async function setChildConsentStatus(
  childProfileId: string,
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN',
): Promise<void> {
  const db = createIntegrationDb();
  const [child] = await db
    .select({ accountId: profiles.accountId })
    .from(profiles)
    .where(eq(profiles.id, childProfileId));
  if (!child) throw new Error(`Child profile ${childProfileId} not found`);

  await setProfileConsentStatusForTest({
    profileId: childProfileId,
    accountId: child.accountId,
    status,
    parentEmail: PARENT_USER.email,
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
    const body = (await res.json()) as {
      profile: { profileId: string };
    };
    expect(body.profile.profileId).toBe(childProfileId);
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

  // [WI-82] Erasure/disable routes must NOT be consent-gated: a parent must be
  // able to exercise GDPR erasure (DELETE /all) even after withdrawing consent.
  // Conversely, new-processing routes (POST /tell) must still 403.
  it('[WI-82] DELETE /v1/learner-profile/:childId/all → NOT 403 when child consent is WITHDRAWN (erasure allowed)', async () => {
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PARENT_USER,
      displayName: 'Parent Owner',
      birthYear: 1985,
    });

    const childProfileId = await createChildProfileDirect(
      parentProfile.id,
      'Erasure Child',
      2012,
    );
    await seedFamilyLink(parentProfile.id, childProfileId);
    await setChildConsentStatus(childProfileId, 'WITHDRAWN');

    const res = await app.request(
      `/v1/learner-profile/${childProfileId}/all`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentProfile.id,
        ),
      },
      TEST_ENV,
    );

    // Must NOT be 403 from the consent gate. Any success status (200/204) is
    // acceptable — there is no learning profile to delete, so the service
    // returns success having deleted 0 rows.
    expect(res.status).not.toBe(403);
    expect(res.status).toBeLessThan(500);
  });

  it('[WI-82] POST /v1/learner-profile/:childId/tell → 403 when child consent is WITHDRAWN (new processing still blocked)', async () => {
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PARENT_USER,
      displayName: 'Parent Owner',
      birthYear: 1985,
    });

    const childProfileId = await createChildProfileDirect(
      parentProfile.id,
      'Tell Child',
      2012,
    );
    await seedFamilyLink(parentProfile.id, childProfileId);
    await setChildConsentStatus(childProfileId, 'WITHDRAWN');

    const res = await app.request(
      `/v1/learner-profile/${childProfileId}/tell`,
      {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(
            { sub: PARENT_USER.userId, email: PARENT_USER.email },
            parentProfile.id,
          ),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'likes drawing' }),
      },
      TEST_ENV,
    );

    // POST /tell is new processing — consent gate must still block it.
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});
