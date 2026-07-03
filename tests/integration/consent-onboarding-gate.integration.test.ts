/**
 * Integration: WI-130 — Consent gate on /v1/onboarding mutating methods
 *
 * Validates:
 * 1. [BREAK] PATCH /v1/onboarding/pronouns → 403 for PENDING minor
 * 2. [BREAK] PATCH /v1/onboarding/pronouns → 403 for WITHDRAWN minor
 * 3. PATCH /v1/onboarding/pronouns → 200 for CONSENTED minor
 * 4. GET /v1/onboarding/* (no real GET route exists, but the helper should not
 *    block a GET — verified via a 404, not a 403, since the route doesn't exist)
 *
 * Seeding approach:
 * - createProfileViaRoute creates a minor (birthYear=2012, age≈14) profile.
 *   The profile route auto-creates a PENDING consent row for minors.
 * - For WITHDRAWN / CONSENTED we directly upsert the consent_states row.
 *
 * No internal mocks — real DB via doppler run -c dev DATABASE_URL.
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  resolveAccountId,
  setProfileConsentStatusForTest,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const USER = {
  userId: 'integration-wi130-consent-user',
  email: 'integration-wi130-consent@integration.test',
};

/** Birth year that puts the learner at age ~14 (requires GDPR consent). */
const MINOR_BIRTH_YEAR = 2012;

async function setConsentStatus(
  profileId: string,
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN',
): Promise<void> {
  const db = createIntegrationDb();
  const accountId = await resolveAccountId(db, profileId);
  if (!accountId) throw new Error(`Profile ${profileId} not found`);

  await setProfileConsentStatusForTest({
    profileId,
    accountId,
    status,
    parentEmail: 'parent@wi130.test.invalid',
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

describe('Integration: WI-130 — onboarding PATCH consent gate', () => {
  it('[BREAK] PATCH /v1/onboarding/pronouns → 403 for PENDING minor', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'Minor Pending',
      birthYear: MINOR_BIRTH_YEAR,
    });

    // Profile creation auto-inserts PENDING for minors; ensure it's set.
    await setConsentStatus(profile.id, 'PENDING');

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          profile.id,
        ),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  it('[BREAK] PATCH /v1/onboarding/pronouns → 403 for WITHDRAWN minor', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'Minor Withdrawn',
      birthYear: MINOR_BIRTH_YEAR,
    });

    await setConsentStatus(profile.id, 'WITHDRAWN');

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          profile.id,
        ),
        body: JSON.stringify({ pronouns: 'he/him' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_WITHDRAWN');
  });

  it('PATCH /v1/onboarding/pronouns → 200 for CONSENTED minor', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'Minor Consented',
      birthYear: MINOR_BIRTH_YEAR,
    });

    await setConsentStatus(profile.id, 'CONSENTED');

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

  it('GET /v1/onboarding/* is not blocked (returns 404 — no route defined, not 403)', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER,
      displayName: 'Minor Pending GET',
      birthYear: MINOR_BIRTH_YEAR,
    });

    await setConsentStatus(profile.id, 'PENDING');

    // No GET route exists under /v1/onboarding — expect 404, not 403.
    // 404 proves the consent gate did NOT block the request (it passed the
    // exempt check) and the router simply has no matching handler.
    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: USER.userId, email: USER.email },
          profile.id,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
  });
});
