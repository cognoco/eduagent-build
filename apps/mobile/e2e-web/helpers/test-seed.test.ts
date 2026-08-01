const originalEmailPrefix = process.env.PLAYWRIGHT_EMAIL_PREFIX;
const originalApiUrl = process.env.PLAYWRIGHT_API_URL;
const originalTestSeedSecret = process.env.PLAYWRIGHT_TEST_SEED_SECRET;
const originalClerkSecretKey = process.env.CLERK_SECRET_KEY;
const originalFetch = global.fetch;

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
  if (originalClerkSecretKey === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = originalClerkSecretKey;
  }
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

describe('[WI-2948] server-owned Clerk seed provisioning', () => {
  it('does not query Clerk with an ambient backend key after the seed endpoint succeeds', async () => {
    process.env.CLERK_SECRET_KEY = 'ambient-key-must-not-be-used';
    const seeded = {
      scenario: 'onboarding-complete',
      accountId: 'account-seeded',
      profileId: 'profile-seeded',
      email: 'seed@example.com',
      password: 'generated-password',
      ids: {},
    };
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://api.test.example/v1/__test/seed') {
        return new Response(JSON.stringify(seeded), { status: 201 });
      }
      throw new Error(`Unexpected request to ${new URL(String(input)).host}`);
    }) as jest.Mock;
    const { seedScenario } = loadTestSeedHelper();

    await expect(
      seedScenario({
        scenario: seeded.scenario,
        email: seeded.email,
      }),
    ).resolves.toEqual(seeded);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
