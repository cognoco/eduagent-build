/**
 * Integration: Homework & OCR Endpoints
 *
 * Exercises the homework session start and server-side OCR fallback routes
 * via Hono's app.request(). Validates:
 *
 * 1. POST /v1/subjects/:subjectId/homework — starts homework session (201)
 * 2. POST /v1/subjects/:subjectId/homework — 403 when subject is inactive
 * 3. POST /v1/subjects/:subjectId/homework — 401 without auth token
 * 4. POST /v1/ocr — 200 with valid image multipart
 * 5. POST /v1/ocr — 400 missing image field
 * 6. POST /v1/ocr — 400 unsupported mime type
 * 7. POST /v1/ocr — 401 without auth token
 */

// --- Service mocks (declared before jest.mock for hoisting) ---

const mockStartSession = jest.fn();
const mockSubjectInactiveError = class extends Error {
  constructor(msg: string) {
    super(msg);
  }
};

jest.mock('../../apps/api/src/services/session', () => ({
  ...jest.createMockFromModule<Record<string, jest.Mock>>(
    '../../apps/api/src/services/session'
  ),
  startSession: mockStartSession,
  SubjectInactiveError: mockSubjectInactiveError,
}));

const mockExtractText = jest.fn();
jest.mock('../../apps/api/src/services/ocr', () => ({
  getOcrProvider: jest.fn().mockReturnValue({ extractText: mockExtractText }),
}));

// --- Base mocks (middleware chain requires these) ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
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
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ENVIRONMENT: 'development',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const SUBJECT_ID = '00000000-0000-4000-8000-000000000010';
const SESSION_ID = '00000000-0000-4000-8000-000000000011';

// ---------------------------------------------------------------------------
// Homework session
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/subjects/:subjectId/homework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 201 with valid subjectId', async () => {
    mockStartSession.mockResolvedValue({
      id: SESSION_ID,
      subjectId: SUBJECT_ID,
      sessionType: 'homework',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
    });

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}/homework`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.id).toBe(SESSION_ID);
    expect(body.session.sessionType).toBe('homework');
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.anything(), // db
      expect.any(String), // profileId
      SUBJECT_ID,
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        sessionType: 'homework',
      })
    );
  });

  it('returns 403 when subject is inactive', async () => {
    mockStartSession.mockRejectedValue(
      new mockSubjectInactiveError('Subject is inactive')
    );

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}/homework`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('SUBJECT_INACTIVE');
  });

  it('returns 401 without auth token', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request(
      `/v1/subjects/${SUBJECT_ID}/homework`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// OCR endpoint
// ---------------------------------------------------------------------------

describe('Integration: POST /v1/ocr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with valid image', async () => {
    mockExtractText.mockResolvedValue({
      text: 'Extracted math problem',
      confidence: 0.95,
    });

    const formData = new FormData();
    const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    formData.append('image', imageBlob, 'homework.jpg');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('Extracted math problem');
    expect(body.confidence).toBe(0.95);
    expect(mockExtractText).toHaveBeenCalled();
  });

  it('returns 400 when image field is missing', async () => {
    const formData = new FormData();
    formData.append('notimage', 'some-data');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for unsupported mime type', async () => {
    const formData = new FormData();
    const pdfBlob = new Blob(['fake-pdf-data'], { type: 'application/pdf' });
    formData.append('image', pdfBlob, 'homework.pdf');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockExtractText).not.toHaveBeenCalled();
  });

  it('returns 401 without auth token', async () => {
    configureInvalidJWT(jwt);

    const formData = new FormData();
    const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    formData.append('image', imageBlob, 'homework.jpg');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
