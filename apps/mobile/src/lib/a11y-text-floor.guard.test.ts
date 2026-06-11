/**
 * Forward-only guard: no raw fontSize of 10 or below in mobile app source.
 *
 * WI-628 swept all fontSize=10 sites (F-060). This guard prevents regressions.
 * Floor is set at 10 (i.e. 10px is the violation boundary): 11px exists in the
 * codebase as an established sub-caption size and is not part of WI-628 scope.
 * A stricter sweep to the full caption (12px) floor is a separate future task.
 *
 * Mirrors the no-clinical-copy / safe-non-core guard patterns.
 *
 * Exemptions:
 *   - *.test.ts / *.test.tsx — test files (testID values, debug output)
 *   - *Animation.tsx / *Celebration.tsx / AnimatedSplash.tsx / MentomateLogo.tsx
 *     — AGENTS.md brand-fixed exception (SVG geometry values can look like sizes)
 */

import { readdirSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';

const MOBILE_SRC = join(__dirname, '..'); // apps/mobile/src

const EXEMPTED_PATTERNS = [
  /\.test\.(tsx?|js)$/,
  /Animation\.tsx$/,
  /Celebration\.tsx$/,
  /AnimatedSplash\.tsx$/,
  /MentomateLogo\.tsx$/,
];

/**
 * Match fontSize: 1-10, fontSize={1-10} — values at or below the 10px floor.
 * Terminal class excludes '.' so decimal continuations (e.g. fontSize: 10.5,
 * which is above the floor) are not falsely flagged.
 */
const SUB_FLOOR_REGEX = /fontSize[:\s=]{1,3}\{?(10|[1-9])\}?[^0-9.]/g;

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (ext === '.tsx' || ext === '.ts') {
        yield full;
      }
    }
  }
}

describe('a11y text-floor guard (F-060)', () => {
  it('has no raw fontSize at or below 10 in mobile app source', () => {
    const violations: string[] = [];

    for (const filePath of walkFiles(MOBILE_SRC)) {
      const name = basename(filePath);
      if (EXEMPTED_PATTERNS.some((p) => p.test(name))) continue;

      const content = readFileSync(filePath, 'utf8');
      let match: RegExpExecArray | null;
      SUB_FLOOR_REGEX.lastIndex = 0;
      while ((match = SUB_FLOOR_REGEX.exec(content)) !== null) {
        // line number for readability
        const line = content.slice(0, match.index).split('\n').length;
        violations.push(
          `${filePath.replace(MOBILE_SRC + '/', '')}:${line} → "${match[0].trim()}"`,
        );
      }
    }

    if (violations.length > 0) {
      console.error(
        '\n[a11y-text-floor] Sub-12 fontSize violations found:\n' +
          violations.map((v) => `  ${v}`).join('\n') +
          '\n\nUse the design system caption token (12px) or larger.',
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('regex flags at-or-below-floor values but not decimal continuations above it', () => {
    const flags = (s: string): boolean => {
      SUB_FLOOR_REGEX.lastIndex = 0;
      return SUB_FLOOR_REGEX.test(s);
    };
    expect(flags('fontSize: 10,')).toBe(true);
    expect(flags('fontSize: 9,')).toBe(true);
    expect(flags('fontSize={10}\n')).toBe(true);
    // 10.5 is above the floor — must not be flagged
    expect(flags('fontSize: 10.5,')).toBe(false);
    expect(flags('fontSize: 11,')).toBe(false);
    expect(flags('fontSize: 12,')).toBe(false);
  });
});
