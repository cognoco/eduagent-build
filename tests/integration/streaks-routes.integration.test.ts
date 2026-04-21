/**
 * Integration: Streak and XP routes
 *
 * Exercises the real routes through the full app + real database.
 * JWT verification uses the real fetch interceptor installed in setup.ts.
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedCurriculum,
  seedStreakRecord,
  seedSubject,
  seedXpLedgerEntry,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const STREAKS_USER = {
  userId: 'integration-streaks-user',
  email: 'integration-streaks@integration.test',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [STREAKS_USER.email],
    clerkUserIds: [STREAKS_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [STREAKS_USER.email],
    clerkUserIds: [STREAKS_USER.userId],
  });
});

async function createOwnerProfile() {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: STREAKS_USER,
    displayName: 'Streak Learner',
    birthYear: 2007,
  });
}

describe('Integration: GET /v1/streaks', () => {
  it('auto-resolves the owner profile when X-Profile-Id is omitted', async () => {
    await createOwnerProfile();

    const res = await app.request(
      '/v1/streaks',
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: STREAKS_USER.userId,
          email: STREAKS_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    });
  });

  it('returns the real streak state with grace period metadata', async () => {
    const profile = await createOwnerProfile();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await seedStreakRecord({
      profileId: profile.id,
      currentStreak: 5,
      longestStreak: 12,
      lastActivityDate: twoDaysAgo,
    });

    const res = await app.request(
      '/v1/streaks',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: STREAKS_USER.userId, email: STREAKS_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streak).toMatchObject({
      currentStreak: 5,
      longestStreak: 12,
      lastActivityDate: twoDaysAgo,
      isOnGracePeriod: true,
      graceDaysRemaining: 2,
    });
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request('/v1/streaks', { method: 'GET' }, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe('Integration: GET /v1/xp', () => {
  it('aggregates XP totals from the real ledger rows', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'History');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Ancient Egypt', sortOrder: 0 },
        { title: 'Roman Empire', sortOrder: 1 },
        { title: 'Industrial Revolution', sortOrder: 2 },
      ],
    });

    await seedXpLedgerEntry({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: curriculum.topicIds[0]!,
      amount: 100,
      status: 'verified',
      verifiedAt: new Date(),
    });
    await seedXpLedgerEntry({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: curriculum.topicIds[1]!,
      amount: 50,
      status: 'pending',
    });
    await seedXpLedgerEntry({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: curriculum.topicIds[2]!,
      amount: 20,
      status: 'decayed',
    });

    const res = await app.request(
      '/v1/xp',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: STREAKS_USER.userId, email: STREAKS_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xp).toMatchObject({
      totalXp: 170,
      verifiedXp: 100,
      pendingXp: 50,
      decayedXp: 20,
      topicsCompleted: 3,
      topicsVerified: 1,
    });
  });
});
