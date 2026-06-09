// i18n hardcoded-JSX-literal ratchet — Phase 3 of the UI-strings hygiene work.
//
// The orphan-key checker (scripts/check-i18n-orphan-keys.ts) only sees strings
// that already pass through `t()`. Hardcoded English in JSX —
// `<Text>Add child</Text>` or `<Text>{'Continue'}</Text>` — bypasses i18n
// entirely and renders English to every locale. There was no guard against
// this class until now (see AGENTS.md → "Known gap").
//
// Scope (deliberately narrow — matches the AGENTS.md Phase 3 definition):
//   1. JsxText nodes: the literal text between JSX tags
//      (`<Text>Add child</Text>` → "Add child").
//   2. JSX-children StringLiteral / NoSubstitutionTemplateLiteral nodes: a
//      string rendered directly as a child through a `{…}` expression
//      container (`<Text>{'Continue'}</Text>`, `<Text>{cond ? 'A' : 'B'}</Text>`,
//      `<Text>{cond && 'Saved'}</Text>`).
//
// Out of scope (a larger, noisier surface deferred to a later phase):
//   - JSX *attribute* string literals (`label="Continue"`, `title="Delete"`).
//     These mix real copy with testID/style/accessibility-role values, so they
//     need a per-prop allow/deny model the audit team has scoped separately
//     (docs/audit/2026-05-29-full-audit/workflow-1/proposed-baseline.json).
//
// Ratchet model (mirrors scripts/check-no-clinical-copy.ts and the GC1
// jest.mock ratchet):
//   - scripts/i18n-jsx-literals-baseline.json grandfathers existing violations
//     so the guard lands without a 900-string sweep PR.
//   - NEW literals beyond the baseline fail the check.
//   - Baseline entries no longer present are reported (not failed) so the
//     baseline can be pruned as copy is migrated to t().
//
// A violation is keyed on { file, kind, text } — NOT line number — so routine
// reformatting (prettier rewrapping a long JsxText across lines) and unrelated
// edits above it never churn the baseline or manufacture false "new" findings.
//
// CLI usage:
//   pnpm exec tsx scripts/check-i18n-jsx-literals.ts          # check
//   pnpm exec tsx scripts/check-i18n-jsx-literals.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new violations, 2 missing source dir.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Node, Project, type SourceFile } from 'ts-morph';

const SRC_DIR = path.resolve(__dirname, '../apps/mobile/src');
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.resolve(
  __dirname,
  'i18n-jsx-literals-baseline.json',
);

export type LiteralKind = 'jsx-text' | 'jsx-child-string';

export interface Violation {
  /** Repo-relative POSIX path (stable across OS). */
  file: string;
  /** 1-based line of the literal — informational only, not part of identity. */
  line: number;
  kind: LiteralKind;
  /** Whitespace-normalized literal text. */
  text: string;
}

export interface BaselineEntry {
  file: string;
  kind: LiteralKind;
  text: string;
}

// Collapse internal runs of whitespace and trim. Keeps the baseline stable when
// prettier rewraps multi-line JsxText and makes identical copy compare equal.
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// A literal is user-visible copy worth translating only if it carries a real
// word — a run of 2+ ASCII letters. This suppresses pure punctuation/symbols
// ("•", "—", ":"), bare numbers ("5"), and single-letter glyphs ("×") that are
// not translatable prose. Emoji and CJK are not ASCII letters, so a label that
// is ONLY an emoji is correctly skipped; mixed "Save 💾" still trips on "Save".
export function isTranslatableProse(text: string): boolean {
  return /[A-Za-z]{2,}/.test(text);
}

function toPosixRelative(absFile: string): string {
  return path.relative(REPO_ROOT, absFile).split(path.sep).join('/');
}

// Unwrap casts / parens / non-null assertions that don't change the rendered
// value, so `{('x' as string)}` and `{('x')}` resolve to the inner literal.
function unwrap(node: Node): Node {
  let cur = node;
  for (;;) {
    if (
      Node.isAsExpression(cur) ||
      Node.isSatisfiesExpression(cur) ||
      Node.isTypeAssertion(cur) ||
      Node.isParenthesizedExpression(cur) ||
      Node.isNonNullExpression(cur)
    ) {
      cur = cur.getExpression();
      continue;
    }
    return cur;
  }
}

// Collect string literals that a JSX child expression renders *directly* —
// reached only through value-preserving branches (?:, ??, ||, &&, casts,
// parens). A literal buried in a CallExpression argument
// (`<Text>{format('hi')}</Text>`) is NOT rendered directly and is excluded.
function collectRenderedStrings(rawNode: Node, out: Node[]): void {
  const node = unwrap(rawNode);

  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    out.push(node);
    return;
  }

  if (Node.isConditionalExpression(node)) {
    collectRenderedStrings(node.getWhenTrue(), out);
    collectRenderedStrings(node.getWhenFalse(), out);
    return;
  }

  if (Node.isBinaryExpression(node)) {
    const op = node.getOperatorToken().getText();
    if (op === '??' || op === '||' || op === '&&') {
      collectRenderedStrings(node.getLeft(), out);
      collectRenderedStrings(node.getRight(), out);
    }
    return;
  }

  // Identifier, call, element/property access, interpolated template, etc. —
  // not a statically-rendered string literal.
}

