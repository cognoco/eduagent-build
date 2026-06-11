/**
 * [BUG-760] Forward-only ratchet test for orphan Inngest dispatchers.
 *
 * Every event name dispatched by `inngest.send(...)`, `safeSend(() => inngest.send(...))`,
 * or `step.sendEvent(label, ...)` must have at least one registered handler
 * (an `inngest.createFunction(opts, { event: '...' }, ...)` somewhere in
 * `apps/api/src/inngest/functions/`).
 *
 * Orphan dispatchers — events fired with no matching handler — silently
 * succeed at the dispatch layer and never run any work. This produces false
 * confidence: the call site looks like it kicked something off, but nothing
 * downstream ever consumes the event. The previous failure mode for this was
 * BUG-698 (progress-backfill functions wired to events nothing emitted) and
 * its inverse — handler removed, dispatch sites left behind — is what this
 * guard catches.
 *
 * Opt-out: if a dispatch genuinely has no handler (e.g. consumed by an
 * out-of-process worker or kept as an observability marker), add a comment
 *   // orphan-allow: <reason>
 * on the line immediately above the `name: '...'` property OR on the line
 * immediately above the dispatch call. Mirrors the GC1 `// gc1-allow:` pattern.
 *
 * See:
 *   apps/api/src/services/safe-non-core.guard.test.ts (template)
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
 * Built-in Inngest event names that the framework itself emits — handlers
 * may listen for these (e.g. function.invoked, scheduled) without us
 * dispatching them. Not strictly needed for the ratchet (we never DISPATCH
 * these from app code), but documented here for clarity.
 */
const INNGEST_BUILTIN_PREFIXES = ['inngest/'];

/**
 * Allow dispatches whose event name uses one of these prefixes — they are
 * consumed out-of-band (e.g. by an external pipeline, by the Inngest dashboard,
 * or by ops monitoring). New top-level prefixes should be added explicitly so
 * a typo (`apps/foo` vs `app/foo`) is still caught by the orphan check.
 */
const ALLOWED_UNREGISTERED_PREFIXES: string[] = [
  // (none today — add with justification)
];

/**
 * [BUG-760] Known-pending orphan event names. Forward-only — ANY new orphan
 * event name not in this set fails CI immediately. DO NOT add to this list.
 *
 * Triage history: the original baseline held 15 entries. 14 were resolved by
 * adding a `// orphan-allow: <reason>` comment at the dispatch site once each
 * was confirmed to be a genuine observability-only marker (structured-telemetry
 * signals paired with logger.warn + captureException to satisfy AGENTS.md's
 * "silent recovery must emit a structured signal" rule, or — for
 * app/filing.retry_completed — an event with a real `step.waitForEvent`
 * consumer the scanner cannot see because it only harvests
 * inngest.createFunction triggers). See the dispatch sites for per-event
 * rationale.
 *
 * The 1 entry that remains is NOT acceptable steady state — it is tracked
 * pending, annotated below with WHY no handler exists yet and what the
 * eventual handler should do:
 *
 *   - app/billing.alias_received — dispatched from
 *     services/billing/revenuecat-webhook-handler.ts when a RevenueCat
 *     SUBSCRIBER_ALIAS arrives and the transferred_from identity still has an
 *     active subscription (revenue-loss scenario). It is already escalated via
 *     captureException(severity:'high'), so alerting is NOT silent. The MISSING
 *     piece is an automated *remediation* handler that merges/transfers the two
 *     subscriptions. That requires a product decision (which sub wins, refund
 *     handling, proration) + a migration worker, so it is genuinely out of
 *     scope for this triage. Left pending until the subscription-merge workflow
 *     is specced. Do NOT orphan-allow it — its pending state is the signal that
 *     a handler is still owed.
 */
const KNOWN_PENDING_ORPHANS = new Set<string>(['app/billing.alias_received']);

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
  // Skip eval harness scaffolding.
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
 * Look for a `// orphan-allow: <reason>` comment in the contiguous comment
 * block immediately above the given node. Line-based scan (not AST trivia)
 * for the same reason as safe-non-core.guard.test.ts:hasCoreSendCommentAbove.
 */
