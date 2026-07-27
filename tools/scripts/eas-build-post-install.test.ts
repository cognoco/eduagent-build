// Regression test for the EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY preflight guard
// (WI-2120). Spawns the real script as a child process with a controlled env
// so the assertion exercises the actual exit-code contract EAS Build depends
// on, not a mocked re-implementation.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(__dirname, 'eas-build-post-install.mjs');
const REPO_ROOT = resolve(__dirname, '..', '..');

function runScript(clerkKey: string | undefined) {
  const env = { ...process.env };
  if (clerkKey === undefined) {
    delete env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  } else {
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkKey;
  }

  return spawnSync('node', [SCRIPT_PATH, REPO_ROOT, 'apps/mobile'], {
    env,
    encoding: 'utf-8',
  });
}

describe('eas-build-post-install EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY preflight', () => {
  it('fails the build when the Clerk publishable key is unset', () => {
    const result = runScript(undefined);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty',
    );
  });

  it('fails the build when the Clerk publishable key is an empty string', () => {
    const result = runScript('');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty',
    );
  });

  it('fails the build when the Clerk publishable key is whitespace-only', () => {
    const result = runScript('   ');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty',
    );
  });

  it('passes when the Clerk publishable key is present', () => {
    const result = runScript('pk_test_placeholder');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'OK: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is set',
    );
  });
});
