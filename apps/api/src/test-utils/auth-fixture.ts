/// <reference types="jest" />

import type { JWK, JWKS, JWTHeader, JWTPayload } from '../middleware/jwt';

export const TEST_JWT_HEADER: JWTHeader = {
  alg: 'RS256',
  kid: 'test-kid',
};

export const TEST_JWKS: JWKS = {
  keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' } satisfies JWK],
};

export function createTestJWTPayload(
  overrides: Partial<JWTPayload> = {},
): JWTPayload {
  return {
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

export function createJwtModuleMock(overrides?: {
  header?: JWTHeader;
  jwks?: JWKS;
  payload?: Partial<JWTPayload>;
}): {
  decodeJWTHeader: jest.Mock;
  fetchJWKS: jest.Mock;
  lookupJWKByKid: jest.Mock;
  verifyJWT: jest.Mock;
} {
  const header = overrides?.header ?? TEST_JWT_HEADER;
  const jwks = overrides?.jwks ?? TEST_JWKS;
  return {
    decodeJWTHeader: jest.fn().mockReturnValue(header),
    fetchJWKS: jest.fn().mockResolvedValue(jwks),
    // [BUG-492] auth middleware now resolves the signing key via lookupJWKByKid
    // (which transparently re-fetches once on kid-miss). The legacy fetchJWKS
    // mock is still exposed for tests that assert it isn't called.
    lookupJWKByKid: jest.fn().mockResolvedValue(jwks.keys[0]),
    verifyJWT: jest
      .fn()
      .mockResolvedValue(createTestJWTPayload(overrides?.payload)),
  };
}
