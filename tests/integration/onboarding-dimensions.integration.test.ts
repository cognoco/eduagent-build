/**
 * Integration: Onboarding Dimensions (BKT-C.1 / BKT-C.2)
 *
 * Exercises the three PATCH /onboarding/* routes through the full app + real DB.
 * Validates:
 * 1. Happy path: update language, pronouns, interests for own profile
 * 2. Cross-account rejection: wrong accountId returns 404
 * 3. Parent updates child's dimensions via /:profileId/ variant
 * 4. Non-parent blocked from foreign child (403)
 *
 * Mocked boundaries:
 * - JWT verification
 */

import { eq } from 'drizzle-orm';
import {
  profiles,
  accounts,
  learningProfiles,
  familyLinks,
} from '@eduagent/database';

import { jwtMock, configureValidJWT } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';

const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const USER_A_CLERK_ID = 'integration-onb-dim-user-a';
const USER_A_EMAIL = 'integration-onb-dim-a@integration.test';
const USER_B_CLERK_ID = 'integration-onb-dim-user-b';
const USER_B_EMAIL = 'integration-onb-dim-b@integration.test';

function buildAuthHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

function setAuthUser(userId: string, email: string): void {
  configureValidJWT(jwt, { sub: userId, email });
}

async function createProfileForUser(
  userId: string,
  email: string,
  displayName: string,
  birthYear: number
): Promise<string> {
  setAuthUser(userId, email);
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ displayName, birthYear }),
    },
    TEST_ENV
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { profile: { id: string } };
  return body.profile.id;
}

/** Insert a child profile directly in the DB, bypassing the subscription-tier
 *  limit enforced by POST /v1/profiles. Returns the child profileId. */
async function createChildProfileDirect(
  parentProfileId: string,
  displayName: string,
  birthYear: number
): Promise<string> {
  const db = createIntegrationDb();
  // Look up accountId from the parent profile
  const [parent] = await db
    .select({ accountId: profiles.accountId })
    .from(profiles)
    .where(eq(profiles.id, parentProfileId));
  if (!parent) throw new Error(`Parent profile ${parentProfileId} not found`);

  const [child] = await db
    .insert(profiles)
    .values({ accountId: parent.accountId, displayName, birthYear })
    .returning({ id: profiles.id });
  return child!.id;
}

async function createFamilyLink(
  parentProfileId: string,
  childProfileId: string
): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(familyLinks).values({
    parentProfileId,
    childProfileId,
    role: 'parent',
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [USER_A_EMAIL, USER_B_EMAIL],
    clerkUserIds: [USER_A_CLERK_ID, USER_B_CLERK_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [USER_A_EMAIL, USER_B_EMAIL],
    clerkUserIds: [USER_A_CLERK_ID, USER_B_CLERK_ID],
  });
});

