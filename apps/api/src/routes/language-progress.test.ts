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
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

jest.mock('../services/language-curriculum', () => ({
  getCurrentLanguageProgress: jest.fn().mockResolvedValue({
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    languageCode: 'es',
    pedagogyMode: 'four_strands',
    currentLevel: 'A1',
    currentSublevel: '3',
    currentMilestone: {
      milestoneId: '880e8400-e29b-41d4-a716-446655440000',
      milestoneTitle: 'Food & Ordering',
      currentLevel: 'A1',
      currentSublevel: '3',
      wordsMastered: 38,
      wordsTarget: 55,
      chunksMastered: 9,
      chunksTarget: 15,
      milestoneProgress: 0.67,
    },
    nextMilestone: {
      milestoneId: '990e8400-e29b-41d4-a716-446655440000',
      milestoneTitle: 'Home & Family',
      level: 'A1',
      sublevel: '4',
    },
  }),
}));

import { app } from '../index';
import { getCurrentLanguageProgress } from '../services/language-curriculum';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('language progress routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/subjects/:subjectId/cefr-progress', () => {
    it('returns 200 with current CEFR milestone progress', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/cefr-progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.languageCode).toBe('es');
      expect(body.currentLevel).toBe('A1');
      expect(body.currentMilestone.milestoneTitle).toBe('Food & Ordering');
      expect(getCurrentLanguageProgress).toHaveBeenCalled();
    });

    it('returns 404 when no language progress exists', async () => {
      (getCurrentLanguageProgress as jest.Mock).mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/cefr-progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/cefr-progress`,
        {
          headers: {
            Authorization: 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/cefr-progress`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
