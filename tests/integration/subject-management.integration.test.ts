/**
 * Integration: Subject Management Endpoints
 *
 * Exercises the subject CRUD routes via the real app + real database.
 * JWT verification uses the real fetch interceptor installed in setup.ts.
 *
 * Validates:
 *
 * 1. GET /v1/subjects — 200 returns subjects list
 * 2. GET /v1/subjects?includeInactive=true — passes flag to service
 * 3. POST /v1/subjects — 201 creates subject
 * 4. POST /v1/subjects — 400 with invalid body
 * 5. GET /v1/subjects/:id — 200 returns subject
 * 6. GET /v1/subjects/:id — 404 when not found/cross-profile
 * 7. PATCH /v1/subjects/:id — 200 updates subject
 * 8. PATCH /v1/subjects/:id — 404 when not found/cross-profile
 * 9. DELETE /v1/subjects/:id — 200 hard-deletes owned subject data
 * 10. DELETE /v1/subjects/:id — 400/403/404 boundary behavior
 * 11. GET /v1/subjects — 401 without auth
 */

const mockCaptureException = jest.fn();
const mockSetUser = jest.fn();
const mockSetTag = jest.fn();

jest.mock('@sentry/cloudflare', () => ({
  // gc1-allow: @sentry/cloudflare is an external observability SDK — no real Sentry transport is available in the test environment; the Cloudflare-specific withSentry/withScope wrappers require a live DSN and worker context to initialise
  withScope: (fn) =>
    fn({
      setUser: (...args) => mockSetUser(...args),
      setTag: (...args) => mockSetTag(...args),
      setExtra: jest.fn(),
    }),
  captureException: (...args) => mockCaptureException(...args),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withSentry: (_config, handler) => handler,
}));

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedAssessmentRecord,
  seedCurriculum,
  seedLearningSession,
  seedXpLedgerEntry,
  seedSubject,
} from './route-fixtures';
import { clearFetchCalls } from './fetch-interceptor';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import {
  createSubjectWithStructureResponseSchema,
  deleteSubjectResponseSchema,
  ERROR_CODES,
  resumeTargetResponseSchema,
  subjectClassifyResultSchema,
  subjectListResponseSchema,
  subjectResolveResultSchema,
  subjectResponseSchema,
  UpstreamLlmError,
} from '@eduagent/schemas';
import { eq } from 'drizzle-orm';
import {
  assessments,
  curriculumBooks,
  generateUUIDv7,
  learningSessions,
  practiceActivityEvents,
  quizRounds,
  subjects,
  xpLedger,
} from '@eduagent/database';

import { app } from '../../apps/api/src/index';
import {
  _clearProviders,
  _resetCircuits,
} from '../../apps/api/src/services/llm';
import { registerLlmProviderFixture } from '../../apps/api/src/test-utils/llm-provider-fixtures';
import {
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';

const TEST_ENV = buildIntegrationEnv();
const SUBJECT_AUTH_USER_ID = 'integration-subject-user';
const SUBJECT_AUTH_EMAIL = 'integration-subjects@integration.test';
const OTHER_SUBJECT_AUTH_USER_ID = 'integration-subject-other-user';
const OTHER_SUBJECT_AUTH_EMAIL = 'integration-subjects-other@integration.test';

const SUBJECT_ID = '00000000-0000-4000-8000-000000000040';
const SUBJECT_LLM_RESPONSE = {
  status: 'corrected',
  resolvedName: 'Physics',
  focus: null,
  focusDescription: null,
  suggestions: [
    {
      name: 'Physics',
      description: 'Forces, motion, energy and the laws of the universe',
    },
  ],
  displayMessage: 'Did you mean **Physics**?',
};

const subjectLlmFixture = registerLlmProviderFixture({
  chatResponse: SUBJECT_LLM_RESPONSE,
});

// Subject route integration tests exercise real route/service code; install the
// external Inngest HTTP boundary once and clear captured calls in tests that
// assert dispatches.
beforeAll(() => {
  mockInngestEvents();
});

async function createOwnerProfile(
  user = { userId: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
  displayName = 'Integration Learner',
): Promise<string> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user,
    displayName,
    birthYear: 2000,
  });
  return profile.id;
}

