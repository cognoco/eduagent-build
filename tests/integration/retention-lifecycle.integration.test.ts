/**
 * Integration: Retention Lifecycle
 *
 * Exercises the SM-2 retention routes via the real app + real database.
 * JWT verification uses real signed tokens via the fetch interceptor in setup.ts.
 * The mock LLM provider registered in setup.ts handles recall quality evaluation
 * (falls back to the length-based heuristic: >100 chars → 4, >20 chars → 3, else → 2).
 *
 * Validates:
 * 1. GET /v1/subjects/:subjectId/retention — returns retention cards
 * 2. GET /v1/topics/:topicId/retention — returns single retention card
 * 3. POST /v1/retention/recall-test — processes recall with real SM-2
 * 4. POST /v1/retention/recall-test — failure path and remediation
 * 5. POST /v1/retention/relearn — resets retention card and creates session
 * 6. GET /v1/subjects/:subjectId/needs-deepening — lists active topics
 * 7. Teaching preference CRUD (GET/PUT/DELETE)
 * 8. GET /v1/retention/stability — returns stable topics
 * 9. Auth and validation edge cases (401, 400)
 */

import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-retention-user';
const AUTH_EMAIL = 'integration-retention@integration.test';

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Retention Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function createSubject(profileId: string, name: string): Promise<string> {
  const res = await app.request(
    '/v1/subjects',
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: AUTH_USER_ID, email: AUTH_EMAIL },
        profileId
      ),
      body: JSON.stringify({ name }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.subject.id as string;
}

// ---------------------------------------------------------------------------
// Direct DB seeding helpers
// ---------------------------------------------------------------------------

async function seedCurriculumWithTopics(
  subjectId: string,
  topicTitles: string[]
): Promise<{ curriculumId: string; topicIds: string[] }> {
  const db = createIntegrationDb();
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId, title: 'Test Book', sortOrder: 1 })
    .returning();

  const topicIds: string[] = [];
  for (let i = 0; i < topicTitles.length; i++) {
    const [topic] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title: topicTitles[i]!,
        description: `Description for ${topicTitles[i]}`,
        sortOrder: i + 1,
        relevance: 'core',
        estimatedMinutes: 30,
      })
      .returning({ id: curriculumTopics.id });
    topicIds.push(topic!.id);
  }

  return { curriculumId: curriculum!.id, topicIds };
}

async function seedRetentionCard(
  profileId: string,
  topicId: string,
  overrides: Partial<typeof retentionCards.$inferInsert> = {}
): Promise<string> {
  const db = createIntegrationDb();
  const [card] = await db
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: '2.50',
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      ...overrides,
    })
    .returning({ id: retentionCards.id });
  return card!.id;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

