import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  process.chdir(originalCwd);
  jest.resetModules();
}

function prepareRuntime(
  options: {
    apiSecret?: string;
    runnerSecret?: string;
    skipLocalApi?: boolean;
  } = {},
) {
  restoreEnvironment();

  const root = mkdtempSync(path.join(os.tmpdir(), 'wi-2921-'));
  const varsDir = path.join(root, 'apps', 'api');
  mkdirSync(varsDir, { recursive: true });
  if (options.apiSecret) {
    writeFileSync(
      path.join(varsDir, '.dev.vars'),
      `TEST_SEED_SECRET=${JSON.stringify(options.apiSecret)}\n`,
    );
  }

  process.chdir(root);
  delete process.env.PLAYWRIGHT_TEST_SEED_SECRET;
  delete process.env.TEST_SEED_SECRET;
  delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
  if (options.runnerSecret) {
    process.env.PLAYWRIGHT_TEST_SEED_SECRET = options.runnerSecret;
  }
  if (options.skipLocalApi) process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';

  return {
    root,
    load: () => require('./runtime') as typeof import('./runtime'),
  };
}

describe('local Playwright test-seed secret contract (WI-2921)', () => {
  afterEach(() => restoreEnvironment());

  it('uses the local API secret by default instead of requiring a manual runner bridge', () => {
    const { root, load } = prepareRuntime({ apiSecret: 'api-local-secret' });
    try {
      const runtime = load();
      expect(runtime.buildTestSeedHeaders()).toEqual({
        'X-Test-Secret': 'api-local-secret',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('continues to accept an explicitly supplied matching local runner secret', () => {
    const { root, load } = prepareRuntime({
      apiSecret: 'api-local-secret',
      runnerSecret: 'api-local-secret',
    });
    try {
      const runtime = load();
      expect(runtime.buildTestSeedHeaders()).toEqual({
        'X-Test-Secret': 'api-local-secret',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a conflicting local runner secret without disclosing either value', () => {
    const apiSecret = 'api-local-secret';
    const runnerSecret = 'runner-dev-secret';

    const { root, load } = prepareRuntime({ apiSecret, runnerSecret });
    try {
      let thrown: unknown;
      try {
        load();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = String(thrown);
      expect(message).toMatch(/does not match the local API seed secret/i);
      expect(message).not.toContain(apiSecret);
      expect(message).not.toContain(runnerSecret);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves staging mode on the caller-supplied secret without reading local API secrets', () => {
    const { root, load } = prepareRuntime({
      runnerSecret: 'staging-runner-secret',
      skipLocalApi: true,
    });
    try {
      const runtime = load();
      expect(runtime.buildTestSeedHeaders()).toEqual({
        'X-Test-Secret': 'staging-runner-secret',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
