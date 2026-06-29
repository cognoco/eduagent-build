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
 * - JWT verification (real RS256 via fetch interceptor in setup.ts)
 */

import { eq } from 'drizzle-orm';
import { learningProfiles, person, profiles } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
  isIdentityV2Enabled,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import {
  resolveAccountId,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';
import { unwrapDbError } from '../../apps/api/src/services/db-errors';

const TEST_ENV = buildIntegrationEnv();

const USER_A_CLERK_ID = 'integration-onb-dim-user-a';
const USER_A_EMAIL = 'integration-onb-dim-a@integration.test';
const USER_B_CLERK_ID = 'integration-onb-dim-user-b';
const USER_B_EMAIL = 'integration-onb-dim-b@integration.test';

async function createProfileForUser(
  userId: string,
  email: string,
  displayName: string,
  birthYear: number,
): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: userId, email }),
      body: JSON.stringify({ displayName, birthYear }),
    },
    TEST_ENV,
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
  birthYear: number,
): Promise<string> {
  const db = createIntegrationDb();
  // [WI-1145] Resolve the parent's org/account v2-first (membership) then legacy
  // `profiles` — the parent is route-created, which writes v2 unconditionally
  // post-WI-867 collapse (legacy `profiles` empty on the flag-off main lane).
  const accountId = await resolveAccountId(db, parentProfileId);
  if (!accountId)
    throw new Error(`Parent profile ${parentProfileId} not found`);

  const child = await seedDirectChildProfileForTest({
    parentProfileId,
    accountId,
    displayName,
    birthYear,
  });
  return child.id;
}

async function createFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await seedFamilyLinkForTest({
    parentProfileId,
    childProfileId,
  });
}

async function readConversationLanguage(profileId: string): Promise<string> {
  const db = createIntegrationDb();
  // [WI-1145] The PATCH /onboarding/language route is flag-honoring (dispatches to
  // the v2 `person` writer on flag-on, the legacy `profiles` writer on flag-off —
  // onboarding.ts), and the create route dual-writes both stores, so read the store
  // the PATCH actually wrote: v2 `person` on flag-on, legacy `profiles` on flag-off.
  if (isIdentityV2Enabled()) {
    const [profile] = await db
      .select({ conversationLanguage: person.conversationLanguage })
      .from(person)
      .where(eq(person.id, profileId));
    return profile!.conversationLanguage;
  }

  const [profile] = await db
    .select({ conversationLanguage: profiles.conversationLanguage })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  return profile!.conversationLanguage;
}

async function readPronouns(profileId: string): Promise<string | null> {
  const db = createIntegrationDb();
  // [WI-1145] Flag-honoring read mirror of the PATCH /onboarding/pronouns writer
  // (v2 `person` on flag-on, legacy `profiles` on flag-off — onboarding.ts).
  if (isIdentityV2Enabled()) {
    const [profile] = await db
      .select({ pronouns: person.pronouns })
      .from(person)
      .where(eq(person.id, profileId));
    return profile!.pronouns;
  }

  const [profile] = await db
    .select({ pronouns: profiles.pronouns })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  return profile!.pronouns;
}

