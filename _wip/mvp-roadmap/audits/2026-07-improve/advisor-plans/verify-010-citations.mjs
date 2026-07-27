#!/usr/bin/env node
// Re-verify (WI-2006 rework, handler-identity variant): confirm every
// handler-identity citation in 010-findings.md resolves at a declared SHA.
// Drift-immune citation unit = `file.ts · METHOD /route`; the printed line
// numbers are script output (a convenience annotation valid at the SHA),
// never hand-maintained.
//
//   node verify-010-citations.mjs <sha> [--doc <path>] [--md]
//
// Exit 0 iff every parsed citation resolves to a real route registration in
// apps/api/src/routes/<file> at <sha>. Exit 1 if any fails; 2 on bad usage.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sha = process.argv[2];
if (!sha || sha.startsWith('--')) {
  console.error('usage: node verify-010-citations.mjs <sha> [--doc <path>] [--md]');
  process.exit(2);
}
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const docPath = arg('--doc') ?? new URL('./010-findings.md', import.meta.url).pathname;
const asMd = process.argv.includes('--md');

const doc = readFileSync(docPath, 'utf8');
// Citation shape: `recaps.ts · GET /recaps/self`  (middle-dot separated, backtick-wrapped)
const re = /`([a-z0-9_.-]+\.ts) · (GET|POST|PATCH|PUT|DELETE) (\/[^`]*)`/g;
const seen = new Set();
const cites = [];
for (let m; (m = re.exec(doc)); ) {
  const c = { file: m[1], method: m[2], route: m[3] };
  const k = `${c.file}|${c.method}|${c.route}`;
  if (!seen.has(k)) { seen.add(k); cites.push(c); }
}

const cache = new Map();
const fileAt = (file) => {
  if (cache.has(file)) return cache.get(file);
  let src = null;
  try { src = execFileSync('git', ['show', `${sha}:apps/api/src/routes/${file}`], { encoding: 'utf8', maxBuffer: 1e8 }); }
  catch { src = null; }
  cache.set(file, src);
  return src;
};

const resolveCite = (c) => {
  const src = fileAt(c.file);
  if (src == null) return { resolves: false, line: null, reason: 'file-missing' };
  const lines = src.split('\n');
  const lit = `'${c.route}'`;
  // method registration, excluding Hono context reads like c.get('db')
  const methodRe = new RegExp(`(?<![\\w])\\.${c.method.toLowerCase()}\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(lit)) continue;
    for (let j = i; j >= Math.max(0, i - 4); j--) {
      if (methodRe.test(lines[j])) return { resolves: true, line: j + 1, reason: 'ok' };
    }
  }
  return { resolves: false, line: null, reason: 'no-registration' };
};

const rows = cites.map((c) => ({ ...c, ...resolveCite(c) }));
const bad = rows.filter((r) => !r.resolves);

if (asMd) {
  console.log(`| Citation | Resolves | Reg. line @ \`${sha.slice(0, 10)}\` |`);
  console.log('|---|---|---|');
  for (const r of rows) console.log(`| \`${r.file} · ${r.method} ${r.route}\` | ${r.resolves ? '✅' : '❌ ' + r.reason} | ${r.line ?? '—'} |`);
} else {
  for (const r of rows) console.log(`${r.resolves ? 'OK  ' : 'FAIL'} ${r.file} · ${r.method} ${r.route}  -> L${r.line ?? '?'} (${r.reason})`);
  console.log(`\n${rows.length} citations · ${rows.length - bad.length} resolved · ${bad.length} failed @ ${sha}`);
}
process.exit(bad.length ? 1 : 0);
