/// <reference types="jest" />

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

/**
 * Standard authenticated request headers. Tests that need a profile-id header
 * spread `{ ...AUTH_HEADERS, 'X-Profile-Id': '...' }`.
 */
export const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
} as const;
