import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const EXPECTED_V2_PARITY_TEST_PATTERNS = [
  'apps/mobile/src/app/\\(app\\)/mentor\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/subjects\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/journal/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/subject-hub/\\[subjectId\\]/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/session/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/quiz/results\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/dictation/review\\.test\\.tsx',
  'apps/mobile/src/components/support/PersonScopeJournalPlaceholder\\.test\\.tsx',
  'apps/mobile/src/components/support/SupportHubJournalTab\\.test\\.tsx',
  'apps/mobile/src/components/support/PersonScopeStructuralSubjects\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/link/initiate\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/link/\\[contractId\\]\\.test\\.tsx',
] as const;

describe('V2 parity command portability', () => {
  test('package entry delegates argument transport to the cross-platform Node runner', () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['test:v2-parity']).toBe(
      'node scripts/run-v2-parity.cjs',
    );
  });

  test('canonical suite forwards the complete ordered path list without additions or omissions', () => {
    const { V2_PARITY_TEST_PATTERNS } = require('./run-v2-parity.cjs') as {
      V2_PARITY_TEST_PATTERNS: readonly string[];
    };

    expect(V2_PARITY_TEST_PATTERNS).toEqual(EXPECTED_V2_PARITY_TEST_PATTERNS);
  });

  test('each canonical regex selects exactly its one intended tracked test path without broadening', () => {
    const trackedMobileTests = execFileSync(
      'git',
      ['ls-files', 'apps/mobile'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    )
      .split(/\r?\n/)
      .filter((path) => path.endsWith('.test.tsx'));

    for (const pattern of EXPECTED_V2_PARITY_TEST_PATTERNS) {
      const expectedLiteralPath = pattern.replaceAll('\\', '');
      const matches = trackedMobileTests.filter((path) =>
        new RegExp(pattern).test(path),
      );
      expect({ pattern, matches }).toEqual({
        pattern,
        matches: [expectedLiteralPath],
      });
    }
  });

  test('literal transport preserves app, parameter, Windows separator, and supported-space metacharacters without a shell', () => {
    const { runV2Parity } = require('./run-v2-parity.cjs') as {
      runV2Parity: (options: {
        jestCliPath: string;
        testPatterns: readonly string[];
        spawnSyncImpl: (
          command: string,
          args: readonly string[],
          options: { stdio: string; shell: boolean },
        ) => { status: number };
      }) => number;
    };
    const literalPattern =
      'apps\\mobile\\src\\app\\\\(app\\\\)\\space dir\\\\[subjectId\\\\]\\screen\\\\.test\\\\.tsx';
    const calls: Array<{
      command: string;
      args: readonly string[];
      options: { stdio: string; shell: boolean };
    }> = [];

    runV2Parity({
      jestCliPath: 'C:\\repo with spaces\\node_modules\\jest\\bin\\jest.js',
      testPatterns: [literalPattern],
      spawnSyncImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(calls).toEqual([
      {
        command: process.execPath,
        args: [
          'C:\\repo with spaces\\node_modules\\jest\\bin\\jest.js',
          '--config',
          'apps/mobile/jest.config.cjs',
          '--no-coverage',
          '--forceExit',
          literalPattern,
        ],
        options: { stdio: 'inherit', shell: false },
      },
    ]);
  });

  test('passing selected test process returns exit zero', () => {
    const { runV2Parity } = require('./run-v2-parity.cjs') as {
      runV2Parity: (options: {
        spawnSyncImpl: () => { status: number };
      }) => number;
    };

    expect(runV2Parity({ spawnSyncImpl: () => ({ status: 0 }) })).toBe(0);
  });

  test('intentionally failing selected test process returns its non-zero exit', () => {
    const { runV2Parity } = require('./run-v2-parity.cjs') as {
      runV2Parity: (options: {
        spawnSyncImpl: () => { status: number };
      }) => number;
    };

    expect(runV2Parity({ spawnSyncImpl: () => ({ status: 7 }) })).toBe(7);
  });

  test('child-start error returns exit one and names the failed Jest launch', () => {
    const { runV2Parity } = require('./run-v2-parity.cjs') as {
      runV2Parity: (options: {
        spawnSyncImpl: () => { status: null; error: Error };
      }) => number;
    };
    const diagnostic = jest.spyOn(console, 'error').mockImplementation();

    try {
      expect(
        runV2Parity({
          spawnSyncImpl: () => ({
            status: null,
            error: new Error('synthetic child-start failure'),
          }),
        }),
      ).toBe(1);
      expect(diagnostic).toHaveBeenCalledWith(
        'Failed to start Jest: synthetic child-start failure',
      );
    } finally {
      diagnostic.mockRestore();
    }
  });
});
