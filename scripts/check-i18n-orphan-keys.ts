// Scans mobile source for `t('key')` and `useTranslation(...)` calls and
// fails CI on classes of i18n bug, all of which would silently render the
// literal key string at runtime — invisible to typecheck and to most existing
// tests:
//
//   1. Orphan keys: `t('quz.lanch.title')` where the key isn't in
//      apps/mobile/src/i18n/locales/en.json.
//   2. Colon-prefix keys: `t('common:ok')`. The i18n init in
//      apps/mobile/src/i18n/index.ts registers ONLY the default
//      `translation` namespace, so colon-prefixed lookups fall through
//      and render `'ok'` to users. Always use `t('common.ok')`.
//   3. `useTranslation('ns')` with a namespace argument. Same root cause:
//      only `translation` is registered, so the argument is ignored and
//      bare-key calls (`t('foo')`) resolve to a top-level `foo` lookup
//      in en.json — not `ns.foo`. Always pass no argument and use full
//      dotted paths: `t('homework.foo')`.
//   4. Multi-interpolation template keys: `t(`a.${x}.b.${y}`)`. With two or
//      more `${…}` interpolations, prefix/suffix extraction loses the literal
//      segment(s) BETWEEN the variables, so the resulting keep-marker is far
//      too broad. Refactor to `const k = computeKey(...); t(k)` (which routes
//      into the dynamic-call-sites report) or, if the breadth is acceptable,
//      add an on-line `// i18n-allow-multi-var: <reason>` escape.
//   5. Unused (reverse-orphan) keys: a key in en.json that no `t(…)` call
//      references. Reported by default (see Usage); `--allow-unused` opts out
//      for ad-hoc local debugging only.
//
// The regex scanner this file used to be was replaced with a ts-morph AST
// walker on 2026-05-26 (formerly TODO(i18n-orphan-ts-morph)). The AST walk
// resolves any `t(...)` CallExpression — including multi-line calls, renamed
// `t` aliases (`const { t: translate } = useTranslation()`), and
// template-literal prefixes — that the line-by-line regex could not see.
//
// i18next pluralization suffixes (_one, _other, _zero, _two, _few, _many) are
// accepted: if `key_other` exists, `key` is considered present, and a static
// `t('key')` reference keeps every pluralised variant alive in the unused-key
// pass.
//
// Usage:
//   pnpm tsx scripts/check-i18n-orphan-keys.ts                # full check
//   pnpm tsx scripts/check-i18n-orphan-keys.ts --allow-unused # skip unused
//
// Exit codes:
//   0 — clean
//   1 — orphan keys, namespace-arg, colon-prefix, multi-interpolation
//       template-literal calls (without escape), or unused keys found

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Node, Project, type SourceFile } from 'ts-morph';

import { KEEP_PATTERNS, type KeepPattern } from './i18n-keep';

const SRC_DIR = path.resolve(__dirname, '../apps/mobile/src');
const EN_PATH = path.resolve(
  __dirname,
  '../apps/mobile/src/i18n/locales/en.json',
);
const REPO_ROOT = path.resolve(__dirname, '..');

type Nested = { [k: string]: string | Nested };

interface Orphan {
  file: string;
  line: number;
  key: string;
  resolved: string;
}

interface NamespaceMisuse {
  file: string;
  line: number;
  kind: 'useTranslation-arg' | 'colon-key';
  snippet: string;
}

interface CallSite {
  file: string;
  line: number;
  snippet: string;
}

interface PrefixMarker {
  prefix: string;
  suffix: string;
}

interface DefaultValueMisuse {
  file: string;
  line: number;
  key: string;
  snippet: string;
}

interface Analysis {
  staticKeys: Set<string>;
  staticRefs: Array<{ file: string; line: number; key: string }>;
  prefixMarkers: PrefixMarker[];
  dynamicCallSites: CallSite[];
  multiVarViolations: CallSite[];
  misuse: NamespaceMisuse[];
  defaultValueMisuse: DefaultValueMisuse[];
}

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function flatten(obj: Nested, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.add(full);
    } else {
      for (const child of flatten(v, full)) out.add(child);
    }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx') &&
      // The mock-i18n test helper documents the t() API in a JSDoc
      // comment, which the regex picked up as a fake call. Skip it.
      !full.includes(`${path.sep}test-utils${path.sep}mock-i18n.`)
    ) {
      out.push(full);
    }
  }
  return out;
}

