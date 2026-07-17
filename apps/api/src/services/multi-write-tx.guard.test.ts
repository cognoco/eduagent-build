/**
 * Forward-only guard: exported functions in the 4 multi-write service modules
 * must not introduce new bare multi-write sequences outside db.transaction().
 *
 * Rule: any EXPORTED FunctionDeclaration in the target files that calls
 * .insert(), .update(), or .delete() two or more times MUST have all those
 * write calls inside a db.transaction() callback (i.e., inside an arrow or
 * function expression that is a direct argument to a foo.transaction(…) call).
 * A single write never needs a transaction; the rule applies only when a
 * function coordinates two or more writes that must land atomically.
 *
 * Private helper functions (non-exported) that receive a tx-scoped db and call
 * multiple writes on it are intentionally excluded — their callers are
 * responsible for wrapping the whole sequence in a transaction (e.g.
 * `cascadeUndoCreatedAncestors` in family-bridge.ts, called from within
 * `undoCloneFromChild`'s transaction callback).
 *
 * [WI-1193] The same tx-participant shape can need to be EXPORTED — a second
 * caller in a different file wants to reuse the helper rather than duplicate
 * its writes. Exported-ness doesn't change the invariant: the function still
 * receives an already-open `tx` and still relies on ITS CALLER to wrap the
 * whole sequence (never opens its own `.transaction()`). `EXEMPT_TX_PARTICIPANTS`
 * below names these by (file, function) — narrowly, not a blanket allowance —
 * so the guard keeps catching a genuine top-level writer that forgets
 * `db.transaction()` entirely.
 *
 * Forward-only ratchet: adding a new exported function with 2+ bare writes to
 * any of the four target files will fail CI before it lands, unless it is
 * added to `EXEMPT_TX_PARTICIPANTS` with the same justification as above.
 *
 * Sites guarded (wrapped by WI-1060):
 *   - executeDeletionV2         apps/api/src/services/identity-v2/deletion-v2.ts
 *                               (legacy deletion.ts whole-removed in WI-1364;
 *                               the multi-write deletion invariant now lives in
 *                               the executeDeletionV2 family of the v2 twin)
 *   - initiateLink              apps/api/src/services/linking-ceremony.ts
 *   - acceptLink                apps/api/src/services/linking-ceremony.ts
 *   - undoCloneFromChild        apps/api/src/services/family-bridge.ts
 *   - persistChallengeRoundReviewTargets  (private — excluded by design)
 *                               apps/api/src/services/session/session-exchange.ts
 *   - rehomeGrantsTx            (exported tx-participant — see
 *                               EXEMPT_TX_PARTICIPANTS below [WI-1193])
 *                               apps/api/src/services/identity-v2/deletion-v2.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const TARGET_FILES = [
  'apps/api/src/services/identity-v2/deletion-v2.ts',
  'apps/api/src/services/linking-ceremony.ts',
  'apps/api/src/services/family-bridge.ts',
  'apps/api/src/services/session/session-exchange.ts',
].map((f) => path.join(REPO_ROOT, f.split('/').join(path.sep)));

/**
 * [WI-1193] Named, narrow exemptions for EXPORTED tx-participant helpers —
 * functions that receive an already-open `tx` and rely on their caller to
 * wrap the whole multi-write sequence (the same invariant the guard already
 * grants private helpers for free, see the file header). Each entry must be
 * individually justified here; this is not a blanket allowance.
 *
 *   - rehomeGrantsTx (deletion-v2.ts): re-homes a person's consent_grant rows
 *     to consent_receipt before a person delete. Originally private, used by
 *     4 functions in this file; exported for WI-1193 so
 *     consent-v2.ts's processConsentResponseV2 deny branch can reuse it
 *     instead of duplicating the re-home logic a third time. Every call site
 *     — the 4 in this file and the 1 in consent-v2.ts — already runs inside
 *     its own caller's db.transaction(); rehomeGrantsTx itself never opens one.
 */
const EXEMPT_TX_PARTICIPANTS: ReadonlySet<string> = new Set([
  'apps/api/src/services/identity-v2/deletion-v2.ts::rehomeGrantsTx',
]);

/** Keyed on the exact (repo-relative file, function name) pair — narrow by construction. */
function isExemptTxParticipant(relFile: string, functionName: string): boolean {
  return EXEMPT_TX_PARTICIPANTS.has(`${relFile}::${functionName}`);
}

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

/**
 * Walk up the AST from `node`. Returns true if the node is syntactically
 * inside an arrow/function expression that is a direct argument to a
 * `.transaction(…)` call — i.e., a db.transaction() callback.
 *
 * Stops at the first arrow/function boundary:
 *   - If that boundary IS a transaction callback → true.
 *   - If it IS NOT → false (a transaction in an outer caller does not count).
 *
 * Also stops at FunctionDeclaration / MethodDeclaration boundaries.
 */
function isInsideTransactionCallback(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const parent = cur.parent;
      if (
        parent &&
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        parent.expression.name.text === 'transaction'
      ) {
        return true;
      }
      // This arrow/function is NOT a transaction callback — it is its own
      // function boundary. A transaction callback in an outer caller does not
      // shield writes inside this inner function.
      return false;
    }
    if (ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur)) {
      return false;
    }
    cur = cur.parent;
  }
  return false;
}

interface WriteCall {
  method: string; // 'insert' | 'update' | 'delete'
  line: number; // 1-based
}

interface Violation {
  file: string; // repo-relative path
  functionName: string;
  writes: WriteCall[];
}

