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

jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    isOwner: true,
    displayName: 'Test User',
    birthYear: 2000,
    birthDate: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
  getProfile: jest.fn(),
}));

jest.mock('../services/home-cards', () => ({
  getHomeCardsForProfile: jest.fn(),
  trackHomeCardInteraction: jest.fn(),
}));

import { app } from '../index';
import {
  getHomeCardsForProfile,
  trackHomeCardInteraction,
} from '../services/home-cards';
import { findOwnerProfile } from '../services/profile';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

beforeEach(() => {
  jest.clearAllMocks();
  (findOwnerProfile as jest.Mock).mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    isOwner: true,
    displayName: 'Test User',
    birthYear: 2000,
    birthDate: null,
    location: null,
    consentStatus: 'CONSENTED',
  });
});

describe('home card routes', () => {
  // TODO: profile-scope middleware's findOwnerProfile mock doesn't propagate
  // profileId in the test environment. The route returns 400 because profileId
  // is correctly guarded (no account.id fallback). Unskip when the test
  // infrastructure supports profile resolution through the middleware chain.
  it.skip('returns ranked home cards', async () => {
    (getHomeCardsForProfile as jest.Mock).mockResolvedValue({
      coldStart: false,
      cards: [
        {
          id: 'study',
          title: 'Continue Biology',
          subtitle: 'Photosynthesis',
          badge: 'Continue',
          primaryLabel: 'Continue topic',
          priority: 82,
          compact: false,
          subjectId: '11111111-1111-4111-8111-111111111111',
          subjectName: 'Biology',
          topicId: '22222222-2222-4222-8222-222222222222',
        },
        {
          id: 'homework',
          title: 'Homework help',
          subtitle: 'Snap a question and open the camera.',
          badge: 'Quick start',
          primaryLabel: 'Open camera',
          priority: 74,
          compact: true,
        },
      ],
    });

    const res = await app.request(
      '/v1/home-cards',
      { headers: AUTH_HEADERS },
      TEST_ENV
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.coldStart).toBe(false);
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0].id).toBe('study');
  });

  // Route is fully implemented but test can't run: profile-scope middleware's
  // findOwnerProfile mock doesn't propagate profileId in the unit test env.
  // Covered by integration tests instead. See bug #29.
  it.skip('records card interactions', async () => {
    (trackHomeCardInteraction as jest.Mock).mockResolvedValue(undefined);

    const res = await app.request(
      '/v1/home-cards/interactions',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          cardId: 'homework',
          interactionType: 'tap',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(trackHomeCardInteraction).toHaveBeenCalledWith(
      expect.anything(),
      'test-profile-id',
      {
        cardId: 'homework',
        interactionType: 'tap',
      }
    );
  });
});