function isPresent(key: string, allKeys: Set<string>): boolean {
  if (allKeys.has(key)) return true;
  for (const suffix of PLURAL_SUFFIXES) {
    if (allKeys.has(`${key}${suffix}`)) return true;
  }
  return false;
}

// Back-compat: external callers used the old 3-arg signature. Keep it.
function resolveKey(key: string, defaultNs: string | null): string {
  if (key.includes(':')) {
    const [ns, rest] = key.split(':');
    return rest ? `${ns}.${rest}` : key;
  }
  if (defaultNs) return `${defaultNs}.${key}`;
  return key;
}

const NOT_T_DIRECTIVE = /\/\/\s*i18n-not-t:\s*(\S+)/;
const ALLOW_MULTI_VAR = 'i18n-allow-multi-var';

// First-10-lines `// i18n-not-t: <ident>` directives remove identifiers from
// the per-file t-call set. One identifier per directive; multiple directives
// allowed; outside the first 10 lines they are ignored (rot silently).
function collectNotTIdentifiers(lines: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const m = NOT_T_DIRECTIVE.exec(lines[i]);
    if (m) out.add(m[1]);
  }
  return out;
}

// Identifiers bound to the `t` slot of any `useTranslation()` call in the file
// (destructured `{ t }` or renamed `{ t: alias }`). The bare `'t'` is ALWAYS
// included regardless of whether the file imports useTranslation, to catch
// wrapper-hook indirection (a hook that returns t from a deeper useTranslation
// call). Per-file `// i18n-not-t` directives subtract from this set.
function collectTIdentifiers(sf: SourceFile, lines: string[]): Set<string> {
  const ids = new Set<string>(['t']);

  // Pass 1: identifiers bound to the `t` slot of a useTranslation() call.
  sf.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const callee = node.getExpression();
    if (!Node.isIdentifier(callee) || callee.getText() !== 'useTranslation') {
      return;
    }
    // Climb to the variable declaration binding this useTranslation() call.
    const decl = node.getFirstAncestor((a) => Node.isVariableDeclaration(a));
    if (decl && Node.isVariableDeclaration(decl)) {
      const nameNode = decl.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) {
        for (const el of nameNode.getElements()) {
          const propNode = el.getPropertyNameNode();
          const prop = propNode ? propNode.getText() : el.getName();
          if (prop === 't') ids.add(el.getName());
        }
      }
    }
  });

  // Pass 2 (fixpoint): alias re-bindings `const tr = t`, `const tr = t as
  // unknown as (k: string) => string`, `const a = tr`, etc. Repeat until no
  // new identifier is added so chained aliases resolve.
  let changed = true;
  while (changed) {
    changed = false;
    sf.forEachDescendant((node) => {
      if (!Node.isVariableDeclaration(node)) return;
      const nameNode = node.getNameNode();
      if (!Node.isIdentifier(nameNode)) return;
      const init = node.getInitializer();
      if (!init) return;
      const target = unwrapArg(init);
      if (
        Node.isIdentifier(target) &&
        ids.has(target.getText()) &&
        !ids.has(nameNode.getText())
      ) {
        ids.add(nameNode.getText());
        changed = true;
      }
    });
  }

  for (const notT of collectNotTIdentifiers(lines)) ids.delete(notT);
  return ids;
}

