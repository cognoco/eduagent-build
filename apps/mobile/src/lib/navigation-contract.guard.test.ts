import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

const V0_RESOLVERS = new Set([
  'resolveTabShape',
  'computeVisibleTabs',
  'computeModeVisibleTabs',
  'resolveHomeTabPresentation',
]);

const V0_RESOLVER_ALLOWED_FILES = new Set([
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/app/(app)/own-learning.tsx',
  'apps/mobile/src/hooks/use-navigation-contract.ts',
  'apps/mobile/src/lib/app-context.tsx',
  'apps/mobile/src/lib/legacy-navigation-contract.ts',
  'apps/mobile/src/lib/navigation-contract.ts',
]);

const DIAGNOSTIC_ALLOWED_FILES = new Set([
  'apps/mobile/src/lib/navigation-contract.ts',
  'apps/mobile/src/lib/navigation-contract.test.ts',
  'apps/mobile/src/lib/navigation-contract.snapshot.test.ts',
  'apps/mobile/src/lib/navigation-contract.guard.test.ts',
]);

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function allMobileSources(): string[] {
  const out = execSync(
    'git ls-files --cached --others --exclude-standard "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot(), encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !file.startsWith('apps/mobile/src/i18n/'));
}

function parseSource(file: string): ts.SourceFile | null {
  const absPath = resolve(repoRoot(), file);
  if (!existsSync(absPath)) return null;
  return ts.createSourceFile(
    file,
    readFileSync(absPath, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function importedNames(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause) return [];

  const names: string[] = [];
  if (clause.name) names.push(clause.name.text);

  const namedBindings = clause.namedBindings;
  if (namedBindings && ts.isNamedImports(namedBindings)) {
    for (const element of namedBindings.elements) {
      names.push(element.name.text);
    }
  }

  return names;
}

function stringLiteralValues(sourceFile: ts.SourceFile): Set<string> {
  const values = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node)) {
      values.add(node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

function routeKeyValues(sourceFile: ts.SourceFile): Set<string> {
  const values = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === 'RouteKey' &&
      ts.isUnionTypeNode(node.type)
    ) {
      for (const type of node.type.types) {
        if (
          ts.isLiteralTypeNode(type) &&
          ts.isStringLiteralLike(type.literal)
        ) {
          values.add(type.literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

function tabKeyValues(sourceFile: ts.SourceFile): Set<string> {
  const values = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === 'TabKey' &&
      ts.isUnionTypeNode(node.type)
    ) {
      for (const type of node.type.types) {
        if (
          ts.isLiteralTypeNode(type) &&
          ts.isStringLiteralLike(type.literal)
        ) {
          values.add(type.literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

describe('navigation-contract AST ratchet', () => {
  const files = allMobileSources();
  const contractSource = parseSource(
    'apps/mobile/src/lib/navigation-contract.ts',
  );

  it('finds mobile source files and the contract module', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(contractSource).not.toBeNull();
  });

  it('imports legacy V0 tab resolvers only from fallback modules', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const sourceFile = parseSource(file);
      if (!sourceFile) continue;

      ts.forEachChild(sourceFile, function visit(node) {
        if (ts.isImportDeclaration(node)) {
          for (const name of importedNames(node)) {
            if (
              V0_RESOLVERS.has(name) &&
              !V0_RESOLVER_ALLOWED_FILES.has(file)
            ) {
              offenders.push(`${file}: imports ${name}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('keeps tab literals inside the TabKey union', () => {
    if (!contractSource) throw new Error('navigation-contract.ts not found');
    const tabKeys = tabKeyValues(contractSource);
    const offenders: string[] = [];
    const tabLikeNames = new Set([
      'home',
      'own-learning',
      'library',
      'recaps',
      'progress',
      'more',
    ]);

    for (const value of stringLiteralValues(contractSource)) {
      if (tabLikeNames.has(value) && !tabKeys.has(value)) {
        offenders.push(value);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('declares every Tabs.Screen name as a RouteKey or tab', () => {
    if (!contractSource) throw new Error('navigation-contract.ts not found');
    const routeKeys = routeKeyValues(contractSource);
    const tabKeys = tabKeyValues(contractSource);
    const offenders: string[] = [];

    for (const file of files) {
      const sourceFile = parseSource(file);
      if (!sourceFile) continue;

      ts.forEachChild(sourceFile, function visit(node) {
        if (
          ts.isJsxSelfClosingElement(node) &&
          ts.isPropertyAccessExpression(node.tagName) &&
          node.tagName.expression.getText(sourceFile) === 'Tabs' &&
          node.tagName.name.text === 'Screen'
        ) {
          const nameAttribute = node.attributes.properties.find(
            (property): property is ts.JsxAttribute =>
              ts.isJsxAttribute(property) &&
              ts.isIdentifier(property.name) &&
              property.name.text === 'name',
          );
          const initializer = nameAttribute?.initializer;
          if (
            initializer &&
            ts.isStringLiteral(initializer) &&
            !routeKeys.has(initializer.text) &&
            !tabKeys.has(initializer.text)
          ) {
            offenders.push(`${file}: ${initializer.text}`);
          }
        }

        ts.forEachChild(node, visit);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('keeps diagnostic branching out of consumer code', () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (DIAGNOSTIC_ALLOWED_FILES.has(file)) continue;
      const sourceFile = parseSource(file);
      if (!sourceFile) continue;

      ts.forEachChild(sourceFile, function visit(node) {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === 'diagnostic'
        ) {
          offenders.push(`${file}: ${node.getText(sourceFile)}`);
        }
        ts.forEachChild(node, visit);
      });
    }

    expect(offenders).toEqual([]);
  });
});
