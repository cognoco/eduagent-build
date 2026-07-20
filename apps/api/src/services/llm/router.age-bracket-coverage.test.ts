/**
 * [WI-2432] Forward ratchet — every LEARNER_FACING_FLOWS `routeAndCall` /
 * `routeAndCallForQuiz` / `routeAndStream` site threads `ageBracket:`.
 *
 * Root cause (WI-1986/WI-1052 fixed the under-18 Gemini/Vertex vendor-exclusion
 * gate INSIDE getModelConfig/getFallbackConfig given an `ageBracket`, but
 * nothing enforced that every learner-facing caller actually SUPPLIES one — a
 * caller that omits it silently disables the gate on the legacy
 * (LLM_ROUTING_V2_ENABLED=false) routing path. This is the caller-side
 * counterpart to router.language-coverage.test.ts (which ratchets
 * `conversationLanguage`/`flow` the same way for the same call-site surface).
 *
 * Scope (per the WI's literal AC-3 text): a call site is in scope only when
 * its `flow:` argument is a STRING LITERAL that is a member of the router's
 * own `LEARNER_FACING_FLOWS` set, mirrored below (same pattern as the sibling
 * `router.locale-coverage.test.ts:49` LEARNER_FACING_FLOW_TAGS mirror) rather
 * than imported — importing it would make `router.ts` itself a
 * "prompt-touching" file (`apps/api/eval-llm/runner/prompt-paths.ts`'s
 * `isPromptTouchingPath` matches `services/llm/.+\.ts`) for a change whose
 * only production-code effect is `export`, forcing an unrelated eval-snapshot
 * pre-commit gate on every future test-only edit here. Mirroring accepts the
 * same drift risk `router.locale-coverage.test.ts` already accepts for the
 * same set (a flow tag added/renamed in router.ts without updating this copy
 * silently under-covers rather than failing loud) — a real but pre-existing
 * tradeoff, not one this WI introduces. Sites whose flow is a non-literal
 * identifier (e.g. `flow: GRADER_FLOW`) are not statically
 * classifiable and are out of this ratchet's scope by construction — none of
 * today's non-literal-flow sites resolve to a LEARNER_FACING_FLOWS member
 * (verified by hand 2026-07-20: GRADER_FLOW='challenge.grader',
 * TEACH_BACK_GRADER_FLOW='teach-back.grader', JUDGE_SUITABILITY_FLOW=
 * 'judge.suitability' — none are in the set).
 *
 * DENYLIST — two categories, each requires a citation, per the WI's explicit
 * "add to an explicit denylist constant with a comment citing the open scope
 * question — do NOT expand this WI to fix them" instruction:
 *
 *   1. Guardian-consumed / open scope question (§10.1): `monthly.report` and
 *      `progress-summary-generation` are LEARNER_FACING_FLOWS members that
 *      lack ageBracket, but whether §10.1's under-18 vendor exclusion even
 *      applies to a guardian reading a minor's summary is an explicitly OPEN
 *      question — ruled OUT OF SCOPE for the whole BID-26 batch (both
 *      WI-2432 and WI-2433's sequencing paragraphs) in "BID-26 entry-gate
 *      ratification — 2026-07-20" (Cosmo page 3a38bce9-1f7c-81b1-9cb2-
 *      db3ea0d5feba), itself citing the BID-4 leads doc §2
 *      (_wip/mvp-roadmap-findings/2026-07-19-safety-floor-batch-adversarial-
 *      pass.md).
 *
 *   2. Deferred sweep, tracked (AGENTS.md > Fix Development Rules — "3+
 *      sibling locations ... document a deferred sweep with tracked ID"):
 *      building this scanner surfaced 11 MORE non-threading call sites
 *      across 9 files, discovered during the WI-2432 build but outside its
 *      ratified 4-site scope (book-generation.ts, assessments.ts,
 *      session-recap.ts, recall-bridge.ts only — BID-26 entry-gate
 *      ratification). Unlike category 1, these read as genuinely
 *      learner-facing (book suggestions, curriculum generation, dictation,
 *      homework/session summaries, post-session suggestions) — NOT assumed
 *      guardian-consumed. Captured as WI-2520 (sibling to WI-2432) for PM
 *      triage; full file:line list + rationale in
 *      _wip/mvp-roadmap-findings/2026-07-20-wi2432-additional-agebracket-
 *      nonthreading-callers.md.
 *
 * RED-GREEN (verified by hand 2026-07-20, per the WI's "guard demonstrated
 * red on a scratch non-threading caller, then reverted" evidence
 * requirement): added a scratch site
 *   `routeAndCall([], 1, { flow: 'book.generation' })`
 * (a LEARNER_FACING_FLOWS member, no ageBracket) to a temp file under
 * apps/api/src/services/ — `pnpm exec jest router.age-bracket-coverage` FAILED
 * with exactly one violation naming that file:line. Removed the scratch site
 * → suite returned to green (0 violations). No repo artifact retained — this
 * is a mechanism proof, not a fixture.
 */

