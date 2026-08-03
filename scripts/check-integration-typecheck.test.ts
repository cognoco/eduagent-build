import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const fixturePath = join(
  repoRoot,
  'tests/integration/wi2578-deliberate-type-error.integration.test.ts',
);
const preExistingFixture = existsSync(fixturePath)
  ? readFileSync(fixturePath, 'utf8')
  : undefined;
const ignoredFixtureDir = join(repoRoot, 'tests/integration/.tmp');
const ignoredFixturePath = join(
  ignoredFixtureDir,
  'wi2578-ignored-type-error.integration.test.ts',
);
const mutantCheckerPath = join(
  repoRoot,
  'scripts/wi2578-coverage-revert-mutant.ts',
);
// Parent of WI-2636's interim manual-glob checker. WI-2578 was captured against
// this no-checker baseline; WI-2636 later cleared the semantic debt and added a
// temporary manually coupled selector before WI-2578 could execute.
const historicalPreFixSha = 'f9424a787b49fa0683e16e2793429178127d08c0';

function pnpmLaunchShape(platform: NodeJS.Platform = process.platform) {
  return platform === 'win32'
    ? { command: 'pnpm.cmd', shell: true }
    : { command: 'pnpm', shell: false };
}

function runPnpm(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: 'utf8';
  },
) {
  const launch = pnpmLaunchShape();
  const probe = spawnSync(launch.command, ['--version'], {
    ...options,
    shell: launch.shell,
  });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      `Unable to launch ${launch.command}; install the repository package manager and ensure it is on PATH.`,
    );
  }
  const result = spawnSync(launch.command, args, {
    ...options,
    shell: launch.shell,
  });
  if (result.error || result.status === null) {
    throw new Error(
      `Unable to launch ${launch.command}: ${result.error?.message ?? 'child process did not start'}`,
    );
  }
  return result;
}

function envWithoutPath(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'PATH') delete env[key];
  }
  return { ...env, PATH: '' };
}

function disposableIndex() {
  const indexPath = join(tmpdir(), `wi2578-index-${process.pid}-${Date.now()}`);
  return { ...process.env, GIT_INDEX_FILE: indexPath };
}