function analyzeSourceFile(sf: SourceFile): Analysis {
  const file = sf.getFilePath();
  const lines = sf.getFullText().split('\n');
  const tIdentifiers = collectTIdentifiers(sf, lines);

  const analysis: Analysis = {
    staticKeys: new Set(),
    staticRefs: [],
    prefixMarkers: [],
    dynamicCallSites: [],
    multiVarViolations: [],
    misuse: [],
    defaultValueMisuse: [],
  };

  sf.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const callee = node.getExpression();

    let isTCall = false;
    if (Node.isIdentifier(callee)) {
      const name = callee.getText();

      // useTranslation('ns') namespace-argument misuse.
      if (name === 'useTranslation') {
        const arg0 = node.getArguments()[0];
        if (
          arg0 &&
          (Node.isStringLiteral(arg0) ||
            Node.isNoSubstitutionTemplateLiteral(arg0))
        ) {
          analysis.misuse.push({
            file,
            line: node.getStartLineNumber(),
            kind: 'useTranslation-arg',
            snippet: node.getText().slice(0, 80),
          });
        }
        return;
      }

      if (tIdentifiers.has(name)) isTCall = true;
    } else if (Node.isPropertyAccessExpression(callee)) {
      // Member-access calls on the i18next instance: `i18next.t(...)` /
      // `i18n.t(...)`. Common in non-React modules (error formatters, hooks)
      // that can't use the useTranslation hook.
      const obj = callee.getExpression();
      if (
        callee.getName() === 't' &&
        Node.isIdentifier(obj) &&
        (obj.getText() === 'i18next' || obj.getText() === 'i18n')
      ) {
        isTCall = true;
      }
    }

    if (!isTCall) return;

    const arg0 = node.getArguments()[0];
    const line = node.getStartLineNumber();
    if (!arg0) return; // t() with no args — not a key lookup.

    classifyArg(arg0, { node, file, line, lines, analysis });

    // Detect `t('key', { defaultValue: 'literal' })` — silently renders English
    // to every non-English locale when the key is absent from a translation file.
    const arg1 = node.getArguments()[1];
    if (arg1 && Node.isObjectLiteralExpression(arg1)) {
      for (const prop of arg1.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;
        if (prop.getName() !== 'defaultValue') continue;
        const init = prop.getInitializer();
        if (!init) continue;
        const val = unwrapArg(init);
        if (
          Node.isStringLiteral(val) ||
          Node.isNoSubstitutionTemplateLiteral(val)
        ) {
          const unwrappedKey = unwrapArg(arg0);
          const keyText =
            Node.isStringLiteral(unwrappedKey) ||
            Node.isNoSubstitutionTemplateLiteral(unwrappedKey)
              ? unwrappedKey.getLiteralText()
              : arg0.getText().slice(0, 60);
          analysis.defaultValueMisuse.push({
            file,
            line,
            key: keyText,
            snippet: node.getText().slice(0, 80),
          });
        }
      }
    }
  });

  return analysis;
}

interface ClassifyCtx {
  node: Node;
  file: string;
  line: number;
  lines: string[];
  analysis: Analysis;
}

// Unwrap casts / parens / non-null assertions that don't change the key value.
function unwrapArg(arg: Node): Node {
  let cur = arg;
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

// Recursively classify the first argument of a t() call. String literals (incl.
// those reached through `cond ? 'a' : 'b'` or `x ?? 'fallback'`) are recorded
// as static keys; template literals become prefix markers; everything else is a
// fully-dynamic call site.
function classifyArg(rawArg: Node, ctx: ClassifyCtx): void {
  const { node, file, line, lines, analysis } = ctx;
  const arg = unwrapArg(rawArg);

  // Static string key (string literal or no-substitution template).
  if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
    const value = arg.getLiteralText();
    if (value.includes(':')) {
      analysis.misuse.push({
        file,
        line,
        kind: 'colon-key',
        snippet: `t('${value}')`,
      });
      return;
    }
    analysis.staticKeys.add(value);
    analysis.staticRefs.push({ file, line, key: value });
    return;
  }

  // `cond ? 'a' : 'b'` — both branches carry statically-known keys.
  if (Node.isConditionalExpression(arg)) {
    classifyArg(arg.getWhenTrue(), ctx);
    classifyArg(arg.getWhenFalse(), ctx);
    return;
  }

  // `x ?? 'fallback'` / `x || 'fallback'` — recurse into both operands.
  if (Node.isBinaryExpression(arg)) {
    const op = arg.getOperatorToken().getText();
    if (op === '??' || op === '||') {
      classifyArg(arg.getLeft(), ctx);
      classifyArg(arg.getRight(), ctx);
      return;
    }
  }

  // Template literal with interpolation.
  if (Node.isTemplateExpression(arg)) {
    const prefix = arg.getHead().getLiteralText();
    const spans = arg.getTemplateSpans();
    const suffix = spans[spans.length - 1].getLiteral().getLiteralText();

    // Empty prefix → key shape is unknowable (a `{prefix:'', suffix:'.bar'}`
    // marker would over-match every key ending in `.bar` regardless of
    // namespace). Route to the dynamic-call-sites report so it never
    // influences the unused pass until a human triages it. [spec fix M-5]
    if (prefix === '') {
      analysis.dynamicCallSites.push({
        file,
        line,
        snippet: node.getText().slice(0, 80),
      });
      return;
    }

    // More than one ${…} interpolation loses the literal between vars; the
    // marker would be over-broad. Require an on-line escape.
    if (spans.length > 1) {
      const lineText = lines[line - 1] ?? '';
      if (!lineText.includes(ALLOW_MULTI_VAR)) {
        analysis.multiVarViolations.push({
          file,
          line,
          snippet: node.getText().slice(0, 80),
        });
      }
    }

    analysis.prefixMarkers.push({ prefix, suffix });
    return;
  }

  // Anything else (Identifier, element/property access, CallExpression, …) →
  // fully dynamic.
  analysis.dynamicCallSites.push({
    file,
    line,
    snippet: node.getText().slice(0, 80),
  });
}

