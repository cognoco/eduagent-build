/**
 * Forward-only ratchet for inline age computation (WI-1070).
 *
 * Age must be derived from `birthYear` through the canonical UTC-safe helper
 * `calculateAge()` in `apps/api/src/services/age-utils.ts` (which uses
 * `getUTCFullYear()`), never via an inline `new Date().getFullYear() - birthYear`.
 *
 * The inline form uses the host process's LOCAL calendar year. On a non-UTC
 * host near a year boundary (e.g. December 31 23:30 UTC, already January 1
 * locally at a positive offset) it computes an off-by-one age — which can
 * misclassify a 17-year-old as 18+ and silently break minor-PII gating, the
 * add-child adult-owner gate, and age-adaptive prompt tone.
 *
 * This guard fails CI when a new inline year-subtraction-by-birthYear site is
 * added under `apps/api/src`. Sweep history: WI-1070 removed nine such sites.
 *
 * Sibling pattern: `services/safe-non-core.guard.test.ts`.
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

/**
 * Matches an inline learner-age computation: a local-year `getFullYear()` call
 * immediately subtracting a `birthYear` operand (`- birthYear`,
 * `- profileMeta.birthYear`, `- (profile?.birthYear ?? 2015)`, …).
 *
 * Deliberately does NOT match:
 *  - bare `new Date().getFullYear()` with no subtraction (current-year use);
 *  - `getFullYear() - 17` / `- opts.ageYears` (constructs a birth year FROM an
 *    age — opposite direction, no `birthYear` operand).
 */
const INLINE_AGE_RE = /getFullYear\(\)\s*-\s*\(?\s*[\w.?]*[Bb]irthYear/;

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
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

interface Violation {
  file: string; // repo-relative
  line: number; // 1-based
  snippet: string;
}

function findViolations(): Violation[] {
  const files: string[] = [];
  walkDir(API_SRC, files);
  const violations: Violation[] = [];
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((text, i) => {
      if (INLINE_AGE_RE.test(text)) {
        violations.push({ file: rel, line: i + 1, snippet: text.trim() });
      }
    });
  }
  return violations;
}

describe('age-gating inline-computation ratchet (WI-1070)', () => {
  it('has zero inline `getFullYear() - birthYear` sites under apps/api/src', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.snippet}`)
        .join('\n');
      throw new Error(
        `Inline age computation found. Use calculateAge(birthYear) from ` +
          `services/age-utils.ts (UTC-safe) instead of ` +
          `new Date().getFullYear() - birthYear:\n${report}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('regex flags the inline form but not legitimate getFullYear uses', () => {
    // Positive (must flag)
    expect(
      INLINE_AGE_RE.test('const a = new Date().getFullYear() - birthYear;'),
    ).toBe(true);
    expect(
      INLINE_AGE_RE.test('new Date().getFullYear() - profileMeta.birthYear'),
    ).toBe(true);
    expect(
      INLINE_AGE_RE.test(
        'new Date().getFullYear() - (profile?.birthYear ?? 2015)',
      ),
    ).toBe(true);
    // Negative (must NOT flag) — out-of-scope legitimate uses
    expect(
      INLINE_AGE_RE.test('const currentYear = new Date().getFullYear();'),
    ).toBe(false);
    expect(INLINE_AGE_RE.test('new Date().getFullYear() - 17')).toBe(false);
    expect(INLINE_AGE_RE.test('new Date().getFullYear() - opts.ageYears')).toBe(
      false,
    );
  });
});
