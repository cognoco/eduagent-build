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
 * 6. GET /v1/subjects/:id — 404 when not found
 * 7. PATCH /v1/subjects/:id — 200 updates subject
 * 8. PATCH /v1/subjects/:id — 404 when not found
 * 9. GET /v1/subjects — 401 without auth
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import { buildAuthHeaders, createProfileViaRoute } from './route-fixtures';
import {
  createSubjectWithStructureResponseSchema,
  subjectListResponseSchema,
  subjectResponseSchema,
} from '@eduagent/schemas';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const SUBJECT_AUTH_USER_ID = 'integration-subject-user';
const SUBJECT_AUTH_EMAIL = 'integration-subjects@integration.test';
const OTHER_SUBJECT_AUTH_USER_ID = 'integration-subject-other-user';
const OTHER_SUBJECT_AUTH_EMAIL = 'integration-subjects-other@integration.test';

const SUBJECT_ID = '00000000-0000-4000-8000-000000000040';

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
    expect(body.structureType).toBe('narrow');
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
