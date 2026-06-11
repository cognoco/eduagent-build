/**
 * [F-005] Forward-only registration-sync ratchet.
 *
 * F-005 finding: "Inngest function registration array is a silent manual sync
 * point (dispatch-but-never-run)."
 *
 * The problem: `apps/api/src/inngest/index.ts` exports a `functions` array that
 * is passed directly to `serve({ client: inngest, functions })` in
 * `routes/inngest.ts`. Inngest Cloud only sees and executes functions that
 * appear in that array — a function defined with `inngest.createFunction(...)`
 * but omitted from `functions[]` is silently dark: it receives no events, its
 * handlers never run, and no error is raised.
 *
 * This guard ensures that every `export const X = inngest.createFunction(...)`
 * in `apps/api/src/inngest/functions/` appears as an identifier in the
 * `functions` export array in `index.ts`.
 *
 * Opt-out: In the rare case a function is intentionally kept out of the serve
 * registry (e.g. a local test stub), add a comment
 *   // registration-exempt: <reason>
 * on the line immediately above the `export const X = inngest.createFunction`
 * declaration. Mirrors the `// orphan-allow:` pattern in the sibling guards.
 *
 * See:
 *   apps/api/src/routes/inngest.ts (serve handler — consumes functions[])
 *   apps/api/src/inngest/index.ts (function registry)
 *   apps/api/src/inngest/orphan-dispatcher.guard.test.ts (dispatch → handler)
 *   apps/api/src/inngest/orphan-handler.guard.test.ts (handler → dispatcher)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/inngest → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');
const INNGEST_FUNCTIONS_DIR = path.join(API_SRC, 'inngest', 'functions');
const INNGEST_INDEX = path.join(API_SRC, 'inngest', 'index.ts');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

function parseSourceFile(absPath: string): ts.SourceFile {
  const text = fs.readFileSync(absPath, 'utf8');
  return ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
}

/**
 * Check if a `// registration-exempt: <reason>` comment appears in the
 * contiguous comment block immediately above the given node. Mirrors the
 * `hasOrphanAllowCommentAbove` pattern from the sibling guard tests.
 */
function hasRegistrationExemptComment(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const lineStarts = sourceFile.getLineStarts();
  const text = sourceFile.text;
  for (let i = line - 1; i >= 0; i -= 1) {
    const start = lineStarts[i] ?? 0;
    const end = lineStarts[i + 1] ?? text.length;
    const lineText = text.slice(start, end).trim();
    if (lineText.length === 0) return false;
    if (!lineText.startsWith('//')) return false;
    if (/^\/\/\s*registration-exempt:/.test(lineText)) return true;
  }
  return false;
}

function isInngestCreateFunctionCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression)) return false;
  if (expr.expression.text !== 'inngest') return false;
  return expr.name.text === 'createFunction';
}

interface DefinedFunction {
  name: string;
  file: string; // repo-relative
  line: number; // 1-based
}

/**
 * Walk a function source file and collect every top-level
 * `export const X = inngest.createFunction(...)` binding.
 */
