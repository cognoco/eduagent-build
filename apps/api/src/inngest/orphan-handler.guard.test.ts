/**
 * [F-INNGEST-INVERSE] Forward-only ratchet for INVERSE orphan Inngest handlers.
 *
 * This is the mirror image of orphan-dispatcher.guard.test.ts.
 *
 *   - orphan-dispatcher.guard.test.ts catches: an event DISPATCHED with no
 *     registered handler (work fired into the void).
 *   - THIS guard catches: an event HANDLER registered (and shipped in the
 *     serve registry) with no production code path that ever dispatches its
 *     triggering event — i.e. a `inngest.createFunction(opts, { event: 'X' })`
 *     where nothing in `apps/api/src/` ever sends `{ name: 'X' }`.
 *
 * A handler nobody triggers is the "wired-but-untriggered" anti-pattern called
 * out in AGENTS.md: "Wired-but-untriggered code is worse than dead code — it
 * creates false confidence." The function shows up in the serve registry, has
 * tests, and looks operational, but no event ever reaches it. The escalation /
 * observability / work it promises silently never runs.
 *
 * Real failure this guard was built for: `app/exchange.empty_reply_fallback`.
 * The handler (exchange-empty-reply-fallback.ts) documents that
 * `services/interview.ts` dispatched the event — but the interview flow was
 * refactored into `services/exchanges.ts:classifyExchangeOutcome`, which now
 * handles empty replies as a local SSE `fallback` frame "without parsing
 * Inngest event names". The dispatcher was dropped; the handler was left
 * registered, listening for an event that no longer exists. The
 * orphan-dispatcher guard cannot see this (it only walks dispatch → handler),
 * so this inverse guard exists to catch the other direction.
 *
 * SCOPE / FALSE-POSITIVE handling. A "dispatcher" is recognised when an event
 * name appears in production source under apps/api/src/ either:
 *   (a) as the `name:` field of an event-shaped object literal
 *       `{ name: '<event>', ... }` — covers inngest.send / step.sendEvent and
 *       the cron fan-out shape `targets.map((t) => ({ name: 'X', data: t }))`
 *       handed to a batch helper (sendBatchedEvents), or
 *   (b) as a bare string-literal argument matching the event-name shape
 *       `^(app|admin)/...` passed to a function — covers dispatch helpers like
 *       `sendMaintenanceBackfillOrError(c, surface, 'admin/...requested')` that
 *       forward the name into `inngest.send({ name: eventName })` dynamically.
 * This intentionally harvests more than just `inngest.send` / `step.sendEvent`
 * call arguments — the same spirit as the dispatcher guard drilling into `.map`
 * callbacks — so legitimate indirection does not read as a false orphan.
 *
 * Cron-only triggers (no `event:`) are never inverse-orphans — Inngest's
 * scheduler is the trigger.
 *
 * Opt-out: add the event name to KNOWN_PENDING_INVERSE_ORPHANS with a written
 * rationale (mirrors KNOWN_PENDING_ORPHANS in orphan-dispatcher.guard.test.ts).
 * Forward-only: ANY new handler whose event has no dispatcher fails CI.
 *
 * See:
 *   apps/api/src/inngest/orphan-dispatcher.guard.test.ts (mirror / template)
 *   apps/api/src/inngest/index.ts (function registry)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/inngest → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');
const INNGEST_FUNCTIONS_DIR = path.join(API_SRC, 'inngest', 'functions');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

/**
 * Built-in Inngest event prefixes. A handler may trigger on these (e.g.
 * `inngest/function.failed` onFailure handlers) without app code ever
 * dispatching them — the framework emits them. Never an inverse-orphan.
 */
const INNGEST_BUILTIN_PREFIXES = ['inngest/'];

