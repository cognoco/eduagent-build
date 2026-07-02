import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const FAKE_DOPPLER_DIR = join(
  REPO_ROOT,
  'scripts',
  '__fixtures__',
  'doppler-run',
);
const EMPTY_PATH_DIR = join(REPO_ROOT, 'scripts', '__fixtures__'); // has no `doppler` executable

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

describe('doppler-run.mjs real invocation (WI-1247)', () => {
  test('resolves the fake doppler fixture via PATH and forwards args verbatim (no reparsing)', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'run', '-c', 'stg', '--', 'pnpm', 'eval:llm', '--', '--live'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${FAKE_DOPPLER_DIR}:${process.env.PATH}`,
        },
      },
    );
    expect(result.stdout).toContain(
      'ARGS:run -c stg -- pnpm eval:llm -- --live',
    );
    expect(result.status).toBe(0);
  });

  test('a non-zero child exit code propagates through the wrapper (must-have: never mask a failing script as green)', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--exit-check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${FAKE_DOPPLER_DIR}:${process.env.PATH}` },
    });
    expect(result.status).toBe(7);
  });

  test('doppler missing entirely → wrapper exits non-zero with a clear message (no crash, no silent success)', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'run', '--', 'echo', 'hi'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: EMPTY_PATH_DIR },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/doppler not found/);
  });
});
