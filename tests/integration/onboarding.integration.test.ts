/**
 * Integration: Onboarding Lifecycle
 *
 * Exercises the real onboarding routes through the full app + real database.
 * Draft persistence, curriculum creation, and ownership checks stay real.
 *
 * Mocked boundaries:
 * - JWT verification
 * - LLM transport (`routeAndCall` / `routeAndStream`)
 */

import { and, desc, eq } from 'drizzle-orm';
import {
  curricula,
  curriculumTopics,
  onboardingDrafts,
  subjects,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

const mockRouteAndCall = jest.fn();
const mockRouteAndStream = jest.fn();

jest.mock('../../apps/api/src/services/llm', () => {
  const actual = jest.requireActual(
    '../../apps/api/src/services/llm'
  ) as Record<string, unknown>;

  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
    routeAndStream: (...args: unknown[]) => mockRouteAndStream(...args),
  };
});

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-onboarding-user';
const AUTH_EMAIL = 'integration-onboarding@integration.test';

function buildLlmResult(response: string) {
  return {
    response,
    provider: 'mock',
    model: 'mock-model',
    latencyMs: 1,
  };
}

function installLlmMocks(): void {
  mockRouteAndCall.mockImplementation(
    async (messages: Array<{ role: string; content: string }>) => {
      const lastMessage = messages[messages.length - 1]?.content ?? '';

      if (lastMessage.includes('Extract signals from this interview')) {
        return buildLlmResult(
          JSON.stringify({
            goals: ['learn algebra'],
            experienceLevel: 'beginner',
            currentKnowledge: 'basic arithmetic',
          })
        );
      }

      if (
        lastMessage.includes('Subject:') &&
        lastMessage.includes('Interview Summary')
      ) {
        return buildLlmResult(
          JSON.stringify([
            {
              title: 'Algebra Foundations',
              description: 'Variables, expressions, and equations',
              relevance: 'core',
              estimatedMinutes: 30,
            },
            {
              title: 'Linear Equations',
              description: 'Solving one-step and two-step equations',
              relevance: 'core',
              estimatedMinutes: 40,
            },
          ])
        );
      }

      if (
        lastMessage.includes('interested in learning') ||
        lastMessage.includes('I want to learn')
      ) {
        return buildLlmResult(
          JSON.stringify({
            reply: 'What specific topics interest you?',
            signals: { ready_to_finish: true },
            ui_hints: {},
            confidence: 'high',
          })
        );
      }

      return buildLlmResult('Tell me more about your learning goals.');
    }
  );

  mockRouteAndStream.mockImplementation(async () => ({
    provider: 'mock',
    model: 'mock-stream',
    stream: (async function* () {
      yield JSON.stringify({
        reply: 'We should start with algebra.',
        signals: { ready_to_finish: true },
        ui_hints: {},
        confidence: 'high',
      });
    })(),
  }));
}

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Onboarding Learner',
        birthYear: 2000,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function seedSubject(profileId: string, name = 'Mathematics') {
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

  return subject!;
}

async function loadDraft(profileId: string, subjectId: string) {
  const db = createIntegrationDb();
  return db.query.onboardingDrafts.findFirst({
    where: and(
      eq(onboardingDrafts.profileId, profileId),
      eq(onboardingDrafts.subjectId, subjectId)
    ),
    orderBy: [desc(onboardingDrafts.updatedAt)],
  });
}

async function loadCurriculum(subjectId: string) {
  const db = createIntegrationDb();
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });

  const topics = curriculum
    ? await db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.curriculumId, curriculum.id),
      })
    : [];

  return { curriculum, topics };
}

beforeEach(async () => {
  jest.clearAllMocks();
  installLlmMocks();

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

describe('Integration: Onboarding interview routes', () => {
  it('persists an in-progress interview draft and exposes resumable state', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId);

    const postRes = await app.request(
      `/v1/subjects/${subject.id}/interview`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({ message: 'Hello, I just started' }),
      },
      TEST_ENV
    );

    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody).toEqual({
      response: 'Tell me more about your learning goals.',
      isComplete: false,
      exchangeCount: 1,
    });

    const draft = await loadDraft(profileId, subject.id);
    expect(draft).toBeDefined();
    expect(draft!.status).toBe('in_progress');
    expect(draft!.exchangeHistory).toEqual([
      { role: 'user', content: 'Hello, I just started' },
      {
        role: 'assistant',
        content: 'Tell me more about your learning goals.',
      },
    ]);

    const stateRes = await app.request(
      `/v1/subjects/${subject.id}/interview`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(stateRes.status).toBe(200);
    const stateBody = await stateRes.json();
    expect(stateBody.state.status).toBe('in_progress');
    expect(stateBody.state.exchangeCount).toBe(1);
    expect(stateBody.state.subjectName).toBe('Mathematics');
    expect(stateBody.state.resumeSummary).toContain('Hello, I just started');
    expect(stateBody.state.exchangeHistory).toHaveLength(2);
  });

  it('completes onboarding and persists a curriculum via the real route stack', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId, 'Algebra');

    const res = await app.request(
      `/v1/subjects/${subject.id}/interview`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({
          message: 'I am interested in learning algebra',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isComplete).toBe(true);
    expect(body.exchangeCount).toBe(1);
    expect(body.response).toBe('What specific topics interest you?');

    const draft = await loadDraft(profileId, subject.id);
    expect(draft).toBeDefined();
    expect(draft!.status).toBe('completed');
    expect(draft!.exchangeHistory).toHaveLength(2);
    expect(draft!.extractedSignals).toEqual({
      goals: ['learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: 'basic arithmetic',
      interests: [],
    });

    const persisted = await loadCurriculum(subject.id);
    expect(persisted.curriculum).toBeDefined();
    expect(persisted.topics).toHaveLength(2);
    expect(persisted.topics.map((topic) => topic.title)).toEqual([
      'Algebra Foundations',
      'Linear Equations',
    ]);

    const curriculumRes = await app.request(
      `/v1/subjects/${subject.id}/curriculum`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
      },
      TEST_ENV
    );

    expect(curriculumRes.status).toBe(200);
    const curriculumBody = await curriculumRes.json();
    expect(curriculumBody.curriculum.topics).toHaveLength(2);
    expect(curriculumBody.curriculum.topics[0].title).toBe(
      'Algebra Foundations'
    );
  });

  it('streams onboarding completion over SSE and persists the completed draft', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId, 'Geometry');

    const res = await app.request(
      `/v1/subjects/${subject.id}/interview/stream`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId
        ),
        body: JSON.stringify({ message: 'I want to learn geometry' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await res.text();
    expect(body).toContain('"type":"chunk"');
    expect(body).toContain('"type":"done"');
    expect(body).toContain('"isComplete":true');

    const draft = await loadDraft(profileId, subject.id);
    expect(draft!.status).toBe('completed');

    const persisted = await loadCurriculum(subject.id);
    expect(persisted.curriculum).toBeDefined();
    expect(persisted.topics).toHaveLength(2);
  });

  it('returns 401 without authentication', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId);

    const res = await app.request(
      `/v1/subjects/${subject.id}/interview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Profile-Id': profileId,
        },
        body: JSON.stringify({ message: 'I want to learn algebra' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