// ---------------------------------------------------------------------------
// Subject Retention
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects/:subjectId/retention', () => {
  it('returns retention cards for subject', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Calculus');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Derivatives',
      'Integrals',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);
    await seedRetentionCard(profileId, topicIds[1]!, {
      nextReviewAt: new Date(Date.now() - 1000), // due now
    });

    const res = await app.request(
      `/v1/subjects/${subjectId}/retention`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics).toHaveLength(2);
    expect(
      body.topics.map((t: { topicTitle: string }) => t.topicTitle)
    ).toEqual(expect.arrayContaining(['Derivatives', 'Integrals']));
    // One card has nextReviewAt in the past → due
    expect(body.reviewDueCount).toBe(1);
  });

  it('returns empty when no curriculum exists', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Empty Subject');

    const res = await app.request(
      `/v1/subjects/${subjectId}/retention`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics).toHaveLength(0);
    expect(body.reviewDueCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Topic Retention
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/topics/:topicId/retention', () => {
  it('returns retention card for topic', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Physics');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Kinematics',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);

    const res = await app.request(
      `/v1/topics/${topicIds[0]}/retention`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card).not.toBeNull();
    expect(body.card.topicId).toBe(topicIds[0]);
    expect(body.card.easeFactor).toBe(2.5);
    expect(body.card.xpStatus).toBe('pending');
  });

  it('returns null when no retention card exists', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Biology');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, ['Cells']);

    const res = await app.request(
      `/v1/topics/${topicIds[0]}/retention`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recall Test
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/retention/recall-test', () => {
  it('submits successful recall test (long answer → quality 3+ via length heuristic)', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Calculus');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Introduction to Calculus',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);

    // Answer > 20 chars triggers length heuristic quality=3 → pass
    const res = await app.request(
      '/v1/retention/recall-test',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          topicId: topicIds[0],
          answer:
            'Calculus is the mathematical study of continuous change, using derivatives and integrals to analyze rates and areas',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.passed).toBe(true);
    expect(body.result.nextReviewAt).toBeDefined();
    expect(body.result.failureCount).toBe(0);
  });

  it('submits failed recall test (short answer → quality 2 via length heuristic)', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Calculus');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Derivatives',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);

    // Answer ≤ 20 chars triggers length heuristic quality=2 → fail
    const res = await app.request(
      '/v1/retention/recall-test',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          topicId: topicIds[0],
          answer: 'Something math',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.passed).toBe(false);
    expect(body.result.failureCount).toBe(1);
    expect(body.result.failureAction).toBe('feedback_only');
  });

  it('returns remediation after 3+ failures (FR52-58)', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Calculus');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Introduction to Calculus',
    ]);
    // Seed card with 2 existing failures — next failure triggers remediation
    await seedRetentionCard(profileId, topicIds[0]!, { failureCount: 2 });

    const res = await app.request(
      '/v1/retention/recall-test',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          topicId: topicIds[0],
          answer: 'No idea',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.passed).toBe(false);
    expect(body.result.failureCount).toBe(3);
    expect(body.result.failureAction).toBe('redirect_to_library');
    expect(body.result.remediation).toBeDefined();
    expect(body.result.remediation.options).toContain('relearn_topic');
    expect(body.result.remediation.topicTitle).toBe('Introduction to Calculus');
  });

  it('rejects missing topicId', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/retention/recall-test',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({ answer: 'Something' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.request(
      '/v1/retention/recall-test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: '00000000-0000-4000-8000-000000000001',
          answer: 'Something',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Relearn Topic
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/retention/relearn', () => {
  it('starts relearning with same method and resets retention card', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Physics');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Kinematics',
    ]);
    // Seed a card with some progress to verify reset
    await seedRetentionCard(profileId, topicIds[0]!, {
      easeFactor: '2.70',
      intervalDays: 10,
      repetitions: 5,
      failureCount: 3,
      consecutiveSuccesses: 2,
    });

    const res = await app.request(
      '/v1/retention/relearn',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          topicId: topicIds[0],
          method: 'same',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Relearn started');
    expect(body.topicId).toBe(topicIds[0]);
    expect(body.method).toBe('same');
    expect(body.resetPerformed).toBe(true);
    expect(body.sessionId).toBeDefined();

    // Verify the retention card was reset in the DB
    const db = createIntegrationDb();
    const card = await db.query.retentionCards.findFirst({
      where: (rc, { and, eq }) =>
        and(eq(rc.profileId, profileId), eq(rc.topicId, topicIds[0]!)),
    });
    expect(card).toBeDefined();
    expect(Number(card!.easeFactor)).toBe(2.5);
    expect(card!.intervalDays).toBe(1);
    expect(card!.repetitions).toBe(0);
    expect(card!.failureCount).toBe(0);
    expect(card!.consecutiveSuccesses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Needs-Deepening
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects/:subjectId/needs-deepening', () => {
  it('returns empty when no topics need deepening', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Chemistry');

    const res = await app.request(
      `/v1/subjects/${subjectId}/needs-deepening`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns topics flagged for deepening after relearn', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Physics');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Kinematics',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);

    // Trigger relearn to create needs-deepening entry
    await app.request(
      '/v1/retention/relearn',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          topicId: topicIds[0],
          method: 'same',
        }),
      },
      TEST_ENV
    );

    const res = await app.request(
      `/v1/subjects/${subjectId}/needs-deepening`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].topicId).toBe(topicIds[0]);
    expect(body.topics[0].status).toBe('active');
    expect(body.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Teaching Preferences
// ---------------------------------------------------------------------------

describe('Integration: Teaching Preference CRUD', () => {
  it('returns null when no preference set', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'History');

    const res = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preference).toBeNull();
  });

  it('sets and retrieves teaching preference', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'History');

    // PUT
    const putRes = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          subjectId,
          method: 'step_by_step',
        }),
      },
      TEST_ENV
    );

    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.preference.method).toBe('step_by_step');

    // GET — verify persistence
    const getRes = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.preference.method).toBe('step_by_step');
    expect(getBody.preference.subjectId).toBe(subjectId);
  });

  it('sets preference with analogy domain (FR134-FR137)', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Science');

    const res = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          subjectId,
          method: 'real_world_examples',
          analogyDomain: 'sports',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preference.method).toBe('real_world_examples');
    expect(body.preference.analogyDomain).toBe('sports');
  });

  it('resets teaching preference', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Art');

    // Set first
    await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({ subjectId, method: 'visual_diagrams' }),
      },
      TEST_ENV
    );

    // Delete
    const delRes = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.message).toContain('reset');

    // Verify it's gone
    const getRes = await app.request(
      `/v1/subjects/${subjectId}/teaching-preference`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );
    const getBody = await getRes.json();
    expect(getBody.preference).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stability (FR93)
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/retention/stability', () => {
  it('returns stable topics with 5+ consecutive successes', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Calculus');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Derivatives',
      'Integrals',
    ]);

    // Seed one stable card (6 successes) and one unstable (2 successes)
    await seedRetentionCard(profileId, topicIds[0]!, {
      consecutiveSuccesses: 6,
    });
    await seedRetentionCard(profileId, topicIds[1]!, {
      consecutiveSuccesses: 2,
    });

    const res = await app.request(
      `/v1/retention/stability?subjectId=${subjectId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics).toHaveLength(2);

    const stable = body.topics.find(
      (t: { topicId: string }) => t.topicId === topicIds[0]
    );
    const unstable = body.topics.find(
      (t: { topicId: string }) => t.topicId === topicIds[1]
    );

    expect(stable.isStable).toBe(true);
    expect(stable.consecutiveSuccesses).toBe(6);
    expect(unstable.isStable).toBe(false);
    expect(unstable.consecutiveSuccesses).toBe(2);
  });

  it('returns all topics when no subjectId provided', async () => {
    const profileId = await createOwnerProfile();

    const subjectId = await createSubject(profileId, 'Physics');
    const { topicIds } = await seedCurriculumWithTopics(subjectId, [
      'Kinematics',
    ]);
    await seedRetentionCard(profileId, topicIds[0]!);

    const res = await app.request(
      '/v1/retention/stability',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics.length).toBeGreaterThanOrEqual(1);
  });
});
