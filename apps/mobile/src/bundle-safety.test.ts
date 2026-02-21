/**
 * Guards against test-only dependencies leaking into the Metro production bundle.
 *
 * Why: Metro resolves all files matching `sourceExts` in the project tree.
 * If a non-test file imports from `@testing-library/*`, `jest`, or similar,
 * the app will crash at runtime with a missing peer-dependency error.
 *
 * Also verifies that metro.config.js has a blockList excluding test files,
 * so even co-located test files don't get swept into the bundle.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname);
const METRO_CONFIG = path.resolve(__dirname, '..', 'metro.config.js');

const TEST_ONLY_PATTERNS = [
  /@testing-library\//,
  /\bfrom\s+['"]jest\b/,
  /\bimport\b.*\bfrom\s+['"]@eduagent\/test-utils['"]/,
  /\bimport\b.*\bfrom\s+['"]@eduagent\/factory['"]/,
  /\brequire\(['"]react-test-renderer['"]\)/,
];

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...getAllSourceFiles(full));
    } else if (
      entry.isFile() &&
      /\.[jt]sx?$/.test(entry.name) &&
      !entry.name.includes('.test.') &&
      entry.name !== 'test-setup.ts' &&
      entry.name !== 'jest.config.ts'
    ) {
      results.push(full);
    }
  }
  return results;
}

describe('bundle safety', () => {
  it('no production source file imports test-only dependencies', () => {
    const sourceFiles = getAllSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of TEST_ONLY_PATTERNS) {
        if (pattern.test(content)) {
          const rel = path.relative(SRC_DIR, file);
          violations.push(`${rel} matches ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('metro.config.js has blockList excluding test files', () => {
    const config = fs.readFileSync(METRO_CONFIG, 'utf-8');
    expect(config).toMatch(/blockList/);
    expect(config).toMatch(/blockList.*test/);
  });
});
