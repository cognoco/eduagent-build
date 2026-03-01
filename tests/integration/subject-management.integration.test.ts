/**
 * Integration: Subject Management Endpoints
 *
 * Exercises the subject CRUD routes via Hono's app.request(). Validates:
 *
 * 1. GET /v1/subjects — 200 returns subjects list
 * 2. GET /v1/subjects?includeInactive=true — passes flag to service
 * 3. POST /v1/subjects — 201 creates subject
 * 4. POST /v1/subjects — 400 with invalid body
 * 5. GET /v1/subjects/:id — 200 returns subject
 * 6. GET /v1/subjects/:id — 404 when not found
 * 7. PATCH /v1/subjects/:id — 200 updates subject
 * 8. PATCH /v1/subjects/:id — 404 when not found
 * 9. GET /v1/subjects — 401 without auth
 */

// --- Subject service mocks ---

const mockListSubjects = jest.fn();
const mockCreateSubject = jest.fn();
const mockGetSubject = jest.fn();
const mockUpdateSubject = jest.fn();

jest.mock('../../apps/api/src/services/subject', () => ({
  listSubjects: mockListSubjects,
  createSubject: mockCreateSubject,
  getSubject: mockGetSubject,
  updateSubject: mockUpdateSubject,
}));

// --- Base mocks (middleware chain requires these) ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  sessionMock,
  llmMock,
  configureValidJWT,
  configureInvalidJWT,
} from './mocks';

const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);
jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
jest.mock('../../apps/api/src/services/account', () => accountMock());
jest.mock('../../apps/api/src/services/billing', () => billingMock());
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/session', () => sessionMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ENVIRONMENT: 'development',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const SUBJECT_ID = '00000000-0000-4000-8000-000000000040';

const AUTH_HEADERS = {
  Authorization: 'Bearer test-token',
  'Content-Type': 'application/json',
};

const MOCK_SUBJECT = {
  id: SUBJECT_ID,
  name: 'Mathematics',
  status: 'active',
  profileId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// GET /v1/subjects
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with subjects list', async () => {
    mockListSubjects.mockResolvedValue([MOCK_SUBJECT]);

    const res = await app.request(
      '/v1/subjects',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].name).toBe('Mathematics');
    expect(mockListSubjects).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { includeInactive: false }
    );
  });

  it('passes includeInactive=true to service', async () => {
    mockListSubjects.mockResolvedValue([
      MOCK_SUBJECT,
      { ...MOCK_SUBJECT, id: 'sub-2', name: 'History', status: 'archived' },
    ]);

    const res = await app.request(
      '/v1/subjects?includeInactive=true',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(2);
    expect(mockListSubjects).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { includeInactive: true }
    );
  });

  it('returns 401 without auth', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request('/v1/subjects', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/subjects
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 201 when creating subject', async () => {
    mockCreateSubject.mockResolvedValue(MOCK_SUBJECT);

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
    expect(mockCreateSubject).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { name: 'Mathematics' }
    );
  });

  it('returns 400 with invalid body (empty name)', async () => {
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
    expect(mockCreateSubject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/subjects/:id
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with subject', async () => {
    mockGetSubject.mockResolvedValue(MOCK_SUBJECT);

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subject).toBeDefined();
    expect(body.subject.id).toBe(SUBJECT_ID);
    expect(mockGetSubject).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      SUBJECT_ID
    );
  });

  it('returns 404 when not found', async () => {
    mockGetSubject.mockResolvedValue(null);

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
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
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 when updating subject', async () => {
    const updatedSubject = { ...MOCK_SUBJECT, name: 'Advanced Mathematics' };
    mockUpdateSubject.mockResolvedValue(updatedSubject);

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      {
        method: 'PATCH',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: 'Advanced Mathematics' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subject).toBeDefined();
    expect(body.subject.name).toBe('Advanced Mathematics');
    expect(mockUpdateSubject).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      SUBJECT_ID,
      { name: 'Advanced Mathematics' }
    );
  });

  it('returns 404 when not found', async () => {
    mockUpdateSubject.mockResolvedValue(null);

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}`,
      {
        method: 'PATCH',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: 'Updated Name' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});
