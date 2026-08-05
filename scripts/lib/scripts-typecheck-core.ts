// [WI-3061] Pure logic for the scripts/ typecheck gate.
//
// Split out from `scripts/check-scripts-typecheck.ts` so the unit suite can
// import it without side effects. The entry module runs `main()` on load and
// uses `import.meta.url`; importing that from a ts-jest (CommonJS) test would
// both execute a multi-minute typecheck and hit an invalid `import.meta`.
// Nothing here touches the filesystem, the compiler, or process state.

import { relative, resolve } from 'node:path';

import { globsToMatcher, replacePathSepForGlob } from 'jest-util';

export type JestSelection = {
  testMatch?: string[];
  testPathIgnorePatterns?: string[];
};

export type BaselineEntry = {
  file: string;
  code: number;
  count: number;
};

export type Roots = {
  repoRoot: string;
  scriptsRoot: string;
};

export function fail(message: string): never {
  throw new Error(`scripts typecheck: ${message}`);
}

/**
 * Jest-aligned root selection.
 *
 * `scripts/jest.config.cjs` declares no `rootDir`, so Jest treats the config's
 * own directory (`scripts/`) as rootDir: `testMatch` globs are matched against
 * scripts-relative paths, while `testPathIgnorePatterns` are regexes tested
 * against absolute paths. This differs from `tests/integration/jest.config.cjs`,
 * which pins `rootDir` to the repo root — do not copy that config's matching
 * convention here.
 *
 * Deriving roots from the Jest config rather than a standalone glob is what
 * stops the typechecked set from drifting away from the executed set.
 */
export function selectedScriptRoots(
  config: JestSelection,
  files: string[],
  { repoRoot, scriptsRoot }: Roots,
): string[] {
  if (!Array.isArray(config.testMatch) || config.testMatch.length === 0) {
    fail('Jest testMatch is required');
  }
  if (!Array.isArray(config.testPathIgnorePatterns)) {
    fail('Jest testPathIgnorePatterns is required');
  }

  const matches = globsToMatcher(config.testMatch.map(replacePathSepForGlob));
  const escapedRoot = replacePathSepForGlob(scriptsRoot).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const ignored = config.testPathIgnorePatterns.map(
    (pattern) => new RegExp(pattern.replaceAll('<rootDir>', escapedRoot)),
  );

  const suites = files.filter((file) => {
    if (!file.startsWith('scripts/')) return false;
    const absolute = resolve(repoRoot, file);
    return (
      matches(replacePathSepForGlob(relative(scriptsRoot, absolute))) &&
      !ignored.some((pattern) => pattern.test(replacePathSepForGlob(absolute)))
    );
  });

  if (suites.length === 0) fail('no tracked Jest scripts suite matched');
  return suites.map((file) => resolve(repoRoot, file));
}

/** Group raw diagnostics into the baseline's (file, code) → count shape. */
export function tallyDiagnostics(
  diagnostics: readonly { fileName: string | undefined; code: number }[],
): BaselineEntry[] {
  const counts = new Map<string, BaselineEntry>();
  for (const diagnostic of diagnostics) {
    const file = diagnostic.fileName ?? '(global)';
    const key = `${file}::${diagnostic.code}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { file, code: diagnostic.code, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.code - b.code,
  );
}

/**
 * Ratchet comparison. Only `regressions` gate: non-empty ⇒ fail closed.
 *
 * Entries are keyed on (file, CODE, count) rather than file alone. That is the
 * property that keeps the gate closed: a diagnostic code absent from a file's
 * baseline entry fails even inside an otherwise-baselined file, so a new
 * wrong-arity TS2554 cannot hide behind unrelated pre-existing TS2532 debt.
 *
 * `improvements` (repaid debt) are returned for reporting only and must NOT be
 * treated as a failure by callers — failing on them would red a PR that merely
 * improved the tree incidentally. This mirrors the repo's established ratchet,
 * scripts/check-i18n-jsx-literals.ts, which prints stale baseline entries as a
 * stdout notice and gates solely on new violations.
 */
export function compareToBaseline(
  actual: BaselineEntry[],
  baseline: BaselineEntry[],
): { regressions: string[]; improvements: string[] } {
  const key = (entry: BaselineEntry) => `${entry.file}::${entry.code}`;
  const baselineByKey = new Map(baseline.map((entry) => [key(entry), entry]));
  const actualByKey = new Map(actual.map((entry) => [key(entry), entry]));
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const entry of actual) {
    const recorded = baselineByKey.get(key(entry));
    if (!recorded) {
      regressions.push(
        `NEW  ${entry.file}: ${entry.count} x TS${entry.code} (not in baseline)`,
      );
    } else if (entry.count > recorded.count) {
      regressions.push(
        `MORE ${entry.file}: TS${entry.code} rose ${recorded.count} -> ${entry.count}`,
      );
    } else if (entry.count < recorded.count) {
      improvements.push(
        `LESS ${entry.file}: TS${entry.code} fell ${recorded.count} -> ${entry.count}`,
      );
    }
  }
  for (const entry of baseline) {
    if (!actualByKey.has(key(entry))) {
      improvements.push(
        `GONE ${entry.file}: TS${entry.code} (${entry.count}) no longer reported`,
      );
    }
  }
  return { regressions, improvements };
}

/** Files named by ratchet violation lines, for focused diagnostic printing. */
export function filesFromViolations(lines: string[]): Set<string> {
  return new Set(lines.map((line) => line.slice(5).split(':')[0] ?? ''));
}
