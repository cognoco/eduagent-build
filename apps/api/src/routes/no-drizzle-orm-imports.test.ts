import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Forward-only guard: confirms that no route file imports from drizzle-orm.
//
// Context: sessions.ts had a sanctioned drizzle-orm import (CLAUDE.md
// "Known Exceptions") that was silently removed in PR #130 (8672bdcd).
// The CLAUDE.md exception entry was removed in e622dd15. This test ensures
// the invariant "zero route files import drizzle-orm" is forward-only:
// if any route file re-introduces the pattern, jest fails fast.
//
// The ESLint G1 rule (root eslint.config.mjs, routes override) is the
// primary enforcement layer. This test adds a second layer that fires on a
// plain jest run even without a full lint pass.

const ROUTES_DIR = __dirname;

describe('drizzle-orm import guard — routes/', () => {
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) =>
      f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'),
  );

  it('has at least one route file to scan', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('no route file imports from drizzle-orm (bare or subpath)', () => {
    const violations: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(join(ROUTES_DIR, file), 'utf-8');
      if (/from\s+['"]drizzle-orm(?:\/[^'"]*)?['"]/.test(source)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});
