/**
 * Integration: Profile Isolation (P0-006)
 *
 * Exercises the real profile-scope middleware through the full app + real DB.
 * JWT verification is the only mocked boundary in this suite.
 *
 * Validates:
 * 1. X-Profile-Id for an owned profile returns that profile's scoped subjects
 * 2. X-Profile-Id for another account's profile returns 403
 * 3. Missing X-Profile-Id auto-resolves to the owner profile
 * 4. Explicitly selecting a second profile routes downstream reads correctly
 * 5. Fabricated profile IDs are rejected
 */

import { eq } from 'drizzle-orm';
import { subjects, profiles, subscriptions } from '@eduagent/database';

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

const PRIMARY_USER_ID = 'integration-profile-primary';
const PRIMARY_EMAIL = 'integration-profile-primary@integration.test';
const SECONDARY_USER_ID = 'integration-profile-secondary';
const SECONDARY_EMAIL = 'integration-profile-secondary@integration.test';
const FABRICATED_PROFILE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildAuthHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

function setAuthUser(userId: string, email: string): void {
  configureValidJWT(jwt, {
    sub: userId,
    email,
  });
}

async function createProfile(input: {
  userId: string;
  email: string;
  displayName: string;
  birthYear: number;
}): Promise<{
  id: string;
  isOwner: boolean;
}> {
  setAuthUser(input.userId, input.email);

  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        displayName: input.displayName,
        birthYear: input.birthYear,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile as { id: string; isOwner: boolean };
}

async function seedSubject(
  profileId: string,
  name: string
): Promise<{ id: string; profileId: string; name: string }> {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return {
    id: subject!.id,
    profileId: subject!.profileId,
    name: subject!.name,
  };
}

/**
 * Seeds a family-tier subscription so the billing guard allows
 * non-first profile creation on this account.
 */
async function seedFamilySubscription(profileId: string) {
  const db = createIntegrationDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { accountId: true },
  });
  if (!profile) throw new Error('Profile not found for subscription seed');

  // Account creation auto-provisions a 'plus' trial subscription,
  // so we UPDATE the existing row to 'family' tier instead of inserting.
  await db
    .update(subscriptions)
    .set({ tier: 'family', status: 'active' })
    .where(eq(subscriptions.accountId, profile.accountId));
}

async function listSubjectsForUser(input: {
  userId: string;
  email: string;
  profileId?: string;
}) {
  setAuthUser(input.userId, input.email);
  return app.request(
    '/v1/subjects',
    {
      method: 'GET',
      headers: buildAuthHeaders(input.profileId),
    },
    TEST_ENV
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [PRIMARY_EMAIL, SECONDARY_EMAIL],
    clerkUserIds: [PRIMARY_USER_ID, SECONDARY_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PRIMARY_EMAIL, SECONDARY_EMAIL],
    clerkUserIds: [PRIMARY_USER_ID, SECONDARY_USER_ID],
  });
});

describe('Integration: Profile Isolation (P0-006)', () => {
  it('returns 200 with subjects when X-Profile-Id belongs to the account', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });
    const subject = await seedSubject(ownerProfile.id, 'Mathematics');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: ownerProfile.id,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: subject.id,
      profileId: ownerProfile.id,
      name: 'Mathematics',
    });
  });

  it('returns 403 FORBIDDEN when X-Profile-Id does not belong to the account', async () => {
    await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });
    const foreignProfile = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'Secondary Learner',
      birthYear: 2001,
    });

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: foreignProfile.id,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('auto-resolves to the owner profile when X-Profile-Id is absent', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Owner Profile',
      birthYear: 2000,
    });
    await seedFamilySubscription(ownerProfile.id);
    const secondProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Second Profile',
      birthYear: 2012,
    });

    expect(ownerProfile.isOwner).toBe(true);
    expect(secondProfile.isOwner).toBe(false);

    const ownerSubject = await seedSubject(ownerProfile.id, 'Owner Subject');
    await seedSubject(secondProfile.id, 'Second Subject');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: ownerSubject.id,
      profileId: ownerProfile.id,
      name: 'Owner Subject',
    });
  });

  it('correctly propagates a second profileId to downstream scoped reads', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Owner Profile',
      birthYear: 2000,
    });
    await seedFamilySubscription(ownerProfile.id);
    const secondProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Teen Profile',
      birthYear: 2001,
    });

    await seedSubject(ownerProfile.id, 'Owner Mathematics');
    const secondSubject = await seedSubject(secondProfile.id, 'Teen Science');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: secondProfile.id,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: secondSubject.id,
      profileId: secondProfile.id,
      name: 'Teen Science',
    });
  });

  it('prevents access with a fabricated profile ID', async () => {
    await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: FABRICATED_PROFILE_ID,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});
