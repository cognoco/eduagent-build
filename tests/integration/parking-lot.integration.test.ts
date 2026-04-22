/**
 * Integration: Parking lot routes
 *
 * Exercises the real parking lot routes through the full app + real database.
 * JWT verification is the only mocked boundary.
 */

import { eq } from 'drizzle-orm';
import { parkingLotItems } from '@eduagent/database';

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedCurriculum,
  seedLearningSession,
  seedParkingLotItem,
  seedSubject,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const PARKING_USER = {
  userId: 'integration-parking-user',
  email: 'integration-parking@integration.test',
};

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PARKING_USER.email],
    clerkUserIds: [PARKING_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PARKING_USER.email],
    clerkUserIds: [PARKING_USER.userId],
  });
});

async function createSessionFixture() {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: PARKING_USER,
    displayName: 'Parking Learner',
    birthYear: 2006,
  });
  const subject = await seedSubject(profile.id, 'Physics');
  const curriculum = await seedCurriculum({
    subjectId: subject.id,
    topics: [{ title: 'Refraction', sortOrder: 0 }],
  });
  const topicId = curriculum.topicIds[0]!;
  const sessionId = await seedLearningSession({
    profileId: profile.id,
    subjectId: subject.id,
    topicId,
  });

  return { profile, subject, topicId, sessionId };
}

describe('Integration: parking lot routes', () => {
  it('lists parked questions for a session with owner auto-resolution', async () => {
    const { profile, sessionId, topicId } = await createSessionFixture();
    await seedParkingLotItem({
      sessionId,
      profileId: profile.id,
      topicId,
      question: 'Why does light bend in water?',
    });

    const res = await app.request(
      `/v1/sessions/${sessionId}/parking-lot`,
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: PARKING_USER.userId,
          email: PARKING_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.items[0].question).toBe('Why does light bend in water?');
  });

  it('creates a parked question and persists it', async () => {
    const { profile, sessionId, topicId } = await createSessionFixture();

    const res = await app.request(
      `/v1/sessions/${sessionId}/parking-lot`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARKING_USER.userId, email: PARKING_USER.email },
          profile.id
        ),
        body: JSON.stringify({
          question: 'Can you come back to total internal reflection later?',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.question).toBe(
      'Can you come back to total internal reflection later?'
    );
    expect(body.item.explored).toBe(false);

    const db = getIntegrationDb();
    const saved = await db.query.parkingLotItems.findFirst({
      where: eq(parkingLotItems.id, body.item.id),
    });
    expect(saved).toBeDefined();
    expect(saved?.topicId).toBe(topicId);
  });

  it('returns 404 when posting to a missing session', async () => {
    const { profile } = await createSessionFixture();

    const res = await app.request(
      '/v1/sessions/00000000-0000-4000-8000-000000000099/parking-lot',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARKING_USER.userId, email: PARKING_USER.email },
          profile.id
        ),
        body: JSON.stringify({ question: 'Missing session?' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty question', async () => {
    const { profile, sessionId } = await createSessionFixture();

    const res = await app.request(
      `/v1/sessions/${sessionId}/parking-lot`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARKING_USER.userId, email: PARKING_USER.email },
          profile.id
        ),
        body: JSON.stringify({ question: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 409 when the per-topic parking lot limit is reached', async () => {
    const { profile, sessionId, topicId } = await createSessionFixture();

    for (let index = 0; index < 10; index += 1) {
      await seedParkingLotItem({
        sessionId,
        profileId: profile.id,
        topicId,
        question: `Question ${index + 1}`,
      });
    }

    const res = await app.request(
      `/v1/sessions/${sessionId}/parking-lot`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARKING_USER.userId, email: PARKING_USER.email },
          profile.id
        ),
        body: JSON.stringify({ question: 'One too many' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('QUOTA_EXCEEDED');
  });

  it('lists topic-linked parked questions for review', async () => {
    const { profile, subject, sessionId, topicId } =
      await createSessionFixture();
    await seedParkingLotItem({
      sessionId,
      profileId: profile.id,
      topicId,
      question: 'Why does factoring help here?',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/parking-lot`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARKING_USER.userId, email: PARKING_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.items[0].question).toBe('Why does factoring help here?');
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/sessions/00000000-0000-4000-8000-000000000099/parking-lot',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
