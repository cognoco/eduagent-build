import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockProfileFindFirst = jest.fn();

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      },
      consentStates: { findFirst: jest.fn().mockResolvedValue(undefined) },
      familyLinks: { findFirst: jest.fn().mockResolvedValue(undefined) },
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    // gc1-allow: stubs findOrCreateAccount — avoids real Clerk/DB round-trip
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

// [WI-867] v2 profile-scope seam continuity mock.
// Echo profileId back so route handlers receive the X-Profile-Id the caller sent.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest.fn().mockImplementation(
  (_db: unknown, profileId?: string) =>
    Promise.resolve(personScope({ profileId: profileId ?? 'test-profile-id' })),
);
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

const mockCreateNudge = jest.fn();
const mockListUnreadNudges = jest.fn();
const mockMarkNudgeRead = jest.fn();
const mockMarkAllNudgesRead = jest.fn();

jest.mock('../services/nudge' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/nudge',
  ) as typeof import('../services/nudge');
  return {
    ...actual,
    // gc1-allow: stubs all nudge service functions — tests exercise HTTP layer, not DB
    createNudge: (...args: unknown[]) => mockCreateNudge(...args),
    listUnreadNudges: (...args: unknown[]) => mockListUnreadNudges(...args),
    markNudgeRead: (...args: unknown[]) => mockMarkNudgeRead(...args),
    markAllNudgesRead: (...args: unknown[]) => mockMarkAllNudgesRead(...args),
  };
});

import { Hono } from 'hono';
import { app } from '../index';
import { nudgeRoutes } from './nudges';
import { BASE_AUTH_ENV, makeAuthHeaders } from '../test-utils/test-env';
import {
  ConsentRequiredError,
  ForbiddenError,
  RateLimitedError,
} from '@eduagent/schemas';

const PARENT_ID = '01914d6a-0000-7000-8000-000000000001';
const CHILD_ID = '01914d6a-0000-7000-8000-000000000002';
const NUDGE_ID = '01914d6a-0000-7000-8000-000000000010';
const AUTH_HEADERS = makeAuthHeaders();
const PARENT_HEADERS = { ...AUTH_HEADERS, 'X-Profile-Id': PARENT_ID };
const CHILD_HEADERS = { ...AUTH_HEADERS, 'X-Profile-Id': CHILD_ID };
const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
};

const SAMPLE_NUDGE = {
  id: NUDGE_ID,
  fromProfileId: PARENT_ID,
  toProfileId: CHILD_ID,
  fromDisplayName: 'Parent',
  template: 'you_got_this' as const,
  createdAt: '2026-05-10T12:00:00.000Z',
  readAt: null,
};

beforeAll(() => {
  installTestJwksInterceptor();
});
afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  // [WI-867] Restore v2 seam defaults after clearAllMocks.
  mockFindOwnerPersonScope.mockResolvedValue(null);
  mockGetPersonScope.mockImplementation(
    (_db: unknown, profileId?: string) =>
      Promise.resolve(personScope({ profileId: profileId ?? 'test-profile-id' })),
  );
  mockProfileFindFirst.mockResolvedValue({
    id: PARENT_ID,
    accountId: 'test-account-id',
    displayName: 'Parent',
    avatarUrl: null,
    birthYear: 1990,
    location: 'EU',
    isOwner: true,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
  });
});

