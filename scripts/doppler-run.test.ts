import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(__dirname, '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const SCRIPT_URL = pathToFileURL(SCRIPT).href;
const CI_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const PACKAGE_JSON = join(REPO_ROOT, 'package.json');
const FAKE_DOPPLER_PRELOAD =
  './scripts/__fixtures__/doppler-run/fake-doppler-preload.cjs';
const EMPTY_PATH_DIR = join(REPO_ROOT, 'scripts', '__fixtures__'); // has no `doppler` executable
const CHILD_BOUNDARY_EXIT = 23;

/**
 * Run doppler-run.mjs's self-test entry point (WI-1247) with the resolver's
 * inputs injected via env vars. Exercises resolveDopplerBinary's full
 * decision matrix — including the win32 fallback, which this suite can't hit
 * naturally on the Linux/macOS machines the rest of the repo's tests run on
 * — as a subprocess, matching this repo's convention of driving .mjs scripts
 * only through their CLI surface (see scripts/sync-skills.test.ts).
 */
function selfTest(opts: {
  platform?: string;
  pathHit?: boolean;
  fallbackExists?: boolean;
}) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DOPPLER_RUN_SELF_TEST: '1',
      ...(opts.platform
        ? { DOPPLER_RUN_SELF_TEST_PLATFORM: opts.platform }
        : {}),
      DOPPLER_RUN_SELF_TEST_PATH_HIT: opts.pathHit ? '1' : '0',
      DOPPLER_RUN_SELF_TEST_FALLBACK_EXISTS: opts.fallbackExists ? '1' : '0',
    },
  });
}

function entryGuardTest(entry: {
  argvPath: string;
  moduleUrl: string;
  windows: boolean;
}) {
  const source = [
    `import { dispatchMainIfEntry } from ${JSON.stringify(SCRIPT_URL)};`,
    `dispatchMainIfEntry(${JSON.stringify(entry)});`,
  ].join('\n');

  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DOPPLER_RUN_SELF_TEST: '1',
        DOPPLER_RUN_SELF_TEST_PATH_HIT: '1',
        DOPPLER_RUN_SELF_TEST_FALLBACK_EXISTS: '0',
      },
    },
  );
}

function packageManagerLaunch(pnpmCli: string) {
  return /\.(?:c?js)$/i.test(pnpmCli)
    ? {
        command: process.execPath,
        args: [pnpmCli],
      }
    : {
        command: pnpmCli,
        args: [],
      };
}

function packageScriptTest(script: string, args: string[] = []) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error(
      'npm_execpath is required; run this suite through `pnpm test:doppler-run` or `pnpm run test:scripts`.',
    );
  }

  const launch = packageManagerLaunch(pnpmCli);

  return spawnSync(launch.command, [...launch.args, 'run', script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: fakeDopplerEnv({ executeChild: true }),
  });
}

function fakeDopplerEnv(
  options: { executeChild?: boolean; forceMissing?: boolean } = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(options.executeChild
      ? {
          DATABASE_URL:
            'postgresql://test:test@127.0.0.1:5433/eduagent_integration_test',
          DOPPLER_CONFIG: '',
          DOPPLER_ENVIRONMENT: '',
          DOPPLER_PROJECT: '',
          DOPPLER_RUN_FAKE_EXEC_CHILD: '1',
        }
      : {}),
    ...(options.forceMissing ? { DOPPLER_RUN_FAKE_MISSING: '1' } : {}),
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      `--require=${FAKE_DOPPLER_PRELOAD}`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function dopplerRun(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: fakeDopplerEnv(),
  });
}

describe('package-manager launcher shape (WI-2522)', () => {
  test.each(['C:\\pnpm\\pnpm.cjs', '/opt/pnpm/pnpm.js'])(
    'runs JavaScript CLI %s through Node',
    (pnpmCli) => {
      expect(packageManagerLaunch(pnpmCli)).toEqual({
        command: process.execPath,
        args: [pnpmCli],
      });
    },
  );

  test('spawns a native Windows pnpm executable directly', () => {
    const pnpmCli = 'C:\\pnpm\\pnpm.exe';

    expect(packageManagerLaunch(pnpmCli)).toEqual({
      command: pnpmCli,
      args: [],
    });
  });
});

describe('doppler-run.mjs resolver decision matrix (WI-1247)', () => {
  test('PATH-present → resolves to bare "doppler" (CI + Homebrew/curl installs, zero behavior change)', () => {
    const result = selfTest({ platform: 'darwin', pathHit: true });
    expect(result.stdout.trim()).toBe('doppler');
    expect(result.status).toBe(0);
  });

  test('win32 + PATH-absent + Windows fallback file exists → resolves to the known Windows path', () => {
    const result = selfTest({
      platform: 'win32',
      pathHit: false,
      fallbackExists: true,
    });
    expect(result.stdout.trim()).toBe('C:/Tools/doppler/doppler.exe');
    expect(result.status).toBe(0);
  });

  test('non-Windows + PATH-absent → errors (no silent fallback on macOS/Linux)', () => {
    const result = selfTest({
      platform: 'darwin',
      pathHit: false,
      fallbackExists: true,
    });
    expect(result.stdout).toMatch(/ERROR: doppler not found/);
    expect(result.status).toBe(1);
  });

  test('win32 + PATH-absent + Windows fallback file missing → errors', () => {
    const result = selfTest({
      platform: 'win32',
      pathHit: false,
      fallbackExists: false,
    });
    expect(result.stdout).toMatch(/ERROR: doppler not found/);
    expect(result.status).toBe(1);
  });
});

