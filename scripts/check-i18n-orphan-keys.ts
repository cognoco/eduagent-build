// Scans mobile source for `t('key')` and `useTranslation(...)` calls and
// fails CI on three classes of i18n bug, all of which would silently render
// the literal key string at runtime — invisible to typecheck and to most
// existing tests:
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
//
// Heuristic, not a full AST walk:
//   - Only literal-string keys are checked. Template literals and dynamic
//     keys are skipped.
//   - Scans line-by-line, so multi-line `t(\n  'key'\n)` calls are NOT
//     matched. The codebase currently has none; if that changes, swap
//     this for an AST walk (ts-morph) rather than a multi-line regex.
//   - i18next pluralization suffixes (_one, _other, _zero, _two, _few,
//     _many) are accepted: if `key_other` exists, `key` is considered
//     present.
//
// Usage:
//   pnpm tsx scripts/check-i18n-orphan-keys.ts
//
// Exit codes:
//   0 — clean
//   1 — orphan keys, namespace-arg, or colon-prefix calls found

import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '../apps/mobile/src');
const EN_PATH = path.resolve(
  __dirname,
  '../apps/mobile/src/i18n/locales/en.json'
);

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
      // comment, which the regex picks up as a fake call. Skip it.
      !full.includes(`${path.sep}test-utils${path.sep}mock-i18n.`)
    ) {
      out.push(full);
    }
  }
  return out;
}

const NS_ARG_RE = /useTranslation\(\s*['"]([\w.-]+)['"]\s*\)/g;
// `t('literal')` — captures the literal-string first arg only. Skips
// `t(\`tpl${x}\`)`, `t(variable)`, etc.
const T_CALL_RE = /\bt\(\s*['"]([^'"]+)['"]/g;

function isPresent(key: string, allKeys: Set<string>): boolean {
  if (allKeys.has(key)) return true;
  for (const suffix of PLURAL_SUFFIXES) {
    if (allKeys.has(`${key}${suffix}`)) return true;
  }
  return false;
}

interface ScanResult {
  orphans: Orphan[];
  misuse: NamespaceMisuse[];
}

function scan(file: string, allKeys: Set<string>): ScanResult {
  const text = fs.readFileSync(file, 'utf-8');
  const orphans: Orphan[] = [];
  const misuse: NamespaceMisuse[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. useTranslation('ns') with a namespace argument is broken because
    //    the i18n init only registers the default `translation` namespace.
    NS_ARG_RE.lastIndex = 0;
    let nsM: RegExpExecArray | null;
    while ((nsM = NS_ARG_RE.exec(line)) !== null) {
      misuse.push({
        file,
        line: i + 1,
        kind: 'useTranslation-arg',
        snippet: nsM[0],
      });
    }

    // 2 & 3. t('literal') calls.
    T_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = T_CALL_RE.exec(line)) !== null) {
      const key = m[1];
      if (/[\s(){}]/.test(key)) continue;

      // 2. `t('ns:key')` falls through to the literal at runtime.
      if (key.includes(':')) {
        misuse.push({
          file,
          line: i + 1,
          kind: 'colon-key',
          snippet: `t('${key}')`,
        });
        continue;
      }

      // 3. Otherwise check the dotted path against en.json.
      if (!isPresent(key, allKeys)) {
        orphans.push({ file, line: i + 1, key, resolved: key });
      }
    }
  }
  return { orphans, misuse };
}

// Back-compat: tests in this file (and any external caller) used the old
// 3-arg signature. Keep it around for them.
function resolveKey(key: string, defaultNs: string | null): string {
  if (key.includes(':')) {
    const [ns, rest] = key.split(':');
    return rest ? `${ns}.${rest}` : key;
  }
  if (defaultNs) return `${defaultNs}.${key}`;
  return key;
}

function main(): void {
  if (!fs.existsSync(EN_PATH)) {
    console.error(`en.json not found at ${EN_PATH}`);
    process.exit(1);
  }
  const en: Nested = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const allKeys = flatten(en);

  const files = walk(SRC_DIR);
  const orphans: Orphan[] = [];
  const misuse: NamespaceMisuse[] = [];
  for (const f of files) {
    const r = scan(f, allKeys);
    orphans.push(...r.orphans);
    misuse.push(...r.misuse);
  }

  let failed = false;
  const repoRoot = path.resolve(__dirname, '..');

  if (misuse.length > 0) {
    failed = true;
    console.error(`Found ${misuse.length} namespace-misuse call(s):\n`);
    for (const u of misuse) {
      const rel = path.relative(repoRoot, u.file);
      const tag =
        u.kind === 'useTranslation-arg'
          ? 'useTranslation(ns) — i18n init only registers `translation`; drop the argument and use full dotted paths'
          : `t('ns:key') — colon-prefix renders the literal at runtime; use a dot instead`;
      console.error(`  ${rel}:${u.line} — ${u.snippet}\n      ${tag}`);
    }
    console.error('');
  }

  if (orphans.length > 0) {
    failed = true;
    console.error(`Found ${orphans.length} orphan t() key(s):\n`);
    for (const o of orphans) {
      const rel = path.relative(repoRoot, o.file);
      console.error(
        `  ${rel}:${o.line} — t(${JSON.stringify(o.key)}) → ${o.resolved}`
      );
    }
    console.error(
      '\nEither add the key to apps/mobile/src/i18n/locales/en.json or fix the typo.'
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

export { scan, isPresent, resolveKey, flatten };
