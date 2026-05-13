// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account + subject services — no DB interaction
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

jest.mock('../services/subject-resolve', () => ({
  resolveSubjectName: jest.fn().mockResolvedValue({
    status: 'corrected',
    resolvedName: 'Physics',
    suggestions: [],
    displayMessage: 'Did you mean **Physics**?',
  }),
}));

jest.mock('../services/subject-classify', () => ({
  classifySubject: jest.fn().mockResolvedValue({
    candidates: [],
    needsConfirmation: false,
    suggestedSubjectName: 'Mathematics',
  }),
}));

jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('../services/subject', () => ({
  SubjectNotLanguageLearningError: class SubjectNotLanguageLearningError extends Error {
    constructor() {
      super('Subject is not configured for language learning');
      this.name = 'SubjectNotLanguageLearningError';
    }
  },
  listSubjects: jest.fn().mockResolvedValue([]),
  createSubject: jest.fn().mockImplementation((_db, _profileId, input) => ({
    id: 'a0000000-0000-4000-a000-000000000001',
    profileId: 'a0000000-0000-4000-a000-000000000002',
    name: input.name,
    rawInput: input.rawInput ?? null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  createSubjectWithStructure: jest
    .fn()
    .mockImplementation((_db, _profileId, input) => ({
      subject: {
        id: 'a0000000-0000-4000-a000-000000000001',
        profileId: 'a0000000-0000-4000-a000-000000000002',
        name: input.name,
        rawInput: input.rawInput ?? null,
        status: 'active',
        pedagogyMode: 'socratic',
        languageCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      structureType: 'narrow',
    })),
  configureLanguageSubject: jest.fn().mockResolvedValue({
    id: 'a0000000-0000-4000-a000-000000000001',
    profileId: 'a0000000-0000-4000-a000-000000000002',
    name: 'Spanish',
    rawInput: 'Learn Spanish',
    status: 'active',
    pedagogyMode: 'four_strands',
    languageCode: 'es',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  getSubject: jest.fn().mockResolvedValue({
    id: 'a0000000-0000-4000-a000-000000000001',
    profileId: 'a0000000-0000-4000-a000-000000000002',
    name: 'Mathematics',
    rawInput: null,
    status: 'active',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updateSubject: jest.fn().mockResolvedValue({
    id: 'a0000000-0000-4000-a000-000000000001',
    profileId: 'a0000000-0000-4000-a000-000000000002',
    name: 'Updated Subject',
    rawInput: null,
    status: 'active',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

import { app } from '../index';
import { resolveSubjectName } from '../services/subject-resolve';
import { classifySubject } from '../services/subject-classify';
import { captureException } from '../services/sentry';
import { UpstreamLlmError, SubjectNotFoundError } from '@eduagent/schemas';
import { SubjectNotLanguageLearningError } from '../services/subject';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

describe('subject routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });
  // -------------------------------------------------------------------------
  // POST /v1/subjects/resolve
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/resolve', () => {
    it('returns 200 with resolve result', async () => {
      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'Phsics' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('status', 'corrected');
      expect(body).toHaveProperty('resolvedName', 'Physics');
      expect(body).toHaveProperty('displayMessage');
    });

    it('returns 400 when rawInput is empty', async () => {
      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          body: JSON.stringify({ rawInput: 'Physics' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    // [CR-650] When the underlying LLM service throws UpstreamLlmError, the
    // global onError handler must classify it as 502 LLM_UNAVAILABLE and
    // capture to Sentry. The previous bare catch{} swallowed the error
    // silently with a generic 500.
    it('[CR-650] classifies UpstreamLlmError as 502 LLM_UNAVAILABLE and captures Sentry', async () => {
      (resolveSubjectName as jest.Mock).mockRejectedValueOnce(
        new UpstreamLlmError('LLM provider down')
      );
      (captureException as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'Physics' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(502);
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('[CR-650] captures generic errors to Sentry and returns 500 (no silent swallow)', async () => {
      (resolveSubjectName as jest.Mock).mockRejectedValueOnce(
        new Error('unexpected boom')
      );
      (captureException as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/subjects/resolve',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'Physics' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(500);
      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/classify
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/classify', () => {
    it('returns 200 with classification result', async () => {
      const res = await app.request(
        '/v1/subjects/classify',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ text: 'Newton laws of motion' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('candidates');
      expect(body).toHaveProperty('needsConfirmation');
    });

    // [CR-651] Same fix as resolve — UpstreamLlmError must surface as 502 with Sentry capture.
    it('[CR-651] classifies UpstreamLlmError as 502 and captures Sentry', async () => {
      (classifySubject as jest.Mock).mockRejectedValueOnce(
        new UpstreamLlmError('LLM provider down')
      );
      (captureException as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/subjects/classify',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ text: 'Photosynthesis lesson' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(502);
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('[CR-651] captures generic classify errors to Sentry and returns 500', async () => {
      (classifySubject as jest.Mock).mockRejectedValueOnce(
        new Error('unexpected boom')
      );
      (captureException as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/subjects/classify',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ text: 'Photosynthesis lesson' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(500);
      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects', () => {
    it('returns 200 with subjects array', async () => {
      const res = await app.request(
        '/v1/subjects',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subjects');
      expect(Array.isArray(body.subjects)).toBe(true);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subjects', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects', () => {
    it('returns 201 with valid subject name and structureType narrow', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'Mathematics' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.subject).toEqual(expect.objectContaining({}));
      expect(body.subject.name).toBe('Mathematics');
      expect(body.subject.status).toBe('active');
      expect(typeof body.subject.createdAt).toBe('string');
      expect(typeof body.subject.updatedAt).toBe('string');
      expect(body.structureType).toBe('narrow');
    });

    it('returns 201 with structureType broad when service detects broad subject', async () => {
      const { createSubjectWithStructure } = jest.requireMock<
        Record<string, jest.Mock>
      >('../services/subject');
      createSubjectWithStructure.mockImplementationOnce(
        (_db: unknown, _profileId: string, input: { name: string }) => ({
          subject: {
            id: 'a0000000-0000-4000-a000-000000000001',
            profileId: 'a0000000-0000-4000-a000-000000000002',
            name: input.name,
            rawInput: null,
            status: 'active',
            pedagogyMode: 'socratic',
            languageCode: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          structureType: 'broad',
          bookCount: 4,
        })
      );

      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'World History' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.structureType).toBe('broad');
      expect(body.bookCount).toBe(4);
    });

    it('returns 400 when name is empty', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 201 with rawInput when provided', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            name: 'Biology — Entomology',
            rawInput: 'ants',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.subject).toEqual(expect.objectContaining({}));
      expect(body.subject.name).toBe('Biology — Entomology');
      expect(body.subject.rawInput).toBe('ants');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Mathematics' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/subjects/:id/language-setup
  // -------------------------------------------------------------------------

  describe('PUT /v1/subjects/:id/language-setup', () => {
    it('returns 200 with configured language subject', async () => {
      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'A2',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subject).toEqual(expect.objectContaining({}));
      expect(body.subject.pedagogyMode).toBe('four_strands');
      expect(body.subject.languageCode).toBe('es');
    });

    it('[FIX-API-6] returns 404 when SubjectNotFoundError is thrown (typed instanceof)', async () => {
      const { configureLanguageSubject } = jest.requireMock(
        '../services/subject'
      );
      configureLanguageSubject.mockRejectedValueOnce(
        new SubjectNotFoundError()
      );

      const res = await app.request(
        '/v1/subjects/missing/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'A1',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 422 when subject is not a language subject (typed SubjectNotLanguageLearningError)', async () => {
      const { configureLanguageSubject } = jest.requireMock(
        '../services/subject'
      );
      configureLanguageSubject.mockRejectedValueOnce(
        new SubjectNotLanguageLearningError()
      );

      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'A1',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    // [BUG-SUBJ-LANG] Break test: a generic Error with the same message text
    // must NOT map to 422 — it should propagate as a 500. This proves the
    // route uses instanceof and not string-matching.
    it('[BUG-SUBJ-LANG] generic Error with matching message text does NOT map to 422 (falls through to 500)', async () => {
      const { configureLanguageSubject } = jest.requireMock(
        '../services/subject'
      );
      configureLanguageSubject.mockRejectedValueOnce(
        new Error('Subject is not configured for language learning')
      );

      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'A1',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(500);
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'Z9',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when only nativeLanguage is provided', async () => {
      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            nativeLanguage: 'en',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/test-subject-id/language-setup',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nativeLanguage: 'en',
            startingLevel: 'A1',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:id
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:id', () => {
    it('returns 200 with subject object', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subject');
    });

    it('returns 404 when subject not found', async () => {
      const { getSubject } = jest.requireMock('../services/subject');
      getSubject.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/subjects/nonexistent-id',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('code', 'NOT_FOUND');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subjects/some-id', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /v1/subjects/:id
  // -------------------------------------------------------------------------

  describe('PATCH /v1/subjects/:id', () => {
    it('returns 200 with valid update', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'Updated Subject' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subject');
    });

    it('returns 404 when subject not found', async () => {
      const { updateSubject } = jest.requireMock('../services/subject');
      updateSubject.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/subjects/nonexistent-id',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'Nope' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('code', 'NOT_FOUND');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Subject' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