beforeEach(async () => {
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
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ conversationLanguage: 'cs' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    expect(await readConversationLanguage(profileId)).toBe('cs');
  });

  it('PATCH /onboarding/pronouns updates pronouns for own profile', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Pronouns Tester',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    expect(await readPronouns(profileId)).toBe('they/them');
  });

  it('PATCH /onboarding/interests/context updates interests for own profile', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Interests Tester',
      2000,
    );

    const interests = [
      { label: 'Football', context: 'free_time' as const },
      { label: 'Mathematics', context: 'school' as const },
    ];

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ interests }),
      },
      TEST_ENV,
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
    expect(lp).not.toBeUndefined();
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
      2010,
    );

    // User B needs their own profile first (profile-scope middleware requires it)
    await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000,
    );

    // Now User B tries to update User A's language by sending User A's profileId
    // as the X-Profile-Id header. The profile-scope middleware should reject this
    // because profileA doesn't belong to User B's account.
    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_B_CLERK_ID, email: USER_B_EMAIL },
          profileA,
        ),
        body: JSON.stringify({ conversationLanguage: 'de' }),
      },
      TEST_ENV,
    );

    // Profile-scope middleware rejects foreign profileId with 403
    expect(res.status).toBe(403);

    // Default is 'en' (NOT NULL) — verify the attacker's PATCH didn't change it.
    expect(await readConversationLanguage(profileA)).toBe('en');
  });

  it('returns 403 when PATCH /onboarding/pronouns targets a profile owned by another account [SECURITY]', async () => {
    const profileA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Owner A',
      2010,
    );

    await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_B_CLERK_ID, email: USER_B_EMAIL },
          profileA,
        ),
        body: JSON.stringify({ pronouns: 'he/him' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);

    expect(await readPronouns(profileA)).toBeNull();
  });

  it('returns 404 when PATCH /onboarding/interests/context targets a profile owned by another account [SECURITY]', async () => {
    const profileA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Owner A',
      2010,
    );

    await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Attacker B',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_B_CLERK_ID, email: USER_B_EMAIL },
          profileA,
        ),
        body: JSON.stringify({
          interests: [{ label: 'Hacking', context: 'free_time' }],
        }),
      },
      TEST_ENV,
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
      1985,
    );

    // Insert child directly in DB (bypasses subscription tier limit).
    const childProfileId = await createChildProfileDirect(
      parentProfileId,
      'Child',
      2014,
    );
    await createFamilyLink(parentProfileId, childProfileId);

    // Parent updates child's language
    const res = await app.request(
      `/v1/onboarding/${childProfileId}/language`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          parentProfileId,
        ),
        body: JSON.stringify({ conversationLanguage: 'es' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    expect(await readConversationLanguage(childProfileId)).toBe('es');
  });

  it('non-parent cannot PATCH /onboarding/:profileId/language for an unlinked child (403)', async () => {
    // User A creates a child profile
    const parentA = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Parent A',
      1985,
    );
    // Insert child directly (bypasses subscription tier limit).
    const childProfileId = await createChildProfileDirect(
      parentA,
      'Child A',
      2014,
    );

    // User B (no family link) tries to update the child
    const parentB = await createProfileForUser(
      USER_B_CLERK_ID,
      USER_B_EMAIL,
      'Stranger B',
      1990,
    );

    const res = await app.request(
      `/v1/onboarding/${childProfileId}/language`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_B_CLERK_ID, email: USER_B_EMAIL },
          parentB,
        ),
        body: JSON.stringify({ conversationLanguage: 'fr' }),
      },
      TEST_ENV,
    );

    // assertParentAccess should reject — either 403 or 404
    expect([403, 404]).toContain(res.status);

    // Default is 'en' (NOT NULL) — verify the attacker's PATCH didn't change it.
    expect(await readConversationLanguage(childProfileId)).toBe('en');
  });

  // ---- Validation -----------------------------------------------------------

  it('rejects invalid conversationLanguage value', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Validation Tester',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ conversationLanguage: 'xx-invalid' }),
      },
      TEST_ENV,
    );

    // Zod validation should reject
    expect(res.status).toBe(400);
  });

  it('rejects pronouns longer than 32 characters', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Long Pronouns',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ pronouns: 'a'.repeat(33) }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  // [BREAK / BUG-978 / CCR-PR123-DB-1] Direct DB write that bypasses the API
  // layer must still be rejected by the profiles_pronouns_length_check
  // constraint. The Zod schema is the primary boundary; this CHECK is the
  // last-resort guard for paths that bypass the API (raw SQL, seed scripts,
  // admin patches). Without the CHECK, a 33-char string would land in the row.
  it('[BREAK] Postgres CHECK rejects pronouns > 32 chars on direct DB write', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Direct DB Bypass',
      2010,
    );

    const db = createIntegrationDb();
    // drizzle >=0.44 wraps the driver error in a DrizzleQueryError whose message
    // is "Failed query: …"; the Postgres CHECK constraint name lives on the
    // unwrapped driver error, not the wrapper. Unwrap before asserting (same
    // helper the production 23505 handlers use).
    const rejection = await Promise.resolve(
      db
        .update(profiles)
        .set({ pronouns: 'a'.repeat(33) })
        .where(eq(profiles.id, profileId)),
    ).then(
      () => {
        throw new Error(
          'expected pronouns CHECK to reject a 33-char write, but the UPDATE succeeded',
        );
      },
      (error: unknown) => error,
    );
    const driverError = unwrapDbError(rejection) as { message?: string };
    expect(driverError.message ?? '').toMatch(/profiles_pronouns_length_check/);

    // Sanity: 32 chars exactly is allowed.
    await db
      .update(profiles)
      .set({ pronouns: 'a'.repeat(32) })
      .where(eq(profiles.id, profileId));
    const [row] = await db
      .select({ pronouns: profiles.pronouns })
      .from(profiles)
      .where(eq(profiles.id, profileId));
    expect(row!.pronouns).toBe('a'.repeat(32));
  });

  it('rejects interests with empty label', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Empty Interest',
      2000,
    );

    const res = await app.request(
      '/v1/onboarding/interests/context',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A_CLERK_ID, email: USER_A_EMAIL },
          profileId,
        ),
        body: JSON.stringify({
          interests: [{ label: '', context: 'free_time' }],
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  // ---- Unauthenticated access -----------------------------------------------

  it('returns 401 without authentication', async () => {
    const profileId = await createProfileForUser(
      USER_A_CLERK_ID,
      USER_A_EMAIL,
      'Unauth Test',
      2010,
    );

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
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