function scanFunctionFileForDefinitions(absPath: string): DefinedFunction[] {
  const sourceFile = parseSourceFile(absPath);
  const results: DefinedFunction[] = [];

  const visit = (node: ts.Node): void => {
    // Match: export const X = inngest.createFunction(...)
    if (
      ts.isVariableStatement(node) &&
      (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          isInngestCreateFunctionCall(decl.initializer)
        ) {
          if (hasRegistrationExemptComment(sourceFile, node)) continue;
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          results.push({
            name: decl.name.text,
            file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return results;
}

/**
 * Parse `index.ts` and collect all identifier names inside the
 * `export const functions = [...]` array literal.
 *
 * We navigate the AST: find the `VariableStatement` for `functions`, then
 * descend into the `ArrayLiteralExpression` and collect `Identifier` elements.
 */
function collectRegisteredFunctionNames(): Set<string> {
  const sourceFile = parseSourceFile(INNGEST_INDEX);
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === 'functions' &&
          decl.initializer &&
          ts.isArrayLiteralExpression(decl.initializer)
        ) {
          for (const el of decl.initializer.elements) {
            if (ts.isIdentifier(el)) {
              names.add(el.text);
            }
          }
          return; // found; stop searching
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function walkFunctionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFunctionFiles(abs));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (entry.name.endsWith('.integration.test.ts')) continue;
    if (entry.name.endsWith('.guard.test.ts')) continue;
    // Skip the test harness helper.
    if (entry.name === '_test-harness.ts') continue;
    out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registration-sync ratchet [F-005]', () => {
  const functionFiles = walkFunctionFiles(INNGEST_FUNCTIONS_DIR);

  const allDefined: DefinedFunction[] = [];
  for (const f of functionFiles) {
    for (const d of scanFunctionFileForDefinitions(f)) allDefined.push(d);
  }

  const registered = collectRegisteredFunctionNames();

  it('scans at least 20 function source files (sanity check)', () => {
    expect(functionFiles.length).toBeGreaterThan(20);
  });

  it('finds at least 20 defined createFunction exports (sanity check)', () => {
    expect(allDefined.length).toBeGreaterThan(20);
  });

  it('functions[] in index.ts contains at least 20 identifiers (sanity check)', () => {
    expect(registered.size).toBeGreaterThan(20);
  });

  it('every defined inngest.createFunction export is in the functions[] serve-registry', () => {
    const missing = allDefined.filter((d) => !registered.has(d.name));
    if (missing.length > 0) {
      const lines = missing
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => `  ${d.name}\n    defined at ${d.file}:${d.line}`);
      throw new Error(
        `Found ${missing.length} defined Inngest function(s) NOT in the functions[] serve-registry (index.ts).\n` +
          `These functions will never receive events from Inngest Cloud — they are silently dark.\n` +
          `Fix by adding each name to the \`functions\` array in apps/api/src/inngest/index.ts,\n` +
          `OR add \`// registration-exempt: <reason>\` above the \`export const X = inngest.createFunction\` ` +
          `declaration if the omission is intentional.\n\n` +
          `${lines.join('\n')}`,
      );
    }
    expect(missing).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Self-checks — verify scanner and registry collector work correctly.
  // Without these, an AST refactor breaking the walk would silently pass.
  // -------------------------------------------------------------------------

  function parseSynthetic(text: string, name = 'synthetic.ts'): ts.SourceFile {
    return ts.createSourceFile(
      name,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
  }

  function collectDefinitionsFromSynthetic(sf: ts.SourceFile): string[] {
    const names: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableStatement(node) &&
        (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
          false)
      ) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            ts.isCallExpression(decl.initializer) &&
            isInngestCreateFunctionCall(decl.initializer)
          ) {
            if (!hasRegistrationExemptComment(sf, node)) {
              names.push(decl.name.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
  }

  function collectRegisteredFromSynthetic(sf: ts.SourceFile): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === 'functions' &&
            decl.initializer &&
            ts.isArrayLiteralExpression(decl.initializer)
          ) {
            for (const el of decl.initializer.elements) {
              if (ts.isIdentifier(el)) names.add(el.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
  }

  it('self-check: detects a defined function', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const myFn = inngest.createFunction(
        { id: 'my-fn' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    expect(collectDefinitionsFromSynthetic(sf)).toContain('myFn');
  });

  it('self-check: ignores non-exported createFunction (no export keyword)', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      const myFn = inngest.createFunction(
        { id: 'my-fn' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    expect(collectDefinitionsFromSynthetic(sf)).not.toContain('myFn');
  });

  it('self-check: registration-exempt comment suppresses detection', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      // registration-exempt: test stub only
      export const myFn = inngest.createFunction(
        { id: 'my-fn' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    expect(collectDefinitionsFromSynthetic(sf)).not.toContain('myFn');
  });

  it('self-check: extracts identifiers from functions[] array', () => {
    const sf = parseSynthetic(`
      export const functions = [
        myFn,
        anotherFn,
        thirdFn,
      ];
    `);
    const names = collectRegisteredFromSynthetic(sf);
    expect(names.has('myFn')).toBe(true);
    expect(names.has('anotherFn')).toBe(true);
    expect(names.has('thirdFn')).toBe(true);
  });

  it('self-check: detects a missing registration (defined but not in array)', () => {
    const definedSf = parseSynthetic(`
      import { inngest } from './client';
      export const myFn = inngest.createFunction(
        { id: 'my-fn' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    const indexSf = parseSynthetic(`
      export const functions = [otherFn];
    `);
    const defined = collectDefinitionsFromSynthetic(definedSf);
    const registered = collectRegisteredFromSynthetic(indexSf);
    const missing = defined.filter((name) => !registered.has(name));
    expect(missing).toContain('myFn');
  });
});
