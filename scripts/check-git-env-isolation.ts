#!/usr/bin/env tsx
/**
 * check-git-env-isolation.ts — WI-1345 (round-3 structural guard)
 *
 * A runtime test cannot reliably red/green-prove that an individual
 * spawnSync/execFileSync call carries a stripped env: mutating
 * `process.env.GIT_DIR` mid-test to simulate husky's export does NOT
 * propagate to a call that OMITS its `env` option, under this repo's
 * jest/ts-jest setup (an explicit `env: {...process.env}` sees the
 * mutation; an omitted `env` key does not — verified empirically during
 * WI-1345's round-3 fix). So a single-site env-drop — exactly how the
 * original P1 (fleet-wide worktree clobber) entered — can silently regress
 * without any runtime test catching it.
 *
 * This is the structural backstop: an AST walk asserting every
 * git-touching `spawnSync`/`execFileSync` call in the WI-1345-swept files
 * carries an `env` option built via that file's own local `childGitEnv()`
 * helper (each of the 3 files defines its own, not a shared import — see
 * each file's WI-1345 commit).
 *
 * SCOPE: exactly the 3 files below. Every spawnSync/execFileSync call
 * currently in these files is git-touching (git itself, or a wrapper — TSX
 * running a script that shells out to git, BASH running a script that
 * shells out to git) — verified by inspection at WI-1345 round 3. A future
 * unrelated spawn added to one of these files would need either its own
 * (harmless) `env: childGitEnv(...)` or an explicit ALLOWLIST entry
 * documented at the call site, same as the one exemption below.
 *
 * ALLOWLIST: `check-merge-invariant.test.ts`'s `rawGit()` helper is a
 * deliberately-independent verification helper (builds/inspects the
 * "ambient" fixture in tests) that constructs its own inline stripped env
 * by design, specifically so the verification doesn't rely on the same
 * (possibly buggy) `childGitEnv()` mechanism it's checking. Excluded by
 * enclosing-function name.
 *
 * USAGE
 *   tsx scripts/check-git-env-isolation.ts
 *
 * EXIT CODES
 *   0  every git-touching call site is compliant.
 *   1  one or more violations found; details printed to stdout.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

export const SWEPT_FILES = [
  'scripts/check-merge-invariant.test.ts',
  'scripts/husky-main-guard.test.ts',
  'scripts/check-change-class.test.ts',
];

const SPAWN_CALLEES = new Set(['spawnSync', 'execFileSync']);

// Enclosing-function names whose spawnSync/execFileSync calls are exempt —
// see the ALLOWLIST note above. Keyed by nothing but name (deliberately
// simple, matching the narrow, fully-audited scope of this check).
const ALLOWLISTED_ENCLOSING_FUNCTIONS = new Set(['rawGit']);

export type Violation = {
  file: string;
  line: number;
  content: string;
  reason: 'no-options-object' | 'no-env-key' | 'env-not-childGitEnv';
};

function getLineNumber(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

// Walks up from a call site to the nearest named function (declaration, or
// a function/arrow expression assigned to a named const/let/var).
function findEnclosingFunctionName(node: ts.Node): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) {
      return cur.name.text;
    }
    if (
      ts.isVariableDeclaration(cur) &&
      ts.isIdentifier(cur.name) &&
      cur.initializer &&
      (ts.isArrowFunction(cur.initializer) ||
        ts.isFunctionExpression(cur.initializer))
    ) {
      return cur.name.text;
    }
    cur = cur.parent;
  }
  return null;
}

function isChildGitEnvCall(expr: ts.Expression): boolean {
  return (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'childGitEnv'
  );
}

export function checkSource(file: string, src: string): Violation[] {
  const sourceFile = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      SPAWN_CALLEES.has(node.expression.text)
    ) {
      const enclosing = findEnclosingFunctionName(node);
      if (enclosing && ALLOWLISTED_ENCLOSING_FUNCTIONS.has(enclosing)) {
        ts.forEachChild(node, visit);
        return;
      }

      const line = getLineNumber(sourceFile, node.getStart(sourceFile));
      const content = node.getText(sourceFile).split('\n')[0] ?? '';

      // Options bag: the last argument that is an object literal.
      const optionsArg = [...node.arguments]
        .reverse()
        .find(ts.isObjectLiteralExpression);

      if (!optionsArg) {
        violations.push({ file, line, content, reason: 'no-options-object' });
      } else {
        const envProp = optionsArg.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'env',
        );
        if (!envProp) {
          violations.push({ file, line, content, reason: 'no-env-key' });
        } else if (!isChildGitEnvCall(envProp.initializer)) {
          violations.push({
            file,
            line,
            content,
            reason: 'env-not-childGitEnv',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function checkFiles(
  repoRoot: string,
  files: string[] = SWEPT_FILES,
): Violation[] {
  const all: Violation[] = [];
  for (const f of files) {
    const src = readFileSync(resolve(repoRoot, f), 'utf8');
    all.push(...checkSource(f, src));
  }
  return all;
}

function runCli(): void {
  const repoRoot = resolve(__dirname, '..');
  const violations = checkFiles(repoRoot);

  if (violations.length === 0) {
    process.stdout.write(
      '[OK] check-git-env-isolation: all git-touching spawnSync/execFileSync ' +
        'call sites in the WI-1345-swept files carry env: childGitEnv(...).\n',
    );
    process.exit(0);
  }

  process.stderr.write(
    '\nWI-1345 structural guard: git-touching spawnSync/execFileSync call ' +
      'missing env: childGitEnv(...).\n\n',
  );
  for (const v of violations) {
    process.stderr.write(
      `  ${v.file}:${v.line}  [${v.reason}]  ${v.content.trim()}\n`,
    );
  }
  process.stderr.write(
    '\nEvery git-touching spawnSync/execFileSync call in these 3 files must ' +
      'pass env: childGitEnv(...), so an ambient GIT_* var (e.g. a ' +
      'husky-exported GIT_DIR) can never redirect the call at a mkdtemp ' +
      'fixture repo instead of the ambient checkout.\n',
  );
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] &&
  /check-git-env-isolation(\.ts)?$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  runCli();
}
