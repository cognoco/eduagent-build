import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const API_SRC = resolve(__dirname, '..');
const HELPER_FILE = 'services/dedupe-key.ts';
const GUARD_FILE = 'services/dedupe-key-guard.test.ts';

const SKIPPED_DIRS = new Set([
  '.git',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function collectTsFiles(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        collectTsFiles(resolve(dir, entry.name), files);
      }
      continue;
    }
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(normalizePath(relative(API_SRC, resolve(dir, entry.name))));
    }
  }
}

function isExempt(relPath: string): boolean {
  if (relPath === HELPER_FILE || relPath === GUARD_FILE) return true;
  if (/\.test\.tsx?$/.test(relPath)) return true;
  return false;
}

const DEDUPE_KEY_TEMPLATE_RE = /dedupeKey\s*[:=]\s*`[^`]*\$\{/;

const IDEMPOTENCY_KEY_TEMPLATE_RE = /idempotencyKey\s*[:=]\s*`[^`]*\$\{/;

describe('dedupe-key-guard — ban raw string joins', () => {
  const files: string[] = [];
  collectTsFiles(API_SRC, files);

  it('finds at least one TS file (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no raw template-literal dedupeKey or idempotencyKey outside dedupe-key.ts', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const relPath of files) {
      if (isExempt(relPath)) continue;

      const absPath = resolve(API_SRC, relPath);
      const lines = readFileSync(absPath, 'utf-8').split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (
          DEDUPE_KEY_TEMPLATE_RE.test(line) ||
          IDEMPOTENCY_KEY_TEMPLATE_RE.test(line)
        ) {
          violations.push({ file: relPath, line: i + 1, text: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Raw template-literal dedupe/idempotency keys found.\n` +
          `Use helpers from services/dedupe-key.ts instead.\n\n` +
          violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n'),
      );
    }
  });
});
