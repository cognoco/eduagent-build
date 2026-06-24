/**
 * [WI-941] Forward-only ratchet: session-topic.ts must NOT declare a local
 * TopicSession interface or an inline session-type union.
 *
 * The canonical type is `TopicSession` from `@eduagent/schemas` (inferred from
 * `topicSessionSchema` in packages/schemas/src/notes.ts, re-exported via
 * packages/schemas/src/index.ts). Any local redeclaration diverges from the
 * contract silently (TypeScript structurally compares shapes) and defeats the
 * purpose of keeping @eduagent/schemas as the single source of truth.
 *
 * This test fails CI if:
 *   - `interface TopicSession` is reintroduced in session-topic.ts
 *   - The inline union `'learning' | 'homework' | 'interleaved'` is
 *     reintroduced (instead of referencing `sessionTypeSchema`)
 */

import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/api/src/services/session
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const TARGET_FILE = path.join(
  REPO_ROOT,
  'apps/api/src/services/session/session-topic.ts',
);

if (!fs.existsSync(TARGET_FILE)) {
  throw new Error(`session-topic.ts not found at ${TARGET_FILE}`);
}

describe('[WI-941] session-topic.ts must use canonical TopicSession from @eduagent/schemas', () => {
  const fileText = fs.readFileSync(TARGET_FILE, 'utf8');
  const lines = fileText.split('\n');

  it('does not declare a local TopicSession interface', () => {
    const violations = lines
      .map((line, idx) => ({ line: idx + 1, text: line }))
      .filter(({ text }) =>
        /^\s*export\s+interface\s+TopicSession\b/.test(text),
      );
    expect(violations).toEqual([]);
  });

  it('does not inline the session-type union literal', () => {
    // The inline union was: sessionType: 'learning' | 'homework' | 'interleaved'
    // After the fix, sessionType is typed through sessionTypeSchema (no literal union).
    const violations = lines
      .map((line, idx) => ({ line: idx + 1, text: line }))
      .filter(({ text }) =>
        /'learning'\s*\|\s*'homework'\s*\|\s*'interleaved'/.test(text),
      );
    expect(violations).toEqual([]);
  });
});
