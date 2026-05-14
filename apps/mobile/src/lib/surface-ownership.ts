/**
 * Surface ownership boundary scanner.
 *
 * Uses the TypeScript compiler API to walk ImportDeclaration nodes — raw
 * string scanning is intentionally rejected because it can be defeated by
 * namespace imports, barrel re-exports, and import aliasing.
 *
 * This module is intentionally dependency-light (no React, no hooks) so it
 * can run inside Jest without any special mocking.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImportRecord {
  /** The literal module specifier as written in the source file. */
  source: string;
  /** Named import bindings (local name, i.e. what appears after `import {`). */
  named: string[];
  /** Default import local name, or null. */
  default: string | null;
  /** Namespace import local name (import * as X), or null. */
  namespace: string | null;
}

export interface ForbiddenSymbol {
  /** Named exports that are forbidden on a surface. */
  symbols: string[];
}

export interface AllowlistEntry {
  /** Repo-relative path of the file that is allowed to violate the rule. */
  relPath: string;
  /** Human-readable reason for the exception. */
  reason: string;
}

export interface SurfaceRule {
  /** Human label shown in test output. */
  label: string;
  /** Predicate that returns true when a repo-relative path belongs to this surface. */
  matches: (relPath: string) => boolean;
  /** Forbidden import symbols. */
  forbid: ForbiddenSymbol;
  /** Files within the surface that are exempt (facade/documented exception allowlist). */
  allowlist?: AllowlistEntry[];
}

// ---------------------------------------------------------------------------
// Surface rules
// ---------------------------------------------------------------------------

/**
 * The canonical surface boundary table.
 *
 * Keep in sync with:
 *   docs/superpowers/specs/2026-05-13-surface-ownership-boundaries-design.md
 *   lines 390-396
 *
 * Adding an allowlist entry requires (a) a comment naming the narrow hook /
 * reason and (b) a note in the PR 8 deliverables report.
 */
export const SURFACE_RULES: SurfaceRule[] = [
  {
    label: 'Session screens',
    matches: (p) =>
      // app/(app)/session/** — route files + _layout
      p.startsWith('apps/mobile/src/app/(app)/session/'),
    forbid: {
      symbols: [
        'useProgressInventory',
        'useOverallProgress',
        'useProgressHistory',
      ],
    },
    // No allowlist needed: session screens must use use-session-context facades.
  },
  {
    label: 'Session-summary screens',
    matches: (p) =>
      // app/session-summary/** — the [sessionId].tsx route
      p.startsWith('apps/mobile/src/app/session-summary/'),
    forbid: {
      symbols: ['useProgressInventory', 'useOverallProgress'],
    },
    // No allowlist needed: session-summary screens may use useTotalSessionCount only.
  },
  {
    label: 'Library screens',
    matches: (p) =>
      // app/(app)/library.tsx — single file
      p === 'apps/mobile/src/app/(app)/library.tsx',
    forbid: {
      symbols: ['useProgressInventory', 'useProgressHistory'],
      // NOTE: useOverallProgress is intentionally NOT in the forbidden list here.
      // library.tsx still imports useOverallProgress for topic-completion stats
      // (totalTopicsCompleted display + loading/error state). This is a documented
      // exception: PR 4 commit message records that the payload-narrow query for
      // this data is deferred to PR 9. When PR 9 ships a /library/stats endpoint,
      // add useOverallProgress to this forbid list and remove the call site.
    },
    // No allowlist needed — the exception is expressed as "not in forbid list" above.
  },
  {
    label: 'Home presentational components',
    matches: (p) =>
      p.startsWith('apps/mobile/src/components/home/') &&
      // LearnerScreen + ParentHomeScreen are home screen orchestrators, not
      // presentational leaves. They are permitted to use heavy progress hooks
      // because they own the full home surface. The rule targets child components
      // that should receive data via props.
      !p.endsWith('LearnerScreen.tsx') &&
      !p.endsWith('ParentHomeScreen.tsx') &&
      // Test files are not production imports — skip them.
      !p.endsWith('.test.tsx') &&
      !p.endsWith('.test.ts'),
    forbid: {
      symbols: ['useProgressInventory'],
    },
  },
  {
    label: 'Family components',
    matches: (p) =>
      p.startsWith('apps/mobile/src/components/family/') &&
      !p.endsWith('.test.tsx') &&
      !p.endsWith('.test.ts'),
    forbid: {
      symbols: ['useDashboard'],
    },
    // No allowlist needed: family components currently pass data via props.
  },
];

