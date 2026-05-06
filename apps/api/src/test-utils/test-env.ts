/// <reference types="jest" />

import { signTestJwt } from '@eduagent/test-utils';

/**
 * Shared auth-env fixture for route/middleware tests.
 *
 * Spread into a per-suite `TEST_ENV` to avoid redeclaring the JWT/JWKS keys
 * in every file. Webhook tests (HMAC-signed) intentionally don't use this —
 * they don't go through auth middleware.
 */
export const BASE_AUTH_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  CLERK_AUDIENCE: 'test-audience',
} as const;

// ---------------------------------------------------------------------------
// JWT claim defaults that match BASE_AUTH_ENV
// The auth middleware derives issuer from CLERK_JWKS_URL and enforces CLERK_AUDIENCE.
// Tokens must carry matching iss + aud claims.
// ---------------------------------------------------------------------------

const TEST_JWT_CLAIMS = {
  sub: 'user_test',
  email: 'test@example.com',
  iss: 'https://clerk.test',
  aud: BASE_AUTH_ENV.CLERK_AUDIENCE,
} as const;

/**
 * Returns `{ Authorization: 'Bearer <real-RS256-token>', 'Content-Type': ... }`
 * for the default test user. Accepts optional extra headers to spread in.
 *
 * A fresh token is signed on each call so expiry is always 3600 s from now.
 * For tests that need a profile-id header:
 *   makeAuthHeaders({ 'X-Profile-Id': 'profile-abc' })
 */
export function makeAuthHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  return {
    Authorization: `Bearer ${signTestJwt(TEST_JWT_CLAIMS)}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * @deprecated Use `makeAuthHeaders()` instead. This constant carries a fake
 * token (`valid.jwt.token`) that only works when `../middleware/jwt` is mocked.
 * It is kept here temporarily during the C1 mock-cleanup migration so that
 * files not yet converted continue to compile.
 *
 * Remove after all 19 route test files have been converted.
 */
export const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
} as const;
