/**
 * Integration: Settings routes
 *
 * Exercises the real settings routes through the full app + real database.
 * JWT verification is the only mocked boundary.
 */

import { and, eq } from 'drizzle-orm';
import {
  learningModes,
  notificationPreferences,
  teachingPreferences,
} from '@eduagent/database';

import { jwtMock } from './mocks';
import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedLearningModeRecord,
  seedNotificationPreferences,
  seedSubject,
  seedTeachingPreference,
  setAuthenticatedUser,
} from './route-fixtures';

const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const SETTINGS_USER = {
  userId: 'integration-settings-user',
  email: 'integration-settings@integration.test',
};
const OTHER_SETTINGS_USER = {
  userId: 'integration-settings-other-user',
  email: 'integration-settings-other@integration.test',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [SETTINGS_USER.email, OTHER_SETTINGS_USER.email],
    clerkUserIds: [SETTINGS_USER.userId, OTHER_SETTINGS_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [SETTINGS_USER.email, OTHER_SETTINGS_USER.email],
    clerkUserIds: [SETTINGS_USER.userId, OTHER_SETTINGS_USER.userId],
  });
});

async function createProfileFor(
  user: { userId: string; email: string },
  displayName: string
) {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    jwt,
    user,
    displayName,
    birthYear: 2000,
  });
}

