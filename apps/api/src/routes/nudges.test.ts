import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { createDatabaseModuleMock } from '../test-utils/database-module';

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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../services/account' /* gc1-allow: unit test boundary */, () => ({
  // gc1-allow: stubs findOrCreateAccount — avoids real Clerk/DB round-trip
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

const mockCreateNudge = jest.fn();
const mockListUnreadNudges = jest.fn();
const mockMarkNudgeRead = jest.fn();
const mockMarkAllNudgesRead = jest.fn();

jest.mock('../services/nudge' /* gc1-allow: unit test boundary */, () => ({
  // gc1-allow: stubs all nudge service functions — tests exercise HTTP layer, not DB
  createNudge: (...args: unknown[]) => mockCreateNudge(...args),
  listUnreadNudges: (...args: unknown[]) => mockListUnreadNudges(...args),
  markNudgeRead: (...args: unknown[]) => mockMarkNudgeRead(...args),
  markAllNudgesRead: (...args: unknown[]) => mockMarkAllNudgesRead(...args),
}));

import { app } from '../index';
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

  it('returns empty array without ?unread=true', async () => {
    const res = await app.request(
      '/v1/nudges',
      { headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nudges).toEqual([]);
    expect(mockListUnreadNudges).not.toHaveBeenCalled();
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

  it('returns count 0 when nudge not found', async () => {
    mockMarkNudgeRead.mockResolvedValue(0);
    const res = await app.request(
      '/v1/nudges/nudge-missing/read',
      { method: 'PATCH', headers: PARENT_HEADERS },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 0 });
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
