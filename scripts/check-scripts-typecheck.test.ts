// [WI-3061] Unit contract for the scripts/ typecheck gate's two load-bearing
// parts: Jest-aligned root selection, and the ratchet comparison that decides
// whether the recorded baseline lets a regression through.
//
// The end-to-end red-green (inject a TS2554 → gate fails → revert → gate
// passes) is deliberately NOT run here: building the program compiles 76 suites
// plus ~230 transitively-imported apps/api sources, far too slow for a unit
// suite. This file pins the pure logic; the gate itself runs in CI as
// `pnpm typecheck:scripts` (see .github/workflows/ci.yml).

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import {
  compareToBaseline,
  selectedScriptRoots,
  tallyDiagnostics,
  type BaselineEntry,
} from './lib/scripts-typecheck-core.ts';

const repoRoot = join(__dirname, '..');
const roots = { repoRoot, scriptsRoot: join(repoRoot, 'scripts') };
// The REAL Jest config, so this suite pins the selector against the same
// testMatch/ignore rules the gate and the test runner actually use.
const jestConfig = require('./jest.config.cjs') as {
  testMatch: string[];
  testPathIgnorePatterns: string[];
};

const posix = (values: string[]) => values.map((v) => v.replaceAll('\\', '/'));

describe('selectedScriptRoots — Jest-aligned selection', () => {
  test('selects scripts/ test files, skipping non-test sources', () => {
    const selected = posix(
      selectedScriptRoots(
        jestConfig,
        [
          'scripts/example.test.ts',
          'scripts/example.ts',
          'scripts/nested/deep.test.ts',
          'scripts/readme.md',
        ],
        roots,
      ),
    );

    expect(selected.some((r) => r.endsWith('scripts/example.test.ts'))).toBe(
      true,
    );
    expect(
      selected.some((r) => r.endsWith('scripts/nested/deep.test.ts')),
    ).toBe(true);
    expect(selected.some((r) => r.endsWith('scripts/example.ts'))).toBe(false);
    expect(selected.some((r) => r.endsWith('scripts/readme.md'))).toBe(false);
  });

  test('ignores test files outside scripts/', () => {
    expect(
      selectedScriptRoots(
        jestConfig,
        [
          'scripts/example.test.ts',
          'apps/api/src/somewhere.test.ts',
          'tests/integration/x.integration.test.ts',
        ],
        roots,
      ),
    ).toHaveLength(1);
  });

  test('honours Jest testPathIgnorePatterns (quarantine registry)', () => {
    const selected = posix(
      selectedScriptRoots(
        { ...jestConfig, testPathIgnorePatterns: ['quarantined-example'] },
        ['scripts/example.test.ts', 'scripts/quarantined-example.test.ts'],
        roots,
      ),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('example.test.ts');
    expect(selected[0]).not.toContain('quarantined');
  });

  test('fails loudly rather than silently checking nothing', () => {
    expect(() =>
      selectedScriptRoots(jestConfig, ['scripts/not-a-test.ts'], roots),
    ).toThrow(/no tracked Jest scripts suite matched/);
    expect(() =>
      selectedScriptRoots({ testPathIgnorePatterns: [] }, [], roots),
    ).toThrow(/testMatch is required/);
    expect(() =>
      selectedScriptRoots({ testMatch: ['**/*.test.ts'] }, [], roots),
    ).toThrow(/testPathIgnorePatterns is required/);
  });
});

describe('tallyDiagnostics', () => {
  test('groups by (file, code) and counts', () => {
    expect(
      tallyDiagnostics([
        { fileName: 'scripts/a.ts', code: 2532 },
        { fileName: 'scripts/a.ts', code: 2532 },
        { fileName: 'scripts/a.ts', code: 2554 },
        { fileName: 'scripts/b.ts', code: 2532 },
      ]),
    ).toEqual([
      { file: 'scripts/a.ts', code: 2532, count: 2 },
      { file: 'scripts/a.ts', code: 2554, count: 1 },
      { file: 'scripts/b.ts', code: 2532, count: 1 },
    ]);
  });
});

describe('compareToBaseline — the ratchet', () => {
  const baseline: BaselineEntry[] = [
    { file: 'scripts/dirty.ts', code: 2532, count: 3 },
  ];

  test('unchanged debt passes', () => {
    expect(
      compareToBaseline(
        [{ file: 'scripts/dirty.ts', code: 2532, count: 3 }],
        baseline,
      ),
    ).toEqual({ regressions: [], improvements: [] });
  });

  // The property that keeps the gate closed. A whole-file baseline would let
  // this through — precisely the "gate that does not fail closed" failure mode
  // this work item exists to remove.
  test('a new diagnostic code inside an already-baselined file is a regression', () => {
    const { regressions } = compareToBaseline(
      [
        { file: 'scripts/dirty.ts', code: 2532, count: 3 },
        { file: 'scripts/dirty.ts', code: 2554, count: 1 },
      ],
      baseline,
    );
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toContain('TS2554');
  });

  test('a rising count is a regression', () => {
    expect(
      compareToBaseline(
        [{ file: 'scripts/dirty.ts', code: 2532, count: 4 }],
        baseline,
      ).regressions[0],
    ).toContain('rose 3 -> 4');
  });

  test('a newly dirty file is a regression', () => {
    expect(
      compareToBaseline(
        [
          { file: 'scripts/dirty.ts', code: 2532, count: 3 },
          { file: 'scripts/fresh.ts', code: 2532, count: 1 },
        ],
        baseline,
      ).regressions[0],
    ).toContain('scripts/fresh.ts');
  });

  // Repaid debt is a NOTICE, not a regression: it must never red a PR that
  // improved the tree incidentally. Matches scripts/check-i18n-jsx-literals.ts,
  // whose gate is new-violations-only. The entries are still surfaced so the
  // baseline can be cleaned up with --accept.
  test('repaid debt is reported but is NOT a regression', () => {
    const falling = compareToBaseline(
      [{ file: 'scripts/dirty.ts', code: 2532, count: 1 }],
      baseline,
    );
    expect(falling.regressions).toEqual([]);
    expect(falling.improvements[0]).toContain('fell 3 -> 1');

    const gone = compareToBaseline([], baseline);
    expect(gone.regressions).toEqual([]);
    expect(gone.improvements[0]).toContain('no longer reported');
  });

  // A tree that both repaid one debt and introduced a new error must still
  // fail — the notice must not mask the regression.
  test('repaid debt alongside a new error still fails closed', () => {
    const { regressions, improvements } = compareToBaseline(
      [
        { file: 'scripts/dirty.ts', code: 2532, count: 1 },
        { file: 'scripts/dirty.ts', code: 2554, count: 1 },
      ],
      baseline,
    );
    expect(improvements[0]).toContain('fell 3 -> 1');
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toContain('TS2554');
  });
});

describe('recorded baseline', () => {
  const baseline = JSON.parse(
    readFileSync(
      join(repoRoot, 'scripts/scripts-typecheck-baseline.json'),
      'utf8',
    ),
  ) as BaselineEntry[];

  // AC-3's regression proof rests on this: TS2554 absent from the baseline
  // everywhere means a wrong-arity call fails in ANY selected suite, including
  // files that carry unrelated pre-existing debt.
  test('carries no TS2554 debt, so wrong-arity calls always fail the gate', () => {
    expect(baseline.filter((entry) => entry.code === 2554)).toEqual([]);
  });

  test('records only scripts/ files', () => {
    expect(
      baseline.filter((entry) => !entry.file.startsWith('scripts/')),
    ).toEqual([]);
  });

  test('the evidenced TS2554 carrier is fully clean, not baselined', () => {
    expect(
      baseline.filter((entry) =>
        entry.file.endsWith('scripts/eval-live-gate-independence.test.ts'),
      ),
    ).toEqual([]);
  });
});
