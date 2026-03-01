/**
 * Integration: Parent Dashboard Endpoints
 *
 * Exercises the parent dashboard routes via Hono's app.request(). Validates:
 *
 * 1. GET /v1/dashboard — returns children list for parent
 * 2. GET /v1/dashboard/children/:profileId — returns child detail
 * 3. GET /v1/dashboard/children/:profileId/sessions — returns child sessions
 * 4. GET /v1/dashboard/children/:profileId/sessions/:sessionId/transcript — returns transcript
 * 5. GET /v1/dashboard/demo — returns hardcoded demo data
 * 6. GET /v1/dashboard — 401 without auth
 * 7. GET /v1/dashboard/children/:profileId/sessions — 401 without auth
 */

// --- Dashboard service mocks ---

const mockGetChildrenForParent = jest.fn();
const mockGetChildDetail = jest.fn();
const mockGetChildSessions = jest.fn();
const mockGetChildSessionTranscript = jest.fn();
const mockGetChildSubjectTopics = jest.fn();

jest.mock('../../apps/api/src/services/dashboard', () => ({
  getChildrenForParent: mockGetChildrenForParent,
  getChildDetail: mockGetChildDetail,
  getChildSubjectTopics: mockGetChildSubjectTopics,
  getChildSessions: mockGetChildSessions,
  getChildSessionTranscript: mockGetChildSessionTranscript,
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

const CHILD_PROFILE_ID = '00000000-0000-4000-8000-000000000020';
const SESSION_ID = '00000000-0000-4000-8000-000000000021';

const AUTH_HEADERS = {
  Authorization: 'Bearer test-token',
};

// ---------------------------------------------------------------------------
// Dashboard routes
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with children list', async () => {
    const mockChildren = [
      {
        profileId: CHILD_PROFILE_ID,
        displayName: 'Test Child',
        sessionsThisWeek: 3,
        sessionsLastWeek: 2,
        totalTimeThisWeek: 120,
        totalTimeLastWeek: 90,
        trend: 'up',
        subjects: [{ name: 'Mathematics', retentionStatus: 'strong' }],
      },
    ];
    mockGetChildrenForParent.mockResolvedValue(mockChildren);

    const res = await app.request(
      '/v1/dashboard',
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.children).toHaveLength(1);
    expect(body.children[0].displayName).toBe('Test Child');
    expect(body.demoMode).toBe(false);
    expect(mockGetChildrenForParent).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String)
    );
  });

  it('returns 401 without auth', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request('/v1/dashboard', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
  });
});

describe('Integration: GET /v1/dashboard/children/:profileId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with child detail', async () => {
    const mockChild = {
      profileId: CHILD_PROFILE_ID,
      displayName: 'Test Child',
      subjects: [
        {
          id: 'sub-1',
          name: 'Mathematics',
          topicCount: 5,
          retentionStatus: 'strong',
        },
      ],
      totalSessions: 12,
      totalTimeMinutes: 360,
    };
    mockGetChildDetail.mockResolvedValue(mockChild);

    const res = await app.request(
      `/v1/dashboard/children/${CHILD_PROFILE_ID}`,
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.child).toBeDefined();
    expect(body.child.profileId).toBe(CHILD_PROFILE_ID);
    expect(body.child.displayName).toBe('Test Child');
    expect(mockGetChildDetail).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String), // parentProfileId
      CHILD_PROFILE_ID
    );
  });
});

describe('Integration: GET /v1/dashboard/children/:profileId/sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with sessions list', async () => {
    const mockSessions = [
      {
        id: SESSION_ID,
        subjectName: 'Mathematics',
        sessionType: 'learning',
        startedAt: '2025-01-15T10:00:00.000Z',
        durationSeconds: 1800,
        exchangeCount: 8,
      },
    ];
    mockGetChildSessions.mockResolvedValue(mockSessions);

    const res = await app.request(
      `/v1/dashboard/children/${CHILD_PROFILE_ID}/sessions`,
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe(SESSION_ID);
    expect(mockGetChildSessions).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String), // parentProfileId
      CHILD_PROFILE_ID
    );
  });

  it('returns 401 without auth', async () => {
    configureInvalidJWT(jwt);

    const res = await app.request(
      `/v1/dashboard/children/${CHILD_PROFILE_ID}/sessions`,
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

describe('Integration: GET /v1/dashboard/children/:profileId/sessions/:sessionId/transcript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with transcript', async () => {
    const mockTranscript = {
      sessionId: SESSION_ID,
      exchanges: [
        { role: 'assistant', content: 'What would you like to learn?' },
        { role: 'user', content: 'How does photosynthesis work?' },
        {
          role: 'assistant',
          content: 'Great question! Let me guide you through it.',
        },
      ],
    };
    mockGetChildSessionTranscript.mockResolvedValue(mockTranscript);

    const res = await app.request(
      `/v1/dashboard/children/${CHILD_PROFILE_ID}/sessions/${SESSION_ID}/transcript`,
      { method: 'GET', headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBeDefined();
    expect(body.transcript.sessionId).toBe(SESSION_ID);
    expect(body.transcript.exchanges).toHaveLength(3);
    expect(mockGetChildSessionTranscript).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String), // parentProfileId
      CHILD_PROFILE_ID,
      SESSION_ID
    );
  });
});

describe('Integration: GET /v1/dashboard/demo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT(jwt);
  });

  it('returns 200 with demo data', async () => {
    const res = await app.request(
      '/v1/dashboard/demo',
      { method: 'GET', headers: AUTH_HEADERS },
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
