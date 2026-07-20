/**
 * [WI-2416] Forward-only ratchet for the read-side profile-authority check.
 *
 * WI-2416 fixed 8 confirmed read-side IDOR gaps (G1-G8: recaps/self,
 * learner-profile self-view + export-text, notes GETs, consent/my-status,
 * progress GETs, sessions/quiz GETs) by inserting
 * `await assertCanReadProfile(c, profileId)` immediately after the
 * header-resolved profileId is read in each handler. This guard is the
 * forward ratchet: it does NOT retroactively require every existing
 * profile-scoped GET route to call assertCanReadProfile (the AC scope is
 * G1-G8 only; other routes are either guarded by a different, pre-existing
 * authority primitive — e.g. assertOwnerAndParentAccess,
 * assertCallerIsAccountOwner — or are legitimately out-of-scope follow-ups,
 * e.g. G9-G32 from the same audit and the supporter-scope gaps G30/G32,
 * which need a different, not-yet-built supportership-edge primitive).
 *
 * Every current such route is grandfathered into
 * `profile-read-authority-baseline.json` (pattern:
 * scripts/i18n-jsx-literals-baseline.json). Only a NEW GET handler that
 * consumes the header-resolved profileId (via `withProfile(c)` or
 * `requireProfileId(c.get('profileId'))`) without calling
 * `assertCanReadProfile(...)`, and is not already in the baseline, fails
 * this guard — mirroring the safe-non-core.guard.test.ts ratchet shape.
 *
 * Baseline entries are keyed on {file, method, route} (the literal path
 * string registered with `.get(...)`) — not line number — so reformatting
 * does not churn the baseline.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ROUTES_DIR = path.join(REPO_ROOT, 'apps/api/src/routes');
const BASELINE_PATH = path.join(
  __dirname,
  'profile-read-authority-baseline.json',
);

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

export interface RouteSite {
  file: string; // repo-relative
  method: string; // hono verb, e.g. 'get'
  route: string; // literal path registered with .get(...)
}

export interface Violation extends RouteSite {
  line: number; // 1-based
}

const PROFILE_ID_CONSUMERS = new Set(['withProfile', 'requireProfileId']);
const GUARD_CALL = 'assertCanReadProfile';

function keyOf(e: RouteSite): string {
  return `${e.file}::${e.method}::${e.route}`;
}

export function loadBaseline(): RouteSite[] {
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  return JSON.parse(raw) as RouteSite[];
}

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/routes/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  return true;
}

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, out);
    } else if (entry.isFile() && shouldScanFile(full)) {
      out.push(full);
    }
  }
}

/**
 * Walk a handler function body for calls that (a) consume the header-resolved
 * profileId via `withProfile(...)` / `requireProfileId(...)`, and (b) call
 * `assertCanReadProfile(...)` anywhere in the same handler. Does not cross
 * into nested function declarations/expressions (a route handler that reads
 * profileId inside its OWN body is what matters; helper functions defined
 * elsewhere and merely called are out of this AST walk's reach by design —
 * same boundary rule as safe-non-core's try/catch walk).
 */
export function scanHandlerBody(handler: ts.Node): {
  consumesProfileId: boolean;
  hasGuard: boolean;
} {
  let consumesProfileId = false;
  let hasGuard = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (PROFILE_ID_CONSUMERS.has(name)) consumesProfileId = true;
        if (name === GUARD_CALL) hasGuard = true;
      } else if (
        // Bare `c.get('profileId')` (no requireProfileId/withProfile
        // wrapper) — e.g. consent.ts's /consent/my-status conditional read.
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0]!) &&
        node.arguments[0]!.text === 'profileId'
      ) {
        consumesProfileId = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(handler);
  return { consumesProfileId, hasGuard };
}

