/**
 * i18n Phase 1 — forward-only ratchet for learner-prose LLM-call coverage.
 *
 * Every `routeAndCall(`, `routeAndCallForQuiz(`, AND `routeAndStream(` site in
 * `apps/api/src/{services,inngest,routes}/**` must either:
 *   1. Pass `flow:` AND `conversationLanguage:` keys in its options object
 *      (the learner-prose contract — the prose is generated in the learner's
 *      selected UI language), OR
 *   2. Live in `INTERNAL_NON_PROSE_FILES` (the explicit denylist below — sites
 *      whose output is taxonomy slugs, numeric scores, JSON classification,
 *      etc., not prose), OR
 *   3. Be exempted as a wrapper-internal forwarder via
 *      `WRAPPER_FORWARDER_SITES` (file + line) — only the wrapper line that
 *      forwards an `options` identifier into the inner `routeAndCall(...)`
 *      is exempt; wrapper *callers* still get the same checks.
 *
 * Forward-only: any new site that lands without satisfying one of those three
 * rules fails CI.
 *
 * See `docs/specs/2026-05-26-i18n-phase1-llm-language-threading.md` for the
 * full classification rationale.
 */

import * as fs from 'fs';
import * as path from 'path';

// __dirname = apps/api/src/services/llm → repoRoot is 5 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'apps/api/src/services'),
  path.join(REPO_ROOT, 'apps/api/src/inngest'),
  path.join(REPO_ROOT, 'apps/api/src/routes'),
];

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

// Output is internal classification / extraction / numeric — not learner-visible
// prose. Threading `conversationLanguage` here would either be a no-op or
// actively wrong (e.g. instructing the model to write Norwegian when we're
// parsing JSON taxonomy slugs). Renaming any of these files requires editing
// this list — a visible diff in review.
const INTERNAL_NON_PROSE_FILES: ReadonlySet<string> = new Set([
  'apps/api/src/services/language-detect.ts',
  'apps/api/src/services/subject-classify.ts',
  'apps/api/src/services/subject-resolve.ts',
  'apps/api/src/services/ocr.ts',
  'apps/api/src/services/memory/dedup-llm.ts',
  'apps/api/src/services/filing.ts',
  'apps/api/src/services/learner-input.ts',
  'apps/api/src/services/learner-profile.ts',
  'apps/api/src/services/parking-lot.ts',
  'apps/api/src/services/retention-data.ts',
  'apps/api/src/services/session/session-depth.ts',
  'apps/api/src/services/session/session-topic-matcher.ts',
  'apps/api/src/services/session/topic-probe-extraction.ts',
  'apps/api/src/services/vocabulary-extract.ts',
  'apps/api/src/routes/test-seed.ts',
]);

// Spec CRITICAL-B — per-SITE (file + line) exemption for wrapper-internal
// forwarder lines only. The wrapper forwards an `options` identifier into the
// inner `routeAndCall(messages, rung, options)` call; the regex `\bflow\s*:/`
// can never match an identifier, so the wrapper line itself must be exempted.
// Wrapper CALLERS still get the same `flow:` + `conversationLanguage:` checks
// every other learner-prose site does (the alternation regex below catches
// them).
//
// Maintenance: if `routeAndCallForQuiz`'s forwarder line shifts, update the
// line number below; CI will fail loudly because the forwarder would
// otherwise be flagged.
const WRAPPER_FORWARDER_SITES: ReadonlySet<string> = new Set([
  'apps/api/src/services/quiz/generate-round.ts:94',
]);

interface CallSite {
  startLine: number;
  optionsText: string;
  callName: string;
}

/**
 * Brace-balanced scan: find every `routeAndCall(` or `routeAndCallForQuiz(`
 * site and extract the third argument (the options object) so the regex
 * checks below run against ONLY the options-object braces, not the whole
 * call expression. A stray comment containing the word "conversationLanguage"
 * elsewhere in the call must NOT satisfy the regex.
 *
 * Scanner is string-state-machine, not AST: tracks single/double/backtick
 * strings, line comments, and block comments so braces/parens inside string
 * bodies don't unbalance the scan. Mirrors the structural conventions of
 * `safe-non-core.guard.test.ts` while keeping the dependency surface flat
 * (no `typescript` import — this is a structural existence check).
 */
/**
 * Replace comment AND string-literal bodies with spaces (preserving newlines
 * so line numbers stay stable) so the regex scan in findRouteAndCallSites
 * doesn't false-match on `routeAndCall(` substrings that appear inside JSDoc,
 * `//` comments, or string literals (e.g. an interpolated error message that
 * mentions the function name).
 *
 * Quote characters themselves are preserved so the downstream brace-balanced
 * walk's string-state tracking still has the open/close anchors it needs;
 * only the *content* between quotes is blanked. Template-literal `${expr}`
 * holes are treated as opaque (their text is also blanked) — this is safe
 * for the static scan because a `routeAndCall(` site inside an interpolation
 * would not be a real call site anyway.
 */
