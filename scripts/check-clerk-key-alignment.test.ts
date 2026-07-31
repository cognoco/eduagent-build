import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

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

describe('check-clerk-key-alignment', () => {
  it('accepts an internally aligned Clerk configuration', () => {
    const result = run();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Clerk key alignment OK');
  });

  it('rejects a backend secret for a different Clerk instance without leaking values', () => {
    const wrongHost = 'wrong-instance.clerk.accounts.dev';
    const wrongSecret = clerkKey('sk_live', wrongHost);
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
});