import * as fs from 'fs';
import * as path from 'path';

// Mirror of LEARNER_FACING_FLOWS in router.ts (see header comment above for
// why this is duplicated rather than imported). Keep in sync by hand.
const LEARNER_FACING_FLOWS: ReadonlySet<string> = new Set([
  'exchange.process',
  'exchange.stream',
  'dictation.review',
  'progress-summary-generation',
  'session-llm-summary',
  'session.recap',
  'session.highlights',
  'monthly.report',
  'book.generation',
  'book.suggestion',
  'curriculum.generate',
  'dictation.generate',
  'dictation.prepare-homework',
  'homework.summary',
  'quiz.generate',
  'assessment.evaluate',
  'recall.bridge',
  'post.session.suggestions',
  'summaries.generate',
]);

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

// Category 1 — guardian-consumed / open §10.1 scope question. See file-header
// citation above. Keyed by flow tag (both sites share the same open question,
// not a per-file quirk).
const OPEN_SCOPE_QUESTION_FLOWS: ReadonlySet<string> = new Set([
  'monthly.report',
  'progress-summary-generation',
]);

// Category 2 — deferred sweep, tracked as WI-2520. Keyed by `file:line` (the
// same siteKey shape findRouteAndCallSites produces) so a genuinely-fixed
// site naturally drops out and a NEW unrelated site at the same line number
// in a denylisted file still gets caught by the ratchet.
const WI_2520_DEFERRED_SITES: ReadonlySet<string> = new Set([
  'apps/api/src/services/book-suggestion-generation.ts:114',
  'apps/api/src/services/curriculum.ts:129',
  'apps/api/src/services/curriculum.ts:204',
  'apps/api/src/services/curriculum.ts:2754',
  'apps/api/src/services/dictation/generate.ts:213',
  'apps/api/src/services/dictation/prepare-homework.ts:82',
  'apps/api/src/services/dictation/review.ts:220',
  'apps/api/src/services/homework-summary.ts:310',
  'apps/api/src/services/session-llm-summary.ts:317',
  'apps/api/src/services/summaries.ts:160',
  'apps/api/src/inngest/functions/post-session-suggestions.ts:182',
]);

interface CallSite {
  startLine: number;
  // Offsets into the MASKED source (see maskComments) — masking never changes
  // string length or newline positions, so these offsets apply identically to
  // the raw source. Two different slices are read from them below:
  // maskedOptionsText (safe for the `ageBracket:` KEY check — comments/string
  // bodies can't false-match) and rawOptionsText (needed to recover the
  // `flow:` string-literal VALUE, which maskComments blanks out).
  optionsStart: number;
  optionsEnd: number;
  callName: string;
}

