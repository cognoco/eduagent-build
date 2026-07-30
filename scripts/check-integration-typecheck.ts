import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

import { globsToMatcher, replacePathSepForGlob } from 'jest-util';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const configPath = resolve(repoRoot, 'tests/integration/jest.config.cjs');
const tsconfigPath = resolve(repoRoot, 'tests/integration/tsconfig.json');

type JestSelection = {
  testMatch?: string[];
  setupFilesAfterEnv?: string[];
};

function fail(message: string): never {
  throw new Error(`integration typecheck: ${message}`);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
}

export function selectedIntegrationRoots(
  config: JestSelection,
  files: string[],
) {
  if (!Array.isArray(config.testMatch) || config.testMatch.length === 0) {
    fail('Jest testMatch is required');
  }
  if (!Array.isArray(config.setupFilesAfterEnv)) {
    fail('Jest setupFilesAfterEnv is required');
  }

  const matches = globsToMatcher(config.testMatch.map(replacePathSepForGlob));
  const suites = files.filter((file) => matches(replacePathSepForGlob(file)));
  const setupRoots = config.setupFilesAfterEnv.map((file) =>
    relative(repoRoot, file).replaceAll('\\', '/'),
  );
  const roots = [...new Set([...suites, ...setupRoots])];
  if (suites.length === 0) fail('no tracked Jest integration suite matched');
  for (const root of roots) {
    if (!files.includes(root))
      fail(`configured TypeScript root is not tracked: ${root}`);
  }
  return roots.map((file) => resolve(repoRoot, file));
}

function compilerOptionsAndFiles(roots: string[]) {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (read.error)
    fail(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(
    {
      ...read.config,
      include: [],
      files: [...(read.config.files ?? []), ...roots],
    },
    ts.sys,
    repoRoot,
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    fail(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => '\n',
      }),
    );
  }
  return parsed;
}

function main() {
  const config = require(configPath) as JestSelection;
  const roots = selectedIntegrationRoots(config, trackedFiles());
  const parsed = compilerOptionsAndFiles(roots);
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options),
  );
  if (diagnostics.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => '\n',
      }),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `integration typecheck passed: ${roots.length} Jest-selected roots`,
  );
}

main();
