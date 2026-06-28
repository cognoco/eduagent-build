// i18n hardcoded-JSX-literal ratchet — Phase 3 of the UI-strings hygiene work.
//
// The orphan-key checker (scripts/check-i18n-orphan-keys.ts) only sees strings
// that already pass through `t()`. Hardcoded English in JSX —
// `<Text>Add child</Text>` or `<Text>{'Continue'}</Text>` — bypasses i18n
// entirely and renders English to every locale. There was no guard against
// this class until now (see AGENTS.md → "Known gap").
//
// Scope:
//   1. JsxText nodes: the literal text between JSX tags
//      (`<Text>Add child</Text>` → "Add child").
//   2. JSX-children StringLiteral / NoSubstitutionTemplateLiteral nodes: a
//      string rendered directly as a child through a `{…}` expression
//      container (`<Text>{'Continue'}</Text>`, `<Text>{cond ? 'A' : 'B'}</Text>`,
//      `<Text>{cond && 'Saved'}</Text>`).
//   3. JSX attribute literals for known user-copy props
//      (`label="Continue"`, `accessibilityLabel="Go back"`), with an explicit
//      non-copy prop classifier for test IDs, styles, roles, IDs, and paths.
//
// Ratchet model (mirrors scripts/check-no-clinical-copy.ts and the GC1
// jest.mock ratchet):
//   - scripts/i18n-jsx-literals-baseline.json grandfathers existing violations
//     so the guard lands without a 900-string sweep PR.
//   - NEW literals beyond the baseline fail the check.
//   - Baseline entries no longer present are reported (not failed) so the
//     baseline can be pruned as copy is migrated to t().
//
// A child/text violation is keyed on { file, kind, text }; an attribute
// violation is keyed on { file, kind, prop, text } — NOT line number — so
// routine reformatting and unrelated edits above it never churn the baseline or
// manufacture false "new" findings.
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

export type LiteralKind =
  | 'jsx-text'
  | 'jsx-child-string'
  | 'jsx-attribute-string';

export type AttributePropClassification = 'copy' | 'non-copy' | 'unknown';

export interface Violation {
  /** Repo-relative POSIX path (stable across OS). */
  file: string;
  /** 1-based line of the literal — informational only, not part of identity. */
  line: number;
  kind: LiteralKind;
  /** JSX prop name for attribute literals. Not part of child/text entries. */
  prop?: string;
  /** Whitespace-normalized literal text. */
  text: string;
}

export interface BaselineEntry {
  file: string;
  kind: LiteralKind;
  prop?: string;
  text: string;
}

const NON_COPY_ATTRIBUTE_PROPS = new Set([
  'testID',
  'id',
  'nativeID',
  'key',
  'role',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLiveRegion',
  'importantForAccessibility',
  'style',
  'className',
  'class',
  'href',
  'src',
  'source',
  'image',
  'imageSource',
  'uri',
  'url',
  'path',
  'pathname',
  'routeName',
  'screenName',
  'name',
  'variant',
  'size',
  'color',
  'type',
  'mode',
  'status',
  'icon',
]);

const COPY_ATTRIBUTE_PROPS = new Set([
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'aria-description',
  'actionLabel',
  'buttonText',
  'cancelText',
  'confirmText',
  'content',
  'description',
  'disabledReason',
  'dismissLabel',
  'displayLanguage',
  'emptyBody',
  'emptyTitle',
  'errorTitle',
  'label',
  'loadingLabel',
  'message',
  'methodIntro',
  'placeholder',
  'progressLabel',
  'subjectIntro',
  'subjectName',
  'subtitle',
  'summary',
  'text',
  'title',
  'topicIntro',
  'usualMethod',
]);

const COPY_PROP_SUFFIX_PATTERN =
  /(Label|Title|Subtitle|Description|Message|Summary|Placeholder|Text|Content|Hint|Body|Reason)$/;

export function classifyJsxAttributeProp(
  propName: string,
): AttributePropClassification {
  if (
    NON_COPY_ATTRIBUTE_PROPS.has(propName) ||
    propName.startsWith('data-') ||
    propName === 'aria-labelledby' ||
    propName === 'aria-describedby' ||
    /(?:ID|Id|id)$/.test(propName)
  ) {
    return 'non-copy';
  }
  if (
    COPY_ATTRIBUTE_PROPS.has(propName) ||
    COPY_PROP_SUFFIX_PATTERN.test(propName)
  ) {
    return 'copy';
  }
  return 'unknown';
}

function getJsxAttributeParentTagName(node: Node): string | undefined {
  const element = node.getParent()?.getParent();
  if (
    element &&
    (Node.isJsxSelfClosingElement(element) || Node.isJsxOpeningElement(element))
  ) {
    return element.getTagNameNode().getText();
  }
  return undefined;
}

