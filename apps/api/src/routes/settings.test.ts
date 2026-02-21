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

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// Mock services imported transitively via sessions routes
jest.mock('../services/interleaved', () => ({
  startInterleavedSession: jest.fn().mockResolvedValue({
    session: { id: 'mock-session' },
    topics: [],
  }),
}));

jest.mock('../services/recall-bridge', () => ({
  generateRecallBridge: jest.fn().mockResolvedValue({
    bridge: 'mock bridge',
  }),
}));

jest.mock('../services/settings', () => ({
  getNotificationPrefs: jest.fn().mockResolvedValue({
    reviewReminders: false,
    dailyReminders: false,
    pushEnabled: false,
    maxDailyPush: 3,
  }),
  upsertNotificationPrefs: jest
    .fn()
    .mockImplementation((_db, _profileId, input) =>
      Promise.resolve({
        reviewReminders: input.reviewReminders,
        dailyReminders: input.dailyReminders,
        pushEnabled: input.pushEnabled,
        maxDailyPush: input.maxDailyPush ?? 3,
      })
    ),
  getLearningMode: jest.fn().mockResolvedValue({ mode: 'serious' }),
  upsertLearningMode: jest
    .fn()
    .mockImplementation((_db, _profileId, mode) => Promise.resolve({ mode })),
}));

import { app } from '../index';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
} from '../services/settings';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

describe('settings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /v1/settings/notifications
  // -------------------------------------------------------------------------

  describe('GET /v1/settings/notifications', () => {
    it('returns 200 with notification preferences', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preferences).toBeDefined();
      expect(body.preferences.reviewReminders).toBe(false);
      expect(body.preferences.dailyReminders).toBe(false);
      expect(body.preferences.pushEnabled).toBe(false);
      expect(body.preferences.maxDailyPush).toBe(3);
    });

    it('calls getNotificationPrefs service', async () => {
      await app.request(
        '/v1/settings/notifications',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getNotificationPrefs).toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/settings/notifications', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/settings/notifications
  // -------------------------------------------------------------------------

  describe('PUT /v1/settings/notifications', () => {
    it('returns 200 with valid body', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
            maxDailyPush: 5,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preferences.reviewReminders).toBe(true);
      expect(body.preferences.dailyReminders).toBe(true);
      expect(body.preferences.pushEnabled).toBe(true);
      expect(body.preferences.maxDailyPush).toBe(5);
    });

    it('calls upsertNotificationPrefs service', async () => {
      await app.request(
        '/v1/settings/notifications',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
          }),
        },
        TEST_ENV
      );

      expect(upsertNotificationPrefs).toHaveBeenCalled();
    });

    it('defaults maxDailyPush to 3 when not provided', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            reviewReminders: false,
            dailyReminders: false,
            pushEnabled: false,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.preferences.maxDailyPush).toBe(3);
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            reviewReminders: 'not-a-boolean',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        {
          method: 'PUT',
          body: JSON.stringify({
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/settings/learning-mode
  // -------------------------------------------------------------------------

  describe('GET /v1/settings/learning-mode', () => {
    it('returns 200 with learning mode', async () => {
      const res = await app.request(
        '/v1/settings/learning-mode',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.mode).toBe('serious');
    });

    it('calls getLearningMode service', async () => {
      await app.request(
        '/v1/settings/learning-mode',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getLearningMode).toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/settings/learning-mode', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/settings/learning-mode
  // -------------------------------------------------------------------------

  describe('PUT /v1/settings/learning-mode', () => {
    it('returns 200 with valid mode', async () => {
      const res = await app.request(
        '/v1/settings/learning-mode',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'casual' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.mode).toBe('casual');
    });

    it('calls upsertLearningMode service', async () => {
      await app.request(
        '/v1/settings/learning-mode',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'casual' }),
        },
        TEST_ENV
      );

      expect(upsertLearningMode).toHaveBeenCalled();
    });

    it('returns 400 with invalid mode', async () => {
      const res = await app.request(
        '/v1/settings/learning-mode',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'invalid_mode' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/settings/learning-mode',
        {
          method: 'PUT',
          body: JSON.stringify({ mode: 'casual' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
