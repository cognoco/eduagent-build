/**
 * Forward-only ratchet for the inlined profile/db unwrap in route handlers.
 *
 * `withProfile(c)` (route-context.ts) is the canonical way to pull
 * `{ db, profileId, user, profileMeta }` out of a Hono Context. Many route
 * handlers still inline the unwrap with `requireProfileId(c.get('profileId'))`.
 *
 * This test counts the inline idiom across `apps/api/src/routes/**` (non-test
 * `.ts` files) and asserts the count does NOT INCREASE beyond the recorded
 * baseline. New handlers must adopt `withProfile(c)`; existing inlines are
 * burned down by the Phase C sweep (each swept file decrements BASELINE).
 *
 * See docs/plans/2026-05-29-centralize-duplication-time-query-route.md (Phase C).
 */

import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/api/src/route-utils → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ROUTES_DIR = path.join(REPO_ROOT, 'apps/api/src/routes');

if (!fs.existsSync(ROUTES_DIR)) {
  throw new Error(
    `ROUTES_DIR (${ROUTES_DIR}) does not exist. Path resolution is wrong.`,
  );
}

/**
 * Current count of inline `requireProfileId(c.get('profileId'))` occurrences
 * across apps/api/src/routes. Established 2026-05-29 (Phase C start: 199).
 *
 * DECREMENT this when migrating a route file onto `withProfile(c)`. The guard
 * fails if the live count exceeds this number, so it can only shrink.
 *
 * Phase C sweep history (decrements from the 199 start):
 *   sessions.ts        -25  → 174
 *   learner-profile.ts -22  → 152
 *   dashboard.ts       -16  → 136
 *   progress.ts        -14  → 122
 *   settings.ts        -14  → 108
 */
const BASELINE = 108;

// The exact inline idiom this ratchet targets. Whitespace-tolerant so a
// reformat (e.g. line wrap) inside the call still matches.
const INLINE_IDIOM = /requireProfileId\(\s*c\.get\(\s*'profileId'\s*\)\s*\)/g;

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/routes/')) return false;
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

function countInlinesInFile(absPath: string): number {
  const text = fs.readFileSync(absPath, 'utf8');
  const matches = text.match(INLINE_IDIOM);
  return matches ? matches.length : 0;
}

describe('route-context withProfile ratchet', () => {
  const files: string[] = [];
  walkDir(ROUTES_DIR, files);

  const perFile = new Map<string, number>();
  let total = 0;
  for (const f of files) {
    const n = countInlinesInFile(f);
    if (n > 0) {
      perFile.set(path.relative(REPO_ROOT, f).replace(/\\/g, '/'), n);
    }
    total += n;
  }

  it('scans the routes directory (sanity check)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it(`does not exceed the inline-unwrap baseline (${BASELINE})`, () => {
    if (total > BASELINE) {
      const lines = [...perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([file, n]) => `  ${file}: ${n}`)
        .join('\n');
      throw new Error(
        `Found ${total} inline \`requireProfileId(c.get('profileId'))\` site(s), ` +
          `exceeding the baseline of ${BASELINE}. New route handlers must use ` +
          `\`withProfile(c)\` from route-context.ts instead of inlining the unwrap.\n${lines}`,
      );
    }
    // Allow the count to be below baseline (further sweeps land separately),
    // but never above it.
    expect(total).toBeLessThanOrEqual(BASELINE);
  });

  // Self-check: prove the regex matches the literal idiom it guards against.
  it('self-check: regex matches the inline idiom', () => {
    const sample = `const profileId = requireProfileId(c.get('profileId'));`;
    expect(sample.match(INLINE_IDIOM)?.length).toBe(1);
  });

  // Self-check: the withProfile destructure form is NOT counted as an inline.
  it('self-check: withProfile destructure is not counted', () => {
    const sample = `const { profileId, db } = withProfile(c);`;
    expect(sample.match(INLINE_IDIOM)).toBeNull();
  });
});