function mergeAnalysis(target: Analysis, src: Analysis): void {
  for (const k of src.staticKeys) target.staticKeys.add(k);
  target.staticRefs.push(...src.staticRefs);
  target.prefixMarkers.push(...src.prefixMarkers);
  target.dynamicCallSites.push(...src.dynamicCallSites);
  target.multiVarViolations.push(...src.multiVarViolations);
  target.misuse.push(...src.misuse);
  target.defaultValueMisuse.push(...src.defaultValueMisuse);
}

function analyzeProject(project: Project): Analysis {
  const merged: Analysis = {
    staticKeys: new Set(),
    staticRefs: [],
    prefixMarkers: [],
    dynamicCallSites: [],
    multiVarViolations: [],
    misuse: [],
    defaultValueMisuse: [],
  };
  for (const sf of project.getSourceFiles()) {
    mergeAnalysis(merged, analyzeSourceFile(sf));
  }
  return merged;
}

function computeOrphans(analysis: Analysis, allKeys: Set<string>): Orphan[] {
  const orphans: Orphan[] = [];
  for (const ref of analysis.staticRefs) {
    if (!isPresent(ref.key, allKeys)) {
      orphans.push({
        file: ref.file,
        line: ref.line,
        key: ref.key,
        resolved: ref.key,
      });
    }
  }
  return orphans;
}

