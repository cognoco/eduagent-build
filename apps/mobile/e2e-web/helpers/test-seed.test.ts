const originalEmailPrefix = process.env.PLAYWRIGHT_EMAIL_PREFIX;
const originalApiUrl = process.env.PLAYWRIGHT_API_URL;
const originalTestSeedSecret = process.env.PLAYWRIGHT_TEST_SEED_SECRET;
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
