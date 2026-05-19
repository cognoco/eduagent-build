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
  /\brequire\(['"]react-test-renderer['"]\)/,
  // Local test-utils/ dir is metro-blocked and excluded from this scan;
  // production code must not reach into it.
  /\bfrom\s+['"][^'"]*\/test-utils\/[^'"]+['"]/,
];

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      entry.name !== 'test-utils' &&
      entry.name !== '__mocks__'
    ) {
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

function toRel(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join('/');
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

  it('session components do not import their own barrel', () => {
    const sessionDir = path.join(SRC_DIR, 'components', 'session');
    const sourceFiles = getAllSourceFiles(sessionDir);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/from\s+['"]\.\.\/session['"]/.test(content)) {
        violations.push(path.relative(SRC_DIR, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('metro.config.js has blockList excluding test files', () => {
    const config = fs.readFileSync(METRO_CONFIG, 'utf-8');
    expect(config).toMatch(/blockList/);
    // multiline-tolerant: blockList may span lines (see [BUG-NOTION-261])
    expect(config).toMatch(/blockList[\s\S]*test/);
  });

  // [BUG-NOTION-261] blockList must also exclude __mocks__ directories and
  // *.stories.tsx files so Storybook/test stubs never ship in the JS bundle.
  it('metro.config.js blockList excludes __mocks__ and .stories files', () => {
    const config = fs.readFileSync(METRO_CONFIG, 'utf-8');
    expect(config).toMatch(/__mocks__/);
    expect(config).toMatch(/\.stories\\?\.\[jt\]sx\?\$/);
  });

  // [BUG-NOTION-258] Forward-only ratchet: production code must import the
  // Sentry SDK via the local wrapper (`import { Sentry } from '.../lib/sentry'`)
  // which gates capture on age/consent. Star-imports drag the full SDK and
  // bypass the wrapper's guarded surface.
  //
  // `lib/sentry.ts` is the ONLY allowed star-import site (it is the wrapper).
  // Existing legacy call-sites are pinned in `LEGACY_SENTRY_STAR_IMPORTS`;
  // sweep one and remove it from the list. New star-imports outside this set
  // fail the test.
  it('Sentry star-import is allowed only in the canonical wrapper (lib/sentry.ts)', () => {
    const LEGACY_SENTRY_STAR_IMPORTS = new Set([
      // Canonical wrapper — always allowed.
      'lib/sentry.ts',
      // Legacy call-sites pending migration to the wrapper.
      'hooks/use-revenuecat.ts',
      'lib/sign-out.ts',
      'app/(app)/shelf/[subjectId]/book/[bookId].tsx',
      'app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx',
      'app/(app)/child/[profileId]/report/[reportId].tsx',
      'app/(app)/progress/reports/[reportId].tsx',
      'app/(app)/progress/weekly-report/[weeklyReportId].tsx',
    ]);

    const STAR_IMPORT =
      /\bimport\s+\*\s+as\s+\w+\s+from\s+['"]@sentry\/react-native['"]/;

    const sourceFiles = getAllSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!STAR_IMPORT.test(content)) continue;
      const rel = toRel(file);
      if (!LEGACY_SENTRY_STAR_IMPORTS.has(rel)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  // [BUG-NOTION-258] expo-camera ships a native module that drags ~Megabyte of
  // JS + native binding into any bundle it touches. The auth bundle (sign-in,
  // sign-up, forgot-password) MUST stay slim — users hit it before any session
  // starts. The homework camera flow is the sole legitimate consumer.
  it('expo-camera is not pulled into the auth bundle', () => {
    const ALLOWED_CAMERA_IMPORTERS = new Set(['app/(app)/homework/camera.tsx']);
    const AUTH_PREFIX = 'app/(auth)/';

    const CAMERA_IMPORT = /\bfrom\s+['"]expo-camera['"]/;

    const sourceFiles = getAllSourceFiles(SRC_DIR);
    const authViolations: string[] = [];
    const newImporters: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!CAMERA_IMPORT.test(content)) continue;
      const rel = toRel(file);
      if (rel.startsWith(AUTH_PREFIX)) {
        authViolations.push(rel);
      }
      if (!ALLOWED_CAMERA_IMPORTERS.has(rel)) {
        newImporters.push(rel);
      }
    }

    expect(authViolations).toEqual([]);
    expect(newImporters).toEqual([]);
  });
});