describe('Integration: Onboarding Dimensions PATCH routes', () => {
  // ---- Happy path: own profile updates ------------------------------------

  it('PATCH /onboarding/language updates conversationLanguage for own profile', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Language Tester',
      2010
    );

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({ conversationLanguage: 'cs' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify persisted in DB
    const db = createIntegrationDb();
    const [profile] = await db
      .select({ conversationLanguage: profiles.conversationLanguage })
      .from(profiles)
      .where(eq(profiles.id, profileId));
    expect(profile!.conversationLanguage).toBe('cs');
  });

  it('PATCH /onboarding/pronouns updates pronouns for own profile', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Pronouns Tester',
      2010
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const db = createIntegrationDb();
    const [profile] = await db
      .select({ pronouns: profiles.pronouns })
      .from(profiles)
      .where(eq(profiles.id, profileId));
    expect(profile!.pronouns).toBe('they/them');
  });

  it('PATCH /onboarding/interests/context updates interests for own profile', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Interests Tester',
      2010
    );

    const interests = [
      { label: 'Football', context: 'free_time' as const },
      { label: 'Mathematics', context: 'school' as const },
    ];

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({ interests }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify persisted in learning_profiles
    const db = createIntegrationDb();
    const [lp] = await db
      .select({ interests: learningProfiles.interests })
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, profileId));
    expect(lp).toBeDefined();
    const stored = lp!.interests as Array<{
      label: string;
      context: string;
    }>;
    expect(stored).toHaveLength(2);
    expect(stored[0]!.label).toBe('Football');
    expect(stored[1]!.context).toBe('school');
  });

  // ---- Cross-account rejection (negative-path / break test) ----------------

  it('returns 403 when PATCH /onboarding/language targets a profile owned by another account [SECURITY]', async () => {
    // User A creates a profile
    const profileA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Owner A',
      2010
    );

    // User B authenticates and tries to update User A's profile
    setAuthUser(USER_B_CLERK_ID, USER_B_EMAIL);
    // User B needs their own profile first (profile-scope middleware requires it)
    const profileB = await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000
    );

    // Now User B tries to update User A's language by sending User A's profileId
    // as the X-Profile-Id header. The profile-scope middleware should reject this
    // because profileA doesn't belong to User B's account.
    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileA),
        body: JSON.stringify({ conversationLanguage: 'de' }),
      },
      TEST_ENV
    );

    // Profile-scope middleware rejects foreign profileId with 403
    expect(res.status).toBe(403);

    // Verify the profile was NOT modified
    const db = createIntegrationDb();
    const [profile] = await db
      .select({ conversationLanguage: profiles.conversationLanguage })
      .from(profiles)
      .where(eq(profiles.id, profileA));
    // Default is 'en' (NOT NULL) — verify the attacker's PATCH didn't change it.
    expect(profile!.conversationLanguage).toBe('en');
  });

  it('returns 403 when PATCH /onboarding/pronouns targets a profile owned by another account [SECURITY]', async () => {
    const profileA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Owner A',
      2010
    );

    setAuthUser(USER_B_CLERK_ID, USER_B_EMAIL);
    await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileA),
        body: JSON.stringify({ pronouns: 'he/him' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);

    const db = createIntegrationDb();
    const [profile] = await db
      .select({ pronouns: profiles.pronouns })
      .from(profiles)
      .where(eq(profiles.id, profileA));
    expect(profile!.pronouns).toBeNull();
  });

  it('returns 404 when PATCH /onboarding/interests/context targets a profile owned by another account [SECURITY]', async () => {
    const profileA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Owner A',
      2010
    );

    setAuthUser(USER_B_CLERK_ID, USER_B_EMAIL);
    await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000
    );

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileA),
        body: JSON.stringify({
          interests: [{ label: 'Hacking', context: 'free_time' }],
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
  });

  // ---- Parent-on-behalf-of-child -------------------------------------------

  it('parent can PATCH /onboarding/:profileId/language for their linked child', async () => {
    // Create parent profile (User A)
    const parentProfileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Parent',
      1985
    );

    // Insert child directly in DB (bypasses subscription tier limit).
    const childProfileId = await createChildProfileDirect(
      parentProfileId,
      'Child',
      2014
    );
    await createFamilyLink(parentProfileId, childProfileId);

    // Parent updates child's language
    const res = await app.request(
      `/v1/onboarding/${childProfileId}/language`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(parentProfileId),
        body: JSON.stringify({ conversationLanguage: 'es' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);

    const db = createIntegrationDb();
    const [profile] = await db
      .select({ conversationLanguage: profiles.conversationLanguage })
      .from(profiles)
      .where(eq(profiles.id, childProfileId));
    expect(profile!.conversationLanguage).toBe('es');
  });

  it('non-parent cannot PATCH /onboarding/:profileId/language for an unlinked child (403)', async () => {
    // User A creates a child profile
    const parentA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Parent A',
      1985
    );
    // Insert child directly (bypasses subscription tier limit).
    const childProfileId = await createChildProfileDirect(
      parentA,
      'Child A',
      2014
    );

    // User B (no family link) tries to update the child
    const parentB = await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Stranger B',
      1990
    );

    const res = await app.request(
      `/v1/onboarding/${childProfileId}/language`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(parentB),
        body: JSON.stringify({ conversationLanguage: 'fr' }),
      },
      TEST_ENV
    );

    // assertParentAccess should reject — either 403 or 404
    expect([403, 404]).toContain(res.status);

    // Verify NOT modified
    const db = createIntegrationDb();
    const [profile] = await db
      .select({ conversationLanguage: profiles.conversationLanguage })
      .from(profiles)
      .where(eq(profiles.id, childProfileId));
    // Default is 'en' (NOT NULL) — verify the attacker's PATCH didn't change it.
    expect(profile!.conversationLanguage).toBe('en');
  });

  // ---- Validation -----------------------------------------------------------

  it('rejects invalid conversationLanguage value', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Validation Tester',
      2010
    );

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({ conversationLanguage: 'xx-invalid' }),
      },
      TEST_ENV
    );

    // Zod validation should reject
    expect(res.status).toBe(400);
  });

  it('rejects pronouns longer than 32 characters', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Long Pronouns',
      2010
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({ pronouns: 'a'.repeat(33) }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('rejects interests with empty label', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Empty Interest',
      2010
    );

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(profileId),
        body: JSON.stringify({
          interests: [{ label: '', context: 'free_time' }],
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  // ---- Unauthenticated access -----------------------------------------------

  it('returns 401 without authentication', async () => {
    const { configureInvalidJWT } = await import('./mocks');
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Unauth Test',
      2010
    );

    configureInvalidJWT(jwt);

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Profile-Id': profileId,
        },
        body: JSON.stringify({ conversationLanguage: 'en' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
