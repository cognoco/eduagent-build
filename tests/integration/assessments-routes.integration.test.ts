/**
 * Integration: Assessment routes
 *
 * Exercises the real assessment routes through the full app + real database.
 * JWT verification and LLM transport are the only mocked boundaries.
 */

import { and, eq } from 'drizzle-orm';
import { assessments, retentionCards, xpLedger } from '@eduagent/database';

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedAssessmentRecord,
  seedCurriculum,
  seedLearningSession,
  seedSubject,
} from './route-fixtures';
import { registerProvider } from '../../apps/api/src/services/llm';
import { app } from '../../apps/api/src/index';

// Controllable mock provider — overrides the default mock registered in setup.ts.
// Avoids jest.mock on an internal service (CLAUDE.md rule: no internal mocks in
// integration tests). Uses registerProvider so the full routeAndCall path runs.
const mockChat = jest.fn<Promise<string>, [unknown, unknown]>();

const TEST_ENV = buildIntegrationEnv();
const ASSESSMENTS_USER = {
  userId: 'integration-assessments-user',
  email: 'integration-assessments@integration.test',
};

// Register controllable mock provider once — overrides setup.ts's default mock.
// Tests control responses via mockChat.mockResolvedValue / mockResolvedValueOnce.
beforeAll(() => {
  registerProvider({
    id: 'gemini',
    chat: mockChat,
    async *chatStream() {
      yield* []; // no-op: streaming not used in these tests
    },
  });
});

function installAssessmentLlmMock(): void {
  mockChat.mockResolvedValue(
    JSON.stringify({
      feedback: 'Good reasoning!',
      passed: true,
      shouldEscalateDepth: false,
      rawScore: 0.45,
      qualityRating: 4,
    })
  );
}

async function createOwnerProfile() {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: ASSESSMENTS_USER,
    displayName: 'Assessment Learner',
    birthYear: 2000,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
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

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/assessments`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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

    expect(assessment).not.toBeUndefined();
    expect(assessment?.status).toBe('in_progress');
  });

  it('returns 401 without auth when creating an assessment', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology');
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'Photosynthesis', sortOrder: 0 }],
    });
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
      verificationDepth: 'transfer',
    });
    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        feedback: 'Good reasoning!',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 0.9,
        qualityRating: 4,
      })
    );

    const getRes = await app.request(
      `/v1/assessments/${assessmentId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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
      masteryScore: 0.9,
      qualityRating: 4,
    });

    const db = getIntegrationDb();
    const updated = await db.query.assessments.findFirst({
      where: eq(assessments.id, assessmentId),
    });

    expect(updated?.status).toBe('passed');
    expect(Number(updated?.masteryScore)).toBe(0.9);
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
      verificationDepth: 'transfer',
    });
    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        feedback: 'Good reasoning!',
        passed: true,
        shouldEscalateDepth: false,
        rawScore: 0.9,
        qualityRating: 4,
      })
    );

    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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

    expect(card).not.toBeUndefined();
    expect(card?.lastReviewedAt).not.toBeNull();
    expect(card?.nextReviewAt).not.toBeNull();
    expect(xp).not.toBeUndefined();
    expect(xp?.amount).toBe(180);
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

    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        feedback: 'Keep going!',
        passed: true,
        shouldEscalateDepth: true,
        rawScore: 0.3,
        qualityRating: 3,
      })
    );

    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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

    const res = await app.request(
      `/v1/assessments/${assessmentId}/answer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
        body: JSON.stringify({ answer: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when the assessment is not found', async () => {
    const profile = await createOwnerProfile();

    const res = await app.request(
      '/v1/assessments/00000000-0000-4000-8000-000000000099/answer',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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

    const res = await app.request(
      `/v1/sessions/${sessionId}/quick-check`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
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

    const res = await app.request(
      '/v1/sessions/00000000-0000-4000-8000-000000000088/quick-check',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: ASSESSMENTS_USER.userId, email: ASSESSMENTS_USER.email },
          profile.id
        ),
        body: JSON.stringify({ answer: 'Some answer' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Session not found');
  });
});
