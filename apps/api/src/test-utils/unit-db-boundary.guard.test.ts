import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');
const API_SRC_ROOT = resolve(REPO_ROOT, 'apps/api/src');
const THIS_FILE = 'apps/api/src/test-utils/unit-db-boundary.guard.test.ts';
const SKIPPED_DIRS = new Set([
  '.git',
  '.nx',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
]);

const DIRECT_DB_SETUP_PATTERNS = [
  { label: 'loadDatabaseEnv', pattern: /\bloadDatabaseEnv\s*\(/ },
  { label: 'createDatabase', pattern: /\bcreateDatabase\s*\(/ },
] as const;

interface Violation {
  file: string;
  line: number;
  label: string;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function collectApiUnitTests(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        collectApiUnitTests(absPath, files);
      }
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.integration.test.ts')
    ) {
      const relPath = normalizePath(relative(REPO_ROOT, absPath));
      if (relPath !== THIS_FILE) {
        files.push(relPath);
      }
    }
  }
}

function listApiUnitTests(): string[] {
  const files: string[] = [];
  if (existsSync(API_SRC_ROOT)) {
    collectApiUnitTests(API_SRC_ROOT, files);
  }
  return files.sort();
}

function codeLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
    return '';
  }
  return line.replace(/\/\/.*$/, '');
}

function fileDirectDbSetupViolations(file: string): Violation[] {
  return readFileSync(resolve(REPO_ROOT, file), 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const code = codeLine(line);
      return DIRECT_DB_SETUP_PATTERNS.filter(({ pattern }) =>
        pattern.test(code),
      ).map(({ label }) => ({
        file,
        line: index + 1,
        label,
      }));
    });
}

describe('API unit tests - real database boundary guard', () => {
  it('keeps real database setup in integration tests only', () => {
    const violations = listApiUnitTests().flatMap(fileDirectDbSetupViolations);

    if (violations.length > 0) {
      throw new Error(
        `API unit tests must not open or resolve a real database. ` +
          `Rename DB-backed tests to *.integration.test.ts.\n` +
          violations
            .map((v) => `  - ${v.file}:${v.line} (${v.label})`)
            .join('\n'),
      );
    }
  });
});
