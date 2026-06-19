/**
 * Integration: WI-278 — Server-side age gate on PATCH /v1/onboarding/pronouns (SELF route)
 *
 * Validates:
 * 1. [BREAK] PATCH /v1/onboarding/pronouns → 403 for CONSENTED profile with age < 13
 *    (consent check passes, AGE gate must still block)
 * 2. PATCH /v1/onboarding/pronouns → 200 for CONSENTED profile with age >= 13
 * 3. PATCH /v1/onboarding/:profileId/pronouns (parent-on-behalf route) is unaffected
 *    by the age gate — under-13 children can still have pronouns set by a parent.
 *
 * Seeding approach:
 * - createProfileViaRoute creates a CONSENTED adult profile (the test user's owner profile).
 * - We then directly insert a CONSENTED child profile (age < 13) to test the age gate.
 *   The child profile uses the same account/JWT (owner calling SELF route for their own
 *   child profile via X-Profile-Id header).
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

const USER = {
  userId: 'integration-wi278-age-gate-user',
  email: 'integration-wi278-age-gate@integration.test',
};

/** Birth year making age exactly 13 by year-only (the boundary case) */
function birthYearAge(age: number): number {
  return new Date().getUTCFullYear() - age;
}

/**
 * Force consent to CONSENTED for a profile so the consent middleware passes,
 * isolating only the age gate check.
 */
async function forceConsented(profileId: string): Promise<void> {
  const db = createIntegrationDb();
  const [profile] = await db
    .select({ accountId: profiles.accountId })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  if (!profile) throw new Error(`Profile ${profileId} not found`);

  await setProfileConsentStatusForTest({
    profileId,
    accountId: profile.accountId,
    status: 'CONSENTED',
    parentEmail: 'parent@wi278.test.invalid',
  });
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [USER.email],
    clerkUserIds: [USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [USER.email],
    clerkUserIds: [USER.userId],
  });
});

describe('Integration: WI-278 — pronouns SELF route age gate', () => {
  it('[break-test] PATCH /v1/onboarding/pronouns → 403 for CONSENTED profile with age < 13 (year-only=12)', async () => {
    // Create the owner profile (adult) so the account exists
    const ownerProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'WI278 Owner',
      birthYear: birthYearAge(30),
    });

    // Insert a child profile directly (age 12 — below PRONOUNS_PROMPT_MIN_AGE=13).
    // birthYearAge(12) = currentYear - 12, which gives year-only age 12.
    const db = createIntegrationDb();
    const child = await seedDirectChildProfileForTest({
      parentProfileId: ownerProfile.id,
      accountId: ownerProfile.accountId,
      displayName: 'WI278 Child Under13',
      birthYear: birthYearAge(12),
    });
    const childId = child.id;

    // Set child consent to CONSENTED so the consent middleware passes —
    // we want to isolate the AGE gate specifically.
    await forceConsented(childId);

    // The child profile belongs to the same account — self-route with X-Profile-Id.
    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          childId,
        ),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV,
    );

    // The server-side age gate must reject with 403 FORBIDDEN.
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('PATCH /v1/onboarding/pronouns → 200 for CONSENTED profile with age >= 13', async () => {
    // birthYearAge(14) = currentYear - 14, year-only age 14 — above the gate.
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'WI278 Teen 14',
      birthYear: birthYearAge(14),
    });

    await forceConsented(profile.id);

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          profile.id,
        ),
        body: JSON.stringify({ pronouns: 'she/her' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('PATCH /v1/onboarding/:profileId/pronouns (parent-managed) is NOT blocked by age gate', async () => {
    // A parent (owner) can set pronouns for an under-13 child via the parent route.
    const parentProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'WI278 Parent',
      birthYear: birthYearAge(35),
    });

    // Insert child under-13 on same account.
    const child = await seedDirectChildProfileForTest({
      parentProfileId: parentProfile.id,
      accountId: parentProfile.accountId,
      displayName: 'WI278 Child for Parent Route',
      birthYear: birthYearAge(10),
    });
    const childId = child.id;

    // Create family link so assertOwnerAndParentAccess passes.
    await seedFamilyLinkForTest({
      parentProfileId: parentProfile.id,
      childProfileId: childId,
    });

    // Set child consent to CONSENTED.
    await forceConsented(childId);

    // Parent calls /v1/onboarding/:childId/pronouns — this route has no age gate.
    const res = await app.request(
      `/v1/onboarding/${childId}/pronouns`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          parentProfile.id,
        ),
        body: JSON.stringify({ pronouns: 'she/her' }),
      },
      TEST_ENV,
    );

    // Parent-managed route should succeed regardless of child's age.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
