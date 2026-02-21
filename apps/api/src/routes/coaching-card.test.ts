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

jest.mock('../services/coaching-cards', () => ({
  getCoachingCardForProfile: jest.fn(),
}));

import { app } from '../index';
import { getCoachingCardForProfile } from '../services/coaching-cards';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('coaching card routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/coaching-card
  // -------------------------------------------------------------------------

  describe('GET /v1/coaching-card', () => {
    it('returns 200 with coaching card on warm path', async () => {
      (getCoachingCardForProfile as jest.Mock).mockResolvedValue({
        coldStart: false,
        card: {
          id: 'card-1',
          profileId: 'test-account-id',
          type: 'challenge',
          title: 'Ready?',
          body: 'Take the next step.',
          priority: 3,
          expiresAt: '2026-02-16T10:00:00.000Z',
          createdAt: '2026-02-15T10:00:00.000Z',
          topicId: 'topic-1',
          difficulty: 'easy',
          xpReward: 10,
        },
        fallback: null,
      });

      const res = await app.request(
        '/v1/coaching-card',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.coldStart).toBe(false);
      expect(body.card).not.toBeNull();
      expect(body.card.type).toBe('challenge');
      expect(body.fallback).toBeNull();
    });

    it('returns 200 with cold-start fallback', async () => {
      (getCoachingCardForProfile as jest.Mock).mockResolvedValue({
        coldStart: true,
        card: null,
        fallback: {
          actions: [
            {
              key: 'continue_learning',
              label: 'Continue learning',
              description: 'Pick up where you left off.',
            },
            {
              key: 'start_new_topic',
              label: 'Start a new topic',
              description: 'Explore something new in your curriculum.',
            },
            {
              key: 'review_progress',
              label: 'Review progress',
              description: 'See how far you have come.',
            },
          ],
        },
      });

      const res = await app.request(
        '/v1/coaching-card',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.coldStart).toBe(true);
      expect(body.card).toBeNull();
      expect(body.fallback).not.toBeNull();
      expect(body.fallback.actions).toHaveLength(3);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/coaching-card', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });
});
