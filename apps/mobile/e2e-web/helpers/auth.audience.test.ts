import type { Page } from '@playwright/test';

import { markPreAuthIntroSeen } from './auth';

function tokenWithPayload(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function pageWithSession(token: string): {
  page: Page;
  evaluate: jest.Mock;
} {
  const evaluate = jest.fn(async () => undefined);
  return {
    page: {
      context: () => ({
        cookies: async () => [{ name: '__session', value: token }],
      }),
      evaluate,
    } as unknown as Page,
    evaluate,
  };
}

describe('markPreAuthIntroSeen development audience preflight', () => {
  const originalAudience = process.env.CLERK_AUDIENCE;
  const originalSkipLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API;

  afterEach(() => {
    if (originalAudience === undefined) delete process.env.CLERK_AUDIENCE;
    else process.env.CLERK_AUDIENCE = originalAudience;

    if (originalSkipLocalApi === undefined) {
      delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    } else {
      process.env.PLAYWRIGHT_SKIP_LOCAL_API = originalSkipLocalApi;
    }
  });

  it('rejects a wrong audience before writing local signed-in state', async () => {
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    process.env.CLERK_AUDIENCE = 'development-api';
    const token = tokenWithPayload({ sub: 'user_1', aud: 'wrong-audience' });
    const { page, evaluate } = pageWithSession(token);

    await expect(markPreAuthIntroSeen(page)).rejects.toThrow(
      /does not match the local API audience/i,
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('accepts matching development metadata and writes only the intro marker', async () => {
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    process.env.CLERK_AUDIENCE = 'development-api';
    const { page, evaluate } = pageWithSession(
      tokenWithPayload({ sub: 'user_1', aud: 'development-api' }),
    );

    await expect(markPreAuthIntroSeen(page)).resolves.toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('leaves hosted staging and production behavior unchanged', async () => {
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    delete process.env.CLERK_AUDIENCE;
    const { page, evaluate } = pageWithSession(
      tokenWithPayload({ sub: 'user_1' }),
    );

    await expect(markPreAuthIntroSeen(page)).resolves.toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
