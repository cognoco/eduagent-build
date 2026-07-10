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

jest.mock('../services/llm', () => {
  const actual = jest.requireActual(
    '../services/llm',
  ) as typeof import('../services/llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
    routeAndStream: (...args: unknown[]) => mockRouteAndStream(...args),
    getRegisteredProviders: () => mockGetRegisteredProviders(),
  };
});

jest.mock('../services/test-seed', () => {
  const actual = jest.requireActual(
    '../services/test-seed',
  ) as typeof import('../services/test-seed');
  return {
    ...actual,
    seedScenario: jest.fn(),
    resetDatabase: jest.fn(),
    debugAccountsByEmail: jest.fn(),
    debugSubjectsByClerkUserId: jest.fn(),
    VALID_SCENARIOS: ['default'],
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

// ---------------------------------------------------------------------------
// [WI-983] /__test/reset body validation — zValidator replaces manual `as` casts
// ---------------------------------------------------------------------------

async function callReset(
  body: unknown,
  env: Record<string, string | undefined> = {
    ENVIRONMENT: 'development',
    TEST_SEED_SECRET: 'dev-secret',
  },
) {
  const req = new Request('http://test.local/__test/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // dev secret is validated by the /__test/* middleware
      'X-Test-Secret': env['TEST_SEED_SECRET'] ?? '',
    },
    body: JSON.stringify(body),
  });
  return testSeedRoutes.request(req, undefined, env);
}

// Import the mock so we can verify it's not called on bad input
const { resetDatabase, seedScenario } = jest.requireMock(
  '../services/test-seed',
) as {
  resetDatabase: jest.Mock;
  seedScenario: jest.Mock;
};

async function callSeed(
  body: unknown,
  env: Record<string, string | undefined> = {
    ENVIRONMENT: 'development',
    TEST_SEED_SECRET: 'dev-secret',
  },
) {
  const req = new Request('http://test.local/__test/seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': env['TEST_SEED_SECRET'] ?? '',
    },
    body: JSON.stringify(body),
  });
  return testSeedRoutes.request(req, undefined, env);
}

describe('[WI-1770] POST /__test/seed — native seed slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedScenario.mockResolvedValue({
      scenario: 'default',
      accountId: 'account-id',
      profileId: 'profile-id',
      email: 'test-e2e-native-01+clerk_test@example.com',
      password: 'seed-password',
      ids: {},
    });
  });

  it('accepts nativeSeedSlot and seeds the deterministic native slot email', async () => {
    const res = await callSeed({
      scenario: 'default',
      nativeSeedSlot: 'native-01',
    });

    expect(res.status).toBe(201);
    expect(seedScenario).toHaveBeenCalledWith(
      undefined,
      'default',
      'test-e2e-native-01+clerk_test@example.com',
      expect.any(Object),
    );
  });

  it('rejects a request that provides both email and nativeSeedSlot', async () => {
    const res = await callSeed({
      scenario: 'default',
      email: 'custom@example.com',
      nativeSeedSlot: 'native-01',
    });

    expect(res.status).toBe(400);
    expect(seedScenario).not.toHaveBeenCalled();
  });

  it('rejects an unknown nativeSeedSlot', async () => {
    const res = await callSeed({
      scenario: 'default',
      nativeSeedSlot: 'native-99',
    });

    expect(res.status).toBe(400);
    expect(seedScenario).not.toHaveBeenCalled();
  });
});

describe('[WI-983] POST /__test/reset — Zod body validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: resetDatabase succeeds and returns the expected shape
    (resetDatabase as jest.Mock).mockResolvedValue({
      deletedCount: 0,
      clerkUsersDeleted: 0,
    });
  });

  it('returns 400 when verifiedSeedClerkUserIds contains a non-string element', async () => {
    const res = await callReset({ verifiedSeedClerkUserIds: [42] });
    expect(res.status).toBe(400);
    expect(resetDatabase).not.toHaveBeenCalled();
  });

  it('returns 200 and calls resetDatabase when verifiedSeedClerkUserIds is a valid string array', async () => {
    const res = await callReset({ verifiedSeedClerkUserIds: ['user_abc'] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('Database reset complete');
    expect(resetDatabase).toHaveBeenCalledTimes(1);
  });

  it('passes preserveClerkUsers=true through to resetDatabase for reusable native slot cleanup', async () => {
    const req = new Request(
      'http://test.local/__test/reset?prefix=test-e2e-native-01&preserveClerkUsers=true',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Secret': 'dev-secret',
        },
        body: JSON.stringify({}),
      },
    );
    const res = await testSeedRoutes.request(req, undefined, {
      ENVIRONMENT: 'development',
      TEST_SEED_SECRET: 'dev-secret',
    });

    expect(res.status).toBe(200);
    const opts = (resetDatabase as jest.Mock).mock.calls[0]?.[2] as {
      prefix?: string;
      preserveClerkUsers?: boolean;
    };
    expect(opts.prefix).toBe('test-e2e-native-01');
    expect(opts.preserveClerkUsers).toBe(true);
  });

  // [WI-983] Regression: the CI seed-cleanup callers POST /__test/reset with NO
  // body and NO Content-Type (`.github/workflows/e2e-web.yml:222-225` and
  // `e2e-web-cleanup.yml:67-70` — `curl -X POST -H X-Test-Secret …`, no `-d`).
  // The pre-WI-983 handler tolerated this and proceeded with
  // verifiedSeedClerkUserIds = undefined. This test locks that contract: when no
  // Content-Type is present, Hono's json validator skips body parsing and passes
  // `{}` to the schema (all fields optional → success), so a bodyless reset still
  // returns 200. (Verified: hono/validator only calls c.req.json() when a JSON
  // Content-Type is set, so an absent body never 400s.)
  it('returns 200 for a bodyless POST (no body, no Content-Type) and proceeds with undefined IDs', async () => {
    const req = new Request('http://test.local/__test/reset', {
      method: 'POST',
      headers: {
        // No Content-Type and no body — mirrors the CI curl invocation.
        'X-Test-Secret': 'dev-secret',
      },
    });
    const res = await testSeedRoutes.request(req, undefined, {
      ENVIRONMENT: 'development',
      TEST_SEED_SECRET: 'dev-secret',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('Database reset complete');
    expect(resetDatabase).toHaveBeenCalledTimes(1);
    // No body → verifiedSeedClerkUserIds is undefined in the resetDatabase opts.
    const opts = (resetDatabase as jest.Mock).mock.calls[0]?.[2] as {
      verifiedSeedClerkUserIds?: unknown;
    };
    expect(opts.verifiedSeedClerkUserIds).toBeUndefined();
  });
});

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

  // ----- Break-test for fail-open ENVIRONMENT guard ---------------------
  // The previous middleware only blocked the literal string 'production'.
  // If ENVIRONMENT was unset (e.g., partial Doppler sync), /__test/* routes
  // were reachable in production. The fix inverts the check to allow only
  // recognised non-production environments ('development', 'staging') and
  // rejects everything else, including `undefined`.
  it('[break-test] rejects when ENVIRONMENT is undefined (fail-closed)', async () => {
    const res = await callPing({ ENVIRONMENT: undefined });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/Not available in production/);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('[break-test] rejects unrecognised ENVIRONMENT values (fail-closed)', async () => {
    const res = await callPing({ ENVIRONMENT: 'preview' });
    expect(res.status).toBe(403);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
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
