/**
 * Forward-only ratchet for raw Postgres SQLSTATE 23505 (unique_violation) reads.
 *
 * drizzle-orm >=0.44 wraps every driver error raised during query execution in
 * a `DrizzleQueryError`, burying the underlying `.code` / `.constraint` on
 * `error.cause`. A handler that reads the SQLSTATE from the top-level error
 * silently stops detecting unique violations and throws a raw 500 instead of
 * mapping the conflict (or absorbing an idempotent race). The single sanctioned
 * reader is `services/db-errors.ts` — `unwrapDbError` / `isUniqueViolation` /
 * `uniqueViolationConstraint`, which walk the cause chain.
 *
 * This test fails CI if the quoted `'23505'` literal reappears in any non-test
 * api source file outside `db-errors.ts`, forcing new sites through the helper.
 *
 * See:
 *   apps/api/src/services/db-errors.ts
 *   AGENTS.md → Fix Development Rules (3+ sibling sweep + forward guard)
 */

import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

// The one file allowed to name the SQLSTATE literal — the canonical helper.
// Matched on the full repo-relative path (not basename) so a future
// `db-errors.ts` in any other directory cannot silently inherit the exemption.
const SANCTIONED_PATHS = new Set(['apps/api/src/services/db-errors.ts']);

// Matches the SQLSTATE as a quoted string literal ('23505' / "23505"). Bare
// occurrences in comments (e.g. "the 23505 catch") are intentionally NOT
// matched — only code that compares against the literal trips the ratchet.
const SQLSTATE_LITERAL = /['"]23505['"]/;

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
  if (SANCTIONED_PATHS.has(rel)) return false;
  return true;
}

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkDir(full, out);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      if (shouldScanFile(full)) out.push(full);
    }
  }
}

interface Offence {
  file: string; // repo-relative
  line: number; // 1-based
  snippet: string;
}

function scanFile(absPath: string): Offence[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const offences: Offence[] = [];
  text.split('\n').forEach((lineText, idx) => {
    if (SQLSTATE_LITERAL.test(lineText)) {
      offences.push({
        file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
        line: idx + 1,
        snippet: lineText.trim().slice(0, 120),
      });
    }
  });
  return offences;
}

describe('db-errors 23505 ratchet', () => {
  const files: string[] = [];
  walkDir(API_SRC, files);

  const offences: Offence[] = [];
  for (const f of files) offences.push(...scanFile(f));

  it('scans a meaningful number of files (sanity check)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no raw 23505 string literal outside db-errors.ts', () => {
    if (offences.length > 0) {
      const lines = offences
        .map((o) => `  ${o.file}:${o.line}  →  ${o.snippet}`)
        .join('\n');
      throw new Error(
        `Found ${offences.length} raw '23505' literal(s) outside db-errors.ts. ` +
          `Use isUniqueViolation()/uniqueViolationConstraint() from ` +
          `services/db-errors.ts — they unwrap drizzle's DrizzleQueryError so ` +
          `the SQLSTATE is read from the driver error, not the wrapper.\n${lines}`,
      );
    }
    expect(offences).toEqual([]);
  });

  // Self-check: prove the scanner would catch a reintroduction. Without this, a
  // broken regex would silently always-pass.
  it('self-check: the literal matcher detects a synthetic occurrence', () => {
    expect(SQLSTATE_LITERAL.test(`if (error.code === '23505') {}`)).toBe(true);
    expect(SQLSTATE_LITERAL.test(`if (error.code === "23505") {}`)).toBe(true);
    // A bare mention in a comment must NOT trip the ratchet.
    expect(SQLSTATE_LITERAL.test(`// the 23505 unique-violation branch`)).toBe(
      false,
    );
  });
});
