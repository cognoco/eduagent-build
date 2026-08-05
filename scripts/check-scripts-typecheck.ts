// [WI-3061] Semantic typecheck for the scripts/ Jest test surface.
//
// The problem this closes: `scripts/` had a Jest config but belonged to no
// TypeScript target. `nx run api:typecheck` stops at `apps/api` (its
// `tsconfig.spec.json` includes `eval-llm/**/*.ts`, not `scripts/`), and the
// root `pnpm exec tsc --build` used by the pre-push hook only walks
// `tsconfig.json`'s project references — neither reaches `scripts/`. So
// compiler-detectable errors inside the repo's own CI guards compiled nowhere
// and passed Jest silently; a wrong-arity `enumerateScenarios` call (TS2554) in
// `scripts/eval-live-gate-independence.test.ts` is the evidenced instance.
//
// Pre-existing debt lives in `scripts-typecheck-baseline.json` as a
// code-keyed ratchet; see `lib/scripts-typecheck-core.ts` for why the key
// includes the diagnostic code and not just the file.
//
// The gate is NEW or RISING diagnostics only. Repaid debt prints a cleanup
// notice and still passes — see the comment at its check in main().
//
// Usage:
//   pnpm typecheck:scripts             # gate
//   pnpm typecheck:scripts --accept    # re-record the baseline after repaying debt

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

import ts from 'typescript';

import {
  compareToBaseline,
  filesFromViolations,
  selectedScriptRoots,
  tallyDiagnostics,
  fail,
  type BaselineEntry,
  type JestSelection,
} from './lib/scripts-typecheck-core.ts';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = resolve(repoRoot, 'scripts');
const configPath = resolve(scriptsRoot, 'jest.config.cjs');
const tsconfigPath = resolve(scriptsRoot, 'tsconfig.typecheck.json');
const baselinePath = resolve(scriptsRoot, 'scripts-typecheck-baseline.json');

function toPosix(value: string) {
  return value.replaceAll('\\', '/');
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  });
}

function compilerOptionsAndFiles(roots: string[]) {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (read.error) {
    fail(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    {
      ...read.config,
      include: [],
      files: [...(read.config.files ?? []), ...roots],
    },
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) fail(formatDiagnostics(parsed.errors));
  return parsed;
}

function readBaseline(): BaselineEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!Array.isArray(parsed)) fail('baseline file must contain a JSON array');
    return parsed as BaselineEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function main() {
  const accept = process.argv.includes('--accept');
  const config = require(configPath) as JestSelection;
  const roots = selectedScriptRoots(config, trackedFiles(), {
    repoRoot,
    scriptsRoot,
  });
  const parsed = compilerOptionsAndFiles(roots);
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options),
  );

  const actual = tallyDiagnostics(
    diagnostics.map((diagnostic) => ({
      fileName: diagnostic.file
        ? toPosix(relative(repoRoot, diagnostic.file.fileName))
        : undefined,
      code: diagnostic.code,
    })),
  );

  if (accept) {
    writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(
      `scripts typecheck: baseline re-recorded (${actual.length} entries, ${diagnostics.length} diagnostics)`,
    );
    return;
  }

  const { regressions, improvements } = compareToBaseline(
    actual,
    readBaseline(),
  );

  if (regressions.length > 0) {
    const offending = filesFromViolations(regressions);
    console.error(
      formatDiagnostics(
        diagnostics.filter(
          (diagnostic) =>
            diagnostic.file &&
            offending.has(
              toPosix(relative(repoRoot, diagnostic.file.fileName)),
            ),
        ),
      ),
    );
    console.error('scripts typecheck: FAILED — new type errors\n');
    for (const line of regressions) console.error(`  ${line}`);
    console.error(
      '\nFix the errors above. Do not add them to the baseline: it records ' +
        'pre-existing debt only.',
    );
    process.exitCode = 1;
    return;
  }

  // Repaid debt is a NOTICE, never a failure — matching this repo's
  // established ratchet, scripts/check-i18n-jsx-literals.ts, whose gate is
  // "no new violations" and which prints stale baseline entries to stdout for
  // cleanup with --accept. Failing here would red another lane's PR for
  // INCIDENTALLY IMPROVING the tree: a gate failing for a reason its pusher
  // did not cause, which is the exact failure family this work removes.
  if (improvements.length > 0) {
    console.log(
      `scripts typecheck: ${improvements.length} baseline entr${
        improvements.length === 1 ? 'y is' : 'ies are'
      } no longer present (clean up with --accept):`,
    );
    for (const line of improvements) console.log(`  ${line}`);
  }

  console.log(
    `scripts typecheck passed: ${roots.length} Jest-selected roots, ` +
      `${diagnostics.length} baselined diagnostics, 0 new`,
  );
}

main();