describe('POST /v1/nudges', () => {
  it('creates a nudge and returns the result', async () => {
    mockCreateNudge.mockResolvedValue({ nudge: SAMPLE_NUDGE, pushSent: true });
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'you_got_this',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nudge: SAMPLE_NUDGE, pushSent: true });
    expect(mockCreateNudge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fromProfileId: PARENT_ID,
        toProfileId: CHILD_ID,
        template: 'you_got_this',
      }),
      expect.objectContaining({ identityV2Enabled: expect.any(Boolean) }),
    );
  });

  it('returns 400 for invalid template', async () => {
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'invalid_template',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing toProfileId', async () => {
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({ template: 'you_got_this' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when parent access is denied', async () => {
    mockCreateNudge.mockRejectedValue(
      new ForbiddenError('Not a parent of this child'),
    );
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'proud_of_you',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when consent is not active', async () => {
    mockCreateNudge.mockRejectedValue(
      new ConsentRequiredError("Can't receive nudges", 'CONSENT_REQUIRED'),
    );
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'quick_session',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  it('returns 429 when rate-limited', async () => {
    mockCreateNudge.mockRejectedValue(
      new RateLimitedError('Too many nudges', 'NUDGE_RATE_LIMITED'),
    );
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'thinking_of_you',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(429);
  });

  it('returns pushSent: false when push is suppressed', async () => {
    mockCreateNudge.mockResolvedValue({ nudge: SAMPLE_NUDGE, pushSent: false });
    const res = await app.request(
      '/v1/nudges',
      {
        method: 'POST',
        headers: PARENT_HEADERS,
        body: JSON.stringify({
          toProfileId: CHILD_ID,
          template: 'you_got_this',
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushSent).toBe(false);
  });
});

describe('GET /v1/nudges', () => {
  it('returns unread nudges when ?unread=true', async () => {
    mockProfileFindFirst.mockResolvedValue({
      id: CHILD_ID,
      accountId: 'test-account-id',
      displayName: 'Alex',
      avatarUrl: null,
      birthYear: 2012,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      archivedAt: null,
    });
    mockListUnreadNudges.mockResolvedValue([SAMPLE_NUDGE]);
    const res = await app.request(
      '/v1/nudges?unread=true',
      { headers: CHILD_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nudges).toHaveLength(1);
    expect(body.nudges[0].id).toBe(NUDGE_ID);
  });

  it('returns unread nudges by default (no query param required)', async () => {
    mockListUnreadNudges.mockResolvedValue([SAMPLE_NUDGE]);
    const res = await app.request(
      '/v1/nudges',
      { headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nudges).toHaveLength(1);
    expect(mockListUnreadNudges).toHaveBeenCalled();
  });
});

describe('PATCH /v1/nudges/:id/read', () => {
  it('marks a single nudge as read', async () => {
    mockMarkNudgeRead.mockResolvedValue(1);
    const res = await app.request(
      `/v1/nudges/${NUDGE_ID}/read`,
      { method: 'PATCH', headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, count: 1 });
    expect(mockMarkNudgeRead).toHaveBeenCalledWith(
      expect.anything(),
      PARENT_ID,
      NUDGE_ID,
    );
  });

  it('returns 404 when nudge not found', async () => {
    mockMarkNudgeRead.mockResolvedValue(0);
    const res = await app.request(
      '/v1/nudges/nudge-missing/read',
      { method: 'PATCH', headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});

describe('POST /v1/nudges/mark-read', () => {
  it('marks all unread nudges as read', async () => {
    mockMarkAllNudgesRead.mockResolvedValue(3);
    const res = await app.request(
      '/v1/nudges/mark-read',
      { method: 'POST', headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 3 });
    expect(mockMarkAllNudgesRead).toHaveBeenCalledWith(
      expect.anything(),
      PARENT_ID,
    );
  });

  it('returns count 0 when no unread nudges', async () => {
    mockMarkAllNudgesRead.mockResolvedValue(0);
    const res = await app.request(
      '/v1/nudges/mark-read',
      { method: 'POST', headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 0 });
  });
});

// ---------------------------------------------------------------------------
// [WI-159 / DS-070] Proxy-mode write guard
//
// Mini-Hono mount of nudgeRoutes with profileMeta.isOwner=false so
// assertNotProxyMode rejects every write before the service is touched.
// Mirrors proxy-guard.test.ts + assessments.test.ts.
// ---------------------------------------------------------------------------
describe('[WI-159 / DS-070] nudges proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, PARENT_ID);
      c.set('account' as never, { id: 'test-account-id' });
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', nudgeRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /nudges returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request('/nudges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toProfileId: CHILD_ID, template: 'you_got_this' }),
    });
    expect(res.status).toBe(403);
    expect(mockCreateNudge).not.toHaveBeenCalled();
  });

  it('PATCH /nudges/:id/read returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(`/nudges/${NUDGE_ID}/read`, {
      method: 'PATCH',
    });
    expect(res.status).toBe(403);
    expect(mockMarkNudgeRead).not.toHaveBeenCalled();
  });

  it('POST /nudges/mark-read returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request('/nudges/mark-read', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
    expect(mockMarkAllNudgesRead).not.toHaveBeenCalled();
  });
});