describe('integration typecheck contract', () => {
  afterEach(() => {
    if (preExistingFixture === undefined) {
      rmSync(fixturePath, { force: true });
    } else {
      writeFileSync(fixturePath, preExistingFixture);
    }
    rmSync(ignoredFixtureDir, { recursive: true, force: true });
    rmSync(mutantCheckerPath, { force: true });
  });

  it.each([
    ['win32', 'pnpm.cmd', true],
    ['linux', 'pnpm', false],
  ] as const)(
    'selects the platform-safe pnpm launcher for %s',
    (platform, command, shell) => {
      expect(pnpmLaunchShape(platform)).toEqual({ command, shell });
    },
  );

  it('fails with an actionable error when the package manager cannot start', () => {
    expect(() =>
      runPnpm(['--version'], {
        cwd: repoRoot,
        env: envWithoutPath(),
        encoding: 'utf8',
      }),
    ).toThrow(/Unable to launch pnpm(?:\.cmd)?.*ensure it is on PATH/);
  });

  it('automates the named pre-fix, fixed, coverage-revert, and restored sequence', () => {
    writeFileSync(fixturePath, "const x: number = 'deliberate type error';\n");
    const env = disposableIndex();

    try {
      execFileSync('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env });
      execFileSync('git', ['add', fixturePath], { cwd: repoRoot, env });

      // Historical pre-fix: there was no owned checker command or integration
      // tsconfig. Assert those durable facts, then run the current intentionally
      // rootless tsconfig directly as an executable surrogate for that missing
      // source-selection step: the named tracked fixture is silently accepted.
      const historicalPackage = JSON.parse(
        execFileSync('git', ['show', `${historicalPreFixSha}:package.json`], {
          cwd: repoRoot,
          env,
          encoding: 'utf8',
        }),
      );
      expect(
        historicalPackage.scripts?.['typecheck:integration'],
      ).toBeUndefined();
      const historicalConfig = spawnSync(
        'git',
        [
          'cat-file',
          '-e',
          `${historicalPreFixSha}:tests/integration/tsconfig.json`,
        ],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );
      expect(historicalConfig.status).not.toBe(0);
      const preFix = runPnpm(
        [
          'exec',
          'tsc',
          '--project',
          'tests/integration/tsconfig.json',
          '--pretty',
          'false',
        ],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );
      expect(preFix.status).toBe(0);

      // Fixed: Jest's source-selection properties feed the compiler roots, so
      // the exact same fixture is rejected by the owned checker command.
      const fixed = runPnpm(
        ['exec', 'tsx', 'scripts/check-integration-typecheck.ts'],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );
      expect(fixed.status).not.toBe(0);
      expect(`${fixed.stdout}${fixed.stderr}`).toContain(
        "Type 'string' is not assignable to type 'number'",
      );

      // Coverage-only revert: mutate the exact source expression that adds
      // the Jest-selected roots, leaving every other checker behavior intact.
      const checkerPath = join(
        repoRoot,
        'scripts/check-integration-typecheck.ts',
      );
      const checker = readFileSync(checkerPath, 'utf8');
      const coverageExpression =
        'const roots = selectedIntegrationRoots(config, trackedFiles());';
      expect(checker.split(coverageExpression)).toHaveLength(2);
      writeFileSync(
        mutantCheckerPath,
        checker.replace(coverageExpression, 'const roots: string[] = [];'),
      );
      const reverted = runPnpm(
        ['exec', 'tsx', 'scripts/wi2578-coverage-revert-mutant.ts'],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );
      expect(reverted.status).toBe(0);

      // Restoration: remove only the named fixture from the disposable index;
      // the unmodified checker returns to its normal successful state.
      rmSync(fixturePath, { force: true });
      execFileSync(
        'git',
        [
          'rm',
          '--cached',
          '--ignore-unmatch',
          'tests/integration/wi2578-deliberate-type-error.integration.test.ts',
        ],
        { cwd: repoRoot, env },
      );
      const restored = runPnpm(
        ['exec', 'tsx', 'scripts/check-integration-typecheck.ts'],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );
      expect(restored.status).toBe(0);
      expect(`${restored.stdout}${restored.stderr}`).toContain(
        'integration typecheck passed',
      );
    } finally {
      if (env.GIT_INDEX_FILE && existsSync(env.GIT_INDEX_FILE)) {
        rmSync(env.GIT_INDEX_FILE, { force: true });
      }
    }
  });

  it('excludes suites ignored by the authoritative Jest configuration', () => {
    mkdirSync(ignoredFixtureDir, { recursive: true });
    writeFileSync(
      ignoredFixturePath,
      "const x: number = 'ignored deliberate type error';\n",
    );
    const env = disposableIndex();

    try {
      execFileSync('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env });
      execFileSync(
        'git',
        [
          'rm',
          '--cached',
          '--ignore-unmatch',
          'tests/integration/wi2578-deliberate-type-error.integration.test.ts',
        ],
        { cwd: repoRoot, env },
      );
      execFileSync('git', ['add', '-f', ignoredFixturePath], {
        cwd: repoRoot,
        env,
      });
      const result = runPnpm(
        ['exec', 'tsx', 'scripts/check-integration-typecheck.ts'],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        'integration typecheck passed',
      );
    } finally {
      if (env.GIT_INDEX_FILE && existsSync(env.GIT_INDEX_FILE)) {
        rmSync(env.GIT_INDEX_FILE, { force: true });
      }
    }
  });

  it('derives filesystem paths from the module URL without encoded pathnames', () => {
    const source = readFileSync(
      join(repoRoot, 'scripts/check-integration-typecheck.ts'),
      'utf8',
    );

    expect(source).toContain('dirname(fileURLToPath(import.meta.url))');
  });

  it('runs in hosted CI for every non-document change', () => {
    const workflow = readFileSync(
      join(repoRoot, '.github/workflows/ci.yml'),
      'utf8',
    );

    expect(workflow).toContain(
      "github.event_name == 'push' ||\n          steps.scope.outputs.docs_only != 'true'\n        run: pnpm typecheck:integration",
    );
  });
});
