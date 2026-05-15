// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockFindOrCreateAccount = jest.fn();
jest.mock('../services/account', () => ({
  ...(jest.requireActual('../services/account') as Record<string, unknown>),
  findOrCreateAccount: (...args: unknown[]) => mockFindOrCreateAccount(...args),
}));

const mockFindOwnerProfile = jest.fn();
const mockGetProfile = jest.fn();
jest.mock('../services/profile', () => ({
  ...(jest.requireActual('../services/profile') as Record<string, unknown>),
  findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

const mockGetCoachingCardForProfile = jest.fn();
jest.mock('../services/coaching-cards', () => ({
  ...(jest.requireActual('../services/coaching-cards') as Record<
    string,
    unknown
  >),
  getCoachingCardForProfile: (...args: unknown[]) =>
    mockGetCoachingCardForProfile(...args),
}));

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();

  // Default happy-path returns — tests that need different values override per-test.
  mockFindOrCreateAccount.mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  mockFindOwnerProfile.mockResolvedValue(null);
  mockGetProfile.mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  });
});

describe('coaching card routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/coaching-card
  // -------------------------------------------------------------------------

  describe('GET /v1/coaching-card', () => {
    it('returns 200 with coaching card on warm path', async () => {
      mockGetCoachingCardForProfile.mockResolvedValue({
        coldStart: false,
        card: {
          id: 'a0000001-0000-4000-a000-000000000001',
          profileId: 'a0000000-0000-4000-a000-000000000000',
          type: 'challenge',
          title: 'Ready?',
          body: 'Take the next step.',
          priority: 3,
          expiresAt: '2026-02-16T10:00:00.000Z',
          createdAt: '2026-02-15T10:00:00.000Z',
          topicId: 'a0000002-0000-4000-a000-000000000002',
          difficulty: 'easy',
          xpReward: 10,
        },
        fallback: null,
      });

      const res = await app.request(
        '/v1/coaching-card',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.coldStart).toBe(false);
      expect(body.card).not.toBeNull();
      expect(body.card.type).toBe('challenge');
      expect(body.fallback).toBeNull();
    });

    it('returns 200 with cold-start fallback', async () => {
      mockGetCoachingCardForProfile.mockResolvedValue({
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
        TEST_ENV,
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
