/**
 * Forward-only ratchet for money/access month arithmetic (WI-1991).
 *
 * Date#setMonth normalizes a day that does not exist in the target month into
 * the following month (for example, January 31 + one month becomes March 3).
 * The ratified billing and identity surfaces must route month additions through
 * addMonthsClamped(). That helper's internal Date#setUTCMonth call is the sole
 * permitted setter in scope.
 *
 * This syntactic guard detects direct setter invocations, including
 * parenthesized access, string-literal element access, and direct call/apply.
 * It intentionally does not claim type-aware detection of aliased functions or
 * dynamically computed property names.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

const API_SRC = resolve(__dirname, '..', '..');
const CLAMPED_HELPER_FILE = 'services/billing/billing-shared.ts';
const MONTH_SETTERS = new Set(['setMonth', 'setUTCMonth']);
const GUARDED_DIRECTORY = resolve(API_SRC, 'services', 'billing');
const GUARDED_FILES = [
  resolve(API_SRC, 'services', 'identity-v2', 'identity-graph.ts'),
  resolve(API_SRC, 'inngest', 'functions', 'topup-expiry-reminder.ts'),
];

function isProductionSource(file: string): boolean {
  if (!/\.tsx?$/.test(file)) return false;
  return !(
    file.endsWith('.test.ts') ||
    file.endsWith('.test.tsx') ||
    file.endsWith('.integration.test.ts') ||
    file.endsWith('.guard.test.ts')
  );
}

function walkProductionSources(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkProductionSources(absolutePath, out);
    } else if (entry.isFile() && isProductionSource(absolutePath)) {
      out.push(absolutePath);
    }
  }
}

interface Violation {
  file: string;
  line: number;
  source: string;
}

interface StaticMemberAccess {
  receiver: ts.Expression;
  name: string;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getStaticMemberAccess(
  expression: ts.Expression,
): StaticMemberAccess | null {
  const unwrapped = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped)) {
    return { receiver: unwrapped.expression, name: unwrapped.name.text };
  }

  if (ts.isElementAccessExpression(unwrapped) && unwrapped.argumentExpression) {
    const argument = unwrapExpression(unwrapped.argumentExpression);
    if (ts.isStringLiteralLike(argument)) {
      return { receiver: unwrapped.expression, name: argument.text };
    }
  }

  return null;
}

function getInvokedMonthSetter(call: ts.CallExpression): string | null {
  const invokedMember = getStaticMemberAccess(call.expression);
  if (!invokedMember) return null;
  if (MONTH_SETTERS.has(invokedMember.name)) return invokedMember.name;

  if (invokedMember.name === 'call' || invokedMember.name === 'apply') {
    const targetMember = getStaticMemberAccess(invokedMember.receiver);
    if (targetMember && MONTH_SETTERS.has(targetMember.name)) {
      return targetMember.name;
    }
  }

  return null;
}

function isInsideClampedHelper(node: ts.Node, file: string): boolean {
  if (file !== CLAMPED_HELPER_FILE) return false;

  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) {
      return current.name?.text === 'addMonthsClamped';
    }
    current = current.parent;
  }

  return false;
}

function findMonthSetterCallsInSource(
  source: string,
  file: string,
): Violation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const setter = getInvokedMonthSetter(node);
      const allowed =
        setter === 'setUTCMonth' && isInsideClampedHelper(node, file);

      if (setter && !allowed) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push({
          file,
          line: line + 1,
          source: node.getText(sourceFile),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function findMonthSetterCalls(): Violation[] {
  const files: string[] = [];
  walkProductionSources(GUARDED_DIRECTORY, files);
  files.push(...GUARDED_FILES.filter(isProductionSource));

  return files.flatMap((file) => {
    const relativeFile = relative(API_SRC, file).replace(/\\/g, '/');
    return findMonthSetterCallsInSource(
      readFileSync(file, 'utf8'),
      relativeFile,
    );
  });
}

describe('billing month-arithmetic guard (WI-1991)', () => {
  it('allows no production month setters outside addMonthsClamped', () => {
    expect(findMonthSetterCalls()).toEqual([]);
  });

  it('scans only the ratified money/access surfaces', () => {
    const files: string[] = [];
    walkProductionSources(GUARDED_DIRECTORY, files);
    files.push(...GUARDED_FILES.filter(isProductionSource));
    const relativeFiles = files.map((file) =>
      relative(API_SRC, file).replace(/\\/g, '/'),
    );

    expect(relativeFiles).toContain(CLAMPED_HELPER_FILE);
    expect(relativeFiles).toContain('services/identity-v2/identity-graph.ts');
    expect(relativeFiles).toContain(
      'inngest/functions/topup-expiry-reminder.ts',
    );
    expect(relativeFiles).not.toContain('services/snapshot-aggregation.ts');
  });

  it('detects both local and UTC month setters', () => {
    expect(
      findMonthSetterCallsInSource(
        'date.setMonth(date.getMonth() + 1);\ndate.setUTCMonth(1);',
        'fixture.ts',
      ),
    ).toEqual([
      {
        file: 'fixture.ts',
        line: 1,
        source: 'date.setMonth(date.getMonth() + 1)',
      },
      {
        file: 'fixture.ts',
        line: 2,
        source: 'date.setUTCMonth(1)',
      },
    ]);
  });

  it.each([
    ['parenthesized property access', '(date.setMonth)(1)'],
    ['string-literal element access', "date['setUTCMonth'](1)"],
    ['Date.prototype call invocation', 'Date.prototype.setMonth.call(date, 1)'],
    [
      'Date.prototype apply invocation',
      'Date.prototype.setMonth.apply(date, [1])',
    ],
  ])('detects %s', (_label, source) => {
    expect(findMonthSetterCallsInSource(source, 'fixture.ts')).toEqual([
      expect.objectContaining({ file: 'fixture.ts', line: 1 }),
    ]);
  });

  it('does not treat strings or comments as month-setter calls', () => {
    expect(
      findMonthSetterCallsInSource(
        "// date.setMonth(1)\nconst example = 'date.setUTCMonth(1)';",
        'fixture.ts',
      ),
    ).toEqual([]);
  });

  it("allows only addMonthsClamped's internal UTC setter", () => {
    const helperSource = `
      export function addMonthsClamped(date: Date, months: number): Date {
        const result = new Date(date);
        result.setUTCMonth(result.getUTCMonth() + months);
        return result;
      }
    `;

    expect(
      findMonthSetterCallsInSource(helperSource, CLAMPED_HELPER_FILE),
    ).toEqual([]);
    expect(findMonthSetterCallsInSource(helperSource, 'other-file.ts')).toEqual(
      [
        expect.objectContaining({
          source: expect.stringContaining('setUTCMonth'),
        }),
      ],
    );
  });
});
