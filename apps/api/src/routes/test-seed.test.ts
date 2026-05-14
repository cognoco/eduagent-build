// ---------------------------------------------------------------------------
// Test-Seed Routes — Tests
//
// Focus: [BUG-725 / SEC-9] /__test/llm-ping must NOT make a real LLM call in
// staging unless LLM_PING_ENABLED='true' is explicitly set. Shared secret
// alone is insufficient — secret leak would otherwise allow LLM cost-DoS.
// ---------------------------------------------------------------------------

const mockRouteAndCall = jest.fn();
const mockRouteAndStream = jest.fn();
const mockGetRegisteredProviders = jest.fn().mockReturnValue([]);

jest.mock('../services/llm', () => { // gc1-allow: requireActual + targeted override (canonical GC1-compliant pattern)
  const actual = jest.requireActual('../services/llm') as Record<string, unknown>;
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
    routeAndStream: (...args: unknown[]) => mockRouteAndStream(...args),
    getRegisteredProviders: () => mockGetRegisteredProviders(),
  };
});

jest.mock('../services/test-seed', () => { // gc1-allow: requireActual + targeted override (canonical GC1-compliant pattern)
  const actual = jest.requireActual('../services/test-seed') as Record<string, unknown>;
  return {
    ...actual,
    seedScenario: jest.fn(),
    resetDatabase: jest.fn(),
    debugAccountsByEmail: jest.fn(),
    debugSubjectsByClerkUserId: jest.fn(),
  };
});

import { testSeedRoutes } from './test-seed';

async function callPing(env: Record<string, string | undefined>) {
  // Always pass the matching shared secret in the header — these tests are
  // about the *additional* LLM-ping-specific gate, not about secret bypass.
  const headers: Record<string, string> = {};
  if (env['TEST_SEED_SECRET']) {
    headers['X-Test-Secret'] = env['TEST_SEED_SECRET'];
  }
  const req = new Request('http://test.local/__test/llm-ping', {
    method: 'GET',
    headers,
  });
  // testSeedRoutes is a Hono app; .request takes (path|Request, init, env)
  const res = await testSeedRoutes.request(req, undefined, env);
  return res;
}

describe('[BUG-725 / SEC-9] /__test/llm-ping environment guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks production unconditionally (route-level middleware)', async () => {
    const res = await callPing({ ENVIRONMENT: 'production' });
    expect(res.status).toBe(403);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('blocks staging when LLM_PING_ENABLED is unset, even with a valid secret', async () => {
    // Staging has TEST_SEED_SECRET configured for E2E seed, but LLM ping must
    // remain dev-only by default. Without the explicit opt-in, this is the
    // exact bug scenario: a secret leak would otherwise allow LLM cost-DoS.
    const res = await callPing({
      ENVIRONMENT: 'staging',
      TEST_SEED_SECRET: 'test-secret',
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/LLM_PING_ENABLED/);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('blocks staging when LLM_PING_ENABLED is "false" or any non-"true" value', async () => {
    const res = await callPing({
      ENVIRONMENT: 'staging',
      LLM_PING_ENABLED: 'yes',
    });
    expect(res.status).toBe(403);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('allows development without LLM_PING_ENABLED', async () => {
    mockRouteAndCall.mockResolvedValue({
      provider: 'mock',
      model: 'm',
      latencyMs: 1,
      response: 'hi',
    });
    const res = await callPing({ ENVIRONMENT: 'development' });
    expect(res.status).toBe(200);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });

  it('allows staging only when LLM_PING_ENABLED is exactly "true"', async () => {
    mockRouteAndCall.mockResolvedValue({
      provider: 'mock',
      model: 'm',
      latencyMs: 1,
      response: 'hi',
    });
    const res = await callPing({
      ENVIRONMENT: 'staging',
      TEST_SEED_SECRET: 'test-secret',
      LLM_PING_ENABLED: 'true',
    });
    expect(res.status).toBe(200);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });
});
