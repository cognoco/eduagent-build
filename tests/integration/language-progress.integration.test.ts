/**
 * Integration: Language progress routes
 *
 * Exercises the real language progress route through the full app + real DB.
 * Real JWT verification via the global fetch interceptor in setup.ts.
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedCurriculum,
  seedSubject,
  seedVocabularyEntry,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const LANGUAGE_USER = {
  userId: 'integration-language-progress-user',
  email: 'integration-language-progress@integration.test',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [LANGUAGE_USER.email],
    clerkUserIds: [LANGUAGE_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [LANGUAGE_USER.email],
    clerkUserIds: [LANGUAGE_USER.userId],
  });
});

async function createOwnerProfile() {
  return createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: LANGUAGE_USER,
    displayName: 'Language Learner',
    birthYear: 1999,
  });
}

describe('Integration: GET /v1/subjects/:subjectId/cefr-progress', () => {
  it('returns real CEFR milestone progress for a language subject', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Spanish', {
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    });
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      topics: [
        {
          title: 'Food & Ordering',
          sortOrder: 0,
          cefrLevel: 'A1',
          cefrSublevel: '3',
          targetWordCount: 4,
          targetChunkCount: 2,
        },
        {
          title: 'Home & Family',
          sortOrder: 1,
          cefrLevel: 'A1',
          cefrSublevel: '4',
          targetWordCount: 3,
          targetChunkCount: 1,
        },
      ],
    });
    const currentMilestoneId = curriculum.topicIds[0]!;

    await seedVocabularyEntry({
      profileId: profile.id,
      subjectId: subject.id,
      milestoneId: currentMilestoneId,
      term: 'comida',
      translation: 'food',
      type: 'word',
      mastered: true,
      cefrLevel: 'A1',
    });
    await seedVocabularyEntry({
      profileId: profile.id,
      subjectId: subject.id,
      milestoneId: currentMilestoneId,
      term: 'menu',
      translation: 'menu',
      type: 'word',
      mastered: true,
      cefrLevel: 'A1',
    });
    await seedVocabularyEntry({
      profileId: profile.id,
      subjectId: subject.id,
      milestoneId: currentMilestoneId,
      term: 'por favor',
      translation: 'please',
      type: 'chunk',
      mastered: true,
      cefrLevel: 'A1',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: LANGUAGE_USER.userId,
          email: LANGUAGE_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      subjectId: subject.id,
      languageCode: 'es',
      pedagogyMode: 'four_strands',
      currentLevel: 'A1',
      currentSublevel: '3',
    });
    expect(body.currentMilestone).toMatchObject({
      milestoneId: currentMilestoneId,
      milestoneTitle: 'Food & Ordering',
      wordsMastered: 2,
      wordsTarget: 4,
      chunksMastered: 1,
      chunksTarget: 2,
      milestoneProgress: 0.5,
    });
    expect(body.nextMilestone).toMatchObject({
      milestoneTitle: 'Home & Family',
      level: 'A1',
      sublevel: '4',
    });
  });

  it('returns a zero-state payload for a language subject with no curriculum yet', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Spanish', {
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: LANGUAGE_USER.userId, email: LANGUAGE_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      subjectId: subject.id,
      languageCode: 'es',
      pedagogyMode: 'four_strands',
      currentLevel: null,
      currentSublevel: null,
      currentMilestone: null,
      nextMilestone: null,
    });
  });

  it('returns 404 for a non-language subject', async () => {
    const profile = await createOwnerProfile();
    const subject = await seedSubject(profile.id, 'Biology', {
      pedagogyMode: 'socratic',
      languageCode: null,
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: LANGUAGE_USER.userId, email: LANGUAGE_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/subjects/00000000-0000-4000-8000-000000000099/cefr-progress',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