/**
 * [F-INNGEST-INVERSE] Known-pending INVERSE orphans — handler registered with
 * a triggering event that NO production dispatcher emits. Forward-only: any new
 * inverse-orphan event not in this set fails CI immediately. DO NOT add to this
 * list without a written rationale + a tracked owner for re-wiring or removal.
 *
 * `app/person.graduated` is S5's consumer for the identity-owned graduation /
 * consent-gate-lifts event. The producer is intentionally owned by the
 * identity-foundation flip/convergence path, not this trust-layer slice; keep
 * the consumer registered so the S5 contract-restamp projection is ready when
 * that producer lands.
 *
 * The original entry — `app/exchange.empty_reply_fallback` —
 * was resolved in [BUG-796]: the dispatcher was re-wired via safeSend() from
 * the streaming fallback path in routes/sessions.ts (option (a) of the
 * resolution noted below), so the observability terminus
 * (inngest/functions/exchange-empty-reply-fallback.ts) now actually runs on
 * every empty-reply / unparseable-envelope fallback. With a live dispatcher the
 * `every event-triggered handler has a production dispatcher` test below passes
 * directly and the entry was removed from this set.
 */
const KNOWN_PENDING_INVERSE_ORPHANS = new Set<string>([
  'app/person.graduated',
  // OPQ-90 Option B authorizes one direct Inngest Event API dispatch for the
  // production fleet-failure proof. WI-1907 owns both that dispatch and
  // removal of this temporary probe immediately after evidence is captured.
  'app/ops.synthetic_fleet_failure_probe_requested',
]);

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
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

function parseSourceFile(absPath: string): ts.SourceFile {
  return ts.createSourceFile(
    absPath,
    fs.readFileSync(absPath, 'utf8'),
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
}

// ---------------------------------------------------------------------------
// String resolution — handles literals, `as const`, and same-file
// `const FOO = 'app/...'` identifier references (e.g. trial-expiry.ts uses a
// TRIAL_EXPIRY_FAILURE_EVENT constant for both the dispatch and the type).
// ---------------------------------------------------------------------------

function resolveStringConstantInFile(
  name: string,
  sourceFile: ts.SourceFile,
): string | null {
  let resolved: string | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        resolved = node.initializer.text;
      } else if (
        ts.isAsExpression(node.initializer) &&
        ts.isStringLiteral(node.initializer.expression)
      ) {
        resolved = node.initializer.expression.text;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return resolved;
}

function resolveEventString(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isAsExpression(node) && ts.isStringLiteral(node.expression)) {
    return node.expression.text;
  }
  if (ts.isIdentifier(node)) {
    return resolveStringConstantInFile(node.text, sourceFile);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registered triggers — every inngest.createFunction(opts, trigger, ...).
// ---------------------------------------------------------------------------

interface TriggerInfo {
  file: string;
  line: number;
  eventName: string | null; // null for cron-only triggers
}

function isInngestCreateFunctionCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression)) return false;
  if (expr.expression.text !== 'inngest') return false;
  return expr.name.text === 'createFunction';
}

function extractEventFromTriggerObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): string | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name)) continue;
    if (prop.name.text !== 'event') continue;
    return resolveEventString(prop.initializer, sourceFile);
  }
  return null;
}

function collectTriggersFromArg(
  arg: ts.Expression,
  sourceFile: ts.SourceFile,
): Array<{ eventName: string | null; node: ts.Node }> {
  const out: Array<{ eventName: string | null; node: ts.Node }> = [];
  if (ts.isObjectLiteralExpression(arg)) {
    out.push({
      eventName: extractEventFromTriggerObject(arg, sourceFile),
      node: arg,
    });
  } else if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      if (ts.isObjectLiteralExpression(el)) {
        out.push({
          eventName: extractEventFromTriggerObject(el, sourceFile),
          node: el,
        });
      }
    }
  }
  return out;
}