/**
 * Collect write calls (.insert / .update / .delete) that appear directly in
 * the body of `func` and are NOT inside a transaction callback.
 *
 * Nested FunctionDeclarations (named inner functions) are excluded from the
 * walk — they have their own scope and their multi-write responsibility
 * belongs to them (if exported) or their caller (if private).
 */
function collectBareWrites(
  func: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): WriteCall[] {
  const bare: WriteCall[] = [];

  const visit = (node: ts.Node): void => {
    // Skip nested function declarations (separate scope).
    if (node !== func && ts.isFunctionDeclaration(node)) {
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['insert', 'update', 'delete'].includes(node.expression.name.text)
    ) {
      if (!isInsideTransactionCallback(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        bare.push({ method: node.expression.name.text, line: line + 1 });
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(func, visit);
  return bare;
}

function scanFile(absPath: string): Violation[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const violations: Violation[] = [];
  const relFile = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      statement.body
    ) {
      const name = statement.name?.text ?? '<anonymous>';
      const writes = collectBareWrites(statement, sourceFile);
      if (writes.length >= 2 && !isExemptTxParticipant(relFile, name)) {
        violations.push({ file: relFile, functionName: name, writes });
      }
    }
  }

  return violations;
}

describe('multi-write-tx guard — exported functions must wrap 2+ writes in db.transaction()', () => {
  const allViolations: Violation[] = [];

  for (const f of TARGET_FILES) {
    if (!fs.existsSync(f)) {
      throw new Error(`Target file not found: ${f}`);
    }
    allViolations.push(...scanFile(f));
  }

  it('scans all 4 target files (sanity check)', () => {
    expect(TARGET_FILES.every(fs.existsSync)).toBe(true);
    // Each target file should parse without throwing — ensured by scanFile above.
    expect(true).toBe(true);
  });

  it('no exported function has 2+ bare writes outside db.transaction()', () => {
    if (allViolations.length > 0) {
      const lines = allViolations
        .map((v) => {
          const writesStr = v.writes
            .map((w) => `    line ${w.line}: .${w.method}()`)
            .join('\n');
          return `  ${v.file} → ${v.functionName}():\n${writesStr}`;
        })
        .join('\n\n');
      throw new Error(
        `Found ${allViolations.length} exported function(s) with 2+ bare writes outside db.transaction().\n` +
          `Wrap the writes in db.transaction(async (tx) => { ... }) using the repo pattern:\n` +
          `  const txDb = tx as unknown as Database;\n\n` +
          `${lines}`,
      );
    }
    expect(allViolations).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Self-checks: prove the scanner actually detects violations and accepts
  // transacted functions. Without these, a broken AST walk would silently
  // always-pass.
  // ---------------------------------------------------------------------------

  it('self-check: detects an exported function with 2 bare writes outside db.transaction()', () => {
    const synthetic = `
      export async function bad(db: any) {
        await db.insert(tableA).values({ x: 1 });
        await db.update(tableB).set({ y: 2 }).where('1=1');
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
        ['insert', 'update', 'delete'].includes(node.expression.name.text) &&
        !isInsideTransactionCallback(node)
      ) {
        bareCount++;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(2);
  });

  it('self-check: accepts an exported function whose 2 writes are inside db.transaction()', () => {
    const ok = `
      export async function good(db: any) {
        await db.transaction(async (tx: any) => {
          await tx.insert(tableA).values({ x: 1 });
          await tx.delete(tableB).where('1=1');
        });
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
        ['insert', 'update', 'delete'].includes(node.expression.name.text) &&
        !isInsideTransactionCallback(node)
      ) {
        bareCount++;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(0);
  });

  // Repo pattern: `const txDb = tx as unknown as Database; txDb.insert(...)`.
  // The scanner must correctly identify txDb writes inside db.transaction() as
  // transacted even though the receiver variable name is not `tx`.
  it('self-check: txDb.insert() inside db.transaction() is not counted as a bare write', () => {
    const usingTxDb = `
      export async function usingTxVar(db: any) {
        await db.transaction(async (tx: any) => {
          const txDb = tx;
          await txDb.insert(tableA).values({ x: 1 });
          await txDb.delete(tableB).where('1=1');
        });
      }
    `;
    const sf = ts.createSourceFile(
      'txDb.ts',
      usingTxDb,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    let bareCount = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ['insert', 'update', 'delete'].includes(node.expression.name.text) &&
        !isInsideTransactionCallback(node)
      ) {
        bareCount++;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(bareCount).toBe(0);
  });

  // [WI-1193] Proves EXEMPT_TX_PARTICIPANTS is narrow-by-construction: it
  // matches on the EXACT (file, function name) pair, not just a bare name or
  // a whole file — a differently-named exported function with 2+ bare writes
  // in the SAME file, or the exempted name in a DIFFERENT file, must still be
  // caught. Without this, a careless broadening (e.g. matching by name only)
  // could silently exempt a genuine future top-level-writer violation.
  it('self-check: the tx-participant exemption is scoped to the exact (file, function) pair, not by name alone', () => {
    const deletionV2Rel = 'apps/api/src/services/identity-v2/deletion-v2.ts';
    expect(isExemptTxParticipant(deletionV2Rel, 'rehomeGrantsTx')).toBe(true);
    expect(isExemptTxParticipant(deletionV2Rel, 'someOtherFunction')).toBe(
      false,
    );
    expect(
      isExemptTxParticipant(
        'apps/api/src/services/linking-ceremony.ts',
        'rehomeGrantsTx',
      ),
    ).toBe(false);
  });
});