function maskComments(src: string): string {
  let out = '';
  let i = 0;
  let stringQuote: '"' | "'" | '`' | null = null;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (stringQuote) {
      if (ch === '\\') {
        // Preserve the escape sequence's length so subsequent offsets/lines
        // stay accurate; blank the actual characters.
        out += next === '\n' ? ' \n' : '  ';
        i += 2;
        continue;
      }
      if (ch === stringQuote) {
        stringQuote = null;
        out += ch;
        i++;
        continue;
      }
      // Inside a string body — blank, preserving newlines for line numbers.
      out += ch === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      out += '  ';
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      stringQuote = ch;
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function findRouteAndCallSites(rawSrc: string): CallSite[] {
  const src = maskComments(rawSrc);
  const sites: CallSite[] = [];
  // Covers the three LLM-call entry points. The runtime tripwire fires for
  // `routeAndStream` too (router.ts), so the static ratchet must also gate
  // streaming sites — otherwise a future learner-prose stream caller without
  // `conversationLanguage:` would slip past CI and only show up in logs.
  const re = /\b(routeAndCall|routeAndCallForQuiz|routeAndStream)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const callName = m[1]!;
    const callStartIdx = m.index;
    const openParenIdx = m.index + m[0].length - 1;

    // Skip declarations: `function routeAndCall(` or `function routeAndCallForQuiz(`
    // is the function definition, not a call site. Check the bytes immediately
    // before the match.
    const prefix = src.slice(Math.max(0, callStartIdx - 32), callStartIdx);
    if (/\bfunction\s+$/.test(prefix)) continue;

    // Walk balanced parens from after the opening '(' to find the matching ')'.
    let i = openParenIdx + 1;
    let depth = 1;
    let stringQuote: '"' | "'" | '`' | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    const commaDepthZero: number[] = []; // indices of top-level commas
    while (i < src.length && depth > 0) {
      const ch = src[i]!;
      const next = src[i + 1];

      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        i++;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (stringQuote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === stringQuote) stringQuote = null;
        i++;
        continue;
      }
      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        stringQuote = ch;
        i++;
        continue;
      }
      if (ch === '(' || ch === '{' || ch === '[') {
        depth++;
        i++;
        continue;
      }
      if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        i++;
        continue;
      }
      if (ch === ',' && depth === 1) {
        commaDepthZero.push(i);
      }
      i++;
    }
    const closeParenIdx = i - 1;

    // Third arg starts after the SECOND top-level comma (index 1 in array).
    // Some sites have only 1 or 0 args; for those, optionsText is empty and
    // both regex checks fail — which is the desired behavior unless the file
    // is denylisted.
    let optionsText = '';
    if (commaDepthZero.length >= 2) {
      const thirdArgStart = commaDepthZero[1]! + 1;
      optionsText = src.slice(thirdArgStart, closeParenIdx);
    }

    const startLine = src.slice(0, callStartIdx).split('\n').length;
    sites.push({ startLine, optionsText, callName });
  }
  return sites;
}

function walkDir(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkDir(full, out);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      if (
        full.endsWith('.test.ts') ||
        full.endsWith('.integration.test.ts') ||
        full.endsWith('.guard.test.ts')
      ) {
        continue;
      }
      out.push(full);
    }
  }
}

describe('routeAndCall sites must thread conversationLanguage + flow (i18n Phase 1 ratchet)', () => {
  it('every learner-facing call site threads conversationLanguage AND flow in the same call', () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) walkDir(root, files);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f).replaceAll('\\', '/');
      if (INTERNAL_NON_PROSE_FILES.has(rel)) continue;
      const src = fs.readFileSync(f, 'utf-8');
      const sites = findRouteAndCallSites(src);
      for (const site of sites) {
        const siteKey = `${rel}:${site.startLine}`;
        if (WRAPPER_FORWARDER_SITES.has(siteKey)) continue;

        // Accept both long-form `conversationLanguage: value` and ES2015
        // shorthand `conversationLanguage` (where the value comes from a
        // same-name variable in scope). The shorthand is detected by a
        // trailing comma, whitespace+close-brace, or end of options text.
        if (
          !/\bconversationLanguage\s*[:,}]/.test(site.optionsText) &&
          !/\bconversationLanguage\s*$/.test(site.optionsText.trim())
        ) {
          violations.push(
            `${siteKey} — ${site.callName} without conversationLanguage`,
          );
        }
        if (!/\bflow\s*:/.test(site.optionsText)) {
          violations.push(`${siteKey} — ${site.callName} without flow tag`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
