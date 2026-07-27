import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Forward-only ratchet for the time-formatting de-duplication (plan
// 2026-05-29-centralize-duplication-time-query-route, Phase A). Once the
// per-screen relative-date / MM:SS / sec→min formatters were folded into
// lib/format-relative-date.ts + hooks/use-time-format.ts, this guard fails CI
// if any new file hand-rolls one of those idioms instead of using the helpers.
//
// Each pattern carries a named allowlist of sites that legitimately keep the
// idiom for a non-display reason. A rot check below asserts every allowlisted
// file still matches, so a stale exemption can't silently linger.

const CANONICAL_FILES = new Set([
  'apps/mobile/src/lib/format-relative-date.ts',
  'apps/mobile/src/hooks/use-time-format.ts',
]);

// `(1000 * 60 * 60 * 24)` whole-day diff math — the relative-date idiom. These
// three sites compute calendar-day spans for non-display logic, not for
// rendering a relative date label, so they stay.
const DAY_DIFF_RE = /1000\s*\*\s*60\s*\*\s*60\s*\*\s*24/;
const DAY_DIFF_ALLOWED = new Set([
  // streak derivation
  'apps/mobile/src/lib/progress.ts',
  // review scheduling
  'apps/mobile/src/lib/retention-utils.ts',
  // book view-model freshness
  'apps/mobile/src/app/(app)/shelf/[subjectId]/book/_view-models/book-derived-state.ts',
]);

// MM:SS built by zero-padding around a template colon. After migration every
// timer uses formatTimer(); there is no legitimate hand-rolled site left.
const MMSS_ALLOWED = new Set<string>();
function isMmssLine(line: string): boolean {
  if (!/padStart\(\s*2/.test(line)) return false;
  // a template-literal colon separator next to the padded value
  return line.includes(':${') || /\}\s*:/.test(line);
}

// Math.floor/round(<...>Seconds / 60) — the sec→min duration idiom. The single
// remaining site renders an aggregate "{n} min total" across many sessions,
// which useDurationLabel/getDurationParts cannot express (they switch to an
// h/m split at 60 minutes). It is intentionally not migrated.
const MINUTE_MATH_RE = /Math\.(?:floor|round)\([^)]*[sS]econds\s*\/\s*60/;
const MINUTE_MATH_ALLOWED = new Set([
  'apps/mobile/src/app/(app)/topic/[topicId].tsx',
]);

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function allScannedSources(): string[] {
  const out = execSync(
    'git ls-files --cached --others --exclude-standard "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot(), encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !/\.test\.|\.guard\./.test(file))
    .filter((file) => !CANONICAL_FILES.has(file));
}

function readLines(file: string): string[] {
  const abs = resolve(repoRoot(), file);
  if (!existsSync(abs)) return [];
  return readFileSync(abs, 'utf-8').split('\n');
}

describe('time-formatting de-duplication ratchet', () => {
  const files = allScannedSources();

  it('enumerates mobile source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('routes whole-day diff math outside the known non-display sites', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (DAY_DIFF_ALLOWED.has(file)) continue;
      readLines(file).forEach((line, i) => {
        if (DAY_DIFF_RE.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no hand-rolled MM:SS padding outside formatTimer', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (MMSS_ALLOWED.has(file)) continue;
      readLines(file).forEach((line, i) => {
        if (isMmssLine(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('routes seconds→minutes math through useDurationLabel', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (MINUTE_MATH_ALLOWED.has(file)) continue;
      readLines(file).forEach((line, i) => {
        if (MINUTE_MATH_RE.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // Allowlist rot guard: every exempted file must still contain the idiom it
  // was exempted for. If a site is migrated/removed, its exemption must go too.
  it('keeps every allowlisted exemption live', () => {
    const stale: string[] = [];

    for (const file of DAY_DIFF_ALLOWED) {
      if (!readLines(file).some((line) => DAY_DIFF_RE.test(line))) {
        stale.push(`${file} (day-diff)`);
      }
    }
    for (const file of MINUTE_MATH_ALLOWED) {
      if (!readLines(file).some((line) => MINUTE_MATH_RE.test(line))) {
        stale.push(`${file} (minute-math)`);
      }
    }

    expect(stale).toEqual([]);
  });
});
