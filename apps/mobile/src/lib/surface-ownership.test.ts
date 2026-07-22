/**
 * Surface-ownership forward-only guard.
 *
 * Enforces the import-boundary rules from the design at
 *   docs/_archive/specs/Done/2026-05-13-surface-ownership-boundaries-design.md
 * (PR 7 in the implementation sequence).
 *
 * Each rule binds a file-path glob ("surface") to a set of forbidden named
 * imports. Screens and components that own a surface must not pull in the
 * broad cross-surface hooks; they read via the documented facades instead:
 *
 *   - session / session-summary surfaces → use-session-context.ts
 *     (`useTotalSessionCount`, `useIsFirstSession`, `useTotalTopicsCompleted`)
 *   - library surface → use-library-context.ts (`useSubjectRetentionMap`)
 *   - home/family leaf components → receive data as props from their screen
 *
 * Detection is AST-based: we parse each scanned file with the TypeScript
 * compiler and inspect ImportDeclaration nodes. We do NOT regex on raw source,
 * because a string match on "useOverallProgress" in a comment or in a facade's
 * implementation must not count as a violation. The check is named-import
 * based, so a re-export through any future `hooks/index.ts` barrel that
 * preserves the same export name would still trip the guard (the *consuming*
 * file lists the forbidden symbol in its import clause regardless of which
 * module it came from).
 *
 * Forward-only ratchet:
 *   - KNOWN_VIOLATIONS lists files that pre-date the guard. Each entry is
 *     justified inline. The set must shrink, never grow.
 *   - ALLOWLIST_FILES lists files that legitimately import the broad hooks
 *     (the facades themselves, and screen-level aggregators that drill props
 *     down to leaf components).
 *   - Any new violator outside both lists fails CI.
 *
 * Self-check tests at the bottom exercise the AST scanner against synthetic
 * sources, so a refactor that breaks the walk fails loudly instead of
 * silently always-passing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

// __dirname = apps/mobile/src/lib → repo root is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MOBILE_SRC = path.join(REPO_ROOT, 'apps', 'mobile', 'src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps', 'mobile'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/mobile. Path resolution is wrong.`,
  );
}

interface SurfaceRule {
  /** Human-readable surface name used in failure messages. */
  surface: string;
  /** Repo-relative path prefix(es) that belong to this surface. */
  matches: (relPath: string) => boolean;
  /** Named imports that are forbidden on this surface. */
  forbidden: ReadonlySet<string>;
  /** Free-text hint shown to the engineer if a violation lands. */
  hint: string;
}

const SURFACE_RULES: SurfaceRule[] = [
  {
    surface: 'session',
    matches: (rel) => rel.startsWith('apps/mobile/src/app/(app)/session/'),
    forbidden: new Set(['useProgressInventory', 'useOverallProgress']),
    hint: 'Use useTotalSessionCount / useIsFirstSession / useTotalTopicsCompleted from hooks/use-session-context.ts.',
  },
  {
    surface: 'session-summary',
    matches: (rel) => rel.startsWith('apps/mobile/src/app/session-summary/'),
    forbidden: new Set(['useProgressInventory', 'useOverallProgress']),
    hint: 'Use useTotalSessionCount from hooks/use-session-context.ts.',
  },
  {
    surface: 'library',
    matches: (rel) =>
      rel === 'apps/mobile/src/app/(app)/library.tsx' ||
      rel.startsWith('apps/mobile/src/app/(app)/library/'),
    forbidden: new Set([
      'useOverallProgress',
      'useProgressInventory',
      'useProgressHistory',
    ]),
    hint: 'Use useSubjectRetentionMap from hooks/use-library-context.ts. Retention is library-owned.',
  },
  {
    surface: 'components/home',
    matches: (rel) => rel.startsWith('apps/mobile/src/components/home/'),
    forbidden: new Set(['useProgressInventory']),
    hint: 'Home leaf components receive data via props from LearnerScreen / ParentHomeScreen.',
  },
  {
    surface: 'components/family',
    matches: (rel) => rel.startsWith('apps/mobile/src/components/family/'),
    forbidden: new Set(['useDashboard']),
    hint: 'Family banners and rows receive a typed child list via props; do not fetch the parent dashboard.',
  },
];

/**
 * Files that legitimately import the broad hooks. Each entry must explain
 * why. Keep this list short.
 */