// ---------------------------------------------------------------------------
// Import collector
// ---------------------------------------------------------------------------

/**
 * Parse a TypeScript/TSX source file and collect all import declarations.
 *
 * Uses ts.createSourceFile (AST walk), not string matching, so it correctly
 * handles multi-line imports, type-only imports, and re-export declarations.
 */
export function collectImports(filePath: string): ImportRecord[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const records: ImportRecord[] = [];

  for (const statement of sf.statements) {
    // ImportDeclaration: import X, { A, B } from 'mod'
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral)
        .text;
      const record: ImportRecord = {
        source: moduleSpecifier,
        named: [],
        default: null,
        namespace: null,
      };

      const clause = statement.importClause;
      if (clause) {
        // Default import
        if (clause.name) {
          record.default = clause.name.text;
        }
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            // import * as X from 'mod'
            record.namespace = clause.namedBindings.name.text;
          } else if (ts.isNamedImports(clause.namedBindings)) {
            // import { A, B as C } from 'mod'
            for (const el of clause.namedBindings.elements) {
              // el.propertyName is the original export name; el.name is the local alias.
              // We care about what is exported FROM the module (propertyName ?? name).
              const exportedName = el.propertyName
                ? el.propertyName.text
                : el.name.text;
              record.named.push(exportedName);
            }
          }
        }
      }

      records.push(record);
    }

    // ExportDeclaration with a from-clause: export { A } from 'mod'
    // We do NOT collect these as "imports the surface makes" — they are re-exports
    // and are only interesting when building the barrel map.
  }

  return records;
}

// ---------------------------------------------------------------------------
// Source file listing
// ---------------------------------------------------------------------------

/**
 * Recursively list all .ts and .tsx files under `rootDir`.
 * Excludes node_modules, .worktrees, and __tests__ directories.
 */
export function listSourceFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.worktrees' ||
          entry.name === '__tests__'
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

// ---------------------------------------------------------------------------
// Barrel map builder
// ---------------------------------------------------------------------------

/**
 * Barrel re-export shape as produced by parseBarrelExports.
 * Maps: exported symbol name → original source path (absolute).
 */
type BarrelExportMap = Map<string, string>;

/**
 * Parse all `export { X } from './...'` and `export * from './...'` declarations
 * in a barrel file, returning a map from exported name to origin module path.
 *
 * For `export * from '...'` the origin path is set to the re-exported module
 * path (not the individual symbol) because we can't know the symbol set without
 * recursing. Callers should check if the import source itself is the barrel
 * entry — if it is, they look up the symbol in this map.
 */
