import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// Forward-only ban on `client.<…> as unknown as { … }` casts.
//
// These casts hand-write the shape of a Hono RPC route instead of letting the
// `hc<AppType>` client infer it. That is dangerous: the cast asserts a route
// exists with a given method/shape, so the compiler can no longer catch a route
// that was never registered on the API. This exact pattern hid two missing
// `POST …/view` routes — the mobile mark-viewed calls compiled and then 404'd
// silently at runtime (see services/monthly-report.ts markMonthlyReportViewedForProfile).
//
// Hono RPC types hyphenated and nested dynamic-param segments fine via bracket
// notation (e.g. `client.settings['celebration-level'].$get`,
// `client.quiz.rounds[':id'].check.$post`). So the cast is never necessary —
// use direct typed access and let tsc verify the route. Baseline is 0: any new
// occurrence fails CI.
const BASELINE = 0;

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function mobileSources(): string[] {
  const out = execSync(
    'git ls-files --cached --others --exclude-standard "apps/mobile/src/*.ts" "apps/mobile/src/*.tsx" "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot(), encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !/\.test\.|\.guard\./.test(file));
}

function parse(file: string): ts.SourceFile | null {
  const abs = resolve(repoRoot(), file);
  if (!existsSync(abs)) return null;
  return ts.createSourceFile(
    file,
    readFileSync(abs, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// Walk a member-access chain down to its leftmost identifier.
function rootIdentifier(node: ts.Expression): string | null {
  let current: ts.Expression = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isElementAccessExpression(current)) {
      current = current.expression;
    } else if (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
    } else if (ts.isIdentifier(current)) {
      return current.text;
    } else {
      return null;
    }
  }
}

// Count `client.<…> as unknown as <T>` casts. The TS AST represents
// `expr as unknown as T` as an outer AsExpression whose `.expression` is an
// inner AsExpression (`expr as unknown`). We flag the inner cast when its
// source expression is a member chain rooted at the `client` identifier.
function rpcClientCasts(sourceFile: ts.SourceFile): string[] {
  const hits: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isAsExpression(node) &&
      node.type.kind === ts.SyntaxKind.UnknownKeyword &&
      rootIdentifier(node.expression) === 'client'
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      hits.push(
        `${sourceFile.fileName}:${line + 1} — ${node.expression
          .getText(sourceFile)
          .slice(0, 60)}`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return hits;
}

describe('rpc client cast ban', () => {
  const files = mobileSources();

  it('enumerates mobile source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('has no `client.* as unknown as` RPC-type-bypass casts', () => {
    const hits: string[] = [];
    for (const file of files) {
      const sourceFile = parse(file);
      if (!sourceFile) continue;
      hits.push(...rpcClientCasts(sourceFile));
    }

    if (hits.length > BASELINE) {
      throw new Error(
        `Found ${hits.length} \`client.* as unknown as\` RPC cast(s) (baseline ${BASELINE}).\n` +
          `Hono RPC types these routes directly — use \`client.foo['bar'][':id'].$get\` ` +
          `and let tsc verify the route exists. A hand-written cast hides missing routes ` +
          `(they 404 silently at runtime). Sites:\n${hits.join('\n')}`,
      );
    }
    expect(hits.length).toBe(BASELINE);
  });
});
