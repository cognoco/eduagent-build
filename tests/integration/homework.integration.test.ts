/**
 * Integration: Homework & OCR Endpoints
 *
 * Exercises the real homework routes through the full app + real DB.
 *
 * Mocked boundaries:
 * - JWT verification
 * - OCR provider extraction via service DI
 */

import { eq } from 'drizzle-orm';
import { subjects, learningSessions, sessionEvents } from '@eduagent/database';

import { jwtMock, configureValidJWT, configureInvalidJWT } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  resetOcrProvider,
  setOcrProvider,
} from '../../apps/api/src/services/ocr';

const jwt = jwtMock();
const mockExtractText = jest.fn();

jest.mock('../../apps/api/src/middleware/jwt', () => jwt);

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const HOMEWORK_USER_ID = 'integration-homework-user';
const HOMEWORK_EMAIL = 'integration-homework@integration.test';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

function buildAuthHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

function setValidAuth(): void {
  configureValidJWT(jwt, {
    sub: HOMEWORK_USER_ID,
    email: HOMEWORK_EMAIL,
  });
}

async function createOwnerProfile(): Promise<string> {
  setValidAuth();

  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        displayName: 'Homework Learner',
        birthYear: 2000,
      }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function seedSubject(input: {
  profileId: string;
  name?: string;
  status?: 'active' | 'paused' | 'archived';
}) {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: input.profileId,
      name: input.name ?? 'Mathematics',
      status: input.status ?? 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return subject!;
}

async function loadSession(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

async function loadSessionEvents(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionEvents.findMany({
    where: eq(sessionEvents.sessionId, sessionId),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  setValidAuth();
  resetOcrProvider();
  setOcrProvider({
    extractText: mockExtractText,
  });
  mockExtractText.mockResolvedValue({
    text: 'Extracted math problem',
    confidence: 0.95,
    regions: [],
  });
  await cleanupAccounts({
    emails: [HOMEWORK_EMAIL],
    clerkUserIds: [HOMEWORK_USER_ID],
  });
});

afterAll(async () => {
  resetOcrProvider();
  await cleanupAccounts({
    emails: [HOMEWORK_EMAIL],
    clerkUserIds: [HOMEWORK_USER_ID],
  });
});

describe('Integration: POST /v1/subjects/:subjectId/homework', () => {
  it('starts a real homework session and records the session_start event', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject({ profileId });

    const res = await app.request(
      `/v1/subjects/${subject.id}/homework`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profileId),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.subjectId).toBe(subject.id);
    expect(body.session.sessionType).toBe('homework');
    expect(body.session.status).toBe('active');

    const session = await loadSession(body.session.id);
    expect(session).not.toBeNull();
    expect(session!.profileId).toBe(profileId);
    expect(session!.subjectId).toBe(subject.id);
    expect(session!.sessionType).toBe('homework');

    const events = await loadSessionEvents(body.session.id);
    expect(events.map((event) => event.eventType)).toContain('session_start');
  });

  it('returns 403 when the subject is inactive', async () => {
    const profileId = await createOwnerProfile();
    const subject = await seedSubject({
      profileId,
      status: 'paused',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/homework`,
      {
        method: 'POST',
        headers: buildAuthHeaders(profileId),
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
      `/v1/subjects/${UNKNOWN_ID}/homework`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

describe('Integration: POST /v1/ocr', () => {
  it('returns 200 with a valid image payload', async () => {
    const profileId = await createOwnerProfile();

    const formData = new FormData();
    const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    formData.append('image', imageBlob, 'homework.jpg');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'X-Profile-Id': profileId,
        },
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      text: 'Extracted math problem',
      confidence: 0.95,
    });
    expect(mockExtractText).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when the image field is missing', async () => {
    const profileId = await createOwnerProfile();

    const formData = new FormData();
    formData.append('notimage', 'some-data');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'X-Profile-Id': profileId,
        },
        body: formData,
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockExtractText).not.toHaveBeenCalled();
  });

  it('returns 400 for unsupported mime types', async () => {
    const profileId = await createOwnerProfile();

    const formData = new FormData();
    const pdfBlob = new Blob(['fake-pdf-data'], { type: 'application/pdf' });
    formData.append('image', pdfBlob, 'homework.pdf');

    const res = await app.request(
      '/v1/ocr',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'X-Profile-Id': profileId,
        },
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