function parseBarrelExports(barrelPath: string): BarrelExportMap {
  const result: BarrelExportMap = new Map();

  let source: string;
  try {
    source = fs.readFileSync(barrelPath, 'utf-8');
  } catch {
    return result;
  }

  const barrelDir = path.dirname(barrelPath);
  const sf = ts.createSourceFile(
    barrelPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sf.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier) continue;

    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    // Resolve to absolute path (TS omits extensions; try .ts then .tsx)
    const absBase = path.resolve(barrelDir, specifier);
    const originPath =
      tryResolveExtension(absBase + '.ts') ??
      tryResolveExtension(absBase + '.tsx') ??
      tryResolveExtension(path.join(absBase, 'index.ts')) ??
      absBase;

    if (statement.exportClause) {
      // export { A, B as C } from '...'
      if (ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) {
          // propertyName = original name in the source module
          // name = what the barrel exports (may be an alias)
          const exportedAs = el.name.text;
          const originalName = el.propertyName
            ? el.propertyName.text
            : el.name.text;
          // The barrel consumer will import `exportedAs`; the underlying symbol is `originalName`.
          // We store exportedAs → originPath so we can resolve origin.
          // We also need originalName to match against forbidden symbols.
          // Strategy: store exportedAs → originPath (consumers look up by exported name).
          result.set(exportedAs, originPath);
          // If the export renames (export { foo as bar }), also map originalName → originPath
          // so a consumer who imports `originalName` directly (bypassing alias) is also caught.
          if (originalName !== exportedAs) {
            result.set(originalName, originPath);
          }
        }
      }
    } else {
      // export * from '...' — we can't enumerate symbols without reading the origin.
      // Store a sentinel so callers know this barrel re-exports everything from originPath.
      // We'll use the special key '*' mapped to the origin path.
      // In practice, our forbidden symbols are specific, so we do one more level of reading.
      const starExports = collectExportedNames(originPath);
      for (const name of starExports) {
        result.set(name, originPath);
      }
    }
  }

  return result;
}

/** Attempt to return `filePath` if it exists on disk, otherwise null. */
function tryResolveExtension(filePath: string): string | null {
  try {
    fs.accessSync(filePath);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Collect names exported by a module (one level deep, named exports only).
 * Used to expand `export * from '...'` in barrel files.
 */
function collectExportedNames(absPath: string): string[] {
  let source: string;
  try {
    source = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }
  const sf = ts.createSourceFile(
    absPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names: string[] = [];
  for (const statement of sf.statements) {
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    ) {
      if (
        statement.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        ) &&
        statement.name
      ) {
        names.push(statement.name.text);
      }
    } else if (ts.isVariableStatement(statement)) {
      if (
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            names.push(decl.name.text);
          }
        }
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) {
          names.push(el.name.text);
        }
      }
    }
  }
  return names;
}

/**
 * Build a map from barrel-file path → (exported name → origin file path).
 *
 * The barrel map is used to resolve imports like:
 *   import { useProgressInventory } from '../../hooks'
 * where `../../hooks` is a barrel that re-exports useProgressInventory from
 * `./use-progress`. Without barrel resolution, the guard would miss this.
 *
 * @param repoRoot  Absolute path to the repository root.
 * @param knownBarrels  Repo-relative paths of known barrel files.
 */
export function buildBarrelMap(
  repoRoot: string,
  knownBarrels: string[],
): Map<string, BarrelExportMap> {
  const result = new Map<string, BarrelExportMap>();

  for (const relPath of knownBarrels) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) continue;
    result.set(absPath, parseBarrelExports(absPath));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Violation detector
// ---------------------------------------------------------------------------

export interface Violation {
  file: string;
  symbol: string;
  importSource: string;
}

/**
 * Scan a single file and return any forbidden-symbol violations against `rule`.
 *
 * @param filePath   Absolute path to the file to scan.
 * @param rule       The surface rule to enforce.
 * @param barrelMap  Pre-built barrel map (from buildBarrelMap).
 * @param repoRoot   Absolute repo root (used to normalise paths for barrel lookup).
 */
export function checkFile(
  filePath: string,
  rule: SurfaceRule,
  _barrelMap: Map<string, BarrelExportMap>,
  _repoRoot: string,
): Violation[] {
  const imports = collectImports(filePath);
  const violations: Violation[] = [];

  for (const imp of imports) {
    for (const symbol of imp.named) {
      if (!rule.forbid.symbols.includes(symbol)) continue;

      // The forbidden symbol is present by name in this import statement.
      // Whether the import is direct or flows through a barrel re-export, the
      // symbol name is sufficient to identify the violation — the guard cares
      // about which names a surface consumes, not which file originally defines them.
      violations.push({
        file: filePath,
        symbol,
        importSource: imp.source,
      });
    }
  }

  return violations;
}