function hasOrphanAllowCommentAbove(
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
    if (/^\/\/\s*orphan-allow:/.test(lineText)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Registered triggers — walk every inngest.createFunction(opts, trigger, ...)
// and harvest the trigger event names. The trigger is the 2nd argument; it is
// either an object literal `{ event: '...' }` / `{ cron: '...' }` or an array
// of such objects (multi-trigger handlers like ask-classification-observe).
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

/** Extract the `event:` string from an object literal trigger spec. */
function extractEventNameFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
): string | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name)) continue;
    if (prop.name.text !== 'event') continue;
    if (ts.isStringLiteral(prop.initializer)) {
      return prop.initializer.text;
    }
    // `event: 'literal' as const` -> skip the AsExpression wrapper
    if (
      ts.isAsExpression(prop.initializer) &&
      ts.isStringLiteral(prop.initializer.expression)
    ) {
      return prop.initializer.expression.text;
    }
  }
  return null;
}

function collectTriggersFromArg(
  arg: ts.Expression,
): Array<{ eventName: string | null; node: ts.Node }> {
  const out: Array<{ eventName: string | null; node: ts.Node }> = [];
  if (ts.isObjectLiteralExpression(arg)) {
    out.push({ eventName: extractEventNameFromObjectLiteral(arg), node: arg });
  } else if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      if (ts.isObjectLiteralExpression(el)) {
        out.push({
          eventName: extractEventNameFromObjectLiteral(el),
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
        for (const t of collectTriggersFromArg(trigArg)) {
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
// Dispatches — collect every event name dispatched by:
//   - inngest.send({ name: '...', ... })
//   - inngest.send([{ name: '...' }, ...])
//   - step.sendEvent('label', { name: '...', ... })
//   - step.sendEvent('label', [{ name: '...' }, ...])
//   - safeSend(() => inngest.send({ name: '...' }), 'surface', ...)
// The lambda inside safeSend is handled transparently because we walk the
// AST recursively — the inngest.send call inside the arrow body is reached
// by the same visitor.
// ---------------------------------------------------------------------------

interface DispatchSite {
  file: string;
  line: number;
  eventName: string;
}

function isInngestSendCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression)) return false;
  if (expr.expression.text !== 'inngest') return false;
  return expr.name.text === 'send';
}

function isStepSendEventCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression)) return false;
  if (expr.expression.text !== 'step') return false;
  return expr.name.text === 'sendEvent';
}

/** Extract the `name:` string from an event object literal. */
function extractNameFromEventObject(
  obj: ts.ObjectLiteralExpression,
): { name: string; node: ts.Node } | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    let propKey: string | null = null;
    if (ts.isIdentifier(prop.name)) propKey = prop.name.text;
    else if (ts.isStringLiteral(prop.name)) propKey = prop.name.text;
    if (propKey !== 'name') continue;
    if (ts.isStringLiteral(prop.initializer)) {
      return { name: prop.initializer.text, node: prop };
    }
    if (
      ts.isAsExpression(prop.initializer) &&
      ts.isStringLiteral(prop.initializer.expression)
    ) {
      return { name: prop.initializer.expression.text, node: prop };
    }
  }
  return null;
}

