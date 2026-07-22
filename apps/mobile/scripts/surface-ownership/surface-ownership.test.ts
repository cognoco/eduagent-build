/**
 * Surface ownership boundary guard test.
 *
 * Forward-only ratchet: PRs 3/4/5 removed existing violations. This test
 * prevents new forbidden direct imports from appearing on regulated surfaces.
 *
 * Uses TypeScript compiler API (AST walk) — NOT raw string scanning — so
 * namespace imports, barrel re-exports, and aliasing are all covered.
 *
 * See:
 *   docs/_archive/specs/Done/2026-05-13-surface-ownership-boundaries-design.md
 *   docs/_archive/plans/done/2026-05-13-surface-ownership-boundaries.md PR 8
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  SURFACE_RULES,
  listSourceFiles,
  collectImports,
  buildBarrelMap,
  checkFile,
  type AllowlistEntry,
  type ImportRecord,
  type SurfaceRule,
  type Violation,
} from './surface-ownership';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// __dirname  = apps/mobile/src/lib
// repoRoot   = ../../.. above that  → monorepo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Sanity check: make sure we landed at the right root.
if (!fs.existsSync(path.join(REPO_ROOT, 'apps/mobile'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/mobile. Path resolution is wrong.`,
  );
}

// Known barrels that could re-export forbidden symbols.
// Add a barrel here when a new index.ts is created under hooks/ or components/
// that re-exports any of the guarded hooks.
const KNOWN_BARRELS = [
  // hooks/index.ts does NOT exist in this repo — no barrel for hooks.
  'apps/mobile/src/components/home/index.ts',
  'apps/mobile/src/components/progress/index.ts',
  'apps/mobile/src/components/session/index.ts',
  'apps/mobile/src/components/common/index.ts',
];

// ---------------------------------------------------------------------------
// Build barrel map once for all tests
// ---------------------------------------------------------------------------

const barrelMap = buildBarrelMap(REPO_ROOT, KNOWN_BARRELS);
const TEMP_ROOT = path.join(REPO_ROOT, '.tmp/surface-ownership-tests');

function cleanupTempPath(tempPath: string): void {
  try {
    fs.rmSync(tempPath, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  } catch {
    /* best-effort cleanup for Windows file-lock races */
  }
}

cleanupTempPath(TEMP_ROOT);

// ---------------------------------------------------------------------------
// Guard tests — one describe per surface rule
// ---------------------------------------------------------------------------

