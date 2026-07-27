// WI-1807 — regression guard for the "undefined Drizzle table" failure class
// that silently broke the required test:llm:enduser gate. scripts/**/*.ts
// sits outside every tsconfig project reference, so
// `import { profiles } from '@eduagent/database'` (a table removed by the
// identity cutover) compiled clean and only blew up at runtime —
// `.update(profiles)` resolved to `.update(undefined)` and crashed inside
// drizzle-orm's mapUpdateSet before the harness's first live exchange (root
// cause fixed in 9b50818b0 / WI-1685 / PR #2063).
//
// This guard statically extracts every named import enduser-session-pass.ts
// takes from '@eduagent/database' and asserts each one is a real
// (non-undefined) export of the package right now, so a future
// removal/rename silently reintroducing this class fails CI instead of
// surfacing as a false-negative live-quality gate.
//
// Red-green-revert: temporarily re-add `profiles` to the
// enduser-session-pass.ts import list (the removed table) — this test fails
// because `database.profiles` is undefined. Remove it again — passes.
//
// Scope boundary: this covers the removed/undefined-table *import* class
// only. It does not catch column-level drift (e.g. the sibling
// birthYear->birthDate rename in the same fixing commit) or other `db.*`
// member-access breakage, which would require full typechecking of
// scripts/**/*.ts — out of scope here (WI-1807 AC3).

import * as path from 'node:path';

import { Project } from 'ts-morph';

import * as database from '@eduagent/database';

const SOURCE_PATH = path.resolve(__dirname, 'enduser-session-pass.ts');

function importedDatabaseNames(): string[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false },
  });
  const sourceFile = project.addSourceFileAtPath(SOURCE_PATH);
  const importDecl = sourceFile
    .getImportDeclarations()
    .find((decl) => decl.getModuleSpecifierValue() === '@eduagent/database');
  if (!importDecl) {
    throw new Error(
      `${SOURCE_PATH} no longer imports from '@eduagent/database' — update this guard`,
    );
  }
  // Skip type-only specifiers (`import { type Foo } from ...` or a
  // type-only whole import) — they don't exist at runtime, so checking them
  // against the imported module's runtime values would false-fail.
  if (importDecl.isTypeOnly()) return [];
  return importDecl
    .getNamedImports()
    .filter((named) => !named.isTypeOnly())
    .map((named) => named.getName());
}

describe('enduser-session-pass.ts seed-path database imports', () => {
  it('every named import from @eduagent/database resolves to a real export', () => {
    const names = importedDatabaseNames();
    // Sanity check: fail loudly if the import list is ever emptied out
    // (would silently pass the "no undefined imports" assertion below).
    expect(names.length).toBeGreaterThan(0);

    const undefinedImports = names.filter(
      (name) => (database as Record<string, unknown>)[name] === undefined,
    );

    expect(undefinedImports).toEqual([]);
  });
});