function collectNamesFromPayload(
  arg: ts.Expression,
): Array<{ name: string; node: ts.Node }> {
  const out: Array<{ name: string; node: ts.Node }> = [];
  if (ts.isObjectLiteralExpression(arg)) {
    const found = extractNameFromEventObject(arg);
    if (found) out.push(found);
  } else if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      if (ts.isObjectLiteralExpression(el)) {
        const found = extractNameFromEventObject(el);
        if (found) out.push(found);
      }
    }
  }
  // Calls like `batch.map((p) => ({ name: '...', data: {...} }))` — drill
  // into arrow/function bodies that return an object literal.
  // step.sendEvent(label, batch.map((profileId) => ({ name: '...', data: {...} })))
  if (ts.isCallExpression(arg)) {
    // Most common form: .map(callback)
    for (const a of arg.arguments) {
      if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
        const body = a.body;
        // Arrow with concise body returning an object literal:
        //   (p) => ({ name: '...', data: {...} })
        // The object literal is wrapped in ParenthesizedExpression.
        if (ts.isParenthesizedExpression(body)) {
          const inner = body.expression;
          if (ts.isObjectLiteralExpression(inner)) {
            const found = extractNameFromEventObject(inner);
            if (found) out.push(found);
          }
        } else if (ts.isObjectLiteralExpression(body)) {
          const found = extractNameFromEventObject(body);
          if (found) out.push(found);
        } else if (ts.isBlock(body)) {
          // Function body with explicit `return { name: '...' }`.
          const visit = (node: ts.Node): void => {
            if (ts.isReturnStatement(node) && node.expression) {
              if (ts.isObjectLiteralExpression(node.expression)) {
                const found = extractNameFromEventObject(node.expression);
                if (found) out.push(found);
              } else if (ts.isParenthesizedExpression(node.expression)) {
                const inner = node.expression.expression;
                if (ts.isObjectLiteralExpression(inner)) {
                  const found = extractNameFromEventObject(inner);
                  if (found) out.push(found);
                }
              }
            }
            ts.forEachChild(node, visit);
          };
          visit(body);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// [BUG-795] Dynamic-name dispatches. A dispatch whose `name:` is a *computed*
// expression (`name: e.name`, `name: someVar`) rather than a string literal is
// invisible to the literal-name harvest above — the orphan check cannot verify
// it has a handler because the actual event name lives somewhere else (often a
// helper that pushes `{ name, data }` tuples, e.g. the memory dedup pass). The
// real BUG-795 failure mode: sessionCompleted fanned dedup tuples out via
//   step.sendEvent('dedup-events', dedupResult.events.map((e) => ({ name: e.name, data: e.data })))
// so the orphaned memory.dedup.* events were never caught. We treat a
// dynamic-name dispatch as a hard violation unless it carries a
// `// orphan-allow: <reason>` (e.g. a genuine pass-through relay with a known
// out-of-band consumer). The fix for pure observability is to NOT dispatch at
// all — emit a structured log instead.
// ---------------------------------------------------------------------------

interface DynamicNameSite {
  file: string;
  line: number;
}

/** Is this `name:` initializer a non-literal (computed) event name? */
function isDynamicNameInitializer(init: ts.Expression): boolean {
  // Unwrap `... as const` / `... as T`.
  let expr: ts.Expression = init;
  if (ts.isAsExpression(expr)) expr = expr.expression;
  // String literal / template with no substitutions are static — not dynamic.
  if (ts.isStringLiteral(expr)) return false;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return false;
  return true;
}

/** Find a `name:` property with a dynamic (non-literal) initializer. */
function findDynamicNameNode(obj: ts.ObjectLiteralExpression): ts.Node | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    let propKey: string | null = null;
    if (ts.isIdentifier(prop.name)) propKey = prop.name.text;
    else if (ts.isStringLiteral(prop.name)) propKey = prop.name.text;
    if (propKey !== 'name') continue;
    if (isDynamicNameInitializer(prop.initializer)) return prop;
  }
  return null;
}

/**
 * Walk a dispatch payload the same way collectNamesFromPayload does, but
 * collect object literals whose `name:` is dynamic. Mirrors the object /
 * array / `.map(cb)` forms.
 */
function collectDynamicNameNodes(arg: ts.Expression): ts.Node[] {
  const out: ts.Node[] = [];
  const pushIfDynamic = (obj: ts.ObjectLiteralExpression): void => {
    const node = findDynamicNameNode(obj);
    if (node) out.push(node);
  };
  if (ts.isObjectLiteralExpression(arg)) {
    pushIfDynamic(arg);
  } else if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      if (ts.isObjectLiteralExpression(el)) pushIfDynamic(el);
    }
  }
  if (ts.isCallExpression(arg)) {
    for (const a of arg.arguments) {
      if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
        const body = a.body;
        if (ts.isParenthesizedExpression(body)) {
          const inner = body.expression;
          if (ts.isObjectLiteralExpression(inner)) pushIfDynamic(inner);
        } else if (ts.isObjectLiteralExpression(body)) {
          pushIfDynamic(body);
        } else if (ts.isBlock(body)) {
          const visit = (node: ts.Node): void => {
            if (ts.isReturnStatement(node) && node.expression) {
              if (ts.isObjectLiteralExpression(node.expression)) {
                pushIfDynamic(node.expression);
              } else if (ts.isParenthesizedExpression(node.expression)) {
                const inner = node.expression.expression;
                if (ts.isObjectLiteralExpression(inner)) pushIfDynamic(inner);
              }
            }
            ts.forEachChild(node, visit);
          };
          visit(body);
        }
      }
    }
  }
  return out;
}

