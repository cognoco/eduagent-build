/**
 * Integration: Parent Dashboard Endpoints
 *
 * Exercises the parent dashboard routes via the real app + real database.
 * JWT verification is the only mocked boundary.
 *
 * Validates:
 * 1. GET /v1/dashboard — returns children list for parent with real aggregation
 * 2. GET /v1/dashboard — returns empty when no family links exist
 * 3. GET /v1/dashboard/children/:profileId — returns child detail
 * 4. GET /v1/dashboard/children/:profileId/sessions — returns child sessions
 * 5. GET /v1/dashboard/children/:profileId/sessions/:sessionId/transcript — returns 404 (removed)
 * 8. GET /v1/dashboard/children/:profileId/memory — returns curated memory categories
 * 9. GET /v1/dashboard/children/:profileId/sessions/:sessionId — returns session detail
 * 6. GET /v1/dashboard/demo — returns hardcoded demo data
 * 7. GET /v1/dashboard — 401 without auth
 */

import { familyLinks, learningSessions, subjects } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const PARENT_USER_ID = 'integration-dashboard-parent';
const PARENT_EMAIL = 'integration-dashboard-parent@integration.test';
const CHILD_USER_ID = 'integration-dashboard-child';
const CHILD_EMAIL = 'integration-dashboard-child@integration.test';

async function createProfile(
  userId: string,
  email: string,
  displayName: string,
  birthYear: number
): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: userId, email }),
      body: JSON.stringify({ displayName, birthYear }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function createSubjectForProfile(
  userId: string,
  email: string,
  profileId: string,
  subjectName: string
): Promise<string> {
  const res = await app.request(
    '/v1/subjects',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: userId, email }, profileId),
      body: JSON.stringify({ name: subjectName }),
    },
    TEST_ENV
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.subject.id as string;
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PARENT_EMAIL, CHILD_EMAIL],
    clerkUserIds: [PARENT_USER_ID, CHILD_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PARENT_EMAIL, CHILD_EMAIL],
    clerkUserIds: [PARENT_USER_ID, CHILD_USER_ID],
  });
});

// ---------------------------------------------------------------------------
// Helpers: seed family link + sessions via direct DB
// ---------------------------------------------------------------------------

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string
): Promise<void> {
  const db = createIntegrationDb();
  await db
    .insert(familyLinks)
    .values({ parentProfileId, childProfileId })
    .onConflictDoNothing();
}

async function seedSession(
  profileId: string,
  subjectId: string,
  overrides: Partial<typeof learningSessions.$inferInsert> = {}
): Promise<string> {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 5,
      escalationRung: 2,
      wallClockSeconds: 1200,
      durationSeconds: 900,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      endedAt: new Date(),
      ...overrides,
    })
    .returning({ id: learningSessions.id });
  return row!.id;
}

// ---------------------------------------------------------------------------
// Dashboard routes
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/dashboard', () => {
  it('returns 200 with children list when family link exists', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    // birthYear 2004 avoids GDPR consent block (age 22) while still
    // being a valid "child" in the family-link sense.
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    // Create a subject for the child so dashboard has data
    const subjectId = await createSubjectForProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      childProfileId,
      'Mathematics'
    );

    // Seed a session so session counts are non-zero
    await seedSession(childProfileId, subjectId);

    // Now request dashboard as parent
    const res = await app.request(
      '/v1/dashboard',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demoMode).toBe(false);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].profileId).toBe(childProfileId);
    expect(body.children[0].displayName).toBe('Test Child');
    expect(body.children[0]).toHaveProperty('sessionsThisWeek');
    expect(body.children[0]).toHaveProperty('trend');
    expect(body.children[0]).toHaveProperty('subjects');
  });

  it('returns empty children when no family links exist', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Lonely Parent',
      1985
    );

    const res = await app.request(
      '/v1/dashboard',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.children).toHaveLength(0);
    expect(body.demoMode).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const res = await app.request('/v1/dashboard', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
  });
});

describe('Integration: GET /v1/dashboard/children/:profileId', () => {
  it('returns 200 with child detail', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.child).toBeDefined();
    expect(body.child.profileId).toBe(childProfileId);
    expect(body.child.displayName).toBe('Test Child');
  });

  it('returns 403 when no family link exists', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    // No family link — assertParentAccess rejects with 403

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
  });
});

describe('Integration: GET /v1/dashboard/children/:profileId/sessions', () => {
  it('returns 200 with sessions list', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await createSubjectForProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      childProfileId,
      'Science'
    );

    const sessionId = await seedSession(childProfileId, subjectId, {
      exchangeCount: 8,
      wallClockSeconds: 1800,
    });

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/sessions`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBe(sessionId);
    expect(body.sessions[0].sessionType).toBe('learning');
    expect(body.sessions[0].exchangeCount).toBe(8);
    expect(body.sessions[0].wallClockSeconds).toBe(1800);
  });

  it('returns 403 when no family link exists', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    // No family link — assertParentAccess rejects with 403

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/sessions`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.request(
      '/v1/dashboard/children/00000000-0000-4000-8000-000000000020/sessions',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Parent Visibility break tests [PV-BT1/BT2/FT1/FT2]
// ---------------------------------------------------------------------------

describe('Parent Visibility break tests', () => {
  it('[PV-BT1] GET transcript returns 404', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await createSubjectForProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      childProfileId,
      'Science'
    );

    const sessionId = await seedSession(childProfileId, subjectId, {
      exchangeCount: 2,
    });

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/sessions/${sessionId}/transcript`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('[PV-BT2] parent cannot see unlinked child memory', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    // No family link — assertParentAccess rejects with 403

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/memory`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
  });
});

describe('Parent Visibility functional tests', () => {
  it('[PV-FT1] curated memory returns categories and settings', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/memory`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.memory.categories)).toBe(true);
    expect(body.memory.settings).toHaveProperty('memoryEnabled');
  });

  it('[PV-FT2] dashboard child includes streak and XP', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await createSubjectForProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      childProfileId,
      'Mathematics'
    );
    await seedSession(childProfileId, subjectId);

    const res = await app.request(
      '/v1/dashboard',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    for (const child of body.children) {
      expect(typeof child.currentStreak).toBe('number');
      expect(typeof child.totalXp).toBe('number');
    }
  });

  it('[PV-FT3] session detail returns summary-only by ID', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );
    const childProfileId = await createProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      'Test Child',
      2004
    );
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await createSubjectForProfile(
      CHILD_USER_ID,
      CHILD_EMAIL,
      childProfileId,
      'Science'
    );
    const sessionId = await seedSession(childProfileId, subjectId, {
      exchangeCount: 5,
    });

    const res = await app.request(
      `/v1/dashboard/children/${childProfileId}/sessions/${sessionId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.sessionId).toBe(sessionId);
    expect(body.session.exchangeCount).toBe(5);
    expect(body.session).not.toHaveProperty('exchanges');
  });
});

describe('Integration: GET /v1/dashboard/demo', () => {
  it('returns 200 with demo data', async () => {
    const parentProfileId = await createProfile(
      PARENT_USER_ID,
      PARENT_EMAIL,
      'Test Parent',
      1985
    );

    const res = await app.request(
      '/v1/dashboard/demo',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER_ID, email: PARENT_EMAIL },
          parentProfileId
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demoMode).toBe(true);
    expect(body.children).toBeDefined();
    expect(body.children.length).toBeGreaterThanOrEqual(1);
    expect(body.children[0]).toHaveProperty('displayName');
    expect(body.children[0]).toHaveProperty('sessionsThisWeek');
    expect(body.children[0]).toHaveProperty('subjects');
  });
});