describe('Integration: settings routes', () => {
  it('auto-resolves the owner profile for notification settings when X-Profile-Id is omitted', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    await seedNotificationPreferences({
      profileId: profile.id,
      reviewReminders: true,
      dailyReminders: true,
      weeklyProgressPush: false,
      pushEnabled: true,
      maxDailyPush: 5,
    });

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/notifications',
      { method: 'GET', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences).toMatchObject({
      reviewReminders: true,
      dailyReminders: true,
      weeklyProgressPush: false,
      pushEnabled: true,
      maxDailyPush: 5,
    });
  });

  it('updates notification preferences and persists the default maxDailyPush', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/notifications',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          reviewReminders: false,
          dailyReminders: true,
          weeklyProgressPush: false,
          pushEnabled: true,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences).toMatchObject({
      reviewReminders: false,
      dailyReminders: true,
      weeklyProgressPush: false,
      pushEnabled: true,
      maxDailyPush: 3,
    });

    const db = getIntegrationDb();
    const saved = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.profileId, profile.id),
    });
    expect(saved).toBeDefined();
    expect(saved).toMatchObject({
      reviewReminders: false,
      dailyReminders: true,
      weeklyProgressPush: false,
      pushEnabled: true,
      maxDailyPush: 3,
    });
  });

  it('rejects an invalid notification payload', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/notifications',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          reviewReminders: 'yes',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns the real default learning mode when no row exists yet', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/learning-mode',
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'casual' });
  });

  it('updates the learning mode and persists it', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/learning-mode',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ mode: 'serious' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'serious' });

    const db = getIntegrationDb();
    const saved = await db.query.learningModes.findFirst({
      where: eq(learningModes.profileId, profile.id),
    });
    expect(saved?.mode).toBe('serious');
  });

  it('rejects an invalid learning mode', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      '/v1/settings/learning-mode',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ mode: 'speedrun' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns and updates the celebration level', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    await seedLearningModeRecord({
      profileId: profile.id,
      mode: 'casual',
      celebrationLevel: 'all',
    });

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const getRes = await app.request(
      '/v1/settings/celebration-level',
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ celebrationLevel: 'all' });

    const putRes = await app.request(
      '/v1/settings/celebration-level',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ celebrationLevel: 'big_only' }),
      },
      TEST_ENV
    );

    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ celebrationLevel: 'big_only' });

    const db = getIntegrationDb();
    const saved = await db.query.learningModes.findFirst({
      where: eq(learningModes.profileId, profile.id),
    });
    expect(saved?.celebrationLevel).toBe('big_only');
  });

  it('gets and updates the analogy domain for an owned subject', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    const subject = await seedSubject(profile.id, 'Math');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const initialRes = await app.request(
      `/v1/settings/subjects/${subject.id}/analogy-domain`,
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(initialRes.status).toBe(200);
    expect(await initialRes.json()).toEqual({ analogyDomain: null });

    const updateRes = await app.request(
      `/v1/settings/subjects/${subject.id}/analogy-domain`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ analogyDomain: 'sports' }),
      },
      TEST_ENV
    );

    expect(updateRes.status).toBe(200);
    expect(await updateRes.json()).toEqual({ analogyDomain: 'sports' });

    const clearRes = await app.request(
      `/v1/settings/subjects/${subject.id}/analogy-domain`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ analogyDomain: null }),
      },
      TEST_ENV
    );

    expect(clearRes.status).toBe(200);
    expect(await clearRes.json()).toEqual({ analogyDomain: null });

    const db = getIntegrationDb();
    const saved = await db.query.teachingPreferences.findFirst({
      where: and(
        eq(teachingPreferences.profileId, profile.id),
        eq(teachingPreferences.subjectId, subject.id)
      ),
    });
    expect(saved?.analogyDomain).toBeNull();
  });

  it('returns 404 when setting analogy domain on a subject owned by another profile', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Owner A');
    const otherProfile = await createProfileFor(OTHER_SETTINGS_USER, 'Owner B');
    const otherSubject = await seedSubject(otherProfile.id, 'Chemistry');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      `/v1/settings/subjects/${otherSubject.id}/analogy-domain`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ analogyDomain: 'gaming' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('rejects invalid analogy-domain input and invalid subject ids', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    const subject = await seedSubject(profile.id, 'Math');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const invalidBodyRes = await app.request(
      `/v1/settings/subjects/${subject.id}/analogy-domain`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ analogyDomain: 'invalid' }),
      },
      TEST_ENV
    );
    expect(invalidBodyRes.status).toBe(400);

    const invalidSubjectRes = await app.request(
      '/v1/settings/subjects/not-a-uuid/analogy-domain',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ analogyDomain: 'sports' }),
      },
      TEST_ENV
    );
    expect(invalidSubjectRes.status).toBe(400);
  });

  it('gets and updates the native language for an owned subject', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    const subject = await seedSubject(profile.id, 'Spanish');
    await seedTeachingPreference({
      profileId: profile.id,
      subjectId: subject.id,
      nativeLanguage: null,
    });

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const initialRes = await app.request(
      `/v1/settings/subjects/${subject.id}/native-language`,
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(initialRes.status).toBe(200);
    expect(await initialRes.json()).toEqual({ nativeLanguage: null });

    const updateRes = await app.request(
      `/v1/settings/subjects/${subject.id}/native-language`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ nativeLanguage: 'en' }),
      },
      TEST_ENV
    );

    expect(updateRes.status).toBe(200);
    expect(await updateRes.json()).toEqual({ nativeLanguage: 'en' });

    const db = getIntegrationDb();
    const savedAfterSet = await db.query.teachingPreferences.findFirst({
      where: and(
        eq(teachingPreferences.profileId, profile.id),
        eq(teachingPreferences.subjectId, subject.id)
      ),
    });
    expect(savedAfterSet?.nativeLanguage).toBe('en');

    const clearRes = await app.request(
      `/v1/settings/subjects/${subject.id}/native-language`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ nativeLanguage: null }),
      },
      TEST_ENV
    );

    expect(clearRes.status).toBe(200);
    expect(await clearRes.json()).toEqual({ nativeLanguage: null });
  });

  it('returns 404 when setting native language on a subject owned by another profile', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Owner A');
    const otherProfile = await createProfileFor(OTHER_SETTINGS_USER, 'Owner B');
    const otherSubject = await seedSubject(otherProfile.id, 'French');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const res = await app.request(
      `/v1/settings/subjects/${otherSubject.id}/native-language`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ nativeLanguage: 'en' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('rejects invalid native-language input and returns 401 without auth', async () => {
    const profile = await createProfileFor(SETTINGS_USER, 'Settings Learner');
    const subject = await seedSubject(profile.id, 'Spanish');

    setAuthenticatedUser(jwt, SETTINGS_USER);
    const invalidBodyRes = await app.request(
      `/v1/settings/subjects/${subject.id}/native-language`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ nativeLanguage: '' }),
      },
      TEST_ENV
    );
    expect(invalidBodyRes.status).toBe(400);

    const invalidSubjectRes = await app.request(
      '/v1/settings/subjects/not-a-uuid/native-language',
      {
        method: 'PUT',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ nativeLanguage: 'en' }),
      },
      TEST_ENV
    );
    expect(invalidSubjectRes.status).toBe(400);

    const unauthorizedRes = await app.request(
      '/v1/settings/notifications',
      { method: 'GET' },
      TEST_ENV
    );
    expect(unauthorizedRes.status).toBe(401);
  });
});