function scanFileForDynamicDispatches(absPath: string): DynamicNameSite[] {
  const sourceFile = parseSourceFile(absPath);
  const sites: DynamicNameSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let payloadArg: ts.Expression | undefined;
      let callNode: ts.Node | undefined;
      if (isInngestSendCall(node)) {
        payloadArg = node.arguments[0];
        callNode = node;
      } else if (isStepSendEventCall(node)) {
        payloadArg = node.arguments[1];
        callNode = node;
      }
      if (payloadArg && callNode) {
        for (const dynNode of collectDynamicNameNodes(payloadArg)) {
          if (
            hasOrphanAllowCommentAbove(sourceFile, dynNode) ||
            hasOrphanAllowCommentAbove(sourceFile, callNode)
          ) {
            continue;
          }
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            dynNode.getStart(sourceFile),
          );
          sites.push({
            file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

function scanFileForDispatches(absPath: string): DispatchSite[] {
  const sourceFile = parseSourceFile(absPath);
  const sites: DispatchSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let payloadArg: ts.Expression | undefined;
      let callNode: ts.Node | undefined;
      if (isInngestSendCall(node)) {
        payloadArg = node.arguments[0];
        callNode = node;
      } else if (isStepSendEventCall(node)) {
        // step.sendEvent(label, payload) — label is arg[0], payload is arg[1].
        payloadArg = node.arguments[1];
        callNode = node;
      }
      if (payloadArg && callNode) {
        for (const found of collectNamesFromPayload(payloadArg)) {
          // Allow-comment can sit above the `name:` line OR above the call.
          if (
            hasOrphanAllowCommentAbove(sourceFile, found.node) ||
            hasOrphanAllowCommentAbove(sourceFile, callNode)
          ) {
            continue;
          }
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            found.node.getStart(sourceFile),
          );
          sites.push({
            file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
            line: line + 1,
            eventName: found.name,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orphan dispatcher ratchet', () => {
  const apiFiles: string[] = [];
  walkDir(API_SRC, apiFiles);

  // Triggers are only registered by functions inside apps/api/src/inngest/functions.
  const triggerFiles = apiFiles.filter((f) =>
    f.startsWith(INNGEST_FUNCTIONS_DIR + path.sep),
  );

  const registeredEvents = new Set<string>();
  for (const f of triggerFiles) {
    for (const t of scanFileForTriggers(f)) {
      if (t.eventName) registeredEvents.add(t.eventName);
    }
  }

  const allDispatches: DispatchSite[] = [];
  for (const f of apiFiles) {
    for (const d of scanFileForDispatches(f)) allDispatches.push(d);
  }

  const allDynamicDispatches: DynamicNameSite[] = [];
  for (const f of apiFiles) {
    for (const d of scanFileForDynamicDispatches(f))
      allDynamicDispatches.push(d);
  }

  it('scans at least one inngest function file (sanity check)', () => {
    expect(triggerFiles.length).toBeGreaterThan(20);
  });

  it('finds at least one registered event trigger (sanity check)', () => {
    // If this fails, the trigger extractor is broken.
    expect(registeredEvents.size).toBeGreaterThan(10);
  });

  it('finds at least one dispatched event name (sanity check)', () => {
    // If this fails, the dispatch extractor is broken.
    expect(allDispatches.length).toBeGreaterThan(10);
  });

  it('every dispatched event name has a registered handler', () => {
    const orphans = allDispatches.filter((d) => {
      if (registeredEvents.has(d.eventName)) return false;
      // Framework-emitted events are never dispatched by app code, but if
      // someone ever does, leave the allow-list for explicit opt-out.
      if (
        INNGEST_BUILTIN_PREFIXES.some((p) => d.eventName.startsWith(p)) ||
        ALLOWED_UNREGISTERED_PREFIXES.some((p) => d.eventName.startsWith(p))
      ) {
        return false;
      }
      // [BUG-760] Pre-existing orphans frozen at the time the ratchet shipped.
      // Forward-only: new event names not in this set fail CI.
      if (KNOWN_PENDING_ORPHANS.has(d.eventName)) return false;
      return true;
    });

    if (orphans.length > 0) {
      // Group by event name to make the failure message compact.
      const byEvent = new Map<string, DispatchSite[]>();
      for (const o of orphans) {
        const list = byEvent.get(o.eventName) ?? [];
        list.push(o);
        byEvent.set(o.eventName, list);
      }
      const lines: string[] = [];
      for (const [eventName, sites] of [...byEvent.entries()].sort()) {
        lines.push(`  ${eventName}`);
        for (const s of sites) {
          lines.push(`    ${s.file}:${s.line}`);
        }
      }
      throw new Error(
        `Found ${orphans.length} orphan dispatch site(s) — event name dispatched with no inngest.createFunction handler.\n` +
          `Fix by adding a handler in apps/api/src/inngest/functions/, registering it in apps/api/src/inngest/index.ts, ` +
          `OR add a "// orphan-allow: <reason>" comment above the dispatch if the event is intentionally consumed out-of-band.\n` +
          `\n${lines.join('\n')}`,
      );
    }
    expect(orphans).toEqual([]);
  });

  it('[BUG-795] no dispatch uses a dynamically computed event name', () => {
    // A dispatch whose `name:` is computed (e.g. `name: e.name` from a helper
    // that returns `{ name, data }` tuples) is invisible to the literal-name
    // orphan harvest above, so an orphaned event can slip through. If the
    // payload is pure observability, emit a structured log instead of
    // dispatching. If it is a genuine pass-through relay with a known
    // out-of-band consumer, add `// orphan-allow: <reason>` above the call.
    if (allDynamicDispatches.length > 0) {
      const lines = allDynamicDispatches.map((s) => `    ${s.file}:${s.line}`);
      throw new Error(
        `Found ${allDynamicDispatches.length} dispatch site(s) with a dynamically computed event name — ` +
          `the orphan check cannot verify these have handlers (BUG-795).\n` +
          `Either dispatch with a string-literal name + register a handler, emit a structured log instead, ` +
          `OR add a "// orphan-allow: <reason>" comment above the dispatch.\n` +
          `\n${lines.join('\n')}`,
      );
    }
    expect(allDynamicDispatches).toEqual([]);
  });

  it('KNOWN_PENDING_ORPHANS contains no stale entries (no event in this set has gained a handler)', () => {
    // If an event in KNOWN_PENDING_ORPHANS is now registered, the entry is
    // stale — delete it from the set so the ratchet stays tight.
    const stale = [...KNOWN_PENDING_ORPHANS].filter((name) =>
      registeredEvents.has(name),
    );
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_PENDING_ORPHANS contains ${stale.length} entry/entries that now have handlers — remove them so the ratchet keeps catching the rest:\n  ${stale.join('\n  ')}`,
      );
    }
    expect(stale).toEqual([]);
  });

  it('KNOWN_PENDING_ORPHANS contains no entries that are no longer dispatched (no stale baseline)', () => {
    // If an event in KNOWN_PENDING_ORPHANS is no longer dispatched anywhere,
    // the entry is dead — delete it so the set shrinks toward zero.
    const dispatchedNames = new Set(allDispatches.map((d) => d.eventName));
    const dead = [...KNOWN_PENDING_ORPHANS].filter(
      (name) => !dispatchedNames.has(name),
    );
    if (dead.length > 0) {
      throw new Error(
        `KNOWN_PENDING_ORPHANS contains ${dead.length} entry/entries that are no longer dispatched — remove them so the baseline shrinks:\n  ${dead.join('\n  ')}`,
      );
    }
    expect(dead).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Self-checks — verify the scanner detects synthetic violations.
  // Without these, an AST refactor that breaks the walk would silently pass.
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

  function collectTriggersFromSynthetic(sf: ts.SourceFile): TriggerInfo[] {
    const out: TriggerInfo[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isInngestCreateFunctionCall(node)) {
        const trigArg = node.arguments[1];
        if (trigArg) {
          for (const t of collectTriggersFromArg(trigArg)) {
            const { line } = sf.getLineAndCharacterOfPosition(
              t.node.getStart(sf),
            );
            out.push({
              file: sf.fileName,
              line: line + 1,
              eventName: t.eventName,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  function collectDispatchesFromSynthetic(sf: ts.SourceFile): DispatchSite[] {
    const out: DispatchSite[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        let payloadArg: ts.Expression | undefined;
        let callNode: ts.Node | undefined;
        if (isInngestSendCall(node)) {
          payloadArg = node.arguments[0];
          callNode = node;
        } else if (isStepSendEventCall(node)) {
          payloadArg = node.arguments[1];
          callNode = node;
        }
        if (payloadArg && callNode) {
          for (const found of collectNamesFromPayload(payloadArg)) {
            if (
              hasOrphanAllowCommentAbove(sf, found.node) ||
              hasOrphanAllowCommentAbove(sf, callNode)
            ) {
              continue;
            }
            const { line } = sf.getLineAndCharacterOfPosition(
              found.node.getStart(sf),
            );
            out.push({
              file: sf.fileName,
              line: line + 1,
              eventName: found.name,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  it('self-check: extracts event trigger from createFunction', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        { event: 'app/synth.example' },
        async () => {},
      );
    `);
    const triggers = collectTriggersFromSynthetic(sf);
    expect(triggers.map((t) => t.eventName)).toContain('app/synth.example');
  });

  it('self-check: extracts multiple event triggers from array form', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        [{ event: 'app/synth.a' }, { event: 'app/synth.b' }],
        async () => {},
      );
    `);
    const names = collectTriggersFromSynthetic(sf)
      .map((t) => t.eventName)
      .filter((n): n is string => n !== null);
    expect(names).toEqual(
      expect.arrayContaining(['app/synth.a', 'app/synth.b']),
    );
  });

  it('self-check: cron-only trigger produces no event name', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export const fn = inngest.createFunction(
        { id: 'x' },
        { cron: '0 3 * * *' },
        async () => {},
      );
    `);
    const triggers = collectTriggersFromSynthetic(sf);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every((t) => t.eventName === null)).toBe(true);
  });

  it('self-check: detects bare inngest.send dispatch', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire() {
        await inngest.send({ name: 'app/synth.dispatched', data: {} });
      }
    `);
    const sites = collectDispatchesFromSynthetic(sf);
    expect(sites.map((s) => s.eventName)).toContain('app/synth.dispatched');
  });

  it('self-check: detects step.sendEvent dispatch', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any) {
        await step.sendEvent('label', { name: 'app/synth.step', data: {} });
      }
    `);
    const sites = collectDispatchesFromSynthetic(sf);
    expect(sites.map((s) => s.eventName)).toContain('app/synth.step');
  });

  it('self-check: detects step.sendEvent array form', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any) {
        await step.sendEvent('label', [
          { name: 'app/synth.bulk1', data: {} },
          { name: 'app/synth.bulk2', data: {} },
        ]);
      }
    `);
    const names = sites_to_names(collectDispatchesFromSynthetic(sf));
    expect(names).toEqual(
      expect.arrayContaining(['app/synth.bulk1', 'app/synth.bulk2']),
    );
  });

  it('self-check: detects step.sendEvent with .map callback returning object', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any, profileIds: string[]) {
        await step.sendEvent(
          'fan-out',
          profileIds.map((profileId) => ({
            name: 'app/synth.mapped' as const,
            data: { profileId },
          })),
        );
      }
    `);
    const names = sites_to_names(collectDispatchesFromSynthetic(sf));
    expect(names).toContain('app/synth.mapped');
  });

  it('self-check: detects inngest.send inside safeSend lambda', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      import { safeSend } from './safe-non-core';
      export async function fire() {
        await safeSend(
          () => inngest.send({ name: 'app/synth.safe', data: {} }),
          'surface',
        );
      }
    `);
    const sites = collectDispatchesFromSynthetic(sf);
    expect(sites.map((s) => s.eventName)).toContain('app/synth.safe');
  });

  it('self-check: orphan-allow comment above name line suppresses detection', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire() {
        await inngest.send({
          // orphan-allow: consumed by external worker
          name: 'app/synth.allowed',
          data: {},
        });
      }
    `);
    const names = sites_to_names(collectDispatchesFromSynthetic(sf));
    expect(names).not.toContain('app/synth.allowed');
  });

  it('self-check: orphan-allow comment above call suppresses detection', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire() {
        // orphan-allow: consumed by external worker
        await inngest.send({ name: 'app/synth.allowed2', data: {} });
      }
    `);
    const names = sites_to_names(collectDispatchesFromSynthetic(sf));
    expect(names).not.toContain('app/synth.allowed2');
  });

  // -------------------------------------------------------------------------
  // [BUG-795] Self-checks for the dynamic-name dispatch detector.
  // -------------------------------------------------------------------------

  function collectDynamicFromSynthetic(sf: ts.SourceFile): DynamicNameSite[] {
    const out: DynamicNameSite[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        let payloadArg: ts.Expression | undefined;
        let callNode: ts.Node | undefined;
        if (isInngestSendCall(node)) {
          payloadArg = node.arguments[0];
          callNode = node;
        } else if (isStepSendEventCall(node)) {
          payloadArg = node.arguments[1];
          callNode = node;
        }
        if (payloadArg && callNode) {
          for (const dynNode of collectDynamicNameNodes(payloadArg)) {
            if (
              hasOrphanAllowCommentAbove(sf, dynNode) ||
              hasOrphanAllowCommentAbove(sf, callNode)
            ) {
              continue;
            }
            const { line } = sf.getLineAndCharacterOfPosition(
              dynNode.getStart(sf),
            );
            out.push({ file: sf.fileName, line: line + 1 });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  it('self-check: detects the exact BUG-795 pattern (step.sendEvent map with name: e.name)', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any, dedupResult: any) {
        await step.sendEvent(
          'dedup-events',
          dedupResult.events.map((e: any) => ({ name: e.name, data: e.data })),
        );
      }
    `);
    expect(collectDynamicFromSynthetic(sf).length).toBe(1);
  });

  it('self-check: detects dynamic name in a direct inngest.send object', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire(evt: { name: string }) {
        await inngest.send({ name: evt.name, data: {} });
      }
    `);
    expect(collectDynamicFromSynthetic(sf).length).toBe(1);
  });

  it('self-check: string-literal name is NOT flagged as dynamic', () => {
    const sf = parseSynthetic(`
      import { inngest } from './client';
      export async function fire() {
        await inngest.send({ name: 'app/synth.literal', data: {} });
      }
    `);
    expect(collectDynamicFromSynthetic(sf)).toEqual([]);
  });

  it('self-check: `as const` literal name is NOT flagged as dynamic', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any, ids: string[]) {
        await step.sendEvent(
          'fan-out',
          ids.map((id) => ({ name: 'app/synth.constmapped' as const, data: { id } })),
        );
      }
    `);
    expect(collectDynamicFromSynthetic(sf)).toEqual([]);
  });

  it('self-check: orphan-allow above the dynamic dispatch suppresses it', () => {
    const sf = parseSynthetic(`
      export async function inner(step: any, dedupResult: any) {
        // orphan-allow: relayed to external pipeline
        await step.sendEvent(
          'dedup-events',
          dedupResult.events.map((e: any) => ({ name: e.name, data: e.data })),
        );
      }
    `);
    expect(collectDynamicFromSynthetic(sf)).toEqual([]);
  });
});

function sites_to_names(sites: DispatchSite[]): string[] {
  return sites.map((s) => s.eventName);
}