async function createSubject(
  profileId: string,
  name: string,
  user = { userId: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
): Promise<{
  id: string;
  name: string;
}> {
  const res = await app.request(
    '/v1/subjects',
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: user.userId, email: user.email },
        profileId,
      ),
      body: JSON.stringify({ name }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = createSubjectWithStructureResponseSchema.parse(await res.json());
  expect(body.subject).toMatchObject({ id: expect.any(String), name });
  return body.subject as { id: string; name: string };
}

beforeEach(async () => {
  jest.clearAllMocks();
  subjectLlmFixture.clearCalls();
  subjectLlmFixture.clearChatError();
  subjectLlmFixture.setChatResponse(SUBJECT_LLM_RESPONSE);
  await cleanupAccounts({
    emails: [SUBJECT_AUTH_EMAIL, OTHER_SUBJECT_AUTH_EMAIL],
    clerkUserIds: [SUBJECT_AUTH_USER_ID, OTHER_SUBJECT_AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [SUBJECT_AUTH_EMAIL, OTHER_SUBJECT_AUTH_EMAIL],
    clerkUserIds: [SUBJECT_AUTH_USER_ID, OTHER_SUBJECT_AUTH_USER_ID],
  });
  _clearProviders();
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/resolve
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects/resolve', () => {
  it('returns 502 and captures Sentry when the subject resolver LLM is unavailable', async () => {
    const profileId = await createOwnerProfile();
    const upstreamError = new UpstreamLlmError(
      'Subject resolver LLM unavailable',
    );
    subjectLlmFixture.setChatError(upstreamError);
    mockCaptureException.mockClear();
    _resetCircuits();

    try {
      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ rawInput: 'Physics' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body).toMatchObject({
        code: ERROR_CODES.UPSTREAM_ERROR,
        message: upstreamError.message,
      });
      // The wrapper calls @sentry/cloudflare.captureException(err) with only the error;
      // context (userId, profileId, requestPath) goes via scope.setUser/setTag, not as a 2nd arg.
      expect(mockCaptureException).toHaveBeenCalledWith(upstreamError);
      expect(mockSetUser).toHaveBeenCalledWith({ id: SUBJECT_AUTH_USER_ID });
      expect(mockSetTag).toHaveBeenCalledWith('profileId', profileId);
      expect(mockSetTag).toHaveBeenCalledWith(
        'requestPath',
        '/v1/subjects/resolve',
      );
    } finally {
      subjectLlmFixture.clearChatError();
      subjectLlmFixture.setChatResponse(SUBJECT_LLM_RESPONSE);
      _resetCircuits();
    }
  });
});

// ---------------------------------------------------------------------------
// GET /v1/subjects
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects', () => {
  it('returns 200 with subjects list', async () => {
    const profileId = await createOwnerProfile();
    const subject = await createSubject(profileId, 'Mathematics');

    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectListResponseSchema.parse(await res.json());
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].id).toBe(subject.id);
    expect(body.subjects[0].name).toBe('Mathematics');
  });

  it('passes includeInactive=true to service', async () => {
    const profileId = await createOwnerProfile();
    const active = await createSubject(profileId, 'Mathematics');
    const archived = await createSubject(profileId, 'History');

    const archiveRes = await app.request(
      `/v1/subjects/${archived.id}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ status: 'archived' }),
      },
      TEST_ENV,
    );
    expect(archiveRes.status).toBe(200);

    const res = await app.request(
      '/v1/subjects?includeInactive=true',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectListResponseSchema.parse(await res.json());
    expect(body.subjects).toHaveLength(2);
    expect(body.subjects.map((row: { id: string }) => row.id)).toEqual(
      expect.arrayContaining([active.id, archived.id]),
    );
  });

  it('returns 401 without auth', async () => {
    const res = await app.request('/v1/subjects', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects', () => {
  it('returns 201 when creating subject', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/subjects',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ name: 'Mathematics' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    const body = createSubjectWithStructureResponseSchema.parse(
      await res.json(),
    );
    expect(body.subject).toMatchObject({
      id: expect.any(String),
      name: 'Mathematics',
    });
    expect(body.structureType).toBe('broad');
  });

  it('returns 400 with invalid body (empty name)', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/subjects',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ name: '' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects/:id', () => {
  it('returns 200 with subject', async () => {
    const profileId = await createOwnerProfile();
    const subject = await createSubject(profileId, 'Mathematics');

    const res = await app.request(
      `/v1/subjects/${subject.id}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectResponseSchema.parse(await res.json());
    expect(body.subject).toMatchObject({ id: subject.id, name: 'Mathematics' });
  });

  it('does not expose a subject across two seeded profiles', async () => {
    const ownerProfileId = await createOwnerProfile();
    const otherProfileId = await createOwnerProfile(
      {
        userId: OTHER_SUBJECT_AUTH_USER_ID,
        email: OTHER_SUBJECT_AUTH_EMAIL,
      },
      'Other Integration Learner',
    );
    const subject = await createSubject(ownerProfileId, 'Private Mathematics');
    const otherHeaders = buildAuthHeaders(
      {
        sub: OTHER_SUBJECT_AUTH_USER_ID,
        email: OTHER_SUBJECT_AUTH_EMAIL,
      },
      otherProfileId,
    );

    const detailRes = await app.request(
      `/v1/subjects/${subject.id}`,
      {
        method: 'GET',
        headers: otherHeaders,
      },
      TEST_ENV,
    );
    expect(detailRes.status).toBe(404);

    const patchRes = await app.request(
      `/v1/subjects/${subject.id}`,
      {
        method: 'PATCH',
        headers: otherHeaders,
        body: JSON.stringify({ name: 'Hijacked Mathematics' }),
      },
      TEST_ENV,
    );
    expect(patchRes.status).toBe(404);

    const listRes = await app.request(
      '/v1/subjects?includeInactive=true',
      {
        method: 'GET',
        headers: otherHeaders,
      },
      TEST_ENV,
    );
    expect(listRes.status).toBe(200);
    const listBody = subjectListResponseSchema.parse(await listRes.json());
    expect(listBody.subjects).toEqual([]);
  });

  it('returns 404 when not found', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('Integration: PATCH /v1/subjects/:id', () => {
  it('returns 200 when updating subject', async () => {
    const profileId = await createOwnerProfile();
    const subject = await createSubject(profileId, 'Mathematics');

    const res = await app.request(
      `/v1/subjects/${subject.id}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ name: 'Advanced Mathematics' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectResponseSchema.parse(await res.json());
    expect(body.subject).toMatchObject({
      id: subject.id,
      name: 'Advanced Mathematics',
    });
  });

  it('returns 404 when not found', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ name: 'Updated Name' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('Integration: DELETE /v1/subjects/:id', () => {
  async function seedSubjectDeleteGraph(profileId: string, name: string) {
    const db = getIntegrationDb();
    const subject = await seedSubject(profileId, name);
    const curriculum = await seedCurriculum({
      subjectId: subject.id,
      bookTitle: `${name} Book`,
      topics: [{ title: `${name} Topic` }],
    });
    const topicId = curriculum.topicIds[0]!;
    const sessionId = await seedLearningSession({
      profileId,
      subjectId: subject.id,
      topicId,
    });
    await seedAssessmentRecord({
      profileId,
      subjectId: subject.id,
      topicId,
      sessionId,
      status: 'passed',
      masteryScore: 0.8,
    });
    await seedXpLedgerEntry({
      profileId,
      subjectId: subject.id,
      topicId,
      amount: 10,
    });
    const [practice] = await db
      .insert(practiceActivityEvents)
      .values({
        profileId,
        subjectId: subject.id,
        activityType: 'review',
        pointsEarned: 5,
        sourceType: 'integration_test',
        sourceId: `${subject.id}:practice`,
        dedupeKey: `${subject.id}:practice`,
        metadata: {},
      })
      .returning({ id: practiceActivityEvents.id });
    const [quiz] = await db
      .insert(quizRounds)
      .values({
        profileId,
        subjectId: subject.id,
        activityType: 'capitals',
        theme: 'integration',
        questions: [],
        results: [],
        total: 1,
        status: 'completed',
      })
      .returning({ id: quizRounds.id });

    if (!practice || !quiz) {
      throw new Error('Failed to seed subject delete set-null fixtures');
    }

    return {
      subject,
      bookId: curriculum.bookId,
      sessionId,
      practiceId: practice.id,
      quizId: quiz.id,
    };
  }

  it('hard-deletes the subject and cascades dependent learning rows while preserving analytics set-null rows', async () => {
    const profileId = await createOwnerProfile();
    const fixture = await seedSubjectDeleteGraph(profileId, 'Disposable Math');
    const db = getIntegrationDb();

    const res = await app.request(
      `/v1/subjects/${fixture.subject.id}`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(deleteSubjectResponseSchema.parse(await res.json())).toEqual({
      deleted: true,
      subjectId: fixture.subject.id,
    });
    await expect(
      db.query.subjects.findFirst({
        where: eq(subjects.id, fixture.subject.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.curriculumBooks.findMany({
        where: eq(curriculumBooks.subjectId, fixture.subject.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.learningSessions.findMany({
        where: eq(learningSessions.subjectId, fixture.subject.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.assessments.findMany({
        where: eq(assessments.subjectId, fixture.subject.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.xpLedger.findMany({
        where: eq(xpLedger.subjectId, fixture.subject.id),
      }),
    ).resolves.toEqual([]);

    const practice = await db.query.practiceActivityEvents.findFirst({
      where: eq(practiceActivityEvents.id, fixture.practiceId),
    });
    expect(practice?.subjectId).toBeNull();
    const quiz = await db.query.quizRounds.findFirst({
      where: eq(quizRounds.id, fixture.quizId),
    });
    expect(quiz?.subjectId).toBeNull();

    const resumeRes = await app.request(
      '/v1/progress/resume-target',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );
    expect(resumeRes.status).toBe(200);
    expect(resumeTargetResponseSchema.parse(await resumeRes.json())).toEqual({
      target: null,
    });
  });

  it('returns 404 on repeat delete after the first successful hard delete', async () => {
    const profileId = await createOwnerProfile();
    const fixture = await seedSubjectDeleteGraph(profileId, 'Repeat Delete');
    const headers = buildAuthHeaders(
      { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
      profileId,
    );

    const first = await app.request(
      `/v1/subjects/${fixture.subject.id}`,
      { method: 'DELETE', headers },
      TEST_ENV,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      `/v1/subjects/${fixture.subject.id}`,
      { method: 'DELETE', headers },
      TEST_ENV,
    );
    expect(second.status).toBe(404);
    expect((await second.json()).code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('returns 400 for a malformed subject id before touching storage', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/subjects/not-a-uuid',
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 in proxy mode and leaves the child subject intact', async () => {
    const ownerProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: { userId: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
      displayName: 'Proxy Parent',
      birthYear: 1980,
    });
    const childProfileId = generateUUIDv7();
    const db = getIntegrationDb();
    await ensureLegacyProfileAnchorForTest(db, {
      profileId: childProfileId,
      accountId: ownerProfile.accountId,
      displayName: 'Proxy Child',
      birthYear: 2013,
      isOwner: false,
    });
    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId: ownerProfile.accountId,
      profileId: childProfileId,
      displayName: 'Proxy Child',
      birthYear: 2013,
      clerkUserId: `${SUBJECT_AUTH_USER_ID}-proxy-child`,
      email: `proxy-child-${childProfileId}@integration.test`,
      isOwner: false,
    });
    const subject = await seedSubject(childProfileId, 'Proxy Math');

    const res = await app.request(
      `/v1/subjects/${subject.id}`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          childProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PROXY_MODE' });
    await expect(
      db.query.subjects.findFirst({ where: eq(subjects.id, subject.id) }),
    ).resolves.toBeDefined();
  });

  it('does not delete another profile subject or its children', async () => {
    const ownerProfileId = await createOwnerProfile();
    const otherProfileId = await createOwnerProfile(
      {
        userId: OTHER_SUBJECT_AUTH_USER_ID,
        email: OTHER_SUBJECT_AUTH_EMAIL,
      },
      'Other Integration Learner',
    );
    const fixture = await seedSubjectDeleteGraph(
      ownerProfileId,
      'Private Deletion Target',
    );
    const db = getIntegrationDb();

    const res = await app.request(
      `/v1/subjects/${fixture.subject.id}`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          {
            sub: OTHER_SUBJECT_AUTH_USER_ID,
            email: OTHER_SUBJECT_AUTH_EMAIL,
          },
          otherProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe(ERROR_CODES.NOT_FOUND);
    await expect(
      db.query.subjects.findFirst({
        where: eq(subjects.id, fixture.subject.id),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, fixture.bookId),
      }),
    ).resolves.toBeDefined();
    await expect(
      db.query.learningSessions.findFirst({
        where: eq(learningSessions.id, fixture.sessionId),
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/:id/retry-curriculum
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects/:id/retry-curriculum', () => {
  it('redispatches stuck curriculum through the real route and clears terminal failure state', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId, 'Mathematics');
    const db = getIntegrationDb();
    const [book] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: subject.id,
        title: 'Retry Evidence Book',
        sortOrder: 0,
        topicsGenerated: false,
        failedAt: new Date('2026-06-20T12:00:00Z'),
        failedReason: 'generation_error',
      })
      .returning({ id: curriculumBooks.id });

    if (!book) {
      throw new Error('Insert into curriculumBooks did not return a row');
    }

    clearFetchCalls();

    const res = await app.request(
      `/v1/subjects/${subject.id}/retry-curriculum`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dispatched: 1 });
    expect(getCapturedInngestEvents()).toEqual([
      expect.objectContaining({
        name: 'app/subject.curriculum-retry-requested',
        data: expect.objectContaining({
          version: 1,
          profileId,
          subjectId: subject.id,
          bookId: book.id,
          timestamp: expect.any(String),
        }),
      }),
    ]);

    await expect(
      db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, book.id),
      }),
    ).resolves.toMatchObject({
      failedAt: null,
      failedReason: null,
    });
  });

  it('does not retry or clear another profile subject curriculum', async () => {
    const ownerProfileId = await createOwnerProfile();
    const otherProfileId = await createOwnerProfile(
      {
        userId: OTHER_SUBJECT_AUTH_USER_ID,
        email: OTHER_SUBJECT_AUTH_EMAIL,
      },
      'Other Integration Learner',
    );
    const subject = await seedSubject(ownerProfileId, 'Private Mathematics');
    const db = getIntegrationDb();
    const failedAt = new Date('2026-06-20T12:00:00Z');
    const [book] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: subject.id,
        title: 'Private Retry Evidence Book',
        sortOrder: 0,
        topicsGenerated: false,
        failedAt,
        failedReason: 'generation_error',
      })
      .returning({ id: curriculumBooks.id });

    if (!book) {
      throw new Error('Insert into curriculumBooks did not return a row');
    }

    clearFetchCalls();

    const res = await app.request(
      `/v1/subjects/${subject.id}/retry-curriculum`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          {
            sub: OTHER_SUBJECT_AUTH_USER_ID,
            email: OTHER_SUBJECT_AUTH_EMAIL,
          },
          otherProfileId,
        ),
      },
      TEST_ENV,
    );

    expect([403, 404]).toContain(res.status);
    expect(getCapturedInngestEvents()).toEqual([]);
    await expect(
      db.query.curriculumBooks.findFirst({
        where: eq(curriculumBooks.id, book.id),
      }),
    ).resolves.toMatchObject({
      failedAt,
      failedReason: 'generation_error',
    });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/resolve
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects/resolve', () => {
  it('returns the real resolver output through the shared response schema', async () => {
    const profileId = await createOwnerProfile();

    const res = await app.request(
      '/v1/subjects/resolve',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ rawInput: 'Phsics' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectResolveResultSchema.parse(await res.json());
    expect(body.status).toBe('corrected');
    expect(body.resolvedName).toBe('Physics');
    expect(subjectLlmFixture.chatCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/classify
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects/classify', () => {
  it('uses real subject services to classify against enrolled subjects', async () => {
    const profileId = await createOwnerProfile();
    const subject = await createSubject(profileId, 'Mathematics');
    await createSubject(profileId, 'History');
    subjectLlmFixture.clearCalls();
    subjectLlmFixture.setChatResponse({
      matches: [{ subjectName: 'Mathematics', confidence: 0.92 }],
      suggestedSubjectName: null,
    });

    const res = await app.request(
      '/v1/subjects/classify',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ text: 'Solve 2x + 5 = 15' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectClassifyResultSchema.parse(await res.json());
    expect(body).toMatchObject({
      needsConfirmation: false,
      suggestedSubjectName: null,
    });
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      subjectId: subject.id,
      subjectName: 'Mathematics',
    });
    expect(body.candidates[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(subjectLlmFixture.chatCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/subjects/:id/language-setup
// ---------------------------------------------------------------------------

describe('Integration: PUT /v1/subjects/:id/language-setup', () => {
  it('returns 422 for a real non-language subject typed error', async () => {
    const profileId = await createOwnerProfile();
    const subject = await createSubject(profileId, 'Mathematics');

    const res = await app.request(
      `/v1/subjects/${subject.id}/language-setup`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ nativeLanguage: 'en', startingLevel: 'A1' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('configures a real language subject and regenerates curriculum', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject(profileId, 'Spanish', {
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/language-setup`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: SUBJECT_AUTH_USER_ID, email: SUBJECT_AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ nativeLanguage: 'en', startingLevel: 'A2' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = subjectResponseSchema.parse(await res.json());
    expect(body.subject).toMatchObject({
      id: subject.id,
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    });
  });
});
