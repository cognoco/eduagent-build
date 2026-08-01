import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const originalEmailPrefix = process.env.PLAYWRIGHT_EMAIL_PREFIX;
const originalApiUrl = process.env.PLAYWRIGHT_API_URL;
const originalTestSeedSecret = process.env.PLAYWRIGHT_TEST_SEED_SECRET;
const originalClerkSecret = process.env.CLERK_SECRET_KEY;
const originalSkipLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API;
const originalFetch = global.fetch;
const originalCwd = process.cwd();

afterEach(() => {
  if (originalEmailPrefix === undefined) {
    delete process.env.PLAYWRIGHT_EMAIL_PREFIX;
  } else {
    process.env.PLAYWRIGHT_EMAIL_PREFIX = originalEmailPrefix;
  }
  if (originalApiUrl === undefined) {
    delete process.env.PLAYWRIGHT_API_URL;
  } else {
    process.env.PLAYWRIGHT_API_URL = originalApiUrl;
  }
  if (originalTestSeedSecret === undefined) {
    delete process.env.PLAYWRIGHT_TEST_SEED_SECRET;
  } else {
    process.env.PLAYWRIGHT_TEST_SEED_SECRET = originalTestSeedSecret;
  }
  if (originalClerkSecret === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = originalClerkSecret;
  }
  if (originalSkipLocalApi === undefined) {
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
  } else {
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = originalSkipLocalApi;
  }
  process.chdir(originalCwd);
  global.fetch = originalFetch;
  jest.resetModules();
});

function loadTestSeedHelper(): typeof import('./test-seed') {
  jest.resetModules();
  process.env.PLAYWRIGHT_EMAIL_PREFIX = 'pw-batched-cleanup-';
  process.env.PLAYWRIGHT_API_URL = 'https://api.test.example';
  process.env.PLAYWRIGHT_TEST_SEED_SECRET = 'test-secret';
  return jest.requireActual('./test-seed');
}

function createLocalApiVars(clerkSecret?: string): {
  cleanup: () => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wi-2936-'));
  const apiDir = path.join(root, 'apps', 'api');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(
    path.join(apiDir, '.dev.vars'),
    clerkSecret ? `CLERK_SECRET_KEY=${JSON.stringify(clerkSecret)}\n` : '',
  );
  process.chdir(root);
  return {
    cleanup: () => {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function seedResponse(email: string): Response {
  return new Response(
    JSON.stringify({
      scenario: 'solo-learner',
      accountId: 'account-id',
      profileId: 'profile-id',
      email,
      password: 'seed-password',
      ids: {},
    }),
    { status: 200 },
  );
}

describe('local Playwright Clerk identity contract (WI-2936)', () => {
  const email = 'seeded@example.com';

  it('uses the local API identity to continue through seeded-email verification', async () => {
    const localSecret = 'sk_test_local_api';
    const local = createLocalApiVars(localSecret);
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(seedResponse(email))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'user-id',
              email_addresses: [
                { id: 'email-address-id', email_address: email },
              ],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as jest.Mock;

    try {
      const { seedScenario } = loadTestSeedHelper();
      await expect(
        seedScenario({ scenario: 'solo-learner', email }),
      ).resolves.toMatchObject({ email });
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect((global.fetch as jest.Mock).mock.calls[1]?.[1]).toMatchObject({
        headers: { Authorization: `Bearer ${localSecret}` },
      });
    } finally {
      local.cleanup();
    }
  });

  it('fails before seeded-email lookup when runner and local API identities conflict', async () => {
    const localSecret = 'sk_test_local_api';
    const runnerSecret = 'sk_test_runner';
    const local = createLocalApiVars(localSecret);
    process.env.CLERK_SECRET_KEY = runnerSecret;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(seedResponse(email)) as jest.Mock;

    try {
      const { seedScenario } = loadTestSeedHelper();
      let thrown: unknown;
      try {
        await seedScenario({ scenario: 'solo-learner', email });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).toMatch(
        /does not match the local API Clerk identity/i,
      );
      expect(String(thrown)).not.toContain(localSecret);
      expect(String(thrown)).not.toContain(runnerSecret);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
    }
  });

  it('fails before seeded-email lookup when the local API identity is missing', async () => {
    const local = createLocalApiVars();
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(seedResponse(email)) as jest.Mock;

    try {
      const { seedScenario } = loadTestSeedHelper();
      await expect(
        seedScenario({ scenario: 'solo-learner', email }),
      ).rejects.toThrow(/Local API CLERK_SECRET_KEY is unavailable/i);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
    }
  });

  it('keeps shared mode on its external identity without substituting local API identity', async () => {
    const local = createLocalApiVars('sk_test_local_api');
    const externalSecret = 'sk_test_external';
    process.env.CLERK_SECRET_KEY = externalSecret;
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(seedResponse(email))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'user-id',
              email_addresses: [
                { id: 'email-address-id', email_address: email },
              ],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as jest.Mock;

    try {
      const { seedScenario } = loadTestSeedHelper();
      await expect(
        seedScenario({ scenario: 'solo-learner', email }),
      ).resolves.toMatchObject({ email });
      expect((global.fetch as jest.Mock).mock.calls[1]?.[1]).toMatchObject({
        headers: { Authorization: `Bearer ${externalSecret}` },
      });
    } finally {
      local.cleanup();
    }
  });
});

describe('[WI-2820 P1] prefix cleanup batching', () => {
  it('repeats a full Worker batch and stops after the partial batch', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Database reset complete',
            deletedCount: 15,
            clerkUsersDeleted: 14,
            clerkUsersSelected: 15,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Database reset complete',
            deletedCount: 2,
            clerkUsersDeleted: 2,
            clerkUsersSelected: 2,
          }),
          { status: 200 },
        ),
      ) as jest.Mock;
    const { resetSeededAccounts } = loadTestSeedHelper();

    await expect(resetSeededAccounts()).resolves.toEqual({
      message: 'Database reset complete',
      deletedCount: 17,
      clerkUsersDeleted: 16,
      clerkUsersSelected: 2,
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe(
      'https://api.test.example/v1/__test/reset?prefix=pw-batched-cleanup-',
    );
    expect(request).toMatchObject({
      method: 'POST',
      headers: { 'X-Test-Secret': 'test-secret' },
    });
  });
});
