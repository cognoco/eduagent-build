/**
 * Integration: Curriculum routes
 *
 * Exercises the real curriculum routes through the full app + real database.
 * JWT verification and LLM transport are the only mocked boundaries.
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import {
  curriculumAdaptations,
  curricula,
  curriculumTopics,
} from '@eduagent/database';

import { jwtMock, configureInvalidJWT } from './mocks';
import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedCurriculum,
  seedSubject,
  setAuthenticatedUser,
} from './route-fixtures';

const mockRouteAndCall = jest.fn();

jest.mock('../../apps/api/src/services/llm', () => {
  const actual = jest.requireActual(
    '../../apps/api/src/services/llm'
  ) as Record<string, unknown>;

  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const CURRICULUM_USER = {
  userId: 'integration-curriculum-user',
  email: 'integration-curriculum@integration.test',
};

function buildLlmResult(response: string) {
  return {
    response,
    provider: 'mock',
    model: 'mock-model',
    latencyMs: 1,
  };
}

function installCurriculumLlmMocks(): void {
  mockRouteAndCall.mockImplementation(
    async (messages: Array<{ role: string; content: string }>) => {
      const lastMessage = messages[messages.length - 1]?.content ?? '';

      if (lastMessage.includes('Topic idea:')) {
        return buildLlmResult(
          JSON.stringify({
            title: 'Trigonometry Basics',
            description: 'Angles and triangle relationships',
            estimatedMinutes: 35,
          })
        );
      }

      if (
        lastMessage.includes('Subject: <subject_name>') &&
        lastMessage.includes('Interview Summary')
      ) {
        return buildLlmResult(
          JSON.stringify([
            {
              title: 'Quadratic Functions',
              description: 'Model and graph parabolas',
              relevance: 'core',
              estimatedMinutes: 40,
            },
            {
              title: 'Trigonometric Ratios',
              description: 'Use sine, cosine, and tangent',
              relevance: 'recommended',
              estimatedMinutes: 35,
            },
          ])
        );
      }

      if (lastMessage.includes('Explain why <topic_title>')) {
        return buildLlmResult('This topic builds on fundamentals.');
      }

      return buildLlmResult('Unexpected curriculum LLM call');
    }
  );
}

async function createOwnerProfile() {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    jwt,
    user: CURRICULUM_USER,
    displayName: 'Curriculum Learner',
    birthYear: 2000,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockRouteAndCall.mockReset();
  installCurriculumLlmMocks();

  await cleanupAccounts({
    emails: [CURRICULUM_USER.email],
    clerkUserIds: [CURRICULUM_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [CURRICULUM_USER.email],
    clerkUserIds: [CURRICULUM_USER.userId],
  });
});

describe('Integration: curriculum routes', () => {
  it('returns the real curriculum for a subject', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Linear Equations', sortOrder: 0 },
        { title: 'Systems of Equations', sortOrder: 1 },
      ],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum`,
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curriculum.subjectId).toBe(subject.id);
    expect(
      body.curriculum.topics.map((topic: { title: string }) => topic.title)
    ).toEqual(['Linear Equations', 'Systems of Equations']);
  });

  it('returns 401 without auth for GET curriculum', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    configureInvalidJWT(jwt);

    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum`,
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });

  it('skips a topic and records the adaptation', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Fractions', sortOrder: 0 },
        { title: 'Decimals', sortOrder: 1 },
      ],
    });
    const topicId = curriculum.topicIds[0]!;

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/skip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ topicId }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      message: 'Topic skipped',
      topicId,
    });

    const db = getIntegrationDb();
    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, topicId),
    });
    const adaptation = await db.query.curriculumAdaptations.findFirst({
      where: and(
        eq(curriculumAdaptations.profileId, profile.id),
        eq(curriculumAdaptations.topicId, topicId)
      ),
      orderBy: desc(curriculumAdaptations.createdAt),
    });

    expect(topic?.skipped).toBe(true);
    expect(adaptation?.skipReason).toBe('User skipped');
  });

  it('returns 400 when skipping with an invalid topic id', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/skip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ topicId: 'not-a-uuid' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('unskips a topic and records the restoration', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Fractions', sortOrder: 0, skipped: true },
        { title: 'Decimals', sortOrder: 1 },
      ],
    });
    const topicId = curriculum.topicIds[0]!;

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/unskip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ topicId }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      message: 'Topic restored',
      topicId,
    });

    const db = getIntegrationDb();
    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, topicId),
    });
    const adaptation = await db.query.curriculumAdaptations.findFirst({
      where: and(
        eq(curriculumAdaptations.profileId, profile.id),
        eq(curriculumAdaptations.topicId, topicId)
      ),
      orderBy: desc(curriculumAdaptations.createdAt),
    });

    expect(topic?.skipped).toBe(false);
    expect(adaptation?.skipReason).toBe('User restored');
  });

  it('returns 422 when unskipping a topic that is not skipped', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Fractions', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/unskip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ topicId }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toBe('Topic is not skipped');
  });

  it('returns a preview for a new topic using the mocked LLM transport', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Algebra Basics', sortOrder: 0 }],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/topics`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          mode: 'preview',
          title: 'trig',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      mode: 'preview',
      preview: {
        title: 'Trigonometry Basics',
        description: 'Angles and triangle relationships',
        estimatedMinutes: 35,
      },
    });
  });

  it('creates a user-authored topic at the end of the curriculum', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const seeded = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Algebra Basics', sortOrder: 0 },
        { title: 'Geometry Basics', sortOrder: 1 },
      ],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/topics`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          mode: 'create',
          title: 'Trigonometry Basics',
          description: 'Angles and triangle relationships',
          estimatedMinutes: 35,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('create');
    expect(body.topic.title).toBe('Trigonometry Basics');
    expect(body.topic.sortOrder).toBe(2);
    expect(body.topic.source).toBe('user');

    const db = getIntegrationDb();
    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, seeded.curriculumId),
      orderBy: asc(curriculumTopics.sortOrder),
    });

    expect(topics.map((topic) => topic.title)).toEqual([
      'Algebra Basics',
      'Geometry Basics',
      'Trigonometry Basics',
    ]);
    expect(topics[2]?.source).toBe('user');
  });

  it('returns 404 when adding a topic without a curriculum', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/topics`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          mode: 'create',
          title: 'Test Topic',
          description: 'A topic without a curriculum',
          estimatedMinutes: 30,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Curriculum not found');
  });

  it('regenerates the curriculum and replaces the stored topics', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Old Topic 1', sortOrder: 0 },
        { title: 'Old Topic 2', sortOrder: 1 },
      ],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/challenge`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          feedback: 'I already know the basics, skip intro topics',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.curriculum.topics.map((topic: { title: string }) => topic.title)
    ).toEqual(['Quadratic Functions', 'Trigonometric Ratios']);

    const db = getIntegrationDb();
    const latest = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subject.id),
      orderBy: desc(curricula.createdAt),
    });
    const topics = latest
      ? await db.query.curriculumTopics.findMany({
          where: eq(curriculumTopics.curriculumId, latest.id),
          orderBy: asc(curriculumTopics.sortOrder),
        })
      : [];

    expect(topics.map((topic) => topic.title)).toEqual([
      'Quadratic Functions',
      'Trigonometric Ratios',
    ]);
  });

  it('returns 400 when challenging with empty feedback', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/challenge`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ feedback: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('adapts curriculum order based on performance and persists the reordering', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Topic A', sortOrder: 0 },
        { title: 'Topic B', sortOrder: 1 },
        { title: 'Topic C', sortOrder: 2 },
        { title: 'Topic D', sortOrder: 3 },
      ],
    });
    const topicId = curriculum.topicIds[1]!;

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/adapt`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          topicId,
          signal: 'struggling',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adapted).toBe(true);
    expect(body.topicOrder).toEqual([
      curriculum.topicIds[0],
      curriculum.topicIds[2],
      curriculum.topicIds[3],
      curriculum.topicIds[1],
    ]);
    expect(body.explanation).toContain('Moved "Topic B" later');

    const db = getIntegrationDb();
    const reordered = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum.curriculumId),
      orderBy: asc(curriculumTopics.sortOrder),
    });
    const adaptation = await db.query.curriculumAdaptations.findFirst({
      where: and(
        eq(curriculumAdaptations.profileId, profile.id),
        eq(curriculumAdaptations.topicId, topicId)
      ),
      orderBy: desc(curriculumAdaptations.createdAt),
    });

    expect(reordered.map((topic) => topic.id)).toEqual([
      curriculum.topicIds[0],
      curriculum.topicIds[2],
      curriculum.topicIds[3],
      curriculum.topicIds[1],
    ]);
    expect(adaptation?.skipReason).toContain(
      'Performance adaptation: struggling'
    );
  });

  it('returns 400 for an invalid adaptation signal', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Topic A', sortOrder: 0 }],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/adapt`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          topicId: curriculum.topicIds[0],
          signal: 'invalid_signal',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('explains topic ordering using the mocked LLM transport', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Mathematics');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        { title: 'Topic A', sortOrder: 0 },
        { title: 'Topic B', sortOrder: 1 },
      ],
    });

    setAuthenticatedUser(jwt, CURRICULUM_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/curriculum/topics/${curriculum.topicIds[1]}/explain`,
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.explanation).toBe('This topic builds on fundamentals.');
  });
});
