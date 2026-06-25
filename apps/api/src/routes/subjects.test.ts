/**
 * Negative-path and boundary tests for the subjects routes.
 *
 * Strategy: mount a mini Hono app that injects a profile via middleware,
 * bypassing auth. Services are mocked via jest.requireActual + targeted
 * overrides to preserve real error classes for instanceof checks.
 *
 * Pattern: follows subjects-language-setup.test.ts.
 */

jest.mock(
  '../services/subject' /* gc1-allow: unit-route isolation; real service covered by integration tests */,
  () => {
    const actual = jest.requireActual(
      '../services/subject',
    ) as typeof import('../services/subject');
    return {
      ...actual,
      listSubjects: jest.fn(),
      createSubjectWithStructure: jest.fn(),
      configureLanguageSubject: jest.fn(),
      getSubject: jest.fn(),
      updateSubject: jest.fn(),
      retryCurriculumForSubject: jest.fn(),
    };
  },
);

jest.mock(
  '../services/subject-resolve' /* gc1-allow: unit-route isolation for subjects route */,
  () => {
    const actual = jest.requireActual(
      '../services/subject-resolve',
    ) as typeof import('../services/subject-resolve');
    return {
      ...actual,
      resolveSubjectName: jest.fn(),
    };
  },
);

jest.mock(
  '../services/subject-classify' /* gc1-allow: unit-route isolation for subjects route */,
  () => {
    const actual = jest.requireActual(
      '../services/subject-classify',
    ) as typeof import('../services/subject-classify');
    return {
      ...actual,
      classifySubject: jest.fn(),
    };
  },
);

// Inngest client mock — prevents real Inngest send in route tests
jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock(
  '../inngest/client' /* gc1-allow: unit-route isolation for subjects route */,
  () => {
    const actual = jest.requireActual(
      '../inngest/client',
    ) as typeof import('../inngest/client');
    return {
      ...actual,
      inngest: {
        send: jest.fn().mockResolvedValue(undefined),
        createFunction: jest.fn().mockReturnValue(jest.fn()),
      },
    };
  },
);

import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  listSubjects,
  createSubjectWithStructure,
  getSubject,
  updateSubject,
  retryCurriculumForSubject,
  SubjectLimitError,
} from '../services/subject';
import { resolveSubjectName } from '../services/subject-resolve';
import { classifySubject } from '../services/subject-classify';
import { subjectRoutes } from './subjects';
import { ERROR_CODES, SubjectNotFoundError } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const OTHER_PROFILE_ID = 'a0000000-0000-4000-a000-000000000099';

// ---------------------------------------------------------------------------
// App factory — bypasses auth, injects profile context
// ---------------------------------------------------------------------------

type TestEnv = {
  Bindings: { DATABASE_URL: string; IDENTITY_V2_ENABLED?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta:
      | { isOwner: boolean; resolvedVia: 'auto' | 'explicit-header' }
      | undefined;
  };
};

function makeApp(opts?: {
  profileId?: string;
  profileMeta?: { isOwner: boolean; resolvedVia: 'auto' | 'explicit-header' };
}) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('profileId', opts?.profileId ?? PROFILE_ID);
    c.set(
      'profileMeta',
      opts?.profileMeta ?? { isOwner: true, resolvedVia: 'explicit-header' },
    );
    await next();
  });
  app.onError((err, c) =>
    c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
  );
  app.route('/v1', subjectRoutes);
  return app;
}

const listSubjectsMock = jest.mocked(listSubjects);
const createSubjectWithStructureMock = jest.mocked(createSubjectWithStructure);
const getSubjectMock = jest.mocked(getSubject);
const updateSubjectMock = jest.mocked(updateSubject);
const retryCurriculumForSubjectMock = jest.mocked(retryCurriculumForSubject);
const resolveSubjectNameMock = jest.mocked(resolveSubjectName);
const classifySubjectMock = jest.mocked(classifySubject);

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /v1/subjects
// ---------------------------------------------------------------------------