const ALLOWLIST_FILES = new Set<string>([
  // Session facade: re-exposes useProgressInventory / useOverallProgress under
  // session-domain names (useTotalSessionCount, useIsFirstSession,
  // useTotalTopicsCompleted). IMPORT-BOUNDARY FACADE — see file header.
  'apps/mobile/src/hooks/use-session-context.ts',
  // Library facade: owns /library/retention. PAYLOAD-NARROW — see file header.
  'apps/mobile/src/hooks/use-library-context.ts',
  // Screen-level aggregators: the spec's PR-5 prop-drill cleanup designates
  // LearnerScreen and ParentHomeScreen as the legitimate fetchers that drill
  // data down to leaf cards. The `components/home/*` rule targets leaf cards
  // (ChildQuotaLine, EarlyAdopterCard, SubjectTile, etc.), not the screen
  // that hosts them. See spec §1 Home (Learner) and §2 Home (Guardian).
  'apps/mobile/src/components/home/LearnerScreen.tsx',
  'apps/mobile/src/components/home/ParentHomeScreen.tsx',
]);

/**
 * Pre-existing violations that the spec's forward-only ratchet tolerates.
 * Each entry must shrink to zero — list a follow-up issue or sweep target in
 * the comment. New violations land in the failure path, never here.
 */
const KNOWN_VIOLATIONS: ReadonlyMap<string, string> = new Map([
  [
    'apps/mobile/src/app/(app)/library.tsx',
    // library reads useOverallProgress() not for retention (already library-
    // owned via useLibraryRetention) but for per-subject topic counts
    // (topicsCompleted / topicsTotal / topicsVerified, used at lines ~308,
    // 784, 1055). The spec's "must not touch overall progress" for library
    // did not anticipate the topic-count display; useSubjectRetentionMap does
    // not cover it. Deferred fix: either (a) extend the library-owned API to
    // return per-subject topic counts, or (b) add a narrow hook similar to
    // useSubjectRetentionMap that exposes only the topic-count slice.
    'topic-count display still uses useOverallProgress',
  ],
]);

function listMobileSources(): string[] {
  const out: string[] = [];
  walk(MOBILE_SRC, out);
  return out
    .map((abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, '/'))
    .filter((rel) => isScannable(rel))
    .sort();
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'out-tsc') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function isScannable(rel: string): boolean {
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.test.tsx')) return false;
  if (rel.endsWith('.spec.ts')) return false;
  if (rel.endsWith('.spec.tsx')) return false;
  if (rel.endsWith('.d.ts')) return false;
  return true;
}

interface Violation {
  file: string;
  surface: string;
  imported: string[];
  line: number;
  hint: string;
}

/**
 * Walk an ImportDeclaration's named bindings and collect any name that the
 * rule forbids. Default imports and namespace (`import *`) imports are
 * ignored — the hooks under scrutiny are exported by name, never as default.
 */
function collectForbiddenNames(
  decl: ts.ImportDeclaration,
  forbidden: ReadonlySet<string>,
): string[] {
  const clause = decl.importClause;
  if (!clause) return [];
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return [];
  const hits: string[] = [];
  for (const element of bindings.elements) {
    // `import { useOverallProgress as foo }` — propertyName carries the real
    // export, name carries the local alias. The export-side name is what we
    // ban.
    const exportName = (element.propertyName ?? element.name).text;
    if (forbidden.has(exportName)) hits.push(exportName);
  }
  return hits;
}

function scanFile(absPath: string, rule: SurfaceRule): Violation | null {
  const text = fs.readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const allHits: string[] = [];
  let firstLine = -1;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const hits = collectForbiddenNames(stmt, rule.forbidden);
    if (hits.length > 0) {
      allHits.push(...hits);
      if (firstLine === -1) {
        firstLine =
          sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
      }
    }
  }
  if (allHits.length === 0) return null;
  return {
    file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
    surface: rule.surface,
    imported: Array.from(new Set(allHits)).sort(),
    line: firstLine,
    hint: rule.hint,
  };
}

function findViolations(files: string[]): Violation[] {
  const out: Violation[] = [];
  for (const rel of files) {
    if (ALLOWLIST_FILES.has(rel)) continue;
    const abs = path.join(REPO_ROOT, rel);
    for (const rule of SURFACE_RULES) {
      if (!rule.matches(rel)) continue;
      const v = scanFile(abs, rule);
      if (v) out.push(v);
    }
  }
  return out;
}

