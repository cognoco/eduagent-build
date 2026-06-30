/**
 * WI-767 guard: mentor_activity_ledger is derive-on-read state.
 *
 * Ledger rows store only identity/kind/params/seen state. Display fields such
 * as templateKey and visibility are resolved by /now at read time, so test
 * fixtures must not keep writing the removed table columns.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'apps/api/src'),
  path.join(REPO_ROOT, 'tests'),
];
const FORBIDDEN_LEDGER_FIELDS = new Set(['templateKey', 'visibility']);

type Violation = {
  file: string;
  line: number;
  field: string;
};

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
  return rel.startsWith('apps/api/src/') || rel.startsWith('tests/');
}

function walkDir(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === '.tmp' ||
      entry.name === '.worktrees'
    ) {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, out);
    } else if (entry.isFile() && shouldScanFile(full)) {
      out.push(full);
    }
  }
}

function isMentorActivityLedgerValuesCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'values') return false;

  const insertCall = node.expression.expression;
  if (!ts.isCallExpression(insertCall)) return false;
  if (!ts.isPropertyAccessExpression(insertCall.expression)) return false;
  if (insertCall.expression.name.text !== 'insert') return false;

  const tableArg = insertCall.arguments[0];
  return tableArg?.getText(sourceFile) === 'mentorActivityLedger';
}

function directLedgerValueObjects(
  arg: ts.Expression,
): ts.ObjectLiteralExpression[] {
  if (ts.isObjectLiteralExpression(arg)) return [arg];
  if (!ts.isArrayLiteralExpression(arg)) return [];

  return arg.elements.filter(ts.isObjectLiteralExpression);
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function scanFile(absPath: string): {
  insertSites: number;
  violations: Violation[];
} {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  const sourceText = fs.readFileSync(absPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const violations: Violation[] = [];
  let insertSites = 0;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      isMentorActivityLedgerValuesCall(node, sourceFile)
    ) {
      insertSites += 1;

      for (const arg of node.arguments) {
        for (const valueObject of directLedgerValueObjects(arg)) {
          for (const property of valueObject.properties) {
            if (!ts.isPropertyAssignment(property)) continue;

            const field = propertyNameText(property.name);
            if (!field || !FORBIDDEN_LEDGER_FIELDS.has(field)) continue;

            const location = sourceFile.getLineAndCharacterOfPosition(
              property.name.getStart(sourceFile),
            );
            violations.push({
              file: rel,
              line: location.line + 1,
              field,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { insertSites, violations };
}

describe('mentor_activity_ledger fixture guard', () => {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walkDir(root, files);

  const results = files.map(scanFile);
  const insertSiteCount = results.reduce(
    (total, result) => total + result.insertSites,
    0,
  );
  const violations = results.flatMap((result) => result.violations);

  it('scans direct mentorActivityLedger insert fixtures', () => {
    expect(insertSiteCount).toBeGreaterThan(0);
  });

  it('does not write removed derive-on-read ledger fields', () => {
    expect(violations).toEqual([]);
  });
});
