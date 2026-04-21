/**
 * Integration: Progress routes
 *
 * Exercises the real progress routes through the full app + real database.
 * JWT verification is the only mocked boundary.
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedAssessmentRecord,
  seedCurriculum,
  seedLearningSession,
  seedNeedsDeepeningRecord,
  seedRetentionCard,
  seedSessionSummary,
  seedSubject,
  seedXpLedgerEntry,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const PROGRESS_USER = {
  userId: 'integration-progress-user',
  email: 'integration-progress@integration.test',
};
const OTHER_PROGRESS_USER = {
  userId: 'integration-progress-other-user',
  email: 'integration-progress-other@integration.test',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [PROGRESS_USER.email, OTHER_PROGRESS_USER.email],
    clerkUserIds: [PROGRESS_USER.userId, OTHER_PROGRESS_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PROGRESS_USER.email, OTHER_PROGRESS_USER.email],
    clerkUserIds: [PROGRESS_USER.userId, OTHER_PROGRESS_USER.userId],
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
    birthYear: 2003,
  });
}

async function createProgressScenario() {
  const profile = await createProfileFor(PROGRESS_USER, 'Progress Learner');
  const subject = await seedSubject(profile.id, 'Mathematics');
  const curriculum = await seedCurriculum({
    subjectId: subject.id,
    topics: [
      { title: 'Numbers', sortOrder: 0 },
      { title: 'Algebra', sortOrder: 1 },
      { title: 'Geometry', sortOrder: 2 },
      { title: 'Fractions', sortOrder: 3 },
    ],
  });

  const [verifiedTopicId, continueTopicId, reviewTopicId, completedTopicId] =
    curriculum.topicIds;

  if (
    !verifiedTopicId ||
    !continueTopicId ||
    !reviewTopicId ||
    !completedTopicId
  ) {
    throw new Error('Expected four seeded topic ids for progress scenario');
  }

  const futureReviewAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
  const overdueReviewAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const completedDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const continueDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const reviewDate = new Date(Date.now() - 60 * 60 * 1000);

  await seedRetentionCard({
    profileId: profile.id,
    topicId: verifiedTopicId,
    xpStatus: 'verified',
    nextReviewAt: futureReviewAt,
  });
  await seedXpLedgerEntry({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: verifiedTopicId,
    amount: 100,
    status: 'verified',
    verifiedAt: new Date(),
  });
  await seedAssessmentRecord({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: verifiedTopicId,
    status: 'passed',
    masteryScore: 0.95,
    qualityRating: 5,
    overrides: {
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  });

  const continueSessionId = await seedLearningSession({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: continueTopicId,
    overrides: {
      status: 'active',
      exchangeCount: 4,
      createdAt: continueDate,
      updatedAt: continueDate,
      startedAt: continueDate,
      lastActivityAt: continueDate,
    },
  });

  const reviewSessionId = await seedLearningSession({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: reviewTopicId,
    overrides: {
      status: 'active',
      exchangeCount: 3,
      createdAt: reviewDate,
      updatedAt: reviewDate,
      startedAt: reviewDate,
      lastActivityAt: reviewDate,
    },
  });
  await seedSessionSummary({
    sessionId: reviewSessionId,
    profileId: profile.id,
    topicId: reviewTopicId,
    content:
      'Learner can describe the triangle rules but still mixes up complementary and supplementary angles.',
  });
  await seedAssessmentRecord({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: reviewTopicId,
    sessionId: reviewSessionId,
    status: 'in_progress',
    masteryScore: 0.62,
    qualityRating: 2,
    exchangeHistory: [
      { role: 'assistant', content: 'Explain angle sums.' },
      { role: 'user', content: 'I know triangles add to 180.' },
    ],
    overrides: {
      createdAt: reviewDate,
      updatedAt: reviewDate,
    },
  });
  await seedRetentionCard({
    profileId: profile.id,
    topicId: reviewTopicId,
    xpStatus: 'pending',
    nextReviewAt: overdueReviewAt,
    failureCount: 3,
  });
  await seedXpLedgerEntry({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: reviewTopicId,
    amount: 30,
    status: 'pending',
  });
  await seedNeedsDeepeningRecord({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: reviewTopicId,
    status: 'active',
  });

  await seedLearningSession({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: completedTopicId,
    overrides: {
      status: 'completed',
      exchangeCount: 5,
      createdAt: completedDate,
      updatedAt: completedDate,
      startedAt: completedDate,
      lastActivityAt: completedDate,
      endedAt: completedDate,
    },
  });

  return {
    profile,
    subject,
    verifiedTopicId,
    continueTopicId,
    reviewTopicId,
    completedTopicId,
    continueSessionId,
    reviewSessionId,
    futureReviewAt,
    reviewDate,
  };
}

describe('Integration: progress routes', () => {
  it('returns subject progress from the real curriculum and progress rows', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const res = await app.request(
      `/v1/subjects/${scenario.subject.id}/progress`,
      { method: 'GET', headers: buildAuthHeaders() },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toMatchObject({
      subjectId: scenario.subject.id,
      name: 'Mathematics',
      topicsTotal: 4,
      topicsCompleted: 2,
      topicsVerified: 1,
      urgencyScore: 1,
      retentionStatus: 'weak',
      lastSessionAt: scenario.reviewDate.toISOString(),
    });
  });

  it('returns detailed topic progress including summary, retention, and struggle status', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const res = await app.request(
      `/v1/subjects/${scenario.subject.id}/topics/${scenario.reviewTopicId}/progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toMatchObject({
      topicId: scenario.reviewTopicId,
      title: 'Geometry',
      completionStatus: 'in_progress',
      retentionStatus: 'forgotten',
      struggleStatus: 'blocked',
      masteryScore: 0.62,
      xpStatus: 'pending',
      totalSessions: 1,
    });
    expect(body.topic.summaryExcerpt).toContain(
      'Learner can describe the triangle rules'
    );
  });

  it('returns overall progress across subjects', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const res = await app.request(
      '/v1/progress/overview',
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      subjectId: scenario.subject.id,
      topicsCompleted: 2,
      topicsVerified: 1,
    });
    expect(body.totalTopicsCompleted).toBe(2);
    expect(body.totalTopicsVerified).toBe(1);
  });

  it('returns overdue review summary data with next review and next upcoming review', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const res = await app.request(
      '/v1/progress/review-summary',
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalOverdue).toBe(1);
    expect(body.nextReviewTopic).toMatchObject({
      topicId: scenario.reviewTopicId,
      subjectId: scenario.subject.id,
      subjectName: 'Mathematics',
      topicTitle: 'Geometry',
    });
    expect(body.nextUpcomingReviewAt).toBe(
      scenario.futureReviewAt.toISOString()
    );
  });

  it('returns the next incomplete topic and keeps lastSessionId aligned to that topic', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const res = await app.request(
      '/v1/progress/continue',
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestion).toMatchObject({
      subjectId: scenario.subject.id,
      subjectName: 'Mathematics',
      topicId: scenario.continueTopicId,
      topicTitle: 'Algebra',
      lastSessionId: scenario.continueSessionId,
    });
  });

  it('returns the active session id for a topic and null when none exists', async () => {
    const scenario = await createProgressScenario();

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const activeRes = await app.request(
      `/v1/progress/topic/${scenario.continueTopicId}/active-session`,
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(activeRes.status).toBe(200);
    expect(await activeRes.json()).toEqual({
      sessionId: scenario.continueSessionId,
    });

    const nullRes = await app.request(
      `/v1/progress/topic/${scenario.completedTopicId}/active-session`,
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(nullRes.status).toBe(200);
    expect(await nullRes.json()).toBeNull();
  });

  it('resolves a topic back to its subject and hides topics owned by another profile', async () => {
    const scenario = await createProgressScenario();
    const otherProfile = await createProfileFor(
      OTHER_PROGRESS_USER,
      'Other Progress Learner'
    );
    const otherSubject = await seedSubject(otherProfile.id, 'Chemistry');
    const otherCurriculum = await seedCurriculum({
      subjectId: otherSubject.id,
      topics: [{ title: 'Atoms', sortOrder: 0 }],
    });

    setAuthenticatedUser(jwt, PROGRESS_USER);
    const resolveRes = await app.request(
      `/v1/topics/${scenario.continueTopicId}/resolve`,
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(resolveRes.status).toBe(200);
    expect(await resolveRes.json()).toEqual({
      subjectId: scenario.subject.id,
      subjectName: 'Mathematics',
      topicTitle: 'Algebra',
    });

    const hiddenRes = await app.request(
      `/v1/topics/${otherCurriculum.topicIds[0]}/resolve`,
      {
        method: 'GET',
        headers: buildAuthHeaders(scenario.profile.id),
      },
      TEST_ENV
    );

    expect(hiddenRes.status).toBe(404);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/progress/continue',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
