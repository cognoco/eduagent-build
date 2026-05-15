/**
 * Ratchet test for `inngest.send(...)` call sites.
 *
 * Every dispatch site must be one of:
 *   1. Wrapped in `safeSend(() => inngest.send({...}), 'surface', ...)`
 *      (preferred — failures captured in Sentry, never throw).
 *   2. Annotated with a `// core-send: <reason>` comment on the line
 *      immediately above the call (intentional CORE dispatch — must throw
 *      on failure, e.g. user-initiated retries, billing alerts).
 *   3. Inside a `try { ... } catch { ... }` block (grandfathered legacy
 *      pattern — explicit handling visible at the call site; new sites
 *      should prefer option 1 unless the catch has semantic logic like a
 *      status return or DB rollback).
 *
 * Forward-only ratchet: new bare dispatches fail CI.
 *
 * See:
 *   docs/superpowers/plans/2026-05-14-telemetry-sweep-and-route-shrink.md
 *   apps/api/src/services/safe-non-core.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

interface DispatchSite {
  file: string; // repo-relative
  line: number; // 1-based
  status: 'safesend' | 'core-send' | 'try-catch' | 'bare';
  snippet: string;
}

const EXCLUDED_BASENAMES = new Set([
  // The helper itself.
  'safe-non-core.ts',
  // Inngest functions are receivers, not callers — their references to send
  // are part of self-test code or comments.
  'exchange-empty-reply-fallback.ts',
]);

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
  if (EXCLUDED_BASENAMES.has(path.basename(absPath))) return false;
  // Skip eval harness and tests scaffolding.
  if (rel.startsWith('apps/api/eval-llm/')) return false;
  return true;
}

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkDir(full, out);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      if (shouldScanFile(full)) out.push(full);
    }
  }
}

/**
 * Walk up the AST from `node` looking for a syntactic ancestor that is the
 * arrow/function body of a `safeSend(...)` CallExpression argument.
 */
function isInsideSafeSendLambda(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const parent = cur.parent;
      if (
        parent &&
        ts.isCallExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        parent.expression.text === 'safeSend'
      ) {
        return true;
      }
    }
    cur = cur.parent;
  }
  return false;
}

function isInsideTryBlock(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isTryStatement(cur)) return true;
    // Stop at function boundaries — a try in an outer function doesn't count.
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      // Keep walking — the try might be in an outer function body containing
      // this one if it's an immediately-invoked lambda. But for the typical
      // shape we want (try inside a route handler containing the call), the
      // call's enclosing function IS the handler, and the try-statement
      // sits inside that function. So we DO continue past function boundaries
      // — but only the nearest enclosing try counts.
    }
    cur = cur.parent;
  }
  return false;
}

function hasCoreSendCommentAbove(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): boolean {
  // Look for a `// core-send: <reason>` comment in the contiguous block of
  // // comments immediately above the call site. Line-based scan (not AST
  // trivia) — AST leading-comment lookup gets confused when the call is the
  // inner expression of `await ...` split across multiple lines.
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const lineStarts = sourceFile.getLineStarts();
  const text = sourceFile.text;
  // Scan up from line-1 as long as the line (trimmed) starts with `//`.
  for (let i = line - 1; i >= 0; i -= 1) {
    const start = lineStarts[i] ?? 0;
    const end = lineStarts[i + 1] ?? text.length;
    const lineText = text.slice(start, end).trim();
    if (lineText.length === 0) {
      // Allow zero blank lines between the comment block and the call —
      // ratchet for a contiguous block only. Bail if blank encountered.
      return false;
    }
    if (!lineText.startsWith('//')) return false;
    if (/^\/\/\s*core-send:/.test(lineText)) return true;
  }
  return false;
}

function classifySite(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): DispatchSite['status'] {
  if (isInsideSafeSendLambda(call)) return 'safesend';
  if (hasCoreSendCommentAbove(sourceFile, call)) return 'core-send';
  if (isInsideTryBlock(call)) return 'try-catch';
  return 'bare';
}

function scanFile(absPath: string): DispatchSite[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
  const sites: DispatchSite[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'inngest' &&
      node.expression.name.text === 'send'
    ) {
      const status = classifySite(sourceFile, node);
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      const lineStart = sourceFile.getLineStarts()[line] ?? 0;
      const nextLine =
        sourceFile.getLineStarts()[line + 1] ?? sourceFile.text.length;
      const snippet = sourceFile.text.slice(lineStart, nextLine).trimEnd();
      sites.push({
        file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
        line: line + 1,
        status,
        snippet,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

describe('safe-non-core ratchet', () => {
  const files: string[] = [];
  walkDir(API_SRC, files);

  const allSites: DispatchSite[] = [];
  for (const f of files) allSites.push(...scanFile(f));

  it('scans at least one file (sanity check)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds at least one inngest.send call (sanity check)', () => {
    // If this fails, the scanner is broken — there must be dispatches in
    // routes/services on any non-trivial state of the codebase.
    expect(allSites.length).toBeGreaterThan(0);
  });

  it('no bare inngest.send sites — every dispatch is wrapped, allowlisted, or in try/catch', () => {
    const bare = allSites.filter((s) => s.status === 'bare');
    if (bare.length > 0) {
      const lines = bare
        .map(
          (s) => `  ${s.file}:${s.line}  →  ${s.snippet.trim().slice(0, 100)}`,
        )
        .join('\n');
      throw new Error(
        `Found ${bare.length} bare inngest.send call(s). Wrap in safeSend(), add a "// core-send: <reason>" comment if dispatch failure must throw, or wrap in try/catch with explicit handling.\n${lines}`,
      );
    }
    expect(bare).toEqual([]);
  });

  // Self-check: prove the scanner detects a synthetic violation. Without this,
  // a refactor that breaks the AST walk would silently always-pass.
  it('self-check: detects a synthetic bare inngest.send', () => {
    const synthetic = `
      import { inngest } from './client';
      export async function bad() {
        // no safeSend, no comment, no try/catch
        await inngest.send({ name: 'app/synthetic', data: {} });
      }
    `;
    const sf = ts.createSourceFile(
      'synthetic.ts',
      synthetic,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let bareCount = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'inngest' &&
        node.expression.name.text === 'send' &&
        classifySite(sf, node) === 'bare'
      ) {
        bareCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(1);
  });

  // Self-check: scanner recognises a safeSend wrapper.
  it('self-check: ignores inngest.send inside safeSend lambda', () => {
    const ok = `
      import { inngest } from './client';
      import { safeSend } from './safe-non-core';
      export async function good() {
        await safeSend(
          () => inngest.send({ name: 'app/ok', data: {} }),
          'ok',
          {},
        );
      }
    `;
    const sf = ts.createSourceFile(
      'ok.ts',
      ok,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let bareCount = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'inngest' &&
        node.expression.name.text === 'send' &&
        classifySite(sf, node) === 'bare'
      ) {
        bareCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(0);
  });

  // Self-check: scanner recognises a core-send comment.
  it('self-check: ignores inngest.send with core-send allowlist comment', () => {
    const ok = `
      import { inngest } from './client';
      export async function core() {
        // core-send: payment-failed alert
        await inngest.send({ name: 'app/payment.failed', data: {} });
      }
    `;
    const sf = ts.createSourceFile(
      'core.ts',
      ok,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let bareCount = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'inngest' &&
        node.expression.name.text === 'send' &&
        classifySite(sf, node) === 'bare'
      ) {
        bareCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(0);
  });
});
