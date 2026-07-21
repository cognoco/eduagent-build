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
  /**
   * Named imports as imported — preserves the alias pair (exportedName, localName).
   * `exported` is what the module exports; `local` is the binding visible in this file.
   * When the import has no alias the two are equal.
   *
   * This complements `named` (kept for backwards compatibility) — `named` carries
   * the exported names (what we check against forbid lists when no barrel is in play);
   * `namedAliases` is what we use to walk through barrels (a barrel may alias a
   * forbidden symbol to a benign local name).
   */
  namedAliases: Array<{ exported: string; local: string }>;
  /** Default import local name, or null. */
  default: string | null;
  /** Namespace import local name (import * as X), or null. */
  namespace: string | null;
  /**
   * Property names accessed off a namespace import (e.g. `X.foo` → 'foo').
   * Only populated when `namespace` is non-null.
   *
   * Bug-A fix: a namespace import combined with a member access is equivalent
   * to a named import of that member; the guard MUST check these against the
   * forbidden symbol list.
   */
  namespaceAccesses: string[];
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
 *   docs/_archive/specs/Done/2026-05-13-surface-ownership-boundaries-design.md
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
      symbols: ['useProgressInventory', 'useOverallProgress'],
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
      symbols: ['useProgressInventory'],
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
        namedAliases: [],
        default: null,
        namespace: null,
        namespaceAccesses: [],
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
              const localName = el.name.text;
              record.named.push(exportedName);
              record.namedAliases.push({
                exported: exportedName,
                local: localName,
              });
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

  // Second pass: walk the AST to collect property accesses on namespace import
  // identifiers. This implements the Bug-A fix — `import * as X from 'mod'`
  // followed by `X.useProgressInventory` is functionally a named import and
  // must be checked the same way.
  const namespaceNames = new Set(
    records
      .filter((r) => r.namespace !== null)
      .map((r) => r.namespace as string),
  );

  if (namespaceNames.size > 0) {
    // Map namespace local name → record, so we can append accesses.
    const byNamespace = new Map<string, ImportRecord>();
    for (const r of records) {
      if (r.namespace) byNamespace.set(r.namespace, r);
    }

    const visit = (node: ts.Node): void => {
      // Skip the ImportDeclaration nodes themselves — the identifiers there are
      // the binding sites, not uses.
      if (ts.isImportDeclaration(node)) return;

      if (ts.isPropertyAccessExpression(node)) {
        // foo.bar  →  expression = foo (Identifier), name = bar (Identifier)
        if (ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
          const objName = node.expression.text;
          const propName = node.name.text;
          const rec = byNamespace.get(objName);
          if (rec && !rec.namespaceAccesses.includes(propName)) {
            rec.namespaceAccesses.push(propName);
          }
        }
      }
      // ElementAccessExpression with a string literal — `X['foo']` — counts too.
      if (ts.isElementAccessExpression(node)) {
        if (
          ts.isIdentifier(node.expression) &&
          ts.isStringLiteralLike(node.argumentExpression)
        ) {
          const objName = node.expression.text;
          const propName = node.argumentExpression.text;
          const rec = byNamespace.get(objName);
          if (rec && !rec.namespaceAccesses.includes(propName)) {
            rec.namespaceAccesses.push(propName);
          }
        }
      }
      // VariableDeclaration with an ObjectBindingPattern initialised from a
      // namespace import — `const { useProgressInventory } = Hooks` is
      // functionally equivalent to `Hooks.useProgressInventory` and must be
      // treated the same way.
      //
      // Bug-A destructuring fix: walk all ObjectBindingPattern bindings whose
      // initializer is an identifier that resolves to a namespace import, and
      // record each destructured element name as a namespace access.
      if (ts.isVariableDeclaration(node)) {
        if (
          ts.isObjectBindingPattern(node.name) &&
          node.initializer &&
          ts.isIdentifier(node.initializer)
        ) {
          const objName = node.initializer.text;
          const rec = byNamespace.get(objName);
          if (rec) {
            for (const element of node.name.elements) {
              // element.propertyName is the key on the RHS object (the export
              // name); element.name is the local binding. We care about the
              // property name because that is what the namespace export provides.
              // When there is no rename (`const { foo } = X`), propertyName is
              // absent and name holds the property name.
              const propName = element.propertyName
                ? ts.isIdentifier(element.propertyName)
                  ? element.propertyName.text
                  : null
                : ts.isIdentifier(element.name)
                  ? element.name.text
                  : null;
              if (propName && !rec.namespaceAccesses.includes(propName)) {
                rec.namespaceAccesses.push(propName);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sf, visit);
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
 * Maps: exported symbol name → { origin: absolute origin path, originalName: pre-alias name }.
 *
 * `originalName` is what the origin module actually exports — distinct from the
 * key when the barrel renames (`export { useFoo as useBar }`). The guard checks
 * `originalName` against the forbid list so an alias cannot launder a forbidden
 * symbol past the surface boundary.
 */
interface BarrelExportEntry {
  origin: string;
  originalName: string;
}
type BarrelExportMap = Map<string, BarrelExportEntry>;

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
          // Map exportedAs (what consumers import) → { origin, originalName }.
          // The guard uses originalName to match against forbid lists so an alias
          // does NOT launder a forbidden symbol past the surface boundary.
          result.set(exportedAs, { origin: originPath, originalName });
          // Also map the original name in case a consumer somehow imports it
          // directly through the barrel (rare, but defensive).
          if (originalName !== exportedAs && !result.has(originalName)) {
            result.set(originalName, { origin: originPath, originalName });
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
        // `export *` cannot rename, so exported name == original name.
        result.set(name, { origin: originPath, originalName: name });
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
 * Resolve an import source string (as written in the file) to an absolute path
 * pointing at the candidate barrel file. Returns null when the source cannot
 * be resolved to a known barrel.
 *
 * Only relative paths are resolved — package imports (e.g. `@eduagent/schemas`)
 * are not currently tracked in the barrel map, so they are returned as-is for
 * direct lookup by the caller (which falls back to symbol-name matching).
 */
function resolveImportSourceToBarrel(
  importSource: string,
  consumerFilePath: string,
  barrelMap: Map<string, BarrelExportMap>,
): string | null {
  if (!importSource.startsWith('.')) {
    // Non-relative import (package or alias). Barrels in this repo are tracked
    // as repo-relative file paths; non-relative resolution would require the
    // module resolution machinery, which is intentionally out of scope.
    return null;
  }
  const consumerDir = path.dirname(consumerFilePath);
  const absBase = path.resolve(consumerDir, importSource);
  const candidates = [
    absBase,
    absBase + '.ts',
    absBase + '.tsx',
    path.join(absBase, 'index.ts'),
    path.join(absBase, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (barrelMap.has(c)) return c;
  }
  return null;
}

/**
 * Scan a single file and return any forbidden-symbol violations against `rule`.
 *
 * Three classes of violation are detected:
 *   1. Direct named imports of a forbidden symbol.
 *   2. Barrel-aliased imports: a named import whose local name is innocent but
 *      whose underlying barrel re-export points at a forbidden symbol
 *      (Bug-B fix — wires the previously-unused barrelMap).
 *   3. Namespace imports combined with a member access that hits a forbidden
 *      symbol (Bug-A fix — covers `import * as X from '...'; X.useFoo()`).
 *
 * @param filePath   Absolute path to the file to scan.
 * @param rule       The surface rule to enforce.
 * @param barrelMap  Pre-built barrel map (from buildBarrelMap).
 * @param repoRoot   Absolute repo root (used to normalise paths for barrel lookup).
 */
export function checkFile(
  filePath: string,
  rule: SurfaceRule,
  barrelMap: Map<string, BarrelExportMap>,
  _repoRoot: string,
): Violation[] {
  const imports = collectImports(filePath);
  const violations: Violation[] = [];
  const seen = new Set<string>();

  const record = (symbol: string, importSource: string): void => {
    const key = `${symbol}::${importSource}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ file: filePath, symbol, importSource });
  };

  for (const imp of imports) {
    // 1. Direct named import — check exported name against forbid list.
    for (const symbol of imp.named) {
      if (rule.forbid.symbols.includes(symbol)) {
        record(symbol, imp.source);
      }
    }

    // 2. Barrel resolution — if the import source resolves to a known barrel,
    //    map each imported (exported) name through the barrel and check the
    //    resolved original name. Catches `export { useFoo as innocentName }`
    //    laundering.
    const barrelPath = resolveImportSourceToBarrel(
      imp.source,
      filePath,
      barrelMap,
    );
    if (barrelPath) {
      const barrel = barrelMap.get(barrelPath);
      if (barrel) {
        for (const alias of imp.namedAliases) {
          // The consumer imports `alias.exported` from the barrel; the barrel
          // entry tells us the underlying origin symbol.
          const entry = barrel.get(alias.exported);
          if (entry && rule.forbid.symbols.includes(entry.originalName)) {
            record(entry.originalName, imp.source);
          }
        }
        // Namespace import from a barrel: each accessed member is effectively
        // a named import. Resolve through the barrel before checking.
        if (imp.namespace) {
          for (const accessed of imp.namespaceAccesses) {
            const entry = barrel.get(accessed);
            const underlying = entry ? entry.originalName : accessed;
            if (rule.forbid.symbols.includes(underlying)) {
              record(underlying, imp.source);
            }
          }
        }
      }
    }

    // 3. Namespace import (non-barrel or barrel-resolved-above) — check raw
    //    member-access names against the forbid list. We always run this for
    //    namespace imports that did NOT resolve to a barrel; for barrel-backed
    //    namespace imports the loop above already handled it.
    if (imp.namespace && !barrelPath) {
      for (const accessed of imp.namespaceAccesses) {
        if (rule.forbid.symbols.includes(accessed)) {
          record(accessed, imp.source);
        }
      }
    }
  }

  return violations;
}