// Mirrors router.language-coverage.test.ts's maskComments/findRouteAndCallSites
// exactly (string-state-machine, not AST) — duplicated rather than imported so
// this file stays self-contained like its siblings (router.fallback-compliance
// .test.ts, router.locale-coverage.test.ts, etc. each own their scan helpers).
function maskComments(src: string): string {
  let out = '';
  let i = 0;
  let stringQuote: '"' | "'" | '`' | null = null;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (stringQuote) {
      if (ch === '\\') {
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
  const re = /\b(routeAndCall|routeAndCallForQuiz|routeAndStream)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const callName = m[1]!;
    const callStartIdx = m.index;
    const openParenIdx = m.index + m[0].length - 1;

    const prefix = src.slice(Math.max(0, callStartIdx - 32), callStartIdx);
    if (/\bfunction\s+$/.test(prefix)) continue;

    let i = openParenIdx + 1;
    let depth = 1;
    let stringQuote: '"' | "'" | '`' | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    const commaDepthZero: number[] = [];
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

    let optionsStart = closeParenIdx;
    let optionsEnd = closeParenIdx;
    if (commaDepthZero.length >= 2) {
      optionsStart = commaDepthZero[1]! + 1;
      optionsEnd = closeParenIdx;
    }

    const startLine = src.slice(0, callStartIdx).split('\n').length;
    sites.push({ startLine, optionsStart, optionsEnd, callName });
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

/** Extracts the flow argument's STRING LITERAL value, or null if it is not a literal. */
function extractFlowLiteral(optionsText: string): string | null {
  const m = optionsText.match(/\bflow\s*:\s*(['"])((?:(?!\1).)*)\1/);
  return m ? m[2]! : null;
}

function hasAgeBracket(optionsText: string): boolean {
  return (
    /\bageBracket\s*[:,}]/.test(optionsText) ||
    /\bageBracket\s*$/.test(optionsText.trim())
  );
}

describe('routeAndCall sites must thread ageBracket for LEARNER_FACING_FLOWS (WI-2432 ratchet)', () => {
  it('every call site whose flow: literal is a LEARNER_FACING_FLOWS member threads ageBracket', () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) walkDir(root, files);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f).replaceAll('\\', '/');
      const rawSrc = fs.readFileSync(f, 'utf-8');
      const maskedSrc = maskComments(rawSrc);
      const sites = findRouteAndCallSites(rawSrc);
      for (const site of sites) {
        // The flow VALUE must come from the RAW source — maskComments blanks
        // string-literal bodies (that's how it keeps brace-balancing safe
        // from quotes/braces inside strings), so reading it from the masked
        // slice would always see spaces, never the actual flow tag.
        const rawOptionsText = rawSrc.slice(site.optionsStart, site.optionsEnd);
        const flow = extractFlowLiteral(rawOptionsText);
        if (flow === null || !LEARNER_FACING_FLOWS.has(flow)) continue;

        const siteKey = `${rel}:${site.startLine}`;
        if (OPEN_SCOPE_QUESTION_FLOWS.has(flow)) continue;
        if (WI_2520_DEFERRED_SITES.has(siteKey)) continue;

        // The ageBracket KEY check is safe on the masked slice (a comment or
        // string body containing the word "ageBracket" can't false-match).
        const maskedOptionsText = maskedSrc.slice(
          site.optionsStart,
          site.optionsEnd,
        );
        if (!hasAgeBracket(maskedOptionsText)) {
          violations.push(
            `${siteKey} — ${site.callName} flow='${flow}' without ageBracket`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  // Confirms the two denylist categories still resolve to real, currently-true
  // facts rather than rotting silently — if a site is fixed, its entry should
  // be removed (not left as a permanent bypass) and this test would still
  // pass (the ratchet above only fails on a MISSING ageBracket, never on an
  // unnecessary denylist entry), so this is a documentation/traceability
  // check, not an enforcement gate.
  it('denylisted flow tags are genuinely LEARNER_FACING_FLOWS members (no stale entries)', () => {
    for (const flow of OPEN_SCOPE_QUESTION_FLOWS) {
      expect(LEARNER_FACING_FLOWS.has(flow)).toBe(true);
    }
  });
});