for (const rule of SURFACE_RULES) {
  describe(`Surface ownership: ${rule.label}`, () => {
    // Collect files matching this surface (only .ts/.tsx, exclude test files
    // — tests are allowed to import anything for mocking/assertion).
    const mobileRoot = path.join(REPO_ROOT, 'apps/mobile/src');
    const allSourceFiles = listSourceFiles(mobileRoot);

    const surfaceFiles = allSourceFiles.filter((f: string) => {
      const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
      return (
        rule.matches(rel) &&
        !rel.endsWith('.test.ts') &&
        !rel.endsWith('.test.tsx')
      );
    });

    it(`found at least one non-test file matching "${rule.label}"`, () => {
      expect(surfaceFiles.length).toBeGreaterThan(0);
    });

    for (const file of surfaceFiles) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');

      // Check allowlist
      const isAllowlisted =
        rule.allowlist?.some((a: AllowlistEntry) => a.relPath === rel) ?? false;

      it(`${rel} — no forbidden imports`, () => {
        if (isAllowlisted) {
          // Allowlisted file: skip violation check, document reason
          const entry = rule.allowlist!.find(
            (a: AllowlistEntry) => a.relPath === rel,
          )!;
          // Allowlist entry is intentional; log reason for traceability.
          expect(entry.reason).toBeTruthy();
          return;
        }

        const violations = checkFile(file, rule, barrelMap, REPO_ROOT);
        if (violations.length > 0) {
          const detail = violations
            .map(
              (v: Violation) =>
                `  symbol="${v.symbol}" imported-from="${v.importSource}"`,
            )
            .join('\n');
          // Throw with a descriptive message that names the file, symbol, and source.
          throw new Error(
            `\n${rel} imports forbidden symbol(s):\n${detail}\n` +
              `\nRemediation options:\n` +
              `  (a) Replace the direct import with the approved facade hook.\n` +
              `  (b) If this exception is intentional, add an allowlist entry to\n` +
              `      SURFACE_RULES["${rule.label}"].allowlist with a reason.\n`,
          );
        }
        expect(violations).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Self-check: guard catches a real violation
// ---------------------------------------------------------------------------

describe('Surface ownership self-check: guard is not always-green', () => {
  it('would fail if a session screen imported useProgressInventory directly', () => {
    // Simulate: hand-construct an imports array including a forbidden symbol.
    // This proves the rule's symbol list and the filter logic are wired correctly.
    const syntheticImports: ImportRecord[] = [
      {
        source: '../../hooks/use-progress',
        named: ['useProgressInventory'],
        namedAliases: [
          { exported: 'useProgressInventory', local: 'useProgressInventory' },
        ],
        default: null,
        namespace: null,
        namespaceAccesses: [],
      },
    ];

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    expect(sessionRule).toBeDefined();

    const forbidden = syntheticImports
      .flatMap((imp: ImportRecord) => imp.named)
      .filter((s: string) => sessionRule.forbid.symbols.includes(s));

    expect(forbidden).toEqual(['useProgressInventory']);
  });

  it('would fail if a session-summary screen imported useOverallProgress directly', () => {
    const syntheticImports: ImportRecord[] = [
      {
        source: '../../hooks/use-progress',
        named: ['useOverallProgress'],
        namedAliases: [
          { exported: 'useOverallProgress', local: 'useOverallProgress' },
        ],
        default: null,
        namespace: null,
        namespaceAccesses: [],
      },
    ];

    const summaryRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session-summary screens',
    )!;
    expect(summaryRule).toBeDefined();

    const forbidden = syntheticImports
      .flatMap((imp: ImportRecord) => imp.named)
      .filter((s: string) => summaryRule.forbid.symbols.includes(s));

    expect(forbidden).toEqual(['useOverallProgress']);
  });

  it('would fail if a home presentational component imported useProgressInventory', () => {
    const syntheticImports: ImportRecord[] = [
      {
        source: '../../hooks/use-progress',
        named: ['useProgressInventory'],
        namedAliases: [
          { exported: 'useProgressInventory', local: 'useProgressInventory' },
        ],
        default: null,
        namespace: null,
        namespaceAccesses: [],
      },
    ];

    const homeRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Home presentational components',
    )!;
    expect(homeRule).toBeDefined();

    const forbidden = syntheticImports
      .flatMap((imp: ImportRecord) => imp.named)
      .filter((s: string) => homeRule.forbid.symbols.includes(s));

    expect(forbidden).toEqual(['useProgressInventory']);
  });

  it('library rule forbids useProgressInventory but not useOverallProgress', () => {
    const libraryRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Library screens',
    )!;
    expect(libraryRule).toBeDefined();

    // Forbidden
    expect(libraryRule.forbid.symbols).toContain('useProgressInventory');

    // useOverallProgress is the documented PR 4 exception — NOT in the forbid list.
    expect(libraryRule.forbid.symbols).not.toContain('useOverallProgress');
  });

  it('collectImports extracts named imports using the AST (not string matching)', () => {
    // Create a synthetic TS source string and verify collectImports reads it.
    // We write a temp file so collectImports (which reads from disk) can parse it.
    const tmpPath = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_surface-ownership-selfcheck.tmp.ts',
    );
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    const tmpSource = `
import { useProgressInventory, useOverallProgress } from '../../hooks/use-progress';
import type { SomeType } from '@eduagent/schemas';
import DefaultExport from './some-module';
import * as AllFromLib from '../lib/api';
export function Foo() { return null; }
`.trim();

    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');
    try {
      const imports = collectImports(tmpPath);

      const progressImport = imports.find(
        (i: ImportRecord) => i.source === '../../hooks/use-progress',
      );
      expect(progressImport).toBeDefined();
      expect(progressImport!.named).toContain('useProgressInventory');
      expect(progressImport!.named).toContain('useOverallProgress');

      const typeImport = imports.find(
        (i: ImportRecord) => i.source === '@eduagent/schemas',
      );
      expect(typeImport).toBeDefined();
      expect(typeImport!.named).toContain('SomeType');

      const defaultImport = imports.find(
        (i: ImportRecord) => i.source === './some-module',
      );
      expect(defaultImport).toBeDefined();
      expect(defaultImport!.default).toBe('DefaultExport');

      const namespaceImport = imports.find(
        (i: ImportRecord) => i.source === '../lib/api',
      );
      expect(namespaceImport).toBeDefined();
      expect(namespaceImport!.namespace).toBe('AllFromLib');
    } finally {
      cleanupTempPath(tmpPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Barrel map coverage check
// ---------------------------------------------------------------------------

describe('Surface ownership: barrel map', () => {
  it('loaded at least one barrel from KNOWN_BARRELS', () => {
    expect(barrelMap.size).toBeGreaterThan(0);
  });

  it('home barrel (components/home/index.ts) does not re-export useProgressInventory', () => {
    // The home index barrel only re-exports UI components (IntentCard, LearnerScreen,
    // SubjectTile, CoachBand). useProgressInventory lives in hooks/use-progress.ts
    // and is NOT exported through the home barrel, so importing the barrel cannot
    // inject it into a non-LearnerScreen component via barrel.
    const homeBarrelAbs = path.join(
      REPO_ROOT,
      'apps/mobile/src/components/home/index.ts',
    );
    const homeBarrel = barrelMap.get(homeBarrelAbs);

    if (homeBarrel) {
      expect(homeBarrel.has('useProgressInventory')).toBe(false);
    } else {
      // Barrel file doesn't exist yet — that's fine, nothing to check.
      expect(true).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug A — Namespace-import bypass break test
// ---------------------------------------------------------------------------

describe('Surface ownership: namespace-import bypass (Bug A)', () => {
  const tmpFiles: string[] = [];
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const f of tmpFiles) {
      try {
        cleanupTempPath(f);
      } catch {
        /* ignore */
      }
    }
    for (const d of tmpDirs) {
      try {
        cleanupTempPath(d);
      } catch {
        /* ignore */
      }
    }
  });

  it('flags `import * as P; P.useProgressInventory` on a session surface', () => {
    // Write a synthetic file under the session surface and verify checkFile flags it.
    const tmpDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_namespace_bypass_test',
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, '_bypass.tmp.ts');
    tmpFiles.push(tmpPath);
    tmpDirs.push(tmpDir);

    const tmpSource = `
import * as P from '../../../../hooks/use-progress';
export function Foo() {
  const inv = P.useProgressInventory();
  return inv;
}
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(tmpPath, sessionRule, barrelMap, REPO_ROOT);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v: Violation) => v.symbol)).toContain(
      'useProgressInventory',
    );
  });

  it('does NOT flag namespace imports that never access a forbidden member', () => {
    const tmpDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_namespace_clean_test',
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, '_clean.tmp.ts');
    tmpFiles.push(tmpPath);
    tmpDirs.push(tmpDir);

    const tmpSource = `
import * as P from '../../../../hooks/use-progress';
export function Foo() {
  // Touch a name that is not on the forbid list.
  return P.someOtherHelper?.();
}
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(tmpPath, sessionRule, barrelMap, REPO_ROOT);
    expect(violations).toEqual([]);
  });

  it('collectImports captures namespace member accesses', () => {
    const tmpPath = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_surface-ownership-ns-accesses.tmp.ts',
    );
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    tmpFiles.push(tmpPath);

    const tmpSource = `
import * as Lib from '../hooks/use-progress';
export const a = Lib.useProgressInventory;
export const b = Lib.someOtherSymbol();
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const records = collectImports(tmpPath);
    const ns = records.find((r) => r.namespace === 'Lib');
    expect(ns).toBeDefined();
    expect(ns!.namespaceAccesses).toContain('useProgressInventory');
    expect(ns!.namespaceAccesses).toContain('someOtherSymbol');
  });

  // Bug-A destructuring fix — break test (red-green validated)
  // Destructuring from a namespace import: `const { useProgressInventory } = Hooks`
  // is functionally identical to `Hooks.useProgressInventory` and must be flagged.
  it('flags `const { forbiddenName } = NamespaceImport` on a session surface', () => {
    const tmpDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_namespace_destructure_test',
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, '_destructure.tmp.ts');
    tmpFiles.push(tmpPath);
    tmpDirs.push(tmpDir);

    // Destructuring from a namespace import — bypasses PropertyAccessExpression
    // and ElementAccessExpression detection without the new VariableDeclaration check.
    const tmpSource = `
import * as Hooks from '../../../../hooks/use-progress';
const { useProgressInventory } = Hooks;
export function Foo() {
  return useProgressInventory();
}
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(tmpPath, sessionRule, barrelMap, REPO_ROOT);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v: Violation) => v.symbol)).toContain(
      'useProgressInventory',
    );
  });

  it('collectImports captures namespace accesses from destructuring', () => {
    const tmpPath = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_surface-ownership-ns-destructure.tmp.ts',
    );
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    tmpFiles.push(tmpPath);

    const tmpSource = `
import * as Lib from '../hooks/use-progress';
const { useProgressInventory, someOtherSymbol } = Lib;
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const records = collectImports(tmpPath);
    const ns = records.find((r: ImportRecord) => r.namespace === 'Lib');
    expect(ns).toBeDefined();
    expect(ns!.namespaceAccesses).toContain('useProgressInventory');
    expect(ns!.namespaceAccesses).toContain('someOtherSymbol');
  });

  it('flags destructuring with rename (`const { forbiddenName: alias } = Ns`)', () => {
    const tmpDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_namespace_destructure_rename_test',
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, '_destructure_rename.tmp.ts');
    tmpFiles.push(tmpPath);
    tmpDirs.push(tmpDir);

    // Rename in destructuring: the property key is the forbidden name; the local
    // binding is an alias. The guard must check the property key, not the alias.
    const tmpSource = `
import * as Hooks from '../../../../hooks/use-progress';
const { useProgressInventory: innocentAlias } = Hooks;
export function Foo() {
  return innocentAlias();
}
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(tmpPath, sessionRule, barrelMap, REPO_ROOT);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v: Violation) => v.symbol)).toContain(
      'useProgressInventory',
    );
  });

  it('does NOT flag destructuring of non-forbidden members from namespace import', () => {
    const tmpDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_namespace_destructure_clean_test',
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, '_destructure_clean.tmp.ts');
    tmpFiles.push(tmpPath);
    tmpDirs.push(tmpDir);

    const tmpSource = `
import * as Hooks from '../../../../hooks/use-progress';
const { someOtherHelper } = Hooks;
export function Foo() {
  return someOtherHelper?.();
}
`.trim();
    fs.writeFileSync(tmpPath, tmpSource, 'utf-8');

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(tmpPath, sessionRule, barrelMap, REPO_ROOT);
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bug B — Barrel resolution wiring break test
// ---------------------------------------------------------------------------

describe('Surface ownership: barrel resolution wiring (Bug B)', () => {
  const tmpFiles: string[] = [];
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const f of tmpFiles) {
      try {
        cleanupTempPath(f);
      } catch {
        /* ignore */
      }
    }
    for (const d of tmpDirs) {
      try {
        cleanupTempPath(d);
      } catch {
        /* ignore */
      }
    }
  });

  it('flags barrel-aliased forbidden symbol (export { useProgressInventory as innocentName })', () => {
    // Build a synthetic barrel that aliases a forbidden symbol to a benign name.
    // A consumer that imports the benign name from the barrel must still be flagged
    // because the underlying symbol is on the forbid list.
    const fakeOriginDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_barrel_test_origin',
    );
    const fakeBarrelDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_barrel_test_barrel',
    );
    fs.mkdirSync(fakeOriginDir, { recursive: true });
    fs.mkdirSync(fakeBarrelDir, { recursive: true });
    tmpDirs.push(fakeOriginDir, fakeBarrelDir);

    const originPath = path.join(fakeOriginDir, 'use-progress.ts');
    const barrelPath = path.join(fakeBarrelDir, 'index.ts');
    const consumerDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_barrel_consumer_test',
    );
    fs.mkdirSync(consumerDir, { recursive: true });
    tmpDirs.push(consumerDir);
    const consumerPath = path.join(consumerDir, 'consumer.tmp.ts');

    fs.writeFileSync(
      originPath,
      `export const useProgressInventory = () => null;\n`,
      'utf-8',
    );
    fs.writeFileSync(
      barrelPath,
      `export { useProgressInventory as innocentName } from '../_barrel_test_origin/use-progress';\n`,
      'utf-8',
    );
    fs.writeFileSync(
      consumerPath,
      `import { innocentName } from '../../../../lib/_barrel_test_barrel';\nexport const x = innocentName;\n`,
      'utf-8',
    );

    tmpFiles.push(originPath, barrelPath, consumerPath);

    // Build a barrel map that includes our synthetic barrel.
    const augmentedMap = buildBarrelMap(REPO_ROOT, [
      ...KNOWN_BARRELS,
      path.relative(REPO_ROOT, barrelPath).replace(/\\/g, '/'),
    ]);

    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(
      consumerPath,
      sessionRule,
      augmentedMap,
      REPO_ROOT,
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v: Violation) => v.symbol)).toContain(
      'useProgressInventory',
    );
  });

  it('barrel-resolved happy path: clean re-export with no forbidden underlying symbol is not flagged', () => {
    const fakeOriginDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_barrel_test_origin_clean',
    );
    const fakeBarrelDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/lib/_barrel_test_barrel_clean',
    );
    fs.mkdirSync(fakeOriginDir, { recursive: true });
    fs.mkdirSync(fakeBarrelDir, { recursive: true });
    tmpDirs.push(fakeOriginDir, fakeBarrelDir);

    const originPath = path.join(fakeOriginDir, 'helpers.ts');
    const barrelPath = path.join(fakeBarrelDir, 'index.ts');
    const consumerDir = path.join(
      TEMP_ROOT,
      'apps/mobile/src/app/(app)/session/_barrel_consumer_clean_test',
    );
    fs.mkdirSync(consumerDir, { recursive: true });
    tmpDirs.push(consumerDir);
    const consumerPath = path.join(consumerDir, 'consumer.tmp.ts');

    fs.writeFileSync(
      originPath,
      `export const friendlyHelper = () => null;\n`,
      'utf-8',
    );
    fs.writeFileSync(
      barrelPath,
      `export { friendlyHelper } from '../_barrel_test_origin_clean/helpers';\n`,
      'utf-8',
    );
    fs.writeFileSync(
      consumerPath,
      `import { friendlyHelper } from '../../../../lib/_barrel_test_barrel_clean';\nexport const x = friendlyHelper;\n`,
      'utf-8',
    );
    tmpFiles.push(originPath, barrelPath, consumerPath);

    const augmentedMap = buildBarrelMap(REPO_ROOT, [
      ...KNOWN_BARRELS,
      path.relative(REPO_ROOT, barrelPath).replace(/\\/g, '/'),
    ]);
    const sessionRule = SURFACE_RULES.find(
      (r: SurfaceRule) => r.label === 'Session screens',
    )!;
    const violations = checkFile(
      consumerPath,
      sessionRule,
      augmentedMap,
      REPO_ROOT,
    );
    expect(violations).toEqual([]);
  });
});