describe('SURFACE-OWNERSHIP guard — forward-only import boundaries', () => {
  const files = listMobileSources();

  it('finds mobile source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('finds the facade hook files (sanity — allowlist not stale)', () => {
    for (const allow of ALLOWLIST_FILES) {
      expect(files).toContain(allow);
    }
  });

  it('does not introduce NEW surface-ownership violations', () => {
    const violations = findViolations(files);
    const fresh = violations.filter((v) => !KNOWN_VIOLATIONS.has(v.file));
    if (fresh.length > 0) {
      const lines = fresh
        .map(
          (v) =>
            `  [${v.surface}] ${v.file}:${v.line}\n` +
            `      forbidden import(s): ${v.imported.join(', ')}\n` +
            `      → ${v.hint}`,
        )
        .join('\n');
      throw new Error(
        `Found ${fresh.length} new surface-ownership violation(s):\n${lines}\n\n` +
          `See docs/_archive/specs/Done/2026-05-13-surface-ownership-boundaries-design.md.`,
      );
    }
    expect(fresh).toEqual([]);
  });

  it('shrinks KNOWN_VIOLATIONS as files are cleaned up', () => {
    const violations = findViolations(files);
    const stillViolating = new Set(violations.map((v) => v.file));
    const stale = Array.from(KNOWN_VIOLATIONS.keys()).filter(
      (f) => !stillViolating.has(f),
    );
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_VIOLATIONS contains entries that no longer violate — remove them:\n` +
          stale.map((f) => `  - ${f}`).join('\n'),
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Self-checks. Prove the scanner detects synthetic offenders. Without these,
  // a refactor that breaks the AST walk would silently always-pass.
  // ---------------------------------------------------------------------------

  function scanSynthetic(
    source: string,
    forbidden: ReadonlySet<string>,
  ): string[] {
    const sf = ts.createSourceFile(
      'synthetic.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const hits: string[] = [];
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      hits.push(...collectForbiddenNames(stmt, forbidden));
    }
    return hits;
  }

  it('self-check: detects a direct named import of a forbidden hook', () => {
    const hits = scanSynthetic(
      `import { useOverallProgress } from '../../hooks/use-progress';
       export function Bad() { return useOverallProgress(); }`,
      new Set(['useOverallProgress']),
    );
    expect(hits).toEqual(['useOverallProgress']);
  });

  it('self-check: detects a renamed import (`as` alias)', () => {
    const hits = scanSynthetic(
      `import { useOverallProgress as op } from '../../hooks/use-progress';
       export function Bad() { return op(); }`,
      new Set(['useOverallProgress']),
    );
    expect(hits).toEqual(['useOverallProgress']);
  });

  it('self-check: ignores a comment that mentions the forbidden name', () => {
    const hits = scanSynthetic(
      `// useOverallProgress is forbidden on this surface — do not import it.
       import { useSomethingElse } from '../../hooks/use-other';
       export function Ok() { return useSomethingElse(); }`,
      new Set(['useOverallProgress']),
    );
    expect(hits).toEqual([]);
  });

  it('self-check: ignores an unrelated named import', () => {
    const hits = scanSynthetic(
      `import { useSubjects } from '../../hooks/use-subjects';
       export function Ok() { return useSubjects(); }`,
      new Set(['useOverallProgress', 'useProgressInventory']),
    );
    expect(hits).toEqual([]);
  });

  it('self-check: detects when the forbidden name comes from a barrel-style path', () => {
    // Barrel-transparent: regardless of the module specifier, an import that
    // pulls the export name `useOverallProgress` into scope is a violation.
    const hits = scanSynthetic(
      `import { useOverallProgress } from '../../hooks';
       export function Bad() { return useOverallProgress(); }`,
      new Set(['useOverallProgress']),
    );
    expect(hits).toEqual(['useOverallProgress']);
  });

  it('self-check: detects multiple forbidden names in one import statement', () => {
    const hits = scanSynthetic(
      `import { useOverallProgress, useProgressInventory, useSubjects }
         from '../../hooks/use-progress';
       export function Bad() { return null; }`,
      new Set(['useOverallProgress', 'useProgressInventory']),
    );
    expect(hits.sort()).toEqual(['useOverallProgress', 'useProgressInventory']);
  });
});
