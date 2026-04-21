/**
 * Integration: Assessment routes
 *
 * Exercises the real assessment routes through the full app + real database.
 * JWT verification and LLM transport are the only mocked boundaries.
 */

import { and, eq } from 'drizzle-orm';
import { assessments, retentionCards, xpLedger } from '@eduagent/database';

import { jwtMock, configureInvalidJWT } from './mocks';
import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedAssessmentRecord,
  seedCurriculum,
  seedLearningSession,
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
const ASSESSMENTS_USER = {
  userId: 'integration-assessments-user',
  email: 'integration-assessments@integration.test',
};

function buildLlmResult(response: string) {
  return {
    response,
    provider: 'mock',
    model: 'mock-model',
    latencyMs: 1,
  };
}

function installAssessmentLlmMock(): void {
  mockRouteAndCall.mockResolvedValue(
    buildLlmResult(
      JSON.stringify({
        feedback: 'Good reasoning!',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 0.45,
        qualityRating: 4,
      })
    )
  );
}

async function createOwnerProfile() {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    jwt,
    user: ASSESSMENTS_USER,
    displayName: 'Assessment Learner',
    birthYear: 2000,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockRouteAndCall.mockReset();
  installAssessmentLlmMock();

  await cleanupAccounts({
    emails: [ASSESSMENTS_USER.email],
    clerkUserIds: [ASSESSMENTS_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [ASSESSMENTS_USER.email],
    clerkUserIds: [ASSESSMENTS_USER.userId],
  });
});

describe('Integration: assessment routes', () => {
  it('creates an assessment row for a subject topic', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/assessments`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({}),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assessment.topicId).toBe(topicId);
    expect(body.assessment.verificationDepth).toBe('recall');
    expect(body.assessment.status).toBe('in_progress');

    const db = getIntegrationDb();
    const assessment = await db.query.assessments.findFirst({
      where: and(
        eq(assessments.profileId, profile.id),
        eq(assessments.topicId, topicId)
      ),
    });

    expect(assessment).toBeDefined();
    expect(assessment?.status).toBe('in_progress');
  });

  it('returns 401 without auth when creating an assessment', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    configureInvalidJWT(jwt);

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${curriculum.topicIds[0]}/assessments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });

  it('returns and updates an assessment with real persistence', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;
    const assessmentId = await seedAssessmentRecord({
      profileId: profile.id,
      subjectId: subject.id,
      topicId,
    });

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const getRes = await app.request(
      `/v1/assessments/${assessmentId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(profile.id),
      },
      TEST_ENV
    );

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.assessment.id).toBe(assessmentId);
    expect(getBody.assessment.status).toBe('in_progress');

    const answerRes = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          answer:
            'Photosynthesis is the process by which plants convert light energy into chemical energy.',
        }),
      },
      TEST_ENV
    );

    expect(answerRes.status).toBe(200);
    const answerBody = await answerRes.json();
    expect(answerBody.evaluation).toMatchObject({
      feedback: 'Good reasoning!',
      passed: true,
      shouldEscalateDepth: false,
      masteryScore: 0.45,
      qualityRating: 4,
    });

    const db = getIntegrationDb();
    const updated = await db.query.assessments.findFirst({
      where: eq(assessments.id, assessmentId),
    });

    expect(updated?.status).toBe('passed');
    expect(Number(updated?.masteryScore)).toBe(0.45);
    expect(updated?.qualityRating).toBe(4);
    expect(updated?.exchangeHistory).toEqual([
      {
        role: 'user',
        content:
          'Photosynthesis is the process by which plants convert light energy into chemical energy.',
      },
      {
        role: 'assistant',
        content: 'Good reasoning!',
      },
    ]);
  });

  it('creates retention and XP side effects when an assessment passes', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;
    const assessmentId = await seedAssessmentRecord({
      profileId: profile.id,
      subjectId: subject.id,
      topicId,
    });

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          answer: 'Plants use light to make energy-rich sugars.',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);

    const db = getIntegrationDb();
    const card = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profile.id),
        eq(retentionCards.topicId, topicId)
      ),
    });
    const xp = await db.query.xpLedger.findFirst({
      where: and(
        eq(xpLedger.profileId, profile.id),
        eq(xpLedger.topicId, topicId)
      ),
    });

    expect(card).toBeDefined();
    expect(card?.lastReviewedAt).not.toBeNull();
    expect(card?.nextReviewAt).not.toBeNull();
    expect(xp).toBeDefined();
    expect(xp?.amount).toBe(45);
    expect(xp?.status).toBe('verified');
  });

  it('does not create retention or XP while the assessment stays in progress', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;
    const assessmentId = await seedAssessmentRecord({
      profileId: profile.id,
      subjectId: subject.id,
      topicId,
    });

    mockRouteAndCall.mockResolvedValueOnce(
      buildLlmResult(
        JSON.stringify({
          feedback: 'Keep going!',
          passed: true,
          shouldEscalateDepth: true,
          rawScore: 0.3,
          qualityRating: 3,
        })
      )
    );

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          answer: 'A partial answer.',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);

    const db = getIntegrationDb();
    const updated = await db.query.assessments.findFirst({
      where: eq(assessments.id, assessmentId),
    });
    const card = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profile.id),
        eq(retentionCards.topicId, topicId)
      ),
    });
    const xp = await db.query.xpLedger.findFirst({
      where: and(
        eq(xpLedger.profileId, profile.id),
        eq(xpLedger.topicId, topicId)
      ),
    });

    expect(updated?.status).toBe('in_progress');
    expect(updated?.verificationDepth).toBe('explain');
    expect(card).toBeUndefined();
    expect(xp).toBeUndefined();
  });

  it('returns 400 for an empty assessment answer', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const assessmentId = await seedAssessmentRecord({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: curriculum.topicIds[0]!,
    });

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ answer: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when the assessment is not found', async () => {
    const profile = await createOwnerProfile();

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      '/v1/assessments/00000000-0000-4000-8000-000000000099/answer',
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ answer: 'Some answer' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Assessment not found');
  });

  it('returns 200 for a session quick check using the real session lookup', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
    const topicId = curriculum.topicIds[0]!;
    const sessionId = await seedLearningSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId,
    });

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      `/v1/sessions/${sessionId}/quick-check`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({
          answer: 'Plants use light energy to make food.',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      feedback: 'Good reasoning!',
      isCorrect: true,
    });
  });

  it('returns 404 when the session quick check targets a missing session', async () => {
    const profile = await createOwnerProfile();

    setAuthenticatedUser(jwt, ASSESSMENTS_USER);
    const res = await app.request(
      '/v1/sessions/00000000-0000-4000-8000-000000000088/quick-check',
      {
        method: 'POST',
        headers: buildAuthHeaders(profile.id),
        body: JSON.stringify({ answer: 'Some answer' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Session not found');
  });
});
