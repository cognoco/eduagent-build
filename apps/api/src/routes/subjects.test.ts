// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

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
    displayMessage: 'Did you mean **Physics**?',
  }),
}));

jest.mock('../services/subject', () => ({
  listSubjects: jest.fn().mockResolvedValue([]),
  createSubject: jest.fn().mockImplementation((_db, profileId, input) => ({
    id: 'test-subject-id',
    profileId,
    name: input.name,
    rawInput: input.rawInput ?? null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  createSubjectWithStructure: jest
    .fn()
    .mockImplementation((_db, profileId, input) => ({
      subject: {
        id: 'test-subject-id',
        profileId,
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
    id: 'test-subject-id',
    profileId: 'test-profile-id',
    name: 'Spanish',
    rawInput: 'Learn Spanish',
    status: 'active',
    pedagogyMode: 'four_strands',
    languageCode: 'es',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  getSubject: jest.fn().mockResolvedValue({
    id: 'test-subject-id',
    profileId: 'test-account-id',
    name: 'Mathematics',
    rawInput: null,
    status: 'active',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updateSubject: jest.fn().mockResolvedValue({
    id: 'test-subject-id',
    profileId: 'test-account-id',
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
import {
  AUTH_HEADERS as BASE_AUTH_HEADERS,
  BASE_AUTH_ENV,
} from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = {
  ...BASE_AUTH_HEADERS,
  'X-Profile-Id': 'test-profile-id',
};

describe('subject routes', () => {
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
      expect(body.subject).toBeDefined();
      expect(body.subject.name).toBe('Mathematics');
      expect(body.subject.status).toBe('active');
      expect(body.subject.createdAt).toBeDefined();
      expect(body.subject.updatedAt).toBeDefined();
      expect(body.structureType).toBe('narrow');
    });

    it('returns 201 with structureType broad when service detects broad subject', async () => {
      const { createSubjectWithStructure } = jest.requireMock<
        Record<string, jest.Mock>
      >('../services/subject');
      createSubjectWithStructure.mockImplementationOnce(
        (_db: unknown, profileId: string, input: { name: string }) => ({
          subject: {
            id: 'test-subject-id',
            profileId,
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
      expect(body.subject).toBeDefined();
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
      expect(body.subject).toBeDefined();
      expect(body.subject.pedagogyMode).toBe('four_strands');
      expect(body.subject.languageCode).toBe('es');
    });

    it('returns 404 when subject is missing', async () => {
      const { configureLanguageSubject } = jest.requireMock(
        '../services/subject'
      );
      configureLanguageSubject.mockRejectedValueOnce(
        new Error('Subject not found')
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
    });

    it('returns 422 when subject is not a language subject', async () => {
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

      expect(res.status).toBe(422);
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
