/// <reference types="jest" />

/**
 * JWKS fetch interceptor for route-level unit tests.
 *
 * Route tests exercise real auth middleware (`apps/api/src/middleware/auth.ts`)
 * which calls `fetchJWKS(jwksUrl)` → `globalThis.fetch`. This interceptor
 * patches `globalThis.fetch` so that any request to a URL containing
 * `.well-known/jwks` returns `TEST_JWKS` from `@eduagent/test-utils`.
 *
 * Usage:
 *   import { installTestJwksInterceptor } from '../test-utils/jwks-interceptor';
 *   import { clearJWKSCache } from '../middleware/jwt';
 *
 *   beforeAll(() => installTestJwksInterceptor());
 *   afterAll(() => restoreTestFetch());
 *   beforeEach(() => clearJWKSCache());  // flush the 10-min module-scope cache
 */

import { TEST_JWKS } from '@eduagent/test-utils';
import { clearJWKSCache } from '../middleware/jwt';

let _originalFetch: typeof globalThis.fetch | undefined;

/**
 * Installs a `globalThis.fetch` interceptor that returns `TEST_JWKS` for any
 * request whose URL contains `.well-known/jwks`. All other requests are
 * forwarded to the original `fetch`.
 *
 * Also clears the in-memory JWKS cache so a prior test's cached real/mock JWKS
 * does not bleed into this suite.
 *
 * Call `restoreTestFetch()` in `afterAll` to undo.
 */
export function installTestJwksInterceptor(): void {
  clearJWKSCache();

  if (_originalFetch !== undefined) {
    // Already installed — idempotent
    return;
  }

  _originalFetch = globalThis.fetch;

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (url.includes('.well-known/jwks') || url.includes('/jwks')) {
      return new Response(JSON.stringify(TEST_JWKS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!_originalFetch) {
      throw new Error('jwks-interceptor: _originalFetch is not set');
    }
    return _originalFetch(input, init);
  };
}

/**
 * Restores the original `globalThis.fetch` and clears the JWKS cache.
 * Call in `afterAll`.
 */
export function restoreTestFetch(): void {
  if (_originalFetch !== undefined) {
    globalThis.fetch = _originalFetch;
    _originalFetch = undefined;
  }
  clearJWKSCache();
}
