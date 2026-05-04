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
  overrides: Partial<JWTPayload> = {}
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
  verifyJWT: jest.Mock;
} {
  return {
    decodeJWTHeader: jest
      .fn()
      .mockReturnValue(overrides?.header ?? TEST_JWT_HEADER),
    fetchJWKS: jest.fn().mockResolvedValue(overrides?.jwks ?? TEST_JWKS),
    verifyJWT: jest
      .fn()
      .mockResolvedValue(createTestJWTPayload(overrides?.payload)),
  };
}
