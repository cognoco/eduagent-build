// [WI-3029 AC-6 S1] Focused type probe for
// scripts/eval-live-gate-independence.test.ts.
//
// That file once called `FlowDefinition.enumerateScenarios` with a second
// argument even though the interface declares it with arity 1
// (apps/api/eval-llm/runner/types.ts: `enumerateScenarios?(profile:
// EvalProfile): Array<Scenario<Input>> | null`), producing two genuine
// TS2554 ("Expected 1 arguments, but got 2") errors. No existing typecheck
// target in this repo reaches that file: `nx run api:typecheck` stops at
// `apps/api` (its `tsconfig.spec.json` includes `eval-llm/**/*.ts`, not
// `scripts/`), and the root `pnpm exec tsc --build` used by the pre-push
// hook only walks `tsconfig.json`'s project references (packages/apps),
// which do not include `scripts/` either — so the bug shipped uncaught.
//
// This probe compiles the target file directly, against the repo's own
// `tsconfig.base.json` compiler options, and asserts NO TS2554 diagnostics
// remain. It deliberately does NOT assert zero diagnostics overall: the
// file's transitive dependency graph (apps/api/eval-llm/**,
// apps/api/src/**, packages/schemas/**) carries pre-existing, unrelated
// errors on origin/main (e.g. TS2532) that are out of scope here.

import { resolve } from 'node:path';
import * as ts from 'typescript';

const repoRoot = resolve(__dirname, '..');
const tsconfigPath = resolve(repoRoot, 'tsconfig.base.json');
const targetFile = resolve(
  repoRoot,
  'scripts/eval-live-gate-independence.test.ts',
);

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  });
}

function typecheckTargetFile(): readonly ts.Diagnostic[] {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (read.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(read.error.messageText, '\n'),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    { ...read.config, include: [], files: [targetFile] },
    ts.sys,
    repoRoot,
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }
  return ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options),
  );
}

describe('scripts/eval-live-gate-independence.test.ts — focused type probe (WI-3029 S1)', () => {
  // Compiling the full transitive dependency graph takes several seconds.
  test('enumerateScenarios call sites pass no argument the interface does not declare (no TS2554)', () => {
    const diagnostics = typecheckTargetFile();
    const wrongArgCount = diagnostics.filter((d) => d.code === 2554);
    if (wrongArgCount.length > 0) {
      throw new Error(formatDiagnostics(wrongArgCount));
    }
    expect(wrongArgCount).toHaveLength(0);
  }, 60_000);
});