function shouldIgnoreCopyAttributeOnElement(prop: string, node: Node): boolean {
  return prop === 'content' && getJsxAttributeParentTagName(node) === 'meta';
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

function isTranslationKeyLike(text: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/.test(text);
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

function getLiteralText(node: Node): string | undefined {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralText();
  }
  return undefined;
}

function templateExpressionShape(node: Node): string | undefined {
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  if (!Node.isTemplateExpression(node)) return undefined;
  let text = node.getHead().getLiteralText();
  for (const span of node.getTemplateSpans()) {
    text += '${}';
    text += span.getLiteral().getLiteralText();
  }
  return text;
}

function concatShape(rawNode: Node): string {
  const node = unwrap(rawNode);
  const literal = getLiteralText(node);
  if (literal !== undefined) return literal;
  const template = templateExpressionShape(node);
  if (template !== undefined) return template;

  if (
    Node.isBinaryExpression(node) &&
    node.getOperatorToken().getText() === '+'
  ) {
    return `${concatShape(node.getLeft())}${concatShape(node.getRight())}`;
  }

  return '${}';
}

function pushAttributeText(
  rawText: string,
  sourceNode: Node,
  prop: string,
  out: Violation[],
  file: string,
): void {
  const text = normalizeText(rawText);
  if (text !== '' && isTranslatableProse(text) && !isTranslationKeyLike(text)) {
    out.push({
      file,
      line: sourceNode.getStartLineNumber(),
      kind: 'jsx-attribute-string',
      prop,
      text,
    });
  }
}

function collectAttributeStrings(
  rawNode: Node,
  prop: string,
  out: Violation[],
  file: string,
): void {
  const node = unwrap(rawNode);

  const literal = getLiteralText(node);
  if (literal !== undefined) {
    pushAttributeText(literal, node, prop, out, file);
    return;
  }

  const template = templateExpressionShape(node);
  if (template !== undefined) {
    pushAttributeText(template, node, prop, out, file);
    return;
  }

  if (Node.isConditionalExpression(node)) {
    collectAttributeStrings(node.getWhenTrue(), prop, out, file);
    collectAttributeStrings(node.getWhenFalse(), prop, out, file);
    return;
  }

  if (Node.isBinaryExpression(node)) {
    const op = node.getOperatorToken().getText();
    if (op === '??' || op === '||' || op === '&&') {
      collectAttributeStrings(node.getLeft(), prop, out, file);
      collectAttributeStrings(node.getRight(), prop, out, file);
      return;
    }
    if (op === '+') {
      pushAttributeText(concatShape(node), node, prop, out, file);
    }
  }
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

    // (2) JSX attribute values for known user-copy props.
    if (Node.isJsxAttribute(node)) {
      const prop = node.getNameNode().getText();
      if (classifyJsxAttributeProp(prop) !== 'copy') return;
      if (shouldIgnoreCopyAttributeOnElement(prop, node)) return;
      const initializer = node.getInitializer();
      if (!initializer) return;

      if (Node.isStringLiteral(initializer)) {
        pushAttributeText(
          initializer.getLiteralText(),
          initializer,
          prop,
          violations,
          file,
        );
        return;
      }

      if (Node.isJsxExpression(initializer)) {
        const expr = initializer.getExpression();
        if (expr) collectAttributeStrings(expr, prop, violations, file);
      }
      return;
    }

    // (3) `{…}` expression container rendered as a JSX child. Its parent is the
    // JSX element/fragment (attribute containers have a JsxAttribute parent, so
    // they are handled by the attribute branch above).
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

const entryKey = (e: {
  file: string;
  kind: string;
  prop?: string;
  text: string;
}) => `${e.file}::${e.kind}::${e.prop ?? ''}::${e.text}`;

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
      `Baseline at ${BASELINE_PATH} must be a JSON array of {file, kind, text} or {file, kind, prop, text} entries`,
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
    if (v.kind === 'jsx-attribute-string') {
      dedup.push({
        file: v.file,
        kind: v.kind,
        prop: v.prop,
        text: v.text,
      });
    } else {
      dedup.push({ file: v.file, kind: v.kind, text: v.text });
    }
  }
  dedup.sort((a, b) =>
    a.file !== b.file
      ? a.file.localeCompare(b.file)
      : a.kind !== b.kind
        ? a.kind.localeCompare(b.kind)
        : (a.prop ?? '') !== (b.prop ?? '')
          ? (a.prop ?? '').localeCompare(b.prop ?? '')
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
      const prop = e.prop ? ` ${e.prop}` : '';
      process.stdout.write(
        `  - ${e.file} (${e.kind}${prop}): ${JSON.stringify(e.text)}\n`,
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
    const prop = v.prop ? ` ${v.prop}` : '';
    process.stderr.write(
      `  ${v.file}:${v.line} (${v.kind}${prop}): ${JSON.stringify(v.text)}\n`,
    );
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
