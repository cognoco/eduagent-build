import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const script = path.join(
  process.cwd(),
  'scripts/check-clerk-key-alignment.mjs',
);

function clerkKey(
  prefix: 'sk_test' | 'sk_live' | 'pk_test' | 'pk_live',
  host: string,
) {
  return `${prefix}_${Buffer.from(`${host}$`).toString('base64')}`;
}

function run(overrides: Record<string, string> = {}) {
  const host = 'whole-iguana-9.clerk.accounts.dev';
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLERK_SECRET_KEY: clerkKey('sk_test', host),
      CLERK_PUBLISHABLE_KEY: clerkKey('pk_test', host),
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkKey('pk_test', host),
      CLERK_JWKS_URL: `https://${host}/.well-known/jwks.json`,
      ...overrides,
    },
  });
}

function runWithMockedDomains(
  secretKey: string,
  response: {
    ok?: boolean;
    body?: unknown;
    error?: string;
  },
): ReturnType<typeof spawnSync> {
  const moduleUrl = pathToFileURL(script).toString();
  const probe = `
    const timeoutSignal = new AbortController().signal;
    AbortSignal.timeout = (milliseconds) => {
      if (milliseconds !== 10_000) throw new Error('unexpected-timeout');
      return timeoutSignal;
    };
    globalThis.fetch = async (url, init) => {
      if (String(url) !== 'https://api.clerk.com/v1/domains') {
        throw new Error('unexpected-clerk-endpoint');
      }
      if (init?.headers?.Authorization !== 'Bearer ' + process.env.CLERK_SECRET_KEY) {
        throw new Error('unexpected-authorization-header');
      }
      if (init?.signal !== timeoutSignal) {
        throw new Error('missing-request-timeout');
      }
      if (${JSON.stringify(response.error ?? '')}) {
        throw new Error(${JSON.stringify(response.error ?? '')});
      }
      return {
        ok: ${JSON.stringify(response.ok ?? true)},
        json: async () => (${JSON.stringify(response.body ?? null)}),
      };
    };
    process.env.CLERK_SECRET_KEY = ${JSON.stringify(secretKey)};
    await import(${JSON.stringify(moduleUrl)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLERK_SECRET_KEY: secretKey,
      CLERK_PUBLISHABLE_KEY: clerkKey(
        'pk_test',
        'whole-iguana-9.clerk.accounts.dev',
      ),
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkKey(
        'pk_test',
        'whole-iguana-9.clerk.accounts.dev',
      ),
      CLERK_JWKS_URL:
        'https://whole-iguana-9.clerk.accounts.dev/.well-known/jwks.json',
    },
  });
}

describe('check-clerk-key-alignment', () => {
  it('accepts an internally aligned Clerk configuration', () => {
    const result = run();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Clerk key alignment OK');
  });

  it('rejects a backend secret for a different Clerk instance without leaking values', () => {
    const wrongHost = 'wrong-instance.clerk.accounts.dev';
    const wrongSecret = clerkKey('sk_test', wrongHost);
    const result = run({ CLERK_SECRET_KEY: wrongSecret });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Clerk key alignment failed');
    expect(result.stderr).not.toContain(wrongSecret);
    expect(result.stderr).not.toContain(wrongHost);
  });

  it('rejects missing required Clerk configuration', () => {
    const result = run({ CLERK_SECRET_KEY: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLERK_SECRET_KEY is missing');
  });

  it('rejects mixed Clerk tiers on the same instance', () => {
    const host = 'whole-iguana-9.clerk.accounts.dev';
    const result = run({ CLERK_SECRET_KEY: clerkKey('sk_live', host) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Clerk key alignment failed');
  });

  it('rejects a JWKS host that differs from both publishable keys', () => {
    const result = run({
      CLERK_JWKS_URL:
        'https://wrong-instance.clerk.accounts.dev/.well-known/jwks.json',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Clerk key alignment failed');
  });

  it('validates opaque multi-key secrets against Clerk without logging values', () => {
    const opaqueSecret = 'sk_test_newOpaqueMultiKeyValue';
    const result = runWithMockedDomains(opaqueSecret, {
      body: {
        data: [
          {
            frontend_api_url: 'https://whole-iguana-9.clerk.accounts.dev',
          },
        ],
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Clerk key alignment OK');
    expect(result.stdout).not.toContain(opaqueSecret);
    expect(result.stderr).not.toContain(opaqueSecret);
  });

  it('rejects a decodable legacy secret mismatch without trusting a live fallback', () => {
    const wrongSecret = clerkKey(
      'sk_test',
      'wrong-instance.clerk.accounts.dev',
    );
    const result = runWithMockedDomains(wrongSecret, {
      body: {
        data: [
          {
            frontend_api_url: 'https://whole-iguana-9.clerk.accounts.dev',
          },
        ],
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Clerk key alignment failed');
    expect(result.stdout).not.toContain(wrongSecret);
    expect(result.stderr).not.toContain(wrongSecret);
  });

  it.each([
    ['authentication rejection', { ok: false }],
    ['network failure', { error: 'synthetic network failure' }],
    ['unexpected response shape', { body: { data: { unexpected: true } } }],
    [
      'different Clerk instance',
      {
        body: {
          data: [
            {
              frontend_api_url: 'https://wrong-instance.clerk.accounts.dev',
            },
          ],
        },
      },
    ],
  ])('fails closed for opaque secrets on %s', (_case, response) => {
    const opaqueSecret = 'sk_test_newOpaqueMultiKeyValue';
    const result = runWithMockedDomains(opaqueSecret, response);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Clerk key alignment failed');
    expect(result.stdout).not.toContain(opaqueSecret);
    expect(result.stderr).not.toContain(opaqueSecret);
  });
});
