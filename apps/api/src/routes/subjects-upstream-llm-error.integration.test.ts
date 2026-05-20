/**
 * Integration: POST /v1/subjects/resolve — UpstreamLlmError → 502 via global onError
 *
 * [CCR PR #236] No integration test previously asserted that an `UpstreamLlmError`
 * thrown from a route propagates UNWRAPPED through the real app and is
 * classified by the global `app.onError` handler in `apps/api/src/index.ts`
 * (502 + `code: UPSTREAM_ERROR`).
 *
 * `subject-classify` swallows LLM failures internally, so `/v1/subjects/resolve`
 * (which calls `resolveSubjectName` → `routeAndCall` with no try/catch) is the
 * route that lets `UpstreamLlmError` propagate.
 *
 * Boundary: only the LLM provider is mocked (external boundary, via the
 * registered LLM provider fixture). Auth, account, profile-scope, consent,
 * metering, llm middleware, the route handler, and the global `onError`
 * handler all run real.
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import { ERROR_CODES, UpstreamLlmError } from '@eduagent/schemas';

import { app } from '../index';
import { _clearProviders, _resetCircuits } from '../services/llm';
import { clearJWKSCache } from '../middleware/jwt';
import { registerLlmProviderFixture } from '../test-utils/llm-provider-fixtures';

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-subjects-upstream-llm-user';
const AUTH_EMAIL = 'integration-subjects-upstream-llm@integration.test';

// Real JWT verification + Clerk JWKS interceptor.
// The cross-package setup at `tests/integration/setup.ts` does this globally,
// but `apps/api/jest.integration.config.cjs` uses its own `api-setup.ts`
// which intentionally does not touch global fetch — so this suite installs
// the interceptor itself, mirroring the cross-package setup.
const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
// Allow Neon HTTP driver passthrough (no-op when the local pg driver is used).
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

const llmFixture = registerLlmProviderFixture({
  // Default response is never used in this suite — every test sets chatError.
  chatResponse: '{}',
});

async function createOwnerProfile(): Promise<string> {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Upstream LLM Error Learner',
    birthYear: 2000,
  });
  return profile.id;
}

beforeEach(async () => {
  jest.clearAllMocks();
  llmFixture.clearCalls();
  llmFixture.clearChatError();
  _resetCircuits();
  clearJWKSCache();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
  llmFixture.dispose();
  _clearProviders();
  _resetCircuits();
  restoreFetch();
});

describe('Integration: UpstreamLlmError → global onError handler → 502', () => {
  it('POST /v1/subjects/resolve returns 502 UPSTREAM_ERROR when routeAndCall throws UpstreamLlmError', async () => {
    const profileId = await createOwnerProfile();
    // Profile creation may trigger ancillary LLM calls (e.g. classification
    // priming). Reset the call counter so the assertion below measures only
    // calls originating from POST /v1/subjects/resolve.
    llmFixture.clearCalls();

    const upstreamError = new UpstreamLlmError(
      'Subject resolver LLM unavailable',
    );
    llmFixture.setChatError(upstreamError);

    const res = await app.request(
      '/v1/subjects/resolve',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
        body: JSON.stringify({ rawInput: 'Physics' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(502);

    const body = (await res.json()) as { code: string; message: string };
    expect(body).toMatchObject({
      code: ERROR_CODES.UPSTREAM_ERROR,
      message: upstreamError.message,
    });

    // routeAndCall delegates to the registered LLM provider; >= 1 chat call
    // confirms the resolver actually invoked the upstream before the error
    // propagated unwrapped to the global onError handler.
    // (Exact count varies: routeAndCall has an internal retry loop on the
    // primary provider before surfacing UpstreamLlmError, so the call count
    // is implementation-defined — only "called at all" is contractually
    // meaningful here.)
    expect(llmFixture.chatCalls.length).toBeGreaterThanOrEqual(1);
  });
});
