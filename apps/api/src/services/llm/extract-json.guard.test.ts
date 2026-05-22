/**
 * Forward-only ratchet: no source file outside this module may use the greedy
 * JSON-object regex /\{[\s\S]*\}/ (or equivalent \{[^]*\}) in place of the
 * brace-depth walker `extractFirstJsonObject`.
 *
 * If this test fails it means a new site introduced the banned pattern.
 * Fix: replace the greedy regex with `extractFirstJsonObject` from './llm'.
 *
 * [BUG-461] guard test.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.ts` files under `dir`, excluding:
 *   - node_modules
 *   - *.test.ts / *.spec.ts  (test files may legitimately contain the pattern
 *     in string literals for documentation / fixture purposes)
 *   - the extract-json.ts module itself (the walker lives there)
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results.push(...collectSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
      if (entry.name === 'extract-json.ts') continue;
      results.push(full);
    }
  }
  return results;
}

/**
 * Returns true if the line contains a greedy `{...}` regex match call.
 *
 * We check for the two canonical spellings:
 *   .match(/\{[\s\S]*\}/)
 *   .match(/\{[^]*\}/)
 *
 * We look for the literal character sequence in the source file text, not
 * via a compiled regex, to avoid false negatives from escape differences.
 */
function lineHasGreedyJsonRegex(line: string): boolean {
  return (
    (line.includes('.match(') || line.includes('.match (')) &&
    (line.includes('[\\s\\S]') || line.includes('[^]')) &&
    line.includes('\\{') &&
    line.includes('\\}')
  );
}

// ---------------------------------------------------------------------------
// Root of the services directory (two levels up from this file's location).
// __dirname at test time is apps/api/src/services/llm/
// ---------------------------------------------------------------------------
const SERVICES_ROOT = path.resolve(__dirname, '..');

describe('[BUG-461] no greedy JSON-object regex in production source files', () => {
  it('contains no .match(/\\{[\\s\\S]*\\}/) calls outside extract-json.ts', () => {
    const files = collectSourceFiles(SERVICES_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (lineHasGreedyJsonRegex(line)) {
          violations.push(`${file}:${i + 1}  ${line.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        [
          `Found ${violations.length} greedy JSON-object regex site(s).`,
          'Replace each with extractFirstJsonObject() from ./llm.',
          '',
          ...violations,
        ].join('\n'),
      );
    }
  });
});
