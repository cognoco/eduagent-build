// scripts/check-i18n-keep-rot.ts
//
// Liveness guard for scripts/i18n-keep.ts. Every KEEP_PATTERNS entry carries a
// `reason` citing one or more `<path>:<line>` tokens (format enforced by the
// Zod schema in i18n-keep.ts at import time). This script confirms each cite
// still resolves to a real file with at least that many lines — i.e. the
// dynamic call site the keep-pattern exists for hasn't been deleted or shrunk
// out from under the pattern.
//
// Split of responsibility:
//   - i18n-keep.ts Zod schema = FORMAT (cite present + parseable; runs
//     everywhere TS/tsx imports the module).
//   - this script           = LIVENESS (cite resolves to a real file:line;
//     runs in pre-commit + CI).
//
// Forward-only: KEEP_PATTERNS starts empty-but-for-the-seed and is populated
// only during triage, so every entry always carries a live cite. There is no
// legacy carve-out — the schema already requires a valid cite on every entry.
//
// Usage:
//   pnpm tsx scripts/check-i18n-keep-rot.ts
//
// Exit codes:
//   0 — every cite resolves
//   1 — at least one cite points at a missing file or a line past EOF

import * as fs from 'node:fs';
import * as path from 'node:path';

import { KEEP_PATTERNS } from './i18n-keep';

const REPO_ROOT = path.resolve(__dirname, '..');

// Matches `<path>:<line>` tokens inside a reason string. Mirrors the Zod regex
// in i18n-keep.ts but with capture groups and the global flag so we can pull
// out EVERY cite in a reason (a reason may list more than one call site). The
// path class includes `()[]` for Expo Router route files.
const CITE_RE = /([\w./()[\]-]+):(\d+)/g;

interface Failure {
  pattern: string;
  cite: string;
  message: string;
}

function checkCite(filePath: string, line: number): string | null {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(REPO_ROOT, filePath);
  if (!fs.existsSync(abs)) {
    return 'file missing';
  }
  const lineCount = fs.readFileSync(abs, 'utf-8').split('\n').length;
  if (lineCount < line) {
    return `file has only ${lineCount} lines`;
  }
  return null;
}

function main(): void {
  const failures: Failure[] = [];

  for (const entry of KEEP_PATTERNS) {
    CITE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let cites = 0;
    while ((m = CITE_RE.exec(entry.reason)) !== null) {
      cites++;
      const filePath = m[1];
      const line = Number(m[2]);
      const problem = checkCite(filePath, line);
      if (problem) {
        failures.push({
          pattern: entry.pattern,
          cite: `${filePath}:${line}`,
          message: problem,
        });
      }
    }
    // The Zod schema guarantees at least one cite, so `cites === 0` should be
    // unreachable; guard anyway so a future schema relaxation can't silently
    // pass an entry with no verifiable cite.
    if (cites === 0) {
      failures.push({
        pattern: entry.pattern,
        cite: '(none)',
        message: 'reason contains no path:line cite',
      });
    }
  }

  if (failures.length > 0) {
    console.error(
      `Found ${failures.length} rotted KEEP_PATTERNS cite(s) in scripts/i18n-keep.ts:\n`,
    );
    for (const f of failures) {
      console.error(`  ${f.pattern}: cite ${f.cite} — ${f.message}`);
    }
    console.error(
      '\nUpdate the reason to cite the current call site, or remove the entry if\n' +
        'the dynamic reference it protected is gone.',
    );
    process.exit(1);
  }

  console.log(
    `Checked ${KEEP_PATTERNS.length} KEEP_PATTERNS entr${
      KEEP_PATTERNS.length === 1 ? 'y' : 'ies'
    }; all cites resolve.`,
  );
}

if (require.main === module) {
  main();
}

export { checkCite };
