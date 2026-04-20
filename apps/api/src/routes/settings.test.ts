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

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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
    .mockImplementation((_db, _profileId, _accountId, input) =>
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
    .mockImplementation((_db, _profileId, _accountId, mode) =>
      Promise.resolve({ mode })
    ),
  getCelebrationLevel: jest.fn().mockResolvedValue('all'),
  upsertCelebrationLevel: jest
    .fn()
    .mockImplementation((_db, _profileId, _accountId, celebrationLevel) =>
      Promise.resolve({ celebrationLevel })
    ),
}));

jest.mock('../services/retention-data', () => ({
  getAnalogyDomain: jest.fn().mockResolvedValue(null),
  getNativeLanguage: jest.fn().mockResolvedValue(null),
  setAnalogyDomain: jest
    .fn()
    .mockImplementation((_db, _profileId, _subjectId, domain) =>
      Promise.resolve(domain)
    ),
  setNativeLanguage: jest
    .fn()
    .mockImplementation((_db, _profileId, _subjectId, nativeLanguage) =>
      Promise.resolve(nativeLanguage)
    ),
}));

import { app } from '../index';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
  getCelebrationLevel,
  upsertCelebrationLevel,
} from '../services/settings';
import {
  getAnalogyDomain,
  getNativeLanguage,
  setAnalogyDomain,
  setNativeLanguage,
} from '../services/retention-data';
import { NotFoundError } from '../errors';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
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

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/settings/notifications',
        {
          headers: {
            Authorization: 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      expect(getNotificationPrefs).not.toHaveBeenCalled();
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

  describe('GET /v1/settings/celebration-level', () => {
    it('returns 200 with celebration level', async () => {
      const res = await app.request(
        '/v1/settings/celebration-level',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.celebrationLevel).toBe('all');
    });

    it('calls getCelebrationLevel service', async () => {
      await app.request(
        '/v1/settings/celebration-level',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getCelebrationLevel).toHaveBeenCalled();
    });
  });

  describe('PUT /v1/settings/celebration-level', () => {
    it('returns 200 with updated celebration level', async () => {
      const res = await app.request(
        '/v1/settings/celebration-level',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ celebrationLevel: 'big_only' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.celebrationLevel).toBe('big_only');
    });

    it('calls upsertCelebrationLevel service', async () => {
      await app.request(
        '/v1/settings/celebration-level',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ celebrationLevel: 'off' }),
        },
        TEST_ENV
      );

      expect(upsertCelebrationLevel).toHaveBeenCalled();
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        '/v1/settings/celebration-level',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ celebrationLevel: 'loud' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/settings/subjects/:subjectId/analogy-domain
  // -------------------------------------------------------------------------

  describe('GET /v1/settings/subjects/:subjectId/analogy-domain', () => {
    const subjectId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns 200 with null when no preference set', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.analogyDomain).toBeNull();
    });

    it('returns 200 with analogy domain when set', async () => {
      (getAnalogyDomain as jest.Mock).mockResolvedValueOnce('cooking');

      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.analogyDomain).toBe('cooking');
    });

    it('calls getAnalogyDomain service', async () => {
      await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getAnalogyDomain).toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/settings/subjects/:subjectId/analogy-domain
  // -------------------------------------------------------------------------

  describe('PUT /v1/settings/subjects/:subjectId/analogy-domain', () => {
    const subjectId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns 200 with valid domain', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: 'sports' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.analogyDomain).toBe('sports');
    });

    it('returns 200 when clearing domain (null)', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: null }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.analogyDomain).toBeNull();
    });

    it('calls setAnalogyDomain service', async () => {
      await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: 'gaming' }),
        },
        TEST_ENV
      );

      expect(setAnalogyDomain).toHaveBeenCalled();
    });

    it('returns 400 with invalid domain', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: 'invalid_domain' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid subjectId', async () => {
      const res = await app.request(
        '/v1/settings/subjects/not-a-uuid/analogy-domain',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: 'sports' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      expect(setAnalogyDomain).not.toHaveBeenCalled();
    });

    it('returns 404 when the subject is not owned by the caller', async () => {
      (setAnalogyDomain as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Subject')
      );

      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ analogyDomain: 'sports' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/analogy-domain`,
        {
          method: 'PUT',
          body: JSON.stringify({ analogyDomain: 'cooking' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/settings/subjects/:subjectId/native-language
  // -------------------------------------------------------------------------

  describe('GET /v1/settings/subjects/:subjectId/native-language', () => {
    const subjectId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns 200 with null when no native language is set', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.nativeLanguage).toBeNull();
    });

    it('returns 200 with a stored native language', async () => {
      (getNativeLanguage as jest.Mock).mockResolvedValueOnce('fr');

      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.nativeLanguage).toBe('fr');
    });

    it('calls getNativeLanguage service', async () => {
      await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getNativeLanguage).toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /v1/settings/subjects/:subjectId/native-language
  // -------------------------------------------------------------------------

  describe('PUT /v1/settings/subjects/:subjectId/native-language', () => {
    const subjectId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns 200 with valid native language', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: 'en' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.nativeLanguage).toBe('en');
    });

    it('returns 200 when clearing native language', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: null }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.nativeLanguage).toBeNull();
    });

    it('calls setNativeLanguage service', async () => {
      await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: 'de' }),
        },
        TEST_ENV
      );

      expect(setNativeLanguage).toHaveBeenCalled();
    });

    it('returns 400 with invalid native language', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid subjectId', async () => {
      const res = await app.request(
        '/v1/settings/subjects/not-a-uuid/native-language',
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: 'en' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      expect(setNativeLanguage).not.toHaveBeenCalled();
    });

    it('returns 404 when the subject is not owned by the caller', async () => {
      (setNativeLanguage as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('Subject')
      );

      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ nativeLanguage: 'en' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/settings/subjects/${subjectId}/native-language`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nativeLanguage: 'en' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
