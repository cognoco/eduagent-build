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

jest.mock('../services/parking-lot-data', () => ({
  getParkingLotItems: jest.fn().mockResolvedValue({ items: [], count: 0 }),
  addParkingLotItem: jest.fn().mockResolvedValue({
    id: 'new-item-id',
    question: 'Why does the sky appear blue?',
    explored: false,
    createdAt: new Date().toISOString(),
  }),
}));

import { app } from '../index';
import {
  getParkingLotItems,
  addParkingLotItem,
} from '../services/parking-lot-data';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

const SESSION_ID = '660e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  jest.clearAllMocks();

  // Reset default mocks
  (getParkingLotItems as jest.Mock).mockResolvedValue({ items: [], count: 0 });
  (addParkingLotItem as jest.Mock).mockResolvedValue({
    id: 'new-item-id',
    question: 'Why does the sky appear blue?',
    explored: false,
    createdAt: new Date().toISOString(),
  });
});

describe('parking lot routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId/parking-lot
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/parking-lot', () => {
    it('returns 200 with items array', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('calls getParkingLotItems with correct params', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getParkingLotItems).toHaveBeenCalledWith(
        undefined, // db — not set in test env (no DATABASE_URL binding)
        'test-account-id', // profileId falls back to account.id
        SESSION_ID
      );
    });

    it('returns items from the service', async () => {
      (getParkingLotItems as jest.Mock).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            question: 'Why is the sky blue?',
            explored: false,
            createdAt: '2026-02-15T10:00:00.000Z',
          },
        ],
        count: 1,
      });

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].question).toBe('Why is the sky blue?');
      expect(body.count).toBe(1);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/parking-lot
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/parking-lot', () => {
    it('returns 201 with valid question', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: 'Why does the sky appear blue?' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.item).toBeDefined();
      expect(body.item.question).toBe('Why does the sky appear blue?');
      expect(body.item.explored).toBe(false);
      expect(body.item.createdAt).toBeDefined();
    });

    it('calls addParkingLotItem with correct params', async () => {
      await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: 'Test question' }),
        },
        TEST_ENV
      );

      expect(addParkingLotItem).toHaveBeenCalledWith(
        undefined, // db — not set in test env (no DATABASE_URL binding)
        'test-account-id', // profileId falls back to account.id
        SESSION_ID,
        'Test question'
      );
    });

    it('returns 400 with empty question', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          body: JSON.stringify({ question: 'A question' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('returns 409 when parking lot limit is reached', async () => {
      (addParkingLotItem as jest.Mock).mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/parking-lot`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ question: 'One too many' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.message).toContain('max 10');
    });
  });
});