function scanFileForTriggers(absPath: string): TriggerInfo[] {
  const sourceFile = parseSourceFile(absPath);
  const triggers: TriggerInfo[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isInngestCreateFunctionCall(node)) {
      const trigArg = node.arguments[1];
      if (trigArg) {
        for (const t of collectTriggersFromArg(trigArg, sourceFile)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            t.node.getStart(sourceFile),
          );
          triggers.push({
            file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
            line: line + 1,
            eventName: t.eventName,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return triggers;
}

// ---------------------------------------------------------------------------
// Dispatched event names — harvest every event-shaped object literal
// `{ name: '<event>', ... }` anywhere in production source. This is broader
// than the dispatcher guard's call-site walk on purpose: cron fan-out builds
// its event batch as `targets.map((t) => ({ name: 'X', data: t }))` and hands
// it to a batch helper, so the dispatch "shape" lives in a `.map` body, not in
// a step.sendEvent argument. We must NOT count the trigger object of a
// createFunction (`{ event: 'X' }` has no `name:` so it is naturally excluded),
// and we exclude object literals that are the 2nd arg of createFunction.
// ---------------------------------------------------------------------------

function nodeIsCreateFunctionTrigger(node: ts.Node): boolean {
  // The trigger arg is `{ event: 'X' }` (no `name:`), so it is excluded by the
  // name-property requirement already. This guard is belt-and-suspenders for
  // any future object that might carry both — keep dispatch detection honest.
  const parent = node.parent;
  if (parent && ts.isCallExpression(parent) && parent.arguments[1] === node) {
    if (isInngestCreateFunctionCall(parent)) return true;
  }
  return false;
}

/**
 * Event-name shape. App/admin events are namespaced `app/...` or `admin/...`.
 * Used to recognise dispatch-helper string arguments (pattern (b)).
 */
const EVENT_NAME_RE = /^(app|admin)\//;

/** Is `node` the `event:` value of a createFunction trigger object? */
function isCreateFunctionTriggerEventValue(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent || !ts.isPropertyAssignment(parent)) return false;
  if (!ts.isIdentifier(parent.name) || parent.name.text !== 'event') {
    return false;
  }
  // parent (PropertyAssignment) -> ObjectLiteral -> (array elem ->) call arg
  const obj = parent.parent;
  if (obj && ts.isObjectLiteralExpression(obj)) {
    if (nodeIsCreateFunctionTrigger(obj)) return true;
    // array form: [{ event: 'a' }, { event: 'b' }]
    const arr = obj.parent;
    if (
      arr &&
      ts.isArrayLiteralExpression(arr) &&
      nodeIsCreateFunctionTrigger(arr)
    ) {
      return true;
    }
  }
  return false;
}

function collectDispatchedNamesFromFile(absPath: string): Set<string> {
  const sourceFile = parseSourceFile(absPath);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    // (a) `{ name: '<event>' }` object-literal shape.
    if (
      ts.isObjectLiteralExpression(node) &&
      !nodeIsCreateFunctionTrigger(node)
    ) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        let key: string | null = null;
        if (ts.isIdentifier(prop.name)) key = prop.name.text;
        else if (ts.isStringLiteral(prop.name)) key = prop.name.text;
        if (key !== 'name') continue;
        const resolved = resolveEventString(prop.initializer, sourceFile);
        if (resolved) names.add(resolved);
      }
    }
    // (b) Bare event-name string literal passed as a call argument, e.g.
    //   sendMaintenanceBackfillOrError(c, surface, 'admin/...requested')
    // which forwards `name: eventName` into inngest.send dynamically. Excludes
    // the createFunction `{ event: '...' }` trigger value so a handler never
    // counts as its own dispatcher.
    if (
      ts.isStringLiteral(node) &&
      EVENT_NAME_RE.test(node.text) &&
      !isCreateFunctionTriggerEventValue(node)
    ) {
      const parent = node.parent;
      if (parent && ts.isCallExpression(parent)) {
        // a direct call argument (not the callee)
        if (parent.arguments.some((a) => a === node)) {
          names.add(node.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inverse orphan handler ratchet', () => {
  const apiFiles: string[] = [];
  walkDir(API_SRC, apiFiles);

  const triggerFiles = apiFiles.filter((f) =>
    f.startsWith(INNGEST_FUNCTIONS_DIR + path.sep),
  );

  // Every event a registered handler triggers on (cron-only triggers excluded
  // — they have a null eventName).
  const handlerEvents: TriggerInfo[] = [];
  for (const f of triggerFiles) {
    for (const t of scanFileForTriggers(f)) {
      if (t.eventName) handlerEvents.push(t);
    }
  }

  // Every event name dispatched anywhere in production source.
  const dispatchedNames = new Set<string>();
  for (const f of apiFiles) {
    for (const n of collectDispatchedNamesFromFile(f)) dispatchedNames.add(n);
  }

  it('scans the inngest functions dir (sanity check)', () => {
    expect(triggerFiles.length).toBeGreaterThan(20);
  });

  it('finds event-triggered handlers (sanity check)', () => {
    expect(handlerEvents.length).toBeGreaterThan(10);
  });

  it('finds dispatched event names (sanity check)', () => {
    expect(dispatchedNames.size).toBeGreaterThan(10);
  });

  it('every event-triggered handler has a production dispatcher', () => {
    const orphans = handlerEvents.filter((t) => {
      const ev = t.eventName as string;
      if (dispatchedNames.has(ev)) return false;
      if (INNGEST_BUILTIN_PREFIXES.some((p) => ev.startsWith(p))) return false;
      if (KNOWN_PENDING_INVERSE_ORPHANS.has(ev)) return false;
      return true;
    });

    if (orphans.length > 0) {
      const lines = orphans
        .sort((a, b) => (a.eventName ?? '').localeCompare(b.eventName ?? ''))
        .map((o) => `  ${o.eventName}\n    handler: ${o.file}:${o.line}`);
      throw new Error(
        `Found ${orphans.length} inverse-orphan handler(s) — a registered Inngest ` +
          `function triggers on an event that NO production code dispatches ` +
          `(wired-but-untriggered, worse than dead code per AGENTS.md).\n` +
          `Fix by dispatching the event from production code (safeSend for ` +
          `non-core, bare inngest.send with // core-send: for core), OR remove ` +
          `the handler + its registration in apps/api/src/inngest/index.ts, OR ` +
          `— only with a written rationale + tracked owner — add the event to ` +
          `KNOWN_PENDING_INVERSE_ORPHANS.\n\n${lines.join('\n')}`,
      );
    }
    expect(orphans).toEqual([]);
  });

  it('KNOWN_PENDING_INVERSE_ORPHANS contains no stale entries (each is still a registered handler)', () => {
    const registeredEvents = new Set(handlerEvents.map((t) => t.eventName));
    const stale = [...KNOWN_PENDING_INVERSE_ORPHANS].filter(
      (name) => !registeredEvents.has(name),
    );
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_PENDING_INVERSE_ORPHANS has ${stale.length} entry/entries that are ` +
          `no longer registered handler triggers — remove them so the baseline ` +
          `shrinks:\n  ${stale.join('\n  ')}`,
      );
    }
    expect(stale).toEqual([]);
  });

  it('KNOWN_PENDING_INVERSE_ORPHANS contains no entries that have since gained a dispatcher', () => {
    const fixed = [...KNOWN_PENDING_INVERSE_ORPHANS].filter((name) =>
      dispatchedNames.has(name),
    );
    if (fixed.length > 0) {
      throw new Error(
        `KNOWN_PENDING_INVERSE_ORPHANS has ${fixed.length} entry/entries that now ` +
          `have a dispatcher — remove them so the ratchet keeps catching the ` +
          `rest:\n  ${fixed.join('\n  ')}`,
      );
    }
    expect(fixed).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Self-checks — verify the scanner detects synthetic violations. Without
  // these, an AST refactor that breaks the walk would silently pass.
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

  function triggersOf(sf: ts.SourceFile): Array<string | null> {
    const out: Array<string | null> = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isInngestCreateFunctionCall(node)) {
        const trigArg = node.arguments[1];
        if (trigArg) {
          for (const t of collectTriggersFromArg(trigArg, sf)) {
            out.push(t.eventName);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  function dispatchedOf(sf: ts.SourceFile): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (
        ts.isObjectLiteralExpression(node) &&
        !nodeIsCreateFunctionTrigger(node)
      ) {
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          let key: string | null = null;
          if (ts.isIdentifier(prop.name)) key = prop.name.text;
          else if (ts.isStringLiteral(prop.name)) key = prop.name.text;
          if (key !== 'name') continue;
          const resolved = resolveEventString(prop.initializer, sf);
          if (resolved) names.add(resolved);
        }
      }
      if (
        ts.isStringLiteral(node) &&
        EVENT_NAME_RE.test(node.text) &&
        !isCreateFunctionTriggerEventValue(node)
      ) {
        const parent = node.parent;
        if (
          parent &&
          ts.isCallExpression(parent) &&
          parent.arguments.some((a) => a === node)
        ) {
          names.add(node.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
  }

  it('self-check: extracts the event trigger from createFunction', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    expect(triggersOf(sf)).toContain('app/synth.example');
  });

  it('self-check: cron-only trigger yields a null event (never an inverse-orphan)', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        { cron: '0 3 * * *' },
        async () => {},
      );
    `);
    const triggers = triggersOf(sf);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every((e) => e === null)).toBe(true);
  });

  it('self-check: detects dispatch via inngest.send literal', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire() {
        await inngest.send({ name: 'app/synth.dispatched', data: {} });
      }
    `);
    expect(dispatchedOf(sf).has('app/synth.dispatched')).toBe(true);
  });

  it('self-check: detects dispatch built in a .map batch (cron fan-out shape)', () => {
    const sf = parseSynthetic(`
      export async function fire(targets: any[]) {
        const batch = targets.map((t) => ({
          name: 'app/synth.batched',
          data: t,
        }));
        return batch;
      }
    `);
    expect(dispatchedOf(sf).has('app/synth.batched')).toBe(true);
  });

  it('self-check: detects dispatch via a helper string-literal argument', () => {
    // sendMaintenanceBackfillOrError(c, surface, 'admin/...requested') forwards
    // the name into inngest.send({ name: eventName }) dynamically.
    const sf = parseSynthetic(`
      export async function fire(c: any) {
        return sendMaintenanceBackfillOrError(
          c,
          'maintenance.surface',
          'admin/synth-backfill.requested',
        );
      }
    `);
    expect(dispatchedOf(sf).has('admin/synth-backfill.requested')).toBe(true);
  });

  it('self-check: a createFunction trigger event string is NOT counted (array form)', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        [{ event: 'app/synth.multi-a' }, { event: 'app/synth.multi-b' }],
        async () => {},
      );
    `);
    const d = dispatchedOf(sf);
    expect(d.has('app/synth.multi-a')).toBe(false);
    expect(d.has('app/synth.multi-b')).toBe(false);
  });

  it('self-check: resolves a same-file event-name constant', () => {
    const sf = parseSynthetic(`
      const EVT = 'app/synth.const' as const;
      export async function fire(send: any) {
        await send({ name: EVT, data: {} });
      }
    `);
    expect(dispatchedOf(sf).has('app/synth.const')).toBe(true);
  });

  it('self-check: a createFunction trigger object is NOT counted as a dispatch', () => {
    // The trigger uses `event:` not `name:`, so it must never be harvested as
    // a dispatcher — otherwise every handler would "dispatch" its own trigger
    // and the inverse check would be a no-op.
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        { event: 'app/synth.trigger-only' },
        async () => {},
      );
    `);
    expect(dispatchedOf(sf).has('app/synth.trigger-only')).toBe(false);
  });
});