export function findViolationsInSourceFile(sf: SourceFile): Violation[] {
  const file = toPosixRelative(sf.getFilePath());
  const violations: Violation[] = [];

  sf.forEachDescendant((node) => {
    // (1) Raw text between JSX tags.
    if (Node.isJsxText(node)) {
      const text = normalizeText(node.getText());
      if (text !== '' && isTranslatableProse(text)) {
        violations.push({
          file,
          line: node.getStartLineNumber(),
          kind: 'jsx-text',
          text,
        });
      }
      return;
    }

    // (2) `{…}` expression container rendered as a JSX child. Its parent is the
    // JSX element/fragment (attribute containers have a JsxAttribute parent, so
    // they are excluded here — props are out of scope).
    if (Node.isJsxExpression(node)) {
      const parent = node.getParent();
      if (
        !parent ||
        !(Node.isJsxElement(parent) || Node.isJsxFragment(parent))
      ) {
        return;
      }
      const expr = node.getExpression();
      if (!expr) return;
      const rendered: Node[] = [];
      collectRenderedStrings(expr, rendered);
      for (const lit of rendered) {
        const text = normalizeText(
          Node.isStringLiteral(lit) || Node.isNoSubstitutionTemplateLiteral(lit)
            ? lit.getLiteralText()
            : lit.getText(),
        );
        if (text !== '' && isTranslatableProse(text)) {
          violations.push({
            file,
            line: lit.getStartLineNumber(),
            kind: 'jsx-child-string',
            text,
          });
        }
      }
    }
  });

  return violations;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.tsx') &&
      !entry.name.endsWith('.stories.tsx')
    ) {
      // JSX syntax only exists in .tsx files; pure .ts files cannot contain
      // JsxText/JSX children, so scanning them would be wasted work.
      out.push(full);
    }
  }
  return out;
}

export interface DiffResult {
  newViolations: Violation[];
  cleanedBaselineEntries: BaselineEntry[];
}

const entryKey = (e: { file: string; kind: string; text: string }) =>
  `${e.file}::${e.kind}::${e.text}`;

export function diffAgainstBaseline(
  current: Violation[],
  baseline: BaselineEntry[],
): DiffResult {
  const baselineSet = new Set(baseline.map(entryKey));
  const currentSet = new Set(current.map(entryKey));

  const seenNew = new Set<string>();
  const newViolations: Violation[] = [];
  for (const v of current) {
    const k = entryKey(v);
    if (baselineSet.has(k) || seenNew.has(k)) continue;
    seenNew.add(k);
    newViolations.push(v);
  }

  const cleanedBaselineEntries = baseline.filter(
    (b) => !currentSet.has(entryKey(b)),
  );
  return { newViolations, cleanedBaselineEntries };
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {file, kind, text} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(violations: Violation[]): void {
  const seen = new Set<string>();
  const dedup: BaselineEntry[] = [];
  for (const v of violations) {
    const k = entryKey(v);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push({ file: v.file, kind: v.kind, text: v.text });
  }
  dedup.sort((a, b) =>
    a.file !== b.file
      ? a.file.localeCompare(b.file)
      : a.kind !== b.kind
        ? a.kind.localeCompare(b.kind)
        : a.text.localeCompare(b.text),
  );
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(dedup, null, 2)}\n`,
    'utf8',
  );
}

export function collectViolations(): Violation[] {
  const files = walkSourceFiles(SRC_DIR);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false, jsx: 4 /* react-jsx */ },
  });
  for (const f of files) project.addSourceFileAtPath(f);

  const violations: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    violations.push(...findViolationsInSourceFile(sf));
  }
  return violations;
}

function main(): number {
  if (!fs.existsSync(SRC_DIR)) {
    process.stderr.write(
      `i18n-jsx-literals: source dir not found at ${SRC_DIR}\n`,
    );
    return 2;
  }

  const violations = collectViolations();

  if (process.argv.includes('--accept')) {
    writeBaseline(violations);
    const unique = new Set(violations.map(entryKey)).size;
    process.stdout.write(
      `i18n-jsx-literals: baseline written (${unique} grandfathered entries)\n`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const { newViolations, cleanedBaselineEntries } = diffAgainstBaseline(
    violations,
    baseline,
  );

  if (cleanedBaselineEntries.length > 0) {
    process.stdout.write(
      `i18n-jsx-literals: ${cleanedBaselineEntries.length} baseline entries no longer present (clean up with --accept):\n`,
    );
    for (const e of cleanedBaselineEntries) {
      process.stdout.write(
        `  - ${e.file} (${e.kind}): ${JSON.stringify(e.text)}\n`,
      );
    }
  }

  if (newViolations.length === 0) {
    process.stdout.write(
      `i18n-jsx-literals: clean (${baseline.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `i18n-jsx-literals: ${newViolations.length} new hardcoded JSX literal(s) — user-visible copy must route through t().\n`,
  );
  process.stderr.write(
    `  Move the string into apps/mobile/src/i18n/locales/en.json and render t('…'), or — if this is genuinely non-translatable (a code sample, a brand token) — re-run with --accept and justify in the commit message.\n`,
  );
  for (const v of newViolations) {
    process.stderr.write(
      `  ${v.file}:${v.line} (${v.kind}): ${JSON.stringify(v.text)}\n`,
    );
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