function globToRegExp(pattern: string): RegExp {
  // Escape each literal segment between '*' wildcards, then join with '.+'.
  // Avoids control-character sentinels that trip no-control-regex lint.
  const body = pattern
    .split('*')
    .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${body}$`);
}

function computeUnused(
  allKeys: Set<string>,
  analysis: Analysis,
  keepPatterns: readonly KeepPattern[],
): string[] {
  const kept = new Set<string>();

  // Static references keep the key and all pluralised variants.
  for (const k of analysis.staticKeys) {
    kept.add(k);
    for (const suffix of PLURAL_SUFFIXES) kept.add(`${k}${suffix}`);
  }

  // Prefix/suffix markers keep every matching key.
  for (const { prefix, suffix } of analysis.prefixMarkers) {
    for (const k of allKeys) {
      if (k.startsWith(prefix) && k.endsWith(suffix)) kept.add(k);
    }
  }

  // KEEP_PATTERNS globs keep every matching key.
  for (const { pattern } of keepPatterns) {
    const re = globToRegExp(pattern);
    for (const k of allKeys) {
      if (re.test(k)) kept.add(k);
    }
  }

  const unused: string[] = [];
  for (const k of allKeys) {
    if (!kept.has(k)) unused.push(k);
  }
  return unused.sort();
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, file);
}

function main(): void {
  const args = process.argv.slice(2);
  const allowUnused = args.includes('--allow-unused');
  // `--report-unused` is accepted for backward compatibility with the
  // diagnostic-pass invocation; unused reporting is on by default now.
  const reportUnused = !allowUnused;

  if (!fs.existsSync(EN_PATH)) {
    console.error(`en.json not found at ${EN_PATH}`);
    process.exit(1);
  }
  const en: Nested = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const allKeys = flatten(en);

  const files = walk(SRC_DIR);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false },
  });
  for (const f of files) project.addSourceFileAtPath(f);

  const analysis = analyzeProject(project);
  const orphans = computeOrphans(analysis, allKeys);

  let failed = false;

  if (analysis.misuse.length > 0) {
    failed = true;
    console.error(
      `Found ${analysis.misuse.length} namespace-misuse call(s):\n`,
    );
    for (const u of analysis.misuse) {
      const tag =
        u.kind === 'useTranslation-arg'
          ? 'useTranslation(ns) — i18n init only registers `translation`; drop the argument and use full dotted paths'
          : "t('ns:key') — colon-prefix renders the literal at runtime; use a dot instead";
      console.error(`  ${rel(u.file)}:${u.line} — ${u.snippet}\n      ${tag}`);
    }
    console.error('');
  }

  if (analysis.multiVarViolations.length > 0) {
    failed = true;
    console.error(
      `Found ${analysis.multiVarViolations.length} multi-interpolation template t() call(s):\n`,
    );
    for (const v of analysis.multiVarViolations) {
      console.error(`  ${rel(v.file)}:${v.line} — ${v.snippet}`);
    }
    console.error(
      '\nA template with 2+ ${...} interpolations loses the literal between\n' +
        'variables, making the keep-marker over-broad. Either compute the key\n' +
        'explicitly (const k = ...; t(k)) or add an on-line\n' +
        '// i18n-allow-multi-var: <reason> escape.\n',
    );
  }

  if (analysis.defaultValueMisuse.length > 0) {
    failed = true;
    console.error(
      `Found ${analysis.defaultValueMisuse.length} t() call(s) with a defaultValue string literal:\n`,
    );
    for (const d of analysis.defaultValueMisuse) {
      console.error(`  ${rel(d.file)}:${d.line} — t('${d.key}')`);
    }
    console.error(
      '\nThe defaultValue option silently renders English to every non-English locale\n' +
        'when the key is missing from a translation file. Add the key to\n' +
        'apps/mobile/src/i18n/locales/en.json and remove the defaultValue.\n',
    );
  }

  if (orphans.length > 0) {
    failed = true;
    console.error(`Found ${orphans.length} orphan t() key(s):\n`);
    for (const o of orphans) {
      console.error(
        `  ${rel(o.file)}:${o.line} — t(${JSON.stringify(o.key)}) → ${o.resolved}`,
      );
    }
    console.error(
      '\nEither add the key to apps/mobile/src/i18n/locales/en.json or fix the typo.\n',
    );
  }

  if (reportUnused) {
    const unused = computeUnused(allKeys, analysis, KEEP_PATTERNS);
    if (unused.length > 0) {
      failed = true;
      const byNs = new Map<string, string[]>();
      for (const k of unused) {
        const ns = k.includes('.') ? k.slice(0, k.indexOf('.')) : '(root)';
        if (!byNs.has(ns)) byNs.set(ns, []);
        byNs.get(ns)!.push(k);
      }
      console.error(
        `Found ${unused.length} unused (reverse-orphan) key(s) in en.json:\n`,
      );
      for (const ns of [...byNs.keys()].sort()) {
        const ks = byNs.get(ns)!;
        console.error(`  ${ns} (${ks.length}):`);
        for (const k of ks) console.error(`    ${k}`);
      }
      console.error(
        '\nDelete these from en.json (then run `pnpm translate` to cascade) or,\n' +
          'if reached by a runtime-dynamic t() call, add a covering pattern to\n' +
          'scripts/i18n-keep.ts. Pass --allow-unused to silence locally.\n',
      );
    }
  }

  // Informational only — never affects exit code.
  if (analysis.dynamicCallSites.length > 0) {
    console.error(
      'Fully-dynamic t() call sites (key cannot be inferred statically):',
    );
    for (const d of analysis.dynamicCallSites) {
      console.error(`  ${rel(d.file)}:${d.line} — ${d.snippet}`);
    }
    console.error(
      '\nThese call sites do not contribute to either forward orphan or\n' +
        'unused-key detection. If any of these reach keys you care about, add\n' +
        'a covering pattern to scripts/i18n-keep.ts.\n',
    );
  }

  if (!failed) {
    console.log(`Checked ${files.length} files; no findings.`);
    return;
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

export {
  analyzeProject,
  analyzeSourceFile,
  computeUnused,
  computeOrphans,
  globToRegExp,
  isPresent,
  resolveKey,
  flatten,
};
export type {
  Analysis,
  Orphan,
  PrefixMarker,
  CallSite,
  NamespaceMisuse,
  DefaultValueMisuse,
};