describe('GET /v1/subjects', () => {
  it('returns 200 with the subject list', async () => {
    const subject = makeSubjectRecord();
    listSubjectsMock.mockResolvedValue([subject]);

    const res = await makeApp().request('/v1/subjects');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ subjects: [{ id: SUBJECT_ID }] });
    expect(listSubjectsMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { includeInactive: false },
    );
  });

  it('returns 200 with an empty array when the profile has no subjects', async () => {
    listSubjectsMock.mockResolvedValue([]);

    const res = await makeApp().request('/v1/subjects');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ subjects: [] });
  });

  it('passes includeInactive=true to the service when the query param is set', async () => {
    listSubjectsMock.mockResolvedValue([]);

    await makeApp().request('/v1/subjects?includeInactive=true');

    expect(listSubjectsMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { includeInactive: true },
    );
  });

  it('returns 400 when profileId is absent (missing profile context)', async () => {
    const app = new Hono<TestEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('profileId', undefined);
      await next();
    });
    app.route('/v1', subjectRoutes);

    const res = await app.request('/v1/subjects');
    // requireProfileId throws HTTPException(400)
    expect(res.status).toBe(400);
  });

  it('propagates service errors to 500', async () => {
    listSubjectsMock.mockRejectedValue(new Error('DB down'));

    const res = await makeApp().request('/v1/subjects');

    expect(res.status).toBe(500);
  });

  it('[WI-991] returns 400 when includeInactive query param has an invalid value', async () => {
    const res = await makeApp().request(
      '/v1/subjects?includeInactive=notabool',
    );
    expect(res.status).toBe(400);
  });

  it('[WI-991] returns 400 when includeInactive query param is an arbitrary string', async () => {
    const res = await makeApp().request('/v1/subjects?includeInactive=yes');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects
// ---------------------------------------------------------------------------

describe('POST /v1/subjects', () => {
  function validCreateBody(overrides?: Record<string, unknown>) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Chemistry', ...overrides }),
    };
  }

  it('returns 201 on successful subject creation', async () => {
    createSubjectWithStructureMock.mockResolvedValue({
      subject: makeSubjectRecord(),
      structureType: 'narrow',
    });

    const res = await makeApp().request('/v1/subjects', validCreateBody());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ subject: { id: SUBJECT_ID } });
    expect(createSubjectWithStructureMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      expect.objectContaining({ name: 'Chemistry' }),
      { conversationLanguage: undefined, identityV2Enabled: false },
    );
  });

  it('threads identityV2Enabled: true into the service when the v2 flag is on', async () => {
    createSubjectWithStructureMock.mockResolvedValue({
      subject: makeSubjectRecord(),
      structureType: 'narrow',
    });

    const res = await makeApp().request('/v1/subjects', validCreateBody(), {
      DATABASE_URL: 'postgres://test',
      IDENTITY_V2_ENABLED: 'true',
    });

    expect(res.status).toBe(201);
    expect(createSubjectWithStructureMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      expect.objectContaining({ name: 'Chemistry' }),
      { conversationLanguage: undefined, identityV2Enabled: true },
    );
  });

  it('returns 400 when the name field is missing', async () => {
    const res = await makeApp().request('/v1/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(createSubjectWithStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is not a string', async () => {
    const res = await makeApp().request(
      '/v1/subjects',
      validCreateBody({ name: 42 }),
    );

    expect(res.status).toBe(400);
    expect(createSubjectWithStructureMock).not.toHaveBeenCalled();
  });

  it('propagates service errors to 500 (lets global handler classify LLM errors)', async () => {
    createSubjectWithStructureMock.mockRejectedValue(new Error('LLM timeout'));

    const res = await makeApp().request('/v1/subjects', validCreateBody());

    expect(res.status).toBe(500);
  });

  it('[WI-855] returns 409 SUBJECT_LIMIT_EXCEEDED when the service throws SubjectLimitError', async () => {
    createSubjectWithStructureMock.mockRejectedValue(new SubjectLimitError());

    const res = await makeApp().request('/v1/subjects', validCreateBody());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      code: ERROR_CODES.SUBJECT_LIMIT_EXCEEDED,
      message: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// GET /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('GET /v1/subjects/:id', () => {
  it('[F-166] returns 400 for a malformed (non-UUID) subject id', async () => {
    const res = await makeApp().request('/v1/subjects/not-a-uuid');
    expect(res.status).toBe(400);
    expect(getSubjectMock).not.toHaveBeenCalled();
  });

  it('returns 200 when the subject is found for this profile', async () => {
    getSubjectMock.mockResolvedValue(makeSubjectRecord());

    const res = await makeApp().request(`/v1/subjects/${SUBJECT_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ subject: { id: SUBJECT_ID } });
    expect(getSubjectMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      SUBJECT_ID,
    );
  });

  it('returns 404 when the subject is not found', async () => {
    getSubjectMock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/subjects/${SUBJECT_ID}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 404 when a different profile tries to access this subject (scoped at service layer)', async () => {
    // getSubject uses createScopedRepository(db, profileId) — wrong profile returns null
    getSubjectMock.mockResolvedValue(null);

    const res = await makeApp({ profileId: OTHER_PROFILE_ID }).request(
      `/v1/subjects/${SUBJECT_ID}`,
    );

    expect(res.status).toBe(404);
    expect(getSubjectMock).toHaveBeenCalledWith(
      expect.anything(),
      OTHER_PROFILE_ID,
      SUBJECT_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('PATCH /v1/subjects/:id', () => {
  function patchRequest(body: Record<string, unknown>) {
    return {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  it('[F-166] returns 400 for a malformed (non-UUID) subject id', async () => {
    const res = await makeApp().request(
      '/v1/subjects/not-a-uuid',
      patchRequest({ name: 'Updated' }),
    );
    expect(res.status).toBe(400);
    expect(updateSubjectMock).not.toHaveBeenCalled();
  });

  it('returns 200 on a valid update', async () => {
    updateSubjectMock.mockResolvedValue(
      makeSubjectRecord({ name: 'Updated Chemistry' }),
    );

    const res = await makeApp().request(
      `/v1/subjects/${SUBJECT_ID}`,
      patchRequest({ name: 'Updated Chemistry' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ subject: { name: 'Updated Chemistry' } });
  });

  it('returns 404 when the subject does not exist or belongs to another profile', async () => {
    updateSubjectMock.mockResolvedValue(null);

    const res = await makeApp().request(
      `/v1/subjects/${SUBJECT_ID}`,
      patchRequest({ name: 'Ghost' }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 400 when the payload is malformed (name too long is a string, so no zod error there; but empty string fails)', async () => {
    const res = await makeApp().request(
      `/v1/subjects/${SUBJECT_ID}`,
      patchRequest({ name: '' }),
    );

    // subjectUpdateSchema enforces min(1) on name when present
    expect(res.status).toBe(400);
    expect(updateSubjectMock).not.toHaveBeenCalled();
  });

  it('propagates service errors to 500', async () => {
    updateSubjectMock.mockRejectedValue(new Error('TX failed'));

    const res = await makeApp().request(
      `/v1/subjects/${SUBJECT_ID}`,
      patchRequest({ name: 'Valid' }),
    );

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/:id/retry-curriculum
// ---------------------------------------------------------------------------

describe('POST /v1/subjects/:id/retry-curriculum', () => {
  const path = `/v1/subjects/${SUBJECT_ID}/retry-curriculum`;

  it('[F-166] returns 400 for a malformed (non-UUID) subject id', async () => {
    const res = await makeApp().request(
      '/v1/subjects/not-a-uuid/retry-curriculum',
      { method: 'POST' },
    );
    expect(res.status).toBe(400);
    expect(retryCurriculumForSubjectMock).not.toHaveBeenCalled();
  });

  it('returns 200 with dispatched count on success', async () => {
    retryCurriculumForSubjectMock.mockResolvedValue(2);

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ dispatched: 2 });
  });

  it('returns 404 when the subject does not exist (typed SubjectNotFoundError)', async () => {
    retryCurriculumForSubjectMock.mockRejectedValue(new SubjectNotFoundError());

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('propagates non-SubjectNotFoundError to 500', async () => {
    retryCurriculumForSubjectMock.mockRejectedValue(new Error('inngest down'));

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/resolve
// ---------------------------------------------------------------------------

describe('POST /v1/subjects/resolve', () => {
  it('returns 200 with resolved subject name', async () => {
    resolveSubjectNameMock.mockResolvedValue({
      status: 'resolved',
      resolvedName: 'Chemistry',
      suggestions: [],
      displayMessage: 'Found: Chemistry',
    });

    const res = await makeApp().request('/v1/subjects/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput: 'chem' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      resolvedName: 'Chemistry',
      status: 'resolved',
    });
  });

  it('returns 400 when rawInput is missing', async () => {
    const res = await makeApp().request('/v1/subjects/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(resolveSubjectNameMock).not.toHaveBeenCalled();
  });

  it('returns 400 when rawInput is not a string', async () => {
    const res = await makeApp().request('/v1/subjects/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput: 99 }),
    });

    expect(res.status).toBe(400);
  });

  it('[BREAK / BUG-93] returns 400 when profileId is absent (requireProfileId guard)', async () => {
    const app = new Hono<TestEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('profileId', undefined);
      await next();
    });
    app.route('/v1', subjectRoutes);

    const res = await app.request('/v1/subjects/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput: 'chem' }),
    });

    // requireProfileId must reject before the resolver is called
    expect(res.status).toBe(400);
    expect(resolveSubjectNameMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/classify
// ---------------------------------------------------------------------------

describe('POST /v1/subjects/classify', () => {
  it('returns 200 with the classification result', async () => {
    classifySubjectMock.mockResolvedValue({
      candidates: [
        { subjectId: SUBJECT_ID, subjectName: 'Chemistry', confidence: 0.9 },
      ],
      needsConfirmation: false,
      suggestedSubjectName: null,
    });

    const res = await makeApp().request('/v1/subjects/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'What is an atom?' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      candidates: [{ subjectId: SUBJECT_ID }],
      needsConfirmation: false,
    });
  });

  // [WI-859 / QA-03] Deterministic proof that the classifier's miss/suggestion
  // shape (zero/low-confidence candidates that need confirmation, plus a
  // suggestedSubjectName for the no-match case) survives the route's
  // subjectClassifyResultSchema.parse() and reaches the client intact. The
  // service is stubbed, so this never depends on live model variance — it
  // pins the route contract the in-chat picker relies on.
  it('[WI-859] passes multi-candidate + suggestedSubjectName through the result schema', async () => {
    classifySubjectMock.mockResolvedValue({
      candidates: [
        { subjectId: SUBJECT_ID, subjectName: 'History', confidence: 0.55 },
        {
          subjectId: 'a0000000-0000-4000-a000-000000000011',
          subjectName: 'Religious Studies',
          confidence: 0.45,
        },
      ],
      needsConfirmation: true,
      suggestedSubjectName: 'Cultural Studies',
    });

    const res = await makeApp().request('/v1/subjects/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'please teach me about Easter' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      candidates: Array<{ subjectName: string }>;
      needsConfirmation: boolean;
      suggestedSubjectName: string | null;
    };
    expect(body.needsConfirmation).toBe(true);
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates.map((candidate) => candidate.subjectName)).toEqual([
      'History',
      'Religious Studies',
    ]);
    expect(body.suggestedSubjectName).toBe('Cultural Studies');
  });

  it('returns 400 when text is missing', async () => {
    const res = await makeApp().request('/v1/subjects/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(classifySubjectMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/subjects/:id/language-setup — cross-profile scoping
// ---------------------------------------------------------------------------

describe('PUT /v1/subjects/:id/language-setup — cross-profile guard', () => {
  it('[F-166] returns 400 for a malformed (non-UUID) subject id', async () => {
    const res = await makeApp().request(
      '/v1/subjects/not-a-uuid/language-setup',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeLanguage: 'en', startingLevel: 'A1' }),
      },
    );
    expect(res.status).toBe(400);
  });

  it('the service receives the requesting profileId, not a foreign one', async () => {
    // Existing subjects-language-setup.test.ts covers the error classification
    // in detail; here we verify that the route passes the middleware-resolved
    // profileId through to the service, not a caller-supplied value.
    const { configureLanguageSubject } = jest.requireMock(
      '../services/subject',
    ) as typeof import('../services/subject');
    const configMock = jest.mocked(configureLanguageSubject);
    configMock.mockResolvedValue(makeSubjectRecord());

    await makeApp({ profileId: OTHER_PROFILE_ID }).request(
      `/v1/subjects/${SUBJECT_ID}/language-setup`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeLanguage: 'en', startingLevel: 'A1' }),
      },
    );

    // The profileId injected by middleware (OTHER_PROFILE_ID) is the one the
    // service must see — the route cannot substitute its own.
    expect(configMock).toHaveBeenCalledWith(
      expect.anything(),
      OTHER_PROFILE_ID,
      SUBJECT_ID,
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubjectRecord(overrides?: Partial<{ name: string }>) {
  return {
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
    name: overrides?.name ?? 'Chemistry',
    rawInput: null,
    status: 'active' as const,
    curriculumStatus: 'ready' as const,
    pedagogyMode: 'socratic' as const,
    languageCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// [WI-177 / DS-088] Proxy-mode write guard — 3 newly-guarded handlers
// (PUT /subjects/:id/language-setup, POST /subjects/:id/retry-curriculum,
//  PATCH /subjects/:id; POST /subjects already had a guard pre-PR)
// ---------------------------------------------------------------------------
describe('[WI-177 / DS-088] subjects proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false, resolvedVia: 'auto' });
      await next();
    });
    proxyApp.route('/', subjectRoutes);
    return proxyApp;
  }

  const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => jest.clearAllMocks());

  it('PUT /subjects/:id/language-setup returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/language-setup`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nativeLanguage: 'english',
          startingLevel: 'A1',
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  it('POST /subjects/:id/retry-curriculum returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/retry-curriculum`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
  });

  it('PATCH /subjects/:id returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(`/subjects/${SUBJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'updated' }),
    });
    expect(res.status).toBe(403);
  });

  // [WI-859 / QA-04] The in-chat classifier and resolver are LLM-metered write
  // endpoints; both carry assertNotProxyMode (subjects.ts). A parent proxying a
  // child must not be able to drive the child's subject classification — assert
  // the guard fires (403 PROXY_MODE) BEFORE the service runs, deterministically,
  // not via live model behavior.
  it('[WI-859] POST /subjects/classify returns 403 PROXY_MODE in proxy mode', async () => {
    const res = await makeProxyApp().request('/subjects/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'what is an atom?' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('PROXY_MODE');
    // Guard must short-circuit before the classifier service is invoked.
    expect(classifySubjectMock).not.toHaveBeenCalled();
  });

  it('[WI-859] POST /subjects/resolve returns 403 PROXY_MODE in proxy mode', async () => {
    const res = await makeProxyApp().request('/subjects/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput: 'chem' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('PROXY_MODE');
    expect(resolveSubjectNameMock).not.toHaveBeenCalled();
  });
});
