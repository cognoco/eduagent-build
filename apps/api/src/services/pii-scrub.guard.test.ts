/**
 * Forward-only guard for PII in error/observability paths [WI-579 / F-018,
 * F-074, F-140].
 *
 * Bans the leak patterns this WP removed from `apps/api/src`:
 *   - `rawData: event.data` — raw, unvalidated event payload forwarded to
 *     `logger.*` / `captureException` extras on a schema-drift path. Use
 *     `summarizeRawPayload(event.data)` from `@eduagent/schemas` (pii-scrub,
 *     the canonical scrubber home).
 *   - `rawSlice:` / `rawResponseTrunc:` — truncated LLM output (derived from
 *     a learner's session) shipped as log/Sentry content. Log shape-only
 *     diagnostics (`responseLength`, Zod `issues`) instead. (`contentSnippet`
 *     is deliberately NOT banned: it is a legitimate product DTO field in
 *     library-search responses; only its one logging use was removed.)
 *
 * New occurrences fail CI. See AGENTS.md → Fix Development Rules (3+-sibling
 * drift sweep) and docs/audit/2026-05-29-full-audit/ findings F-018/074/140.
 */

import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

const BANNED_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'rawData: event.data', regex: /rawData:\s*event\.data/ },
  { name: 'rawSlice key', regex: /\brawSlice\s*:/ },
  { name: 'rawResponseTrunc key', regex: /\brawResponseTrunc\s*:/ },
];

// Files allowed to mention the patterns (this guard's own docs). The scrubber
// itself now lives in packages/schemas (outside the scanned tree).
const EXCLUDED_BASENAMES = new Set(['pii-scrub.guard.test.ts']);

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (EXCLUDED_BASENAMES.has(path.basename(absPath))) return false;
  return true;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (entry.isFile() && shouldScanFile(abs)) {
      out.push(abs);
    }
  }
  return out;
}

describe('PII error-logging guard (forward-only) [WI-579]', () => {
  it('no banned PII leak patterns in apps/api/src', () => {
    const violations: string[] = [];

    for (const file of walk(API_SRC)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const { name, regex } of BANNED_PATTERNS) {
          if (regex.test(line)) {
            violations.push(`${rel}:${i + 1} [${name}] ${line.trim()}`);
          }
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `Banned PII leak pattern(s) found — log shape-only diagnostics ` +
          `(summarizeRawPayload / responseLength), never raw payloads or ` +
          `LLM-output slices:\n${violations.join('\n')}`,
      );
    }
  });
});