export function scanFile(absPath: string): Violation[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'get' &&
      node.arguments.length >= 2
    ) {
      const pathArg = node.arguments[0];
      const handlerArg = node.arguments[node.arguments.length - 1];
      if (
        pathArg &&
        ts.isStringLiteral(pathArg) &&
        pathArg.text.startsWith('/') &&
        handlerArg &&
        (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg))
      ) {
        const { consumesProfileId, hasGuard } = scanHandlerBody(handlerArg);
        if (consumesProfileId && !hasGuard) {
          // node.getStart() on a chained call (`X.get(...)`) returns the
          // start of the WHOLE chain (every `.get(...)` in one Hono chain
          // would report the same line). Use the `get` property-name token's
          // own position instead so the error message points at the actual
          // call site.
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.expression.name.getStart(sourceFile),
          );
          violations.push({
            file: rel,
            method: 'get',
            route: pathArg.text,
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

describe('profile-read-authority ratchet (WI-2416)', () => {
  const files: string[] = [];
  walkDir(ROUTES_DIR, files);

  const allViolations: Violation[] = [];
  for (const f of files) allViolations.push(...scanFile(f));

  const baseline = loadBaseline();
  const baselineKeys = new Set(baseline.map(keyOf));

  it('scans at least one route file (sanity check)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('finds at least one profileId-consuming GET handler (sanity check)', () => {
    // If this fails, the scanner is broken — there must be profile-scoped
    // GET handlers in routes/ on any non-trivial state of the codebase.
    const anyConsumer = files.some((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return (
        text.includes('withProfile(') || text.includes('requireProfileId(')
      );
    });
    expect(anyConsumer).toBe(true);
  });

  it('no NEW unguarded profile-scoped GET route — every current gap is baselined', () => {
    const newViolations = allViolations.filter(
      (v) => !baselineKeys.has(keyOf(v)),
    );
    if (newViolations.length > 0) {
      const lines = newViolations
        .map((v) => `  ${v.file}:${v.line}  GET ${v.route}`)
        .join('\n');
      throw new Error(
        `Found ${newViolations.length} new profile-scoped GET route(s) that consume the ` +
          `header-resolved profileId without calling assertCanReadProfile(...). Add the ` +
          `guard (see services/family-access.ts), or if this route is genuinely exempt ` +
          `(e.g. guarded by a different, pre-existing authority primitive), add it to ` +
          `profile-read-authority-baseline.json with a justification in the PR.\n${lines}`,
      );
    }
    expect(newViolations).toEqual([]);
  });

  it('baseline has no stale entries — every baselined route still exists and is still unguarded', () => {
    const currentKeys = new Set(allViolations.map(keyOf));
    const stale = baseline.filter((b) => !currentKeys.has(keyOf(b)));
    if (stale.length > 0) {
      const lines = stale.map((b) => `  ${b.file}  GET ${b.route}`).join('\n');
      throw new Error(
        `Found ${stale.length} stale baseline entrie(s) — the route no longer exists or is ` +
          `now guarded. Remove from profile-read-authority-baseline.json to keep the ` +
          `ratchet honest.\n${lines}`,
      );
    }
    expect(stale).toEqual([]);
  });

  // Self-check: prove the scanner detects a synthetic violation. Without this,
  // a refactor that breaks the AST walk would silently always-pass.
  it('self-check: detects a synthetic unguarded profileId-consuming GET route', () => {
    const synthetic = `
      export const bad = new Hono()
        .get('/synthetic/unguarded', async (c) => {
          const { db, profileId } = withProfile(c);
          return c.json({ profileId });
        });
    `;
    const sf = ts.createSourceFile(
      'synthetic.ts',
      synthetic,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let found = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        node.arguments.length >= 2
      ) {
        const pathArg = node.arguments[0];
        const handlerArg = node.arguments[node.arguments.length - 1];
        if (
          pathArg &&
          ts.isStringLiteral(pathArg) &&
          pathArg.text.startsWith('/') &&
          handlerArg &&
          (ts.isArrowFunction(handlerArg) ||
            ts.isFunctionExpression(handlerArg))
        ) {
          const { consumesProfileId, hasGuard } = scanHandlerBody(handlerArg);
          if (consumesProfileId && !hasGuard) found += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(found).toBe(1);
  });

  // Self-check: scanner recognises the guard call and does not flag a
  // properly-guarded route.
  it('self-check: ignores a GET route that calls assertCanReadProfile', () => {
    const ok = `
      export const good = new Hono()
        .get('/synthetic/guarded', async (c) => {
          const { db, profileId } = withProfile(c);
          await assertCanReadProfile(c, profileId);
          return c.json({ profileId });
        });
    `;
    const sf = ts.createSourceFile(
      'ok.ts',
      ok,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let found = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        node.arguments.length >= 2
      ) {
        const pathArg = node.arguments[0];
        const handlerArg = node.arguments[node.arguments.length - 1];
        if (
          pathArg &&
          ts.isStringLiteral(pathArg) &&
          pathArg.text.startsWith('/') &&
          handlerArg &&
          (ts.isArrowFunction(handlerArg) ||
            ts.isFunctionExpression(handlerArg))
        ) {
          const { consumesProfileId, hasGuard } = scanHandlerBody(handlerArg);
          if (consumesProfileId && !hasGuard) found += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(found).toBe(0);
  });

  // Self-check: a GET route that never touches profileId (e.g. a health
  // check) is not flagged.
  it('self-check: ignores a GET route that does not consume profileId', () => {
    const ok = `
      export const health = new Hono()
        .get('/health', async (c) => {
          return c.json({ ok: true });
        });
    `;
    const sf = ts.createSourceFile(
      'health.ts',
      ok,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let found = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        node.arguments.length >= 2
      ) {
        const pathArg = node.arguments[0];
        const handlerArg = node.arguments[node.arguments.length - 1];
        if (
          pathArg &&
          ts.isStringLiteral(pathArg) &&
          pathArg.text.startsWith('/') &&
          handlerArg &&
          (ts.isArrowFunction(handlerArg) ||
            ts.isFunctionExpression(handlerArg))
        ) {
          const { consumesProfileId, hasGuard } = scanHandlerBody(handlerArg);
          if (consumesProfileId && !hasGuard) found += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(found).toBe(0);
  });
});