describe('doppler-run.mjs entry-point guard (WI-2522)', () => {
  test('Windows drive-letter argv dispatches main when its file URL matches', () => {
    const result = entryGuardTest({
      argvPath: 'C:\\repo\\scripts\\doppler-run.mjs',
      moduleUrl: 'file:///C:/repo/scripts/doppler-run.mjs',
      windows: true,
    });

    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('doppler');
    expect(result.status).toBe(0);
  });

  test('Windows drive-letter argv does not dispatch main for a different file URL', () => {
    const result = entryGuardTest({
      argvPath: 'C:\\repo\\scripts\\doppler-run.mjs',
      moduleUrl: 'file:///D:/repo/scripts/doppler-run.mjs',
      windows: true,
    });

    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });

  test('POSIX argv dispatches main when its file URL matches', () => {
    const result = entryGuardTest({
      argvPath: '/repo/scripts/doppler-run.mjs',
      moduleUrl: 'file:///repo/scripts/doppler-run.mjs',
      windows: false,
    });

    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('doppler');
    expect(result.status).toBe(0);
  });
});

describe('doppler-run.mjs real invocation (WI-1247)', () => {
  test('resolves the fake doppler preload and forwards args verbatim (no reparsing)', () => {
    const result = dopplerRun([
      'run',
      '-c',
      'stg',
      '--',
      'pnpm',
      'eval:llm',
      '--',
      '--live',
    ]);
    expect(result.stdout).toContain(
      'ARGS:run -c stg -- pnpm eval:llm -- --live',
    );
    expect(result.status).toBe(0);
  });

  test('a non-zero child exit code propagates through the wrapper (must-have: never mask a failing script as green)', () => {
    const result = dopplerRun(['--exit-check']);
    expect(result.status).toBe(7);
  });

  test('doppler missing entirely → wrapper exits non-zero with a clear message (no crash, no silent success)', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'run', '--', 'echo', 'hi'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...fakeDopplerEnv({ forceMissing: true }),
          PATH: EMPTY_PATH_DIR,
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/doppler not found/);
  });
});

describe('Windows-facing package-script dispatch (WI-2522)', () => {
  test('pnpm test reaches doppler with the unit-test command', () => {
    const result = packageScriptTest('test');

    expect(result.stdout).toContain('ARGS:run -- nx run-many -t test');
    expect(result.stdout).toContain(
      'CHILD_STARTED:["nx","run-many","-t","test"]',
    );
    expect(result.status).toBe(CHILD_BOUNDARY_EXIT);
  });

  test('pnpm test:api:integration reaches doppler with the guarded API integration launcher', () => {
    const result = packageScriptTest('test:api:integration');

    expect(result.stdout).toContain(
      'ARGS:run --project mentomate --config dev_integration --',
    );
    expect(result.stdout).toContain('scripts/run-api-integration.mjs --nx');
    expect(result.stdout).toContain(
      'CHILD_STARTED:["nx","run","api:integration-api"]',
    );
    expect(result.status).toBe(CHILD_BOUNDARY_EXIT);
  });

  test('pnpm test:api:integration:ci reaches the guarded Nx boundary', () => {
    const result = packageScriptTest('test:api:integration:ci');

    expect(result.stdout).toContain(
      'CHILD_STARTED:["nx","run","api:integration-api"]',
    );
    expect(result.status).toBe(CHILD_BOUNDARY_EXIT);
  });

  test('pnpm test:integration reaches doppler with the cross-package integration command', () => {
    const result = packageScriptTest('test:integration');

    expect(result.stdout).toContain(
      'ARGS:run -- jest --config tests/integration/jest.config.cjs --no-coverage',
    );
    expect(result.stdout).toContain(
      'CHILD_STARTED:["jest","--config","tests/integration/jest.config.cjs","--no-coverage"]',
    );
    expect(result.status).toBe(CHILD_BOUNDARY_EXIT);
  });

  test('targeted API integration command runs through the pnpm lifecycle', () => {
    const result = packageScriptTest('test:api:integration', [
      '--jest',
      'apps/api/src/services/auth-scoping.integration.test.ts',
      '--runInBand',
      '--no-coverage',
    ]);

    expect(result.stdout).toContain(
      'CHILD_STARTED:["jest","--config","apps/api/jest.integration.config.cjs","--forceExit","apps/api/src/services/auth-scoping.integration.test.ts","--runInBand","--no-coverage"]',
    );
    expect(result.status).toBe(CHILD_BOUNDARY_EXIT);
  });
});

describe('native Windows CI gate (WI-2522)', () => {
  test('runs the focused doppler wrapper suite in the required Windows job', () => {
    const workflow = parseYaml(readFileSync(CI_WORKFLOW, 'utf8')) as {
      jobs?: Record<
        string,
        {
          'runs-on'?: string;
          steps?: Array<{ name?: string; run?: string }>;
        }
      >;
    };
    const windowsJob = workflow.jobs?.['wi2176-windows-orion-contract'];
    const dopplerStep = windowsJob?.steps?.find(
      (step) => step.name === 'Run WI-2522 doppler-run Windows contract',
    );

    expect(windowsJob?.['runs-on']).toBe('windows-latest');
    expect(dopplerStep?.run).toBe('pnpm test:doppler-run');
  });
});

describe('scripts-suite CI command (WI-2522)', () => {
  test('runs through a pnpm lifecycle that supplies npm_execpath', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = parseYaml(readFileSync(CI_WORKFLOW, 'utf8')) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const scriptsStep = workflow.jobs?.main?.steps?.find(
      (step) => step.name === 'scripts/* tests',
    );

    expect(packageJson.scripts?.['test:scripts']).toBe(
      'jest --config scripts/jest.config.cjs --no-coverage',
    );
    expect(scriptsStep?.run).toBe('pnpm run test:scripts');
  });
});
